# MindMesh Demo AI + Diagram Contract Plan

## Summary
##
Implement a bounded, low-latency backend pipeline that converts triggered transcript deltas into stable, versioned diagram updates for React Flow. The backend will use a hybrid rules-first plus model-fallback intent path, maintain a sticky per-session diagram scope after the first strong classification, generate semantic facts instead of UI primitives from AI, and deterministically convert those facts into `diagram.replace` and `diagram.patch` events with stable IDs, monotonic versions, and server-owned layout.
#
Demo target:

- one excellent `flowchart` path
- functional `orgchart`, `timeline`, and `mindmap`
- visibly live updates without canvas resets
- strong filtering of off-topic transcript once a diagram session is locked

## Key Changes

### 1. Session state and transcript processing

Add diagram-session fields to `app/state/session_state.py`:

- `locked_diagram_type: DiagramType | NONE`
- `scope_summary: str`
- `scope_keywords: list[str]`
- `semantic_index: dict[str, str]`
- `last_processed_offset: int`
- `switch_streak: int`
- `last_request_id: int`
- `last_applied_version: int`

> **Ownership note**: `session_state.py` is Person 1's file. These fields are diagram-session state that Person 3 needs. Coordinate with Person 1 or add them directly since the fields are additive and non-breaking.

Change transcript handling so there are two distinct cursors:

- `last_processed_offset`: how much raw transcript has been evaluated for diagram relevance
- `last_generated_offset`: how much accepted in-scope transcript has been turned into graph output (already exists)

Processing rules:

- Every trigger evaluates only the raw delta since `last_processed_offset`.
- The system classifies the delta as `in_scope`, `out_of_scope`, `correction`, or `switch_candidate`.
- `out_of_scope` transcript advances `last_processed_offset` but does not advance `last_generated_offset`.
- Accepted transcript is appended to a diagram-specific working context and becomes eligible for generation.
- Corrections are preserved separately from generic transcript so they can trigger relabel, reorder, or replace behavior.

### 2. Intent, scope lock, and model orchestration

Refactor the intent path so `app/services/pipeline.py` performs four steps after a trigger:

1. Fast relevance filter on the new transcript delta.
2. Rules-based classification attempt.
3. Model fallback only when rules are low-confidence, conflicting, or indicate correction or switch.
4. Deterministic planning into graph operations.

Intent behavior:

- Before lock: classify transcript against all four diagram types plus `none`.
- Lock when either:
  - one explicit high-confidence signal is present, or
  - two consecutive medium-confidence signals agree.
- After lock: default to the locked diagram type and treat unrelated transcript as `out_of_scope`.
- Unlock only on:
  - `diagram.reset`
  - explicit manual diagram type override
  - `switch_streak >= 2` with strong, consistent alternative evidence

Confidence policy:

- `>= 0.85`: trust rules or model result directly
- `0.65 - 0.84`: accept only if consistent with current lock or repeated twice
- `< 0.65`: `NOOP`

Routing policy in the model orchestrator:

- `fast`: rules-only result, no model call
- `fallback`: model classification only
- `repair`: model asked to reinterpret the latest accepted context against current graph for correction or replacement
- `noop`: skip model call entirely

Diagram-type rules:

- `flowchart`: default path when there are sequence or process cues
- `orgchart`: only on explicit reporting, role, or hierarchy language
- `timeline`: only on explicit time anchors or chronological framing
- `mindmap`: only on explicit themes, categories, or idea clustering language

### 3. LLM integration and model-agnostic provider

Use the **OpenAI Python SDK** (`openai`) as the LLM interface. This provides model-agnosticism because OpenAI, Groq, Together, Fireworks, Anthropic (via OpenAI-compatible endpoints), and other providers all support the same API format. Switching providers requires only changing `base_url`, `api_key`, and `model` in config.

Add to `app/config.py`:

- `llm_api_key: str` (from env `MINDMESH_LLM_API_KEY`)
- `llm_base_url: str` (default `https://api.openai.com/v1`, swap for Groq/Together/etc.)
- `llm_model: str` (default `gpt-4o-mini`, the fast/cheap option for hackathon)
- `llm_timeout_seconds: float` (default `8.0`)
- `llm_max_retries: int` (default `1`)

LLM call pattern:

- Use `openai.AsyncOpenAI` for non-blocking calls inside the async pipeline.
- Use `response_format={"type": "json_object"}` for structured JSON output.
- Parse and validate the response with Pydantic against the semantic facts schema.
- On parse failure, treat as `noop` and log the raw response for debugging.

Provider swap examples:

- **OpenAI**: `base_url=https://api.openai.com/v1`, `model=gpt-4o-mini`
- **Groq**: `base_url=https://api.groq.com/openai/v1`, `model=llama-3.3-70b-versatile`
- **Together**: `base_url=https://api.together.xyz/v1`, `model=meta-llama/Llama-3-70b-chat-hf`

### 4. AI contract: semantic facts, not React Flow entities

The model must return schema-safe semantic JSON, never raw React Flow nodes or edges.

Use an internal structured response shape:

```json
{
  "decision": {
    "diagram_type": "flowchart|timeline|mindmap|orgchart|none",
    "confidence": 0.0,
    "scope_relation": "in_scope|out_of_scope|correction|switch_candidate",
    "action": "update|replace|noop"
  },
  "facts": {
    "nodes": [
      {
        "key": "semantic_key",
        "label": "Human label",
        "kind": "root|step|decision|milestone|person|branch",
        "status": "done|active|blocked|waiting|null",
        "description": "optional",
        "lane": "optional",
        "actor": "optional",
        "time_label": "optional"
      }
    ],
    "edges": [
      {
        "source_key": "semantic_key",
        "target_key": "semantic_key",
        "kind": "sequence|reports_to|depends_on|branch",
        "label": "optional"
      }
    ]
  },
  "reason": "short_machine_reason"
}
```

Model prompt constraints:

- Input includes only:
  - accepted transcript delta
  - locked diagram type
  - compact current graph summary
  - scope summary
- Output limits:
  - max 12 nodes
  - max 16 edges
  - max label length 56 chars
  - no positions
  - no IDs
  - no style tokens
- If confidence is weak, return `action=noop`.

### 5. Deterministic graph building, patching, and payload contract

Extend `app/schemas/diagram.py` to support a React-Flow-compatible but backend-owned wire contract.

`DiagramNode` should include:

- `id`
- `type`
- `position`
- `hidden`
- optional `parent_id`
- `data` with:
  - `label`
  - `kind`
  - `status`
  - `description`
  - `lane`
  - `actor`
  - `time_label`
  - `confidence`
  - `source_span`
  - `metadata`

`DiagramEdge` should include:

- `id`
- `source`
- `target`
- `type`
- `label`
- `hidden`
- `animated`
- optional handles
- `data.kind`
- `data.confidence`

`DiagramDocument` should include:

- `diagram_id`
- `diagram_type`
- `version`
- `layout_version`
- `viewport_hint`
- `nodes`
- `edges`

`DiagramPatch` should include:

- `diagram_id`
- `diagram_type`
- `base_version`
- `version`
- `reason`
- `layout_changed`
- `viewport_hint`
- ops:
  - `add_node { node }`
  - `update_node { node }`
  - `remove_node { id }`
  - `add_edge { edge }`
  - `update_edge { edge }`
  - `remove_edge { id }`

`IntentResult` should be extended with:

- `scope_relation: ScopeRelation` (enum: `in_scope`, `out_of_scope`, `correction`, `switch_candidate`)

Graph construction rules:

- Backend owns IDs and positions.
- IDs are derived from semantic keys and stay stable across updates.
- Full replace is the first render and any structural reset.
- Patch is used only for local changes against a matching `base_version`.
- `version` is monotonic across both replace and patch and never reset to `1` after the session starts.
- If any existing node moves, emit `update_node` with new position for that node.
- If layout changes more than 30 percent of existing nodes, emit `diagram.replace` instead of a patch.
- If a node is removed, connected edges must also be removed in the same patch or by replace.

Patch policy:

- Patch for append, relabel, status update, one-edge add or remove, one-node add or remove.
- Replace for diagram type change, hierarchy reparenting, major reorder, ambiguous correction, or stale base version.

### 6. Layout and server contract

Layout policy (server-owned, implemented in `render_adapter.py`):

- Server remains the source of truth for layout.
- Preserve existing positions whenever possible.
- Only assign positions to new nodes on append patches.
- Use deterministic templates per diagram type:
  - `flowchart`: left-to-right linear or branched
  - `timeline`: left-to-right time anchors
  - `mindmap`: centered root with radial or grid branches
  - `orgchart`: top-down hierarchy

Client contract (reference for Person 4):

- Use controlled `nodes` and `edges`.
- Apply websocket updates immutably.
- Preserve object identity for untouched nodes and edges.
- Apply server patches inside `startTransition`.
- Use `fitView` only on first `diagram.replace`, reset, or explicit type switch.
- Do not relayout client-side on every message.
- Keep dragging disabled for demo unless the backend later supports pinning positions.
- Support `hidden` nodes and edges for future subtree collapsing without changing the contract.

Latency targets:

- rules-only path: under 150 ms server-side
- model-backed update: under 1 s perceived latency
- bound payload size and graph size rather than optimizing for perfect semantic coverage

### 7. Failure handling and stale-result protection

Edge-case behavior:

- Duplicate partial or final transcript: dedupe before interpretation.
- Empty or filler-only transcript: `noop`.
- Off-topic meeting chatter after lock: `out_of_scope`, advance processed cursor, no graph update.
- Correction phrases like "actually", "no, it reports to", or "instead": mark as `correction` and prefer repair or replace if structure changes.
- Conflicting simultaneous model responses: drop any response whose `request_id` is older than `last_request_id`.
- Patch with mismatched `base_version`: do not emit; generate a full replace instead.
- No valid graph facts from AI: `intent.result` may still emit, but no diagram event.
- Lock drift: if two consecutive strong alternative classifications arrive, replace and re-lock to the new type.

LLM failure handling:

- **Timeout**: if the LLM call exceeds `llm_timeout_seconds`, treat as `noop`. The next trigger will retry with fresh context.
- **Rate limit / 429**: back off and treat as `noop`. Log the error. Do not block the WebSocket event loop.
- **Malformed JSON response**: parse with Pydantic; on `ValidationError`, log the raw response and treat as `noop`.
- **API key missing or invalid**: fail fast at startup with a clear error message. In demo mode, fall back to rules-only classification (no model calls).
- **Network error**: treat as `noop` and let the next trigger cycle retry.

## Implementation Phases

Person 3 should build in this order:

### Phase 1: Schemas and config (build first, unblocks everything)

1. Extend `app/schemas/intent.py` with `ScopeRelation` enum and add `scope_relation` to `IntentResult`.
2. Extend `app/schemas/diagram.py` with the full `DiagramNode`, `DiagramEdge`, `DiagramDocument`, `DiagramPatch` contracts from Section 5.
3. Add LLM config fields to `app/config.py`.
4. Add `openai` to `requirements.txt`.
5. Add diagram-session fields to `app/state/session_state.py`.

### Phase 2: Model orchestrator (LLM integration)

1. Implement `ModelOrchestrator` with async OpenAI client, prompt construction, structured response parsing, and error handling.
2. Build the prompt template for semantic fact extraction.
3. Validate responses against Pydantic models.

### Phase 3: Intent classifier (hybrid rules + model)

1. Upgrade `IntentClassifier` with expanded keyword sets, confidence scoring, and `scope_relation` classification.
2. Add scope lock logic (lock, unlock, switch_streak tracking).
3. Wire model fallback for low-confidence or correction cases.

### Phase 4: Diagram generator (semantic facts to graph ops)

1. Replace stub generation with semantic-key-based node/edge construction.
2. Implement stable ID derivation from semantic keys.
3. Implement smart patch generation (diff-based, not naive append).
4. Support all four diagram type builders.

### Phase 5: Pipeline integration

1. Refactor `pipeline.py` to use the 4-step flow (filter, classify, model fallback, plan).
2. Wire scope filtering and offset tracking.
3. End-to-end test with the demo script from the handoff.

## Test Plan

Add backend tests that cover:

- first strong orgchart utterance locks the session to `orgchart`
- unrelated later transcript is classified `out_of_scope` and does not update the graph
- two weak alternative utterances do not break the lock
- two strong alternative utterances trigger a type switch and full replace
- corrections relabel or restructure the graph correctly
- monotonic `version` across replace and patch events
- stale model result is discarded
- patch with stale `base_version` falls back to replace
- remove-node behavior also removes dependent edges
- position-preserving patch updates do not relayout untouched nodes
- `flowchart` demo script produces first replace then later patches
- `timeline` only activates with explicit time markers
- `mindmap` only activates with category or theme language
- `orgchart` requires explicit reporting language
- LLM timeout falls back to noop without blocking
- malformed LLM response is caught and treated as noop

Acceptance criteria for the demo:

- first usable diagram appears within one trigger cycle after visualization is enabled
- later in-scope transcript updates the same graph without canvas reset
- off-topic transcript after lock does not pollute the diagram
- one end-to-end flowchart demo works flawlessly with patch-based updates

## Assumptions and Defaults

- Demo-first bias: prefer stability over sophistication.
- `flowchart` is the default fallback when there is meaningful process language.
- Sticky lock is enabled after the first strong classification and persists until reset, manual override, or strong repeated switch.
- AI is used for semantic extraction and repair, not direct graph rendering.
- The backend remains authoritative for IDs, versions, and layout.
- The current frontend in `client/components/process-canvas.tsx` will be replaced by a controlled React Flow view that consumes this contract directly.
- LLM provider is swappable via config without code changes. Default to `gpt-4o-mini` for speed and cost during hackathon.
- If no LLM API key is configured, the system operates in rules-only mode (no model calls, `fast` path always).
