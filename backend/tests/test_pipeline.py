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
        min_new_chars=999,
    )


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
    ) -> AIResponse:
        normalized = delta.lower()
        if "sales hands off" in normalized:
            return _ai_response_for_flowchart_graph(
                ["Sales hands off the deal to solutions engineering"],
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

    first_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )

    assert [type(event) for event in first_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert state.diagram_type == DiagramType.FLOWCHART
    assert state.locked_diagram_type is None
    assert state.switch_streak == 1

    second_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
    )

    assert [type(event) for event in second_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert state.locked_diagram_type == DiagramType.FLOWCHART
    assert state.diagram.version == 2
    assert len(state.diagram.nodes) == 2


def test_pipeline_flowchart_ai_canonical_graph_appends_without_committed_noise() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="ai-flowchart", mode=SessionMode.VISUALIZING)

    first_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )
    assert [type(event) for event in first_events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]
    assert [node.data.label for node in state.diagram.nodes] == [
        "Sales hands off the deal to solutions engineering"
    ]

    second_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
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

    third_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="After security sign-off, legal approves the MSA.",
        ),
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

    fourth_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Finally provisioning starts and customer success is notified.",
        ),
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

    partial_events = _run(
        pipeline,
        partial_state,
        SpeechFinalEvent(type="speech.final", text=final_text),
    )
    final_events = _run(
        pipeline,
        final_only_state,
        SpeechFinalEvent(type="speech.final", text=final_text),
    )

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


def test_pipeline_filters_out_of_scope_transcript_after_lock() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(
        session_id="org-session",
        mode=SessionMode.VISUALIZING,
    )

    first_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Alice reports to Bob in the organization chart.",
        ),
    )

    assert any(isinstance(event, DiagramReplaceEvent) for event in first_events)
    assert state.locked_diagram_type == DiagramType.ORGCHART
    previous_version = state.diagram.version

    off_topic_events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Let's take a quick break before lunch.",
        ),
    )

    assert [type(event) for event in off_topic_events] == [TranscriptUpdateEvent]
    assert state.diagram.version == previous_version
    assert state.last_processed_offset == len(state.committed_transcript)


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
    assert state.last_processed_offset == 0
    assert state.switch_streak == 0
    assert state.last_request_id == 0
    assert state.last_applied_version == 0


def test_pipeline_falls_back_to_replace_when_patch_base_version_is_stale(monkeypatch) -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="stale", mode=SessionMode.VISUALIZING)

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
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

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramReplaceEvent,
    ]


def test_pipeline_correction_rebuilds_from_committed_finals_only() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="correction", mode=SessionMode.VISUALIZING)

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Actually legal approves the MSA first.",
        ),
    )

    assert [type(event) for event in events] == [
        TranscriptUpdateEvent,
        IntentResultEvent,
        DiagramPatchEvent,
    ]
    assert len(state.diagram.nodes) == 1
    assert state.diagram.nodes[0].data.label == "Legal approves the MSA first"
    assert "Actually" not in state.diagram.nodes[0].data.label
    assert state.accepted_utterances == ["Legal approves the MSA first"]


def test_pipeline_flowchart_correction_with_ai_rebuilds_from_committed_history() -> None:
    pipeline = SessionPipeline(_settings())
    pipeline.model_orchestrator = _CanonicalFlowchartModelOrchestrator()
    state = SessionState(session_id="ai-correction", mode=SessionMode.VISUALIZING)

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )
    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
    )

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Actually legal approves the MSA.",
        ),
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

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Then security reviews the integration requirements.",
        ),
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
    assert state.last_generated_offset == len(state.committed_transcript)

    pause_events = _run(
        pipeline,
        state,
        UICommandEvent(type="ui.command", command="pause.detected", payload={}),
    )

    assert pause_events == []
    assert state.telemetry.trigger_counts == {"final_transcript": 1}


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
    assert state.last_generated_offset == len(state.committed_transcript)

    pause_events = _run(
        pipeline,
        state,
        UICommandEvent(type="ui.command", command="pause.detected", payload={}),
    )

    assert pause_events == []


def test_pipeline_flowchart_rules_only_filters_meta_chatter_from_boxes() -> None:
    pipeline = SessionPipeline(_settings())
    state = SessionState(session_id="rules-filter", mode=SessionMode.VISUALIZING)

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )
    previous_version = state.diagram.version

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Okay that kind of works. What's going to happen next is I'll send the recap.",
        ),
    )

    assert [type(event) for event in events] == [TranscriptUpdateEvent]
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

    _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="First sales hands off the deal to solutions engineering.",
        ),
    )
    previous_version = state.diagram.version

    events = _run(
        pipeline,
        state,
        SpeechFinalEvent(
            type="speech.final",
            text="Okay that kind of works. What's going to happen next is I'll send the recap.",
        ),
    )

    assert [type(event) for event in events] == [TranscriptUpdateEvent]
    assert state.diagram.version == previous_version
    assert state.accepted_utterances == [
        "Sales hands off the deal to solutions engineering"
    ]
