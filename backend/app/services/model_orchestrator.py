import json
import logging
from typing import Optional

from pydantic import BaseModel, Field, ValidationError

from app.config import Settings
from app.schemas.diagram import DiagramType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# AI response models (internal contract between LLM and pipeline)
# ---------------------------------------------------------------------------


class AIFactNode(BaseModel):
    key: str
    label: str
    kind: str = "step"
    status: Optional[str] = None
    description: Optional[str] = None
    lane: Optional[str] = None
    actor: Optional[str] = None
    time_label: Optional[str] = None


class AIFactEdge(BaseModel):
    source_key: str
    target_key: str
    kind: str = "sequence"
    label: Optional[str] = None


class AIDecision(BaseModel):
    diagram_type: str = "none"
    confidence: float = 0.0
    scope_relation: str = "in_scope"
    action: str = "noop"


class AIFacts(BaseModel):
    nodes: list[AIFactNode] = Field(default_factory=list)
    edges: list[AIFactEdge] = Field(default_factory=list)


class AIResponse(BaseModel):
    decision: AIDecision = Field(default_factory=AIDecision)
    facts: AIFacts = Field(default_factory=AIFacts)
    reason: str = ""
    request_id: int = 0


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a diagram extraction engine for a live meeting tool. Given meeting \
transcript text and context about the current diagram, extract structured \
semantic facts that describe a visual diagram.

Respond ONLY with valid JSON matching this schema:

{
  "decision": {
    "diagram_type": "flowchart | timeline | mindmap | orgchart | none",
    "confidence": <float 0.0-1.0>,
    "scope_relation": "in_scope | out_of_scope | correction | switch_candidate",
    "action": "update | replace | noop"
  },
  "facts": {
    "nodes": [
      {
        "key": "<unique_snake_case_semantic_key>",
        "label": "<human readable, max 56 chars>",
        "kind": "root | step | decision | milestone | person | branch",
        "status": "done | active | blocked | waiting" or null,
        "description": "<optional>" or null,
        "lane": "<optional grouping>" or null,
        "actor": "<optional person/role>" or null,
        "time_label": "<optional time ref>" or null
      }
    ],
    "edges": [
      {
        "source_key": "<semantic_key>",
        "target_key": "<semantic_key>",
        "kind": "sequence | reports_to | depends_on | branch",
        "label": "<optional>" or null
      }
    ]
  },
  "reason": "<one sentence>"
}

Rules:
- Max 12 nodes, max 16 edges, max 56 chars per label.
- Do NOT include positions, numeric IDs, or style tokens.
- Use descriptive snake_case keys (e.g. "sales_handoff").
- Same concept must always use the same key across calls.
- Return the FULL canonical in-scope graph after applying the transcript delta.
- Do NOT return delta-only nodes or edges.
- flowchart: "step"/"decision" kinds, "sequence" edges.
- timeline: "milestone" kind with "time_label", "sequence" edges.
- mindmap: "root" center + "branch" children, "depends_on" edges.
- orgchart: "person" kind with "actor", "reports_to" edges.
- Off-topic transcript: action="noop", scope_relation="out_of_scope".
- Meta-talk, acknowledgements, questions, requests, and planning chatter that \
  do not describe real process steps are off-topic.
- Examples of off-topic flowchart chatter: "okay that kind of works", \
  "what's going to happen next", "can someone send that?".
- Corrections ("actually", "no", "instead"): scope_relation="correction", \
include corrected facts.
- Prefer "update" for incremental additions.
- Use "replace" only when the structure fundamentally changes.\
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
    ) -> Optional[AIResponse]:
        if not self._client:
            return None

        user_content = self._build_user_prompt(
            delta, diagram_type, graph_summary, scope_summary
        )

        try:
            from openai import APIError, APITimeoutError, RateLimitError

            response = await self._client.chat.completions.create(
                model=self._settings.llm_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

            raw = response.choices[0].message.content
            if not raw:
                logger.warning("Empty LLM response for request %d", request_id)
                return None

            parsed = json.loads(raw)
            ai_response = AIResponse.model_validate(parsed)
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
    ) -> str:
        type_label = (
            diagram_type.value
            if diagram_type != DiagramType.NONE
            else "none (not yet determined)"
        )

        parts = [
            f'Transcript delta:\n"{delta}"',
            f"Current diagram type: {type_label}",
        ]

        if graph_summary:
            parts.append(f"Current graph:\n{graph_summary}")
        else:
            parts.append("Current graph: empty (first diagram)")

        if scope_summary:
            parts.append(f"Meeting context: {scope_summary}")

        return "\n\n".join(parts)
