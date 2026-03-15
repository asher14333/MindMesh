import asyncio

from app.config import Settings
from app.schemas.diagram import DiagramPatch, DiagramType
from app.schemas.events import (
    DiagramPatchEvent,
    DiagramReplaceEvent,
    IntentResultEvent,
    SpeechFinalEvent,
    SpeechPartialEvent,
    TranscriptUpdateEvent,
    UICommandEvent,
)
from app.services.model_orchestrator import (
    AIDecision,
    AIFactEdge,
    AIFactNode,
    AIFacts,
    AIResponse,
)
from app.services.pipeline import SessionPipeline
from app.state.session_state import SessionMode, SessionState


def _run(pipeline: SessionPipeline, state: SessionState, event):
    return asyncio.run(pipeline.handle_event(state, event))


def _settings() -> Settings:
    return Settings(
        generation_cooldown_seconds=0.0,
        min_new_chars=1,
    )


def _flush(pipeline: SessionPipeline, state: SessionState):
    return _run(
        pipeline,
        state,
        UICommandEvent(type="ui.command", command="pause.detected", payload={}),
    )


def _speak_and_flush(
    pipeline: SessionPipeline, state: SessionState, text: str
):
    return _run(
        pipeline,
        state,
        SpeechFinalEvent(type="speech.final", text=text),
    ) + _flush(pipeline, state)


def _ai_response_for_flowchart_graph(
    labels: list[str],
    *,
    action: str = "update",
    scope_relation: str = "in_scope",
    request_id: int = 0,
) -> AIResponse:
    nodes = []
    edges = []
    previous_key = None
    for label in labels:
        key = label.lower().replace(" ", "_")
        nodes.append(AIFactNode(key=key, label=label, kind="step"))
        if previous_key:
            edges.append(
                AIFactEdge(
                    source_key=previous_key,
                    target_key=key,
                    kind="sequence",
                )
            )
        previous_key = key
    return AIResponse(
        decision=AIDecision(
            diagram_type="flowchart",
            confidence=0.9,
            scope_relation=scope_relation,
            action=action,
        ),
        facts=AIFacts(
            nodes=nodes,
            edges=edges,
        ),
        reason="canonical_flowchart_stub",
        request_id=request_id,
    )


class _CanonicalFlowchartModelOrchestrator:
    def is_available(self) -> bool:
        return True

    async def generate(
        self,
        delta: str,
        diagram_type: DiagramType,
        graph_summary: str,
        scope_summary: str,
        request_id: int = 0,
        current_diagram=None,
    ) -> AIResponse:
        normalized = delta.lower()
        if "provisioning starts" in normalized:
            return _ai_response_for_flowchart_graph(
                [
                    "Sales hands off the deal to solutions engineering",
                    "Security reviews the integration requirements",
                    "Legal approves the MSA",
                    "Provisioning starts and customer success is notified",
                ],
                request_id=request_id,
            )
        if "legal approves" in normalized:
            return _ai_response_for_flowchart_graph(
                (
                    [
                        "Sales hands off the deal to solutions engineering",
                        "Legal approves the MSA",
                    ]
                    if "actually" in normalized
                    else [
                        "Sales hands off the deal to solutions engineering",
                        "Security reviews the integration requirements",
                        "Legal approves the MSA",
                    ]
                ),
                action="replace" if "actually" in normalized else "update",
                scope_relation="correction" if "actually" in normalized else "in_scope",
                request_id=request_id,
            )
        if "security reviews" in normalized:
            return _ai_response_for_flowchart_graph(
                [
                    "Sales hands off the deal to solutions engineering",
                    "Security reviews the integration requirements",
                ],
                request_id=request_id,
            )
        if "sales hands off" in normalized:
            return _ai_response_for_flowchart_graph(
                ["Sales hands off the deal to solutions engineering"],
                request_id=request_id,
            )
        if "okay that kind of works" in normalized or "what's going to happen next" in normalized:
            return AIResponse(
                decision=AIDecision(
                    diagram_type="flowchart",
                    confidence=0.92,
                    scope_relation="out_of_scope",
                    action="noop",
                ),
                reason="meta_chatter",
                request_id=request_id,
            )
        return AIResponse(request_id=request_id)


class _DelayedCanonicalFlowchartModelOrchestrator(_CanonicalFlowchartModelOrchestrator):
    def __init__(self, delay_seconds: float = 0.01) -> None:
        self.delay_seconds = delay_seconds

    async def generate(
        self,
        delta: str,
        diagram_type: DiagramType,
        graph_summary: str,
        scope_summary: str,
        request_id: int = 0,
        current_diagram=None,
    ) -> AIResponse:
        await asyncio.sleep(self.delay_seconds)
        return await super().generate(
            delta=delta,
            diagram_type=diagram_type,
            graph_summary=graph_summary,
            scope_summary=scope_summary,
            request_id=request_id,
            current_diagram=current_diagram,
        )


def test_pipeline_replaces_then_patches_for_flowchart_updates() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="demo", mode=SessionMode.STANDBY)

    toggle_events = _run(
        pipeline,
        state,
        UICommandEvent(
            type="ui.command",
            command="visualize.toggle",
            payload={"enabled": True},
        ),
    )
    assert state.mode == SessionMode.VISUALIZING
    assert len(toggle_events) == 1

    first_events = _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )

    assert [type(event) for event in first_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert state.diagram_type == DiagramType.FLOWCHART
    assert state.locked_diagram_type is None
    assert state.switch_streak == 0

    second_events = _speak_and_flush(
        pipeline,
        state,
        "Then security reviews the integration requirements.",
    )

    assert [type(event) for event in second_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert state.last_generated_utterance_index == 2
    assert state.diagram.version == 2
    assert len(state.diagram.nodes) == 2


def test_pipeline_flowchart_ai_canonical_graph_appends_without_committed_noise() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="ai-flowchart", mode=SessionMode.VISUALIZING)

    first_events = _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )
    assert [type(event) for event in first_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering"
    ]

    second_events = _speak_and_flush(
        pipeline,
        state,
        "Then security reviews the integration requirements.",
    )
    assert [type(event) for event in second_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering",
        "Security reviews the integration requirements",
    ]

    third_events = _speak_and_flush(
        pipeline,
        state,
        "After security sign-off, legal approves the MSA.",
    )
    assert [type(event) for event in third_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering",
        "Security reviews the integration requirements",
        "Legal approves the MSA",
    ]

    fourth_events = _speak_and_flush(
        pipeline,
        state,
        "Finally provisioning starts and customer success is notified.",
    )
    assert [type(event) for event in fourth_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering",
        "Security reviews the integration requirements",
        "Legal approves the MSA",
        "Provisioning starts and customer success is notified",
    ]
    assert state.diagram.version == 4
    assert len(state.diagram.edges) == 3
    assert state.accepted_utterances == [
        "Sales hands off the deal to solutions engineering",
        "Security reviews the integration requirements",
        "Legal approves the MSA",
        "Provisioning starts and customer success is notified",
    ]


def test_pipeline_replaces_when_linear_flow_becomes_diagram_choice_branch() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="branching-flow", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First we receive audio from the meeting.",
    )
    _speak_and_flush(
        pipeline,
        state,
        "Then we infer the text via STT.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Then we address intent and create 1 of 4 diagrams.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert state.diagram.version == 3
    assert [node.data.label for node in state.diagram.nodes] == [
        "We receive audio from the meeting",
        "We infer the text via STT",
        "Address intent",
        "Flowchart",
        "Timeline",
        "Mindmap",
        "Orgchart",
    ]
    assert state.accepted_utterances == [
        "We receive audio from the meeting",
        "We infer the text via STT",
        "We address intent and create 1 of 4 diagrams",
    ]
    assert state.scope_summary == (
        "We receive audio from the meeting -> "
        "We infer the text via STT -> "
        "Address intent -> "
        "{Flowchart | Timeline | Mindmap | Orgchart}"
    )


def test_pipeline_replaces_when_inline_or_creates_branch() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="inline-or-branch", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "So first off we start with the sales team passing it to the solutions engineering team.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Then they pass it off to the product team or the engineering team.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "So first off we start with the sales team passing it to\u2026",
        "They pass it off",
        "Product team",
        "Engineering team",
    ]
    assert [(edge.source, edge.target, edge.data.kind) for edge in state.diagram.edges] == [
        (
            "n-so-first-off-we-start-with-the-sales-team-passing-it-to",
            "n-they-pass-it-off",
            "sequence",
        ),
        ("n-they-pass-it-off", "n-product-team", "branch"),
        ("n-they-pass-it-off", "n-engineering-team", "branch"),
    ]
    assert state.scope_summary == (
        "So first off we start with the sales team passing it to\u2026 -> "
        "They pass it off -> "
        "{Product team | Engineering team}"
    )


def test_pipeline_replaces_when_branch_children_arrive_in_followup_utterance() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="branch-followup", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "Transform it into some sort of intent and then we map it out.",
    )
    _speak_and_flush(
        pipeline,
        state,
        "And then we branch out into two categories.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "One being that it is relevant the other being that it's not relevant.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Transform it into some sort of intent and then we map i\u2026",
        "And then we branch out into two categories",
        "Relevant",
        "Not relevant",
    ]
    assert [(edge.source, edge.target, edge.data.kind) for edge in state.diagram.edges] == [
        (
            "n-transform-it-into-some-sort-of-intent-and-then-we-map-i",
            "n-and-then-we-branch-out-into-two-categories",
            "sequence",
        ),
        (
            "n-and-then-we-branch-out-into-two-categories",
            "n-relevant",
            "branch",
        ),
        (
            "n-and-then-we-branch-out-into-two-categories",
            "n-not-relevant",
            "branch",
        ),
    ]
    assert state.scope_summary == (
        "Transform it into some sort of intent and then we map i\u2026 -> "
        "And then we branch out into two categories -> "
        "{Relevant | Not relevant}"
    )


def test_pipeline_does_not_generate_or_broadcast_from_partials() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="partials", mode=SessionMode.VISUALIZING)

    events = _run(
        pipeline,
        state,
        SpeechPartialEvent(
            type="speech.partial",
            text="First sales hands off the",
        ),
    )

    assert events == []
    assert state.committed_transcript == ""
    assert state.preview_transcript == "First sales hands off the"
    assert state.diagram.version == 0
    assert state.telemetry.dropped_partials == 1


def test_partial_heavy_sequence_matches_final_only_diagram() -> None:
    pipeline = SessionPipeline(_settings())
    partial_state = SessionState(session_id="partial-heavy", mode=SessionMode.VISUALIZING)
    final_only_state = SessionState(session_id="final-only", mode=SessionMode.VISUALIZING)
    final_text = "First sales hands off the deal to solutions engineering."

    for partial in (
        "First sales",
        "First sales hands off",
        "First sales hands off the deal",
        "First sales hands off the deal to solutions",
    ):
        _run(
            pipeline,
            partial_state,
            SpeechPartialEvent(type="speech.partial", text=partial),
        )

    partial_events = _speak_and_flush(pipeline, partial_state, final_text)
    final_events = _speak_and_flush(pipeline, final_only_state, final_text)

    assert [type(event) for event in partial_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [type(event) for event in final_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert partial_state.committed_transcript == final_only_state.committed_transcript
    assert partial_state.committed_utterances == [final_text]
    assert [node.data.label for node in partial_state.diagram.nodes] == [
        node.data.label for node in final_only_state.diagram.nodes
    ]
    assert [edge.id for edge in partial_state.diagram.edges] == [
        edge.id for edge in final_only_state.diagram.edges
    ]


def test_pipeline_flowchart_first_ignores_non_flowchart_content() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(
        session_id="flowchart-first",
        mode=SessionMode.VISUALIZING,
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Alice reports to Bob in the organization chart.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
    ]
    assert state.diagram.version == 0
    assert state.last_generated_offset == len(state.committed_transcript)


def test_pipeline_reset_clears_scope_and_offsets() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(
        session_id="reset-session",
        mode=SessionMode.VISUALIZING,
        locked_diagram_type=DiagramType.FLOWCHART,
        diagram_type=DiagramType.FLOWCHART,
        committed_transcript="existing transcript",
        preview_transcript="existing preview",
        committed_utterances=["existing transcript"],
        accepted_utterances=["Accepted step"],
        last_generated_offset=5,
        last_processed_offset=10,
        switch_streak=2,
        last_request_id=7,
        last_applied_version=3,
    )

    events = _run(
        pipeline,
        state,
        UICommandEvent(type="ui.command", command="diagram.reset", payload={}),
    )

    assert isinstance(events[0], DiagramReplaceEvent)
    assert state.diagram_type == DiagramType.NONE
    assert state.locked_diagram_type is None
    assert state.committed_transcript == ""
    assert state.preview_transcript == ""
    assert state.committed_utterances == []
    assert state.accepted_utterances == []
    assert state.last_generated_offset == 0
    assert state.last_generated_utterance_index == 0
    assert state.last_processed_offset == 0
    assert state.switch_streak == 0
    assert state.last_request_id == 8
    assert state.last_applied_version == 0


def test_pipeline_falls_back_to_replace_when_patch_base_version_is_stale(monkeypatch) -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="stale", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )

    original_build_patch = pipeline._build_patch

    def _stale_patch(*args, **kwargs):
        patch = original_build_patch(*args, **kwargs)
        assert patch is not None
        return DiagramPatch(
            diagram_id=patch.diagram_id,
            diagram_type=patch.diagram_type,
            base_version=patch.base_version + 10,
            ops=patch.ops,
            version=patch.version,
            reason=patch.reason,
            layout_changed=patch.layout_changed,
            viewport_hint=patch.viewport_hint,
        )

    monkeypatch.setattr(pipeline, "_build_patch", _stale_patch)

    events = _speak_and_flush(
        pipeline,
        state,
        "Then security reviews the integration requirements.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]


def test_pipeline_correction_rebuilds_from_committed_finals_only() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="correction", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Actually legal approves the MSA first.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert len(state.diagram.nodes) == 1
    assert state.diagram.nodes[0].data.label == "Legal approves the MSA first"
    assert "Actually" not in state.diagram.nodes[0].data.label
    assert state.accepted_utterances == ["Legal approves the MSA first"]


def test_pipeline_flowchart_correction_with_ai_rebuilds_from_committed_history() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="ai-correction", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )
    _speak_and_flush(
        pipeline,
        state,
        "Then security reviews the integration requirements.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Actually legal approves the MSA.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering",
        "Legal approves the MSA",
    ]
    assert len(state.diagram.edges) == 1
    assert state.accepted_utterances == [
        "Sales hands off the deal to solutions engineering",
        "Legal approves the MSA",
    ]


def test_pipeline_patch_payload_uses_positioned_server_node() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="positioned-patch", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )

    events = _speak_and_flush(
        pipeline,
        state,
        "Then security reviews the integration requirements.",
    )

    patch_event = next(
        event for event in events if isinstance(event, DiagramPatchEvent)
    )
    add_node = next(op for op in patch_event.patch.ops if op.op == "add_node")
    server_node = next(node for node in state.diagram.nodes if node.id == add_node.data["id"])

    assert add_node.data["position"] == server_node.position.model_dump()
    assert add_node.data["position"] != {"x": 0.0, "y": 0.0}


def test_pipeline_consumes_ignored_out_of_scope_delta() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(
        session_id="ignored-delta",
        mode=SessionMode.VISUALIZING,
        locked_diagram_type=DiagramType.FLOWCHART,
    )

    first_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Can someone send the Zoom link again?",
        ),
    )

    assert [type(event) for event in first_events] == [TranscriptUpdateEvent]
    assert state.last_generated_offset == 0

    pause_events = _flush(pipeline, state)

    assert [type(event) for event in pause_events] == [IntentResultEvent]
    assert state.last_generated_offset == len(state.committed_transcript)
    assert state.telemetry.trigger_counts == {"pause.detected": 1}


def test_pipeline_treats_connector_only_final_as_ignorable() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(
        session_id="connector-only",
        mode=SessionMode.VISUALIZING,
        locked_diagram_type=DiagramType.FLOWCHART,
    )

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then",
        ),
    )

    assert [type(event) for event in events] == [TranscriptUpdateEvent]
    assert state.diagram.version == 0
    assert state.last_generated_offset == 0

    pause_events = _flush(pipeline, state)

    assert [type(event) for event in pause_events] == [IntentResultEvent]
    assert state.last_generated_offset == len(state.committed_transcript)


def test_pipeline_flowchart_rules_only_filters_meta_chatter_from_boxes() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="rules-filter", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )
    previous_version = state.diagram.version

    events = _speak_and_flush(
        pipeline,
        state,
        "Okay that kind of works. What's going to happen next is I'll send the recap.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
    ]
    assert state.diagram.version == previous_version
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering"
    ]
    assert state.accepted_utterances == [
        "Sales hands off the deal to solutions engineering"
    ]


def test_pipeline_flowchart_ai_filters_meta_chatter_without_patching() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="ai-filter", mode=SessionMode.VISUALIZING)

    _speak_and_flush(
        pipeline,
        state,
        "First sales hands off the deal to solutions engineering.",
    )
    previous_version = state.diagram.version

    events = _speak_and_flush(
        pipeline,
        state,
        "Okay that kind of works. What's going to happen next is I'll send the recap.",
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
    ]
    assert state.diagram.version == previous_version
    assert state.accepted_utterances == [
        "Sales hands off the deal to solutions engineering"
    ]


def test_pipeline_batches_multiple_finals_until_pause() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="pause-batch", mode=SessionMode.VISUALIZING)

    first_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(type="speech.final", text="First sales hands off the deal."),
    )
    second_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(type="speech.final", text="Then security reviews the requirements."),
    )
    pause_events = _flush(pipeline, state)

    assert [type(event) for event in first_events] == [TranscriptUpdateEvent]
    assert [type(event) for event in second_events] == [TranscriptUpdateEvent]
    assert [type(event) for event in pause_events] == [
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering",
        "Security reviews the integration requirements",
    ]


def test_pipeline_discards_stale_generation_when_newer_pause_request_exists() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _DelayedCanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="stale-request", mode=SessionMode.VISUALIZING)

    first_final = pipeline.prepare_event(
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )
    assert [type(event) for event in first_final.outbound_events] == [TranscriptUpdateEvent]
    first_request = pipeline.prepare_event(
        state,
        UICommandEvent(type="ui.command", command="pause.detected", payload={}),
    ).generation_request
    assert first_request is not None

    second_final = pipeline.prepare_event(
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
    )
    assert [type(event) for event in second_final.outbound_events] == [TranscriptUpdateEvent]
    second_request = pipeline.prepare_event(
        state,
        UICommandEvent(type="ui.command", command="pause.detected", payload={}),
    ).generation_request
    assert second_request is not None
    assert second_request.request_id > first_request.request_id

    first_execution = asyncio.run(pipeline.run_generation(first_request))
    assert pipeline.apply_generation_result(state, first_execution) == []
    assert state.diagram.version == 0

    second_execution = asyncio.run(pipeline.run_generation(second_request))
    second_outbound = pipeline.apply_generation_result(state, second_execution)
    assert [type(event) for event in second_outbound] == [
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert len(state.diagram.nodes) == 2
