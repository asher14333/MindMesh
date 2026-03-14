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
        previous_mode = state.mode

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

        pre_generation_ran = False
        if isinstance(event, (SpeechPartialEvent, SpeechFinalEvent)):
            pre_trigger_text = self.transcript_buffer.unread_for_trigger(state)
            pre_diagram_text = self.transcript_buffer.unread_for_diagram(state)
            pre_decision = self.trigger_engine.should_generate_before_event(
                state, event, pre_trigger_text
            )
            if pre_decision.should_generate:
                outbound.extend(
                    await self._generate_from_transcript(
                        state=state,
                        trigger_text=pre_trigger_text,
                        diagram_text=pre_diagram_text,
                    )
                )
                pre_generation_ran = True

        if isinstance(event, UICommandEvent):
            outbound.extend(self._handle_command(state, event))
            if event.command == "diagram.reset":
                return outbound

        if isinstance(event, SpeechPartialEvent):
            text = self.transcript_buffer.append_partial(state, event.text)
            if text:
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=False,
                    )
                )

        if isinstance(event, SpeechFinalEvent):
            text = self.transcript_buffer.append_final(state, event.text)
            if text:
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=True,
                    )
                )

        if pre_generation_ran:
            return outbound

        unread_trigger_text = self.transcript_buffer.unread_for_trigger(state)
        unread_diagram_text = self.transcript_buffer.unread_for_diagram(state)
        decision = self.trigger_engine.should_generate_after_event(
            state,
            event,
            unread_trigger_text,
            previous_mode=previous_mode,
        )
        if not decision.should_generate:
            return outbound

        outbound.extend(
            await self._generate_from_transcript(
                state=state,
                trigger_text=unread_trigger_text,
                diagram_text=unread_diagram_text,
            )
        )
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
            self.transcript_buffer.reset(state)
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

    async def _generate_from_transcript(
        self,
        state: SessionState,
        trigger_text: str,
        diagram_text: str,
    ) -> list[OutboundEvent]:
        outbound: list[OutboundEvent] = []
        intent = self.intent_classifier.classify(trigger_text or state.raw_transcript)
        await self.model_orchestrator.choose_path(intent)
        outbound.append(IntentResultEvent(result=intent))

        if intent.diagram_type == DiagramType.NONE:
            self.transcript_buffer.mark_triggered(state)
            self.trigger_engine.arm_cooldown(state)
            return outbound

        if not state.diagram.nodes or state.diagram.diagram_type != intent.diagram_type:
            diagram = self.diagram_generator.generate_document(intent, state.raw_transcript)
            diagram = self.render_adapter.layout_document(diagram)
            state.diagram = diagram
            state.diagram_type = diagram.diagram_type
            self.transcript_buffer.mark_triggered(state)
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        patch = self.diagram_generator.generate_patch(intent, diagram_text, state.diagram)
        if patch.ops:
            state.diagram = self.render_adapter.apply_patch(state.diagram, patch)
            state.diagram_type = state.diagram.diagram_type
            self.transcript_buffer.mark_triggered(state)
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            outbound.append(DiagramPatchEvent(patch=patch))
            return outbound

        diagram = self.diagram_generator.generate_document(intent, state.raw_transcript)
        diagram = self.render_adapter.layout_document(diagram)
        state.diagram = diagram
        state.diagram_type = diagram.diagram_type
        self.transcript_buffer.mark_triggered(state)
        self.transcript_buffer.mark_generated(state)
        self.trigger_engine.arm_cooldown(state)
        outbound.append(DiagramReplaceEvent(diagram=diagram))
        return outbound
