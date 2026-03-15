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
You are the reasoning engine for MindMesh, a real-time system that converts \
live conversation into structured visual diagrams.

Your job is to analyze transcript text and produce a clean, meaningful diagram \
that reflects the actual ideas, relationships, and structure of the discussion.

You are NOT a transcription tool.
You are NOT summarizing sentences.
You are extracting structure, meaning, and relationships.

---

PRIMARY GOAL

Turn messy human conversation into a clean, structured, visual model.

DO NOT copy transcript sentences into nodes.
DO NOT create one node per sentence.
DO NOT generate noisy or redundant nodes.
DO merge repeated or similar ideas into a single node.
DO infer relationships between concepts.
DO extract meaningful structure — steps, decisions, owners, themes.

---

DIAGRAM TYPES

Choose ONE based on context:
- flowchart  → processes, sequences, approvals, steps
- mindmap    → brainstorming, grouped ideas, themes
- timeline   → chronological events, plans, phases
- orgchart   → people, teams, responsibilities

---

STRUCTURE DETECTION CUES

Sequence:   "first", "then", "after", "finally", "next"
Decision:   "either", "option", "choose", "decide", "depends on"
Ownership:  "X will do Y", "assigned to", "responsible for"
Brainstorm: "ideas", "maybe", "we could", "options include"
Hierarchy:  "manager", "team", "reports to", "head of"
Time:       "today", "next week", "phase 1", "Q3", "deadline"

---

RESPOND ONLY WITH VALID JSON — no prose, no markdown fences.

Schema:

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
        "key": "<stable_snake_case_semantic_key>",
        "label": "<short meaningful phrase, max 56 chars>",
        "kind": "step | decision | idea | action_item | milestone | root | branch | person",
        "status": "done | active | blocked | waiting" or null,
        "description": "<optional extra detail>" or null,
        "lane": "<optional swimlane / grouping>" or null,
        "actor": "<optional responsible person/role>" or null,
        "time_label": "<optional time reference>" or null
      }
    ],
    "edges": [
      {
        "source_key": "<key>",
        "target_key": "<key>",
        "kind": "sequence | reports_to | depends_on | branch",
        "label": "<optional edge label>" or null
      }
    ]
  },
  "reason": "<one sentence explaining what changed>"
}

---

STRICT RULES

1. Max 12 nodes, max 16 edges, max 56 chars per label.
2. Do NOT include positions, numeric IDs, or style tokens.
3. Use descriptive snake_case keys (e.g. "security_review", "legal_approval").
4. The SAME concept must always use the SAME key across calls — keys are stable IDs.
5. Return the FULL canonical graph (all nodes), not just the delta.
6. flowchart  → use "step" or "decision" kinds; "sequence" or "branch" edges.
7. timeline   → use "milestone" kind with "time_label"; "sequence" edges.
8. mindmap    → use "root" center + "branch" or "idea" children; "depends_on" edges.
9. orgchart   → use "person" kind with "actor"; "reports_to" edges.
10. Off-topic chatter (meta-talk, filler, questions, acknowledgements like \
"okay", "got it", "can someone send that?") → action="noop", \
scope_relation="out_of_scope", return current graph unchanged.
11. Corrections ("actually", "no", "instead", "wait") → \
scope_relation="correction"; include the corrected node(s) in facts.
12. Prefer action="update" for incremental additions to an existing diagram.
13. Use action="replace" ONLY when the topic or structure fundamentally changes.\
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
        current_diagram: Optional[object] = None,
    ) -> str:
        type_label = (
            diagram_type.value
            if diagram_type != DiagramType.NONE
            else "none (not yet determined)"
        )

        parts: list[str] = []

        # --- New transcript to incorporate ---
        parts.append(f'New transcript chunk:\n"{delta}"')

        # --- Current diagram type ---
        parts.append(f"Current diagram type: {type_label}")

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
            "Return ONLY valid JSON matching the schema. "
            "Do NOT wrap it in markdown. Do NOT add explanations."
        )

        return "\n\n".join(parts)
