from app.config import Settings
from app.schemas.diagram import DiagramDocument, DiagramType
from app.schemas.events import (
    DiagramPatchEvent,
    DiagramReplaceEvent,
    InboundEvent,
    IntentResultEvent,
    OutboundEvent,
    SessionStartEvent,
    SessionStopEvent,
    SpeechFinalEvent,
    SpeechPartialEvent,
    StatusEvent,
    TranscriptUpdateEvent,
    UICommandEvent,
)
from app.state.session_state import SessionMode, SessionState

from .diagram_generator import DiagramGenerator
from .intent_classifier import IntentClassifier
from .model_orchestrator import ModelOrchestrator
from .render_adapter import RenderAdapter
from .transcript_buffer import TranscriptBuffer
from .trigger_engine import TriggerEngine


class SessionPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.transcript_buffer = TranscriptBuffer()
        self.trigger_engine = TriggerEngine(settings=settings)
        self.intent_classifier = IntentClassifier()
        self.diagram_generator = DiagramGenerator()
        self.render_adapter = RenderAdapter()
        self.model_orchestrator = ModelOrchestrator()

    async def handle_event(self, state: SessionState, event: InboundEvent) -> list[OutboundEvent]:
        outbound: list[OutboundEvent] = []

        if isinstance(event, SessionStartEvent):
            if event.meeting_title:
                state.meeting_title = event.meeting_title
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="session_started",
                    diagram_type=state.diagram_type,
                )
            )
            return outbound

        if isinstance(event, SessionStopEvent):
            state.mode = SessionMode.STANDBY
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="session_stopped",
                    diagram_type=state.diagram_type,
                )
            )
            return outbound

        if isinstance(event, UICommandEvent):
            outbound.extend(self._handle_command(state, event))
            if event.command == "diagram.reset":
                return outbound

        if isinstance(event, (SpeechPartialEvent, SpeechFinalEvent)):
            text = self.transcript_buffer.append(state, event.text)
            if text:
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=isinstance(event, SpeechFinalEvent),
                    )
                )

        unread_text = self.transcript_buffer.unread_text(state)
        decision = self.trigger_engine.should_generate(state, event, unread_text)
        if not decision.should_generate:
            return outbound

        intent = self.intent_classifier.classify(unread_text or state.raw_transcript)
        await self.model_orchestrator.choose_path(intent)
        outbound.append(IntentResultEvent(result=intent))

        if intent.diagram_type == DiagramType.NONE:
            self.trigger_engine.arm_cooldown(state)
            return outbound

        if not state.diagram.nodes or state.diagram.diagram_type != intent.diagram_type:
            diagram = self.diagram_generator.generate_document(intent, state.raw_transcript)
            diagram = self.render_adapter.layout_document(diagram)
            state.diagram = diagram
            state.diagram_type = diagram.diagram_type
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        patch = self.diagram_generator.generate_patch(intent, unread_text, state.diagram)
        if patch.ops:
            state.diagram = self.render_adapter.apply_patch(state.diagram, patch)
            state.diagram_type = state.diagram.diagram_type
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            outbound.append(DiagramPatchEvent(patch=patch))
            return outbound

        diagram = self.diagram_generator.generate_document(intent, state.raw_transcript)
        diagram = self.render_adapter.layout_document(diagram)
        state.diagram = diagram
        state.diagram_type = diagram.diagram_type
        self.transcript_buffer.mark_generated(state)
        self.trigger_engine.arm_cooldown(state)
        outbound.append(DiagramReplaceEvent(diagram=diagram))
        return outbound

    def _handle_command(self, state: SessionState, event: UICommandEvent) -> list[OutboundEvent]:
        outbound: list[OutboundEvent] = []

        if event.command == "visualize.toggle":
            enabled = event.payload.get("enabled")
            if enabled is None:
                enabled = state.mode != SessionMode.VISUALIZING
            state.mode = SessionMode.VISUALIZING if enabled else SessionMode.STANDBY
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="visualize_enabled" if enabled else "visualize_disabled",
                    diagram_type=state.diagram_type,
                )
            )
            return outbound

        if event.command == "diagram.reset":
            state.diagram = DiagramDocument()
            state.diagram_type = DiagramType.NONE
            state.raw_transcript = ""
            state.last_generated_offset = 0
            state.last_generation_at = 0.0
            outbound.append(
                DiagramReplaceEvent(diagram=state.diagram)
            )
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="diagram_reset",
                    diagram_type=state.diagram_type,
                )
            )
            return outbound

        if event.command.startswith("diagram.type.") and event.payload.get("diagram_type"):
            state.diagram_type = DiagramType(event.payload["diagram_type"])
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="diagram_type_set",
                    diagram_type=state.diagram_type,
                )
            )

        return outbound
