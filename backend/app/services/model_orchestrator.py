import json
import logging
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import Settings
from app.schemas.diagram import DiagramType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# AI response models (internal contract between LLM and pipeline)
# ---------------------------------------------------------------------------


class AIFactNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    # Extended kind vocabulary: step | decision | idea | action_item |
    # milestone | root | branch | person
    kind: str = "step"
    status: Optional[str] = None
    description: Optional[str] = None
    # lane / group both map to swimlane grouping; group is the prompt-facing name
    lane: Optional[str] = None
    group: Optional[str] = None
    actor: Optional[str] = None
    time_label: Optional[str] = None

    @property
    def effective_lane(self) -> Optional[str]:
        """Return whichever grouping field the LLM populated."""
        return self.lane or self.group


class AIFactEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: str
    target_key: str
    kind: str = "sequence"
    label: Optional[str] = None


class AIDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    diagram_type: Literal["flowchart", "none"] = "none"
    confidence: float = 0.0
    scope_relation: Literal[
        "in_scope", "out_of_scope", "correction"
    ] = "in_scope"
    action: Literal["update", "replace", "noop"] = "noop"


class AIFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[AIFactNode] = Field(default_factory=list)
    edges: list[AIFactEdge] = Field(default_factory=list)


class AIResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: AIDecision = Field(default_factory=AIDecision)
    facts: AIFacts = Field(default_factory=AIFacts)
    reason: str = ""
    request_id: int = 0


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are the reasoning engine for MindMesh's auto-flowchart mode.

Your job is to turn a batch of finalized meeting utterances into one canonical \
FLOWCHART or return a noop when the batch is not process content.

You are NOT a transcription tool.
You are NOT a summarizer.
You are extracting process structure.

Return only one of these outcomes:
- flowchart: process or approval structure is present
- none + noop: the batch is filler, meta-talk, a question, or too vague

You must:
- produce the FULL canonical flowchart, not just the new delta
- merge repeated concepts instead of duplicating nodes
- keep stable snake_case keys across calls
- preserve useful existing nodes from the previous diagram when still valid

You must not:
- switch to mindmap, timeline, or orgchart
- create one node per sentence by default
- copy filler or commentary into the graph

Flowchart cues:
- sequence: first, then, after, before, once, finally, next
- decisions: choose, if, whether, depends on, approval, reject
- branching: types of, kinds of, includes, can be, options are

Branching rule:
When a parent has multiple options or types, create one parent node and one \
child node per option, connected by branch edges. Do not create a linear chain.

Off-topic / noop examples:
- "okay that works"
- "what's the condition?"
- "can someone send the link?"
- "it populated"
- "this is confusing"

Corrections:
- "actually", "no", "wait", "instead" should set scope_relation="correction"
- include the corrected canonical graph in facts

Respond only with valid JSON matching the schema.
"""


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class ModelOrchestrator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

        if settings.llm_api_key:
            try:
                from openai import AsyncOpenAI

                self._client = AsyncOpenAI(
                    api_key=settings.llm_api_key,
                    base_url=settings.llm_base_url,
                    timeout=settings.llm_timeout_seconds,
                    max_retries=settings.llm_max_retries,
                )
            except Exception:
                logger.warning("Failed to initialise LLM client; running rules-only")

    def is_available(self) -> bool:
        return self._client is not None

    async def generate(
        self,
        delta: str,
        diagram_type: DiagramType,
        graph_summary: str,
        scope_summary: str,
        request_id: int = 0,
        current_diagram: Optional[object] = None,
    ) -> Optional[AIResponse]:
        if not self._client:
            return None

        user_content = self._build_user_prompt(
            delta, diagram_type, graph_summary, scope_summary, current_diagram
        )

        try:
            from openai import APIError, APITimeoutError, RateLimitError

            response = await self._client.chat.completions.create(
                model=self._settings.llm_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "mindmesh_flowchart_response",
                        "strict": True,
                        "schema": AIResponse.model_json_schema(),
                    },
                },
                temperature=0,
            )

            raw = response.choices[0].message.content
            if not raw:
                logger.warning("Empty LLM response for request %d", request_id)
                return None

            ai_response = AIResponse.model_validate_json(raw)
            ai_response.request_id = request_id
            return ai_response

        except (APITimeoutError, TimeoutError):
            logger.warning("LLM timeout for request %d", request_id)
            return None
        except RateLimitError:
            logger.warning("LLM rate-limited for request %d", request_id)
            return None
        except APIError as exc:
            logger.error("LLM API error for request %d: %s", request_id, exc)
            return None
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.warning(
                "LLM response parse error for request %d: %s", request_id, exc
            )
            return None
        except Exception as exc:
            logger.error(
                "Unexpected LLM error for request %d: %s", request_id, exc
            )
            return None

    # ------------------------------------------------------------------

    def _build_user_prompt(
        self,
        delta: str,
        diagram_type: DiagramType,
        graph_summary: str,
        scope_summary: str,
        current_diagram: Optional[object] = None,
    ) -> str:
        parts: list[str] = []

        # --- New transcript to incorporate ---
        parts.append(f"New finalized utterances:\n{delta}")

        # --- Full previous diagram as JSON (preferred) or text summary ---
        if current_diagram is not None:
            try:
                diagram_json = json.dumps(
                    current_diagram.model_dump(mode="json"), indent=2
                )
                parts.append(f"Previous diagram (JSON):\n{diagram_json}")
            except Exception:
                # Fall back to text summary if serialisation fails
                if graph_summary:
                    parts.append(f"Previous diagram (summary):\n{graph_summary}")
                else:
                    parts.append("Previous diagram: empty (first diagram)")
        elif graph_summary:
            parts.append(f"Previous diagram (summary):\n{graph_summary}")
        else:
            parts.append("Previous diagram: empty — produce the first diagram.replace.")

        # --- Optional meeting context ---
        if scope_summary:
            parts.append(
                f"Meeting context (use for disambiguation, not as nodes):\n{scope_summary}"
            )

        parts.append(
            "Auto mode supports flowchart generation only. "
            "Return diagram_type='flowchart' or diagram_type='none'."
        )
        parts.append(
            "Return ONLY valid JSON matching the schema. "
            "Do NOT wrap it in markdown. Do NOT add explanations."
        )

        return "\n\n".join(parts)
