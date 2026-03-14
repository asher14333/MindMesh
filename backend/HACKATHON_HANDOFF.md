# MindMesh Backend Handoff

This document is the working handoff for the hackathon backend.

It covers:
- what the current backend scaffold does
- what should happen when you run it
- what is intentionally stubbed
- how to split work across 4 people
- what each person owns, delivers, and should not touch

## Goal

Build a near-real-time backend for MindMesh that:
- accepts streamed transcript events over WebSocket
- buffers transcript instead of generating on every token
- triggers diagram generation only when appropriate
- returns typed patch or replace events to the frontend
- stays modular enough for parallel work

The current backend is hackathon-grade by design:
- in-memory sessions
- rules-based intent classifier
- stub diagram generator
- no persistent storage
- no production auth
- no job queue

## Current Backend Structure

```text
backend/
  app/
    main.py
    config.py
    api/
      routes.py
      websocket.py
    core/
      session_manager.py
    schemas/
      diagram.py
      events.py
      intent.py
    services/
      transcript_buffer.py
      trigger_engine.py
      intent_classifier.py
      diagram_generator.py
      render_adapter.py
      model_orchestrator.py
      pipeline.py
    state/
      memory_store.py
      session_state.py
  tests/
  requirements.txt
```

## What Happens If You Run It

### Command

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Expected behavior

If you run it on your machine outside the sandbox:

1. The FastAPI app boots.
2. Startup initializes:
   - `SessionManager`
   - `SessionPipeline`
3. `GET /api/health` returns:

```json
{ "status": "ok" }
```

4. A WebSocket client can connect to:

```text
/ws/{session_id}
```

5. On connect, the server sends an initial status event:

```json
{
  "type": "status",
  "session_id": "demo-session",
  "mode": "standby",
  "message": "connected",
  "diagram_type": null
}
```

6. While in `standby`, transcript events are accepted and echoed back as `transcript.update`, but diagram generation does not run until visualization is enabled.

7. When the client sends:

```json
{
  "type": "ui.command",
  "command": "visualize.toggle",
  "payload": { "enabled": true }
}
```

the session enters `visualizing` mode.

8. After that, generation is triggered when one of the current trigger rules is met:
   - `speech.final`
   - sentence boundary
   - enough new text
   - manual `visualize.generate`
   - manual `pause.detected`

9. The backend then emits:
   - `intent.result`
   - followed by `diagram.replace` the first time
   - then `diagram.patch` on later updates when patch append is possible

## What Is Already Working

- FastAPI app setup
- WebSocket endpoint
- typed event parsing
- per-session in-memory state
- transcript buffering
- generation gating through session mode
- simple rule-based intent classification
- stub document generation
- patch-vs-replace path
- basic layout assignment for frontend rendering

## What Is Not Done Yet

These are the main gaps:

- real pause detection timer
- real LLM integration
- stronger patch merge logic
- explicit timeline generator behavior
- robust diagram corrections / regeneration strategy
- tests
- frontend WebSocket wiring
- speech-to-text integration

## Important Current Behavior Notes

### The backend does not generate continuously

This is intentional.

Generation only happens after trigger checks in:
- `app/services/trigger_engine.py`

### The backend prefers patch updates

This is also intentional.

First diagram:
- `diagram.replace`

Later incremental updates:
- `diagram.patch`

Fallback:
- full `diagram.replace`

### Layout is server-side right now

This keeps node IDs and basic positions stable for the frontend.

The frontend should render what it receives, not invent IDs or re-layout aggressively on every message.

## Team Split For 4 People

Use this split exactly unless someone gets blocked.

### Person 1: Gateway + Session State

Owns:
- `app/api/websocket.py`
- `app/core/session_manager.py`
- `app/state/memory_store.py`
- `app/state/session_state.py`
- `app/schemas/events.py`

Responsibilities:
- finalize WebSocket message flow
- handle session start/stop/connect/disconnect cleanly
- harden event validation
- define exact inbound/outbound event contracts
- support multiple browser clients if needed for the demo

Deliverables:
- stable session lifecycle
- no event parsing ambiguity
- connection-safe session handling
- sample WebSocket message script or Postman collection

Do not own:
- trigger rules
- intent logic
- LLM prompt logic
- frontend canvas rendering

### Person 2: Transcript Buffer + Trigger Engine

Owns:
- `app/services/transcript_buffer.py`
- `app/services/trigger_engine.py`
- trigger-related parts of `app/services/pipeline.py`

Responsibilities:
- implement real pause detection behavior
- track transcript offsets cleanly
- prevent spam generation
- define exact trigger precedence
- support manual commands like:
  - `visualize.generate`
  - `pause.detected`
  - `diagram.reset`

Deliverables:
- deterministic generation rules
- cooldown behavior
- clear unread transcript slice logic
- edge-case handling for partial vs final transcript

Do not own:
- diagram schema
- diagram layout
- frontend WebSocket client

### Person 3: Intent + Diagram Generation + AI

Owns:
- `app/services/intent_classifier.py`
- `app/services/diagram_generator.py`
- `app/services/model_orchestrator.py`
- AI-related parts of `app/services/pipeline.py`
- `app/schemas/diagram.py`
- `app/schemas/intent.py`

Responsibilities:
- replace rules-only logic with hybrid rules + model fallback
- define strict prompt + schema for diagram generation
- make patch generation better than naive append
- support all four diagram modes:
  - flowchart
  - timeline
  - mindmap
  - orgchart

Deliverables:
- model prompts
- schema-safe AI output
- fallback strategy
- transcript-to-diagram examples

Do not own:
- session connection logic
- frontend rendering details

### Person 4: Frontend Integration + Render Contract

Owns:
- frontend WebSocket client
- React Flow integration
- diagram event handling in the client
- coordination with `render_adapter.py`

Backend touch points:
- `app/services/render_adapter.py`
- event contract consumption from `app/schemas/events.py`

Responsibilities:
- consume `diagram.replace` and `diagram.patch`
- map server nodes/edges into React Flow
- avoid full rerender when patch events arrive
- implement standby state vs visualizing state in the UI

Deliverables:
- WebSocket client hookup
- diagram state store in frontend
- patch application logic
- demo-ready toggling from meeting view to visual mode

Do not own:
- session internals
- trigger heuristics
- model prompt engineering

## Integration Contract Between All 4 People

This is the boundary everyone should respect.

### Inbound events to backend

```json
{ "type": "session.start", "meeting_title": "Enterprise Customer Onboarding Approval Flow" }
{ "type": "speech.partial", "text": "first sales hands off to solutions engineering" }
{ "type": "speech.final", "text": "then security reviews the compliance setup." }
{ "type": "ui.command", "command": "visualize.toggle", "payload": { "enabled": true } }
```

### Outbound events from backend

```json
{
  "type": "transcript.update",
  "text": "then security reviews the compliance setup.",
  "is_final": true
}
```

```json
{
  "type": "intent.result",
  "result": {
    "diagram_type": "flowchart",
    "confidence": 0.85,
    "action": "update",
    "reason": "flow_keywords"
  }
}
```

```json
{
  "type": "diagram.patch",
  "patch": {
    "diagram_type": "flowchart",
    "ops": [
      { "op": "add_node", "data": { "id": "n3", "label": "Security review", "kind": "step" } }
    ],
    "version": 2,
    "reason": "append"
  }
}
```

## Recommended Working Order

Do this in order:

1. Person 1 stabilizes event contracts and WebSocket flow.
2. Person 2 finalizes trigger logic and transcript slicing.
3. Person 3 plugs in AI and improves patch generation.
4. Person 4 wires frontend to backend and consumes patch events.

Then do a full-team integration pass.

## Suggested Branch Plan

Use one branch per owner:

- `feature/backend-gateway`
- `feature/backend-triggers`
- `feature/backend-ai`
- `feature/frontend-live-diagram`

Merge order:

1. gateway
2. triggers
3. ai
4. frontend integration

## Definition Of Done For Demo

The demo is good enough when:

- the frontend can connect to the backend over WebSocket
- transcript chunks stream in
- visualize toggle turns generation on
- first diagram appears as `diagram.replace`
- later updates arrive as `diagram.patch`
- the canvas updates without full reset
- one diagram type works extremely well
- the other diagram types work at least at a basic level

## Suggested Demo Script

Use this exact narrative for the first end-to-end run:

1. Join meeting in standby mode.
2. Click `Turn On MindMesh`.
3. Send transcript:
   - "First sales hands off the deal to solutions engineering."
   - "Then security reviews the integration requirements."
   - "After security sign-off, legal approves the MSA."
   - "Finally provisioning starts and customer success is notified."
4. Expect:
   - flowchart intent
   - first replace event
   - later patch events

## Immediate Next Tasks

### Highest priority

- Person 1: add a tiny script to manually exercise the WebSocket endpoint
- Person 2: implement actual pause-based triggering
- Person 3: replace stub generation with model-backed schema output
- Person 4: wire frontend to `diagram.replace` and `diagram.patch`

### Nice to have

- tests for event parsing
- tests for trigger decisions
- tests for patch merge
- session replay logging

## Final Notes

Keep the system bounded.

Do not turn this into a fully autonomous agent.

For the hackathon, the winning behavior is:
- stable
- understandable
- visibly real-time
- patch-based
- demo-safe

That matters more than sophistication.
