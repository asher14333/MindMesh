import logging
from typing import Optional

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
from app.schemas.intent import IntentAction, IntentResult, ScopeRelation
from app.state.session_state import SessionMode, SessionState

from .diagram_generator import DiagramGenerator
from .intent_classifier import IntentClassifier
from .model_orchestrator import AIResponse, ModelOrchestrator
from .render_adapter import RenderAdapter
from .transcript_buffer import TranscriptBuffer
from .trigger_engine import TriggerEngine

logger = logging.getLogger(__name__)


class SessionPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.transcript_buffer = TranscriptBuffer()
        self.trigger_engine = TriggerEngine(settings=settings)
        self.intent_classifier = IntentClassifier()
        self.diagram_generator = DiagramGenerator()
        self.render_adapter = RenderAdapter()
        self.model_orchestrator = ModelOrchestrator(settings)

    async def handle_event(
        self, state: SessionState, event: InboundEvent
    ) -> list[OutboundEvent]:
        outbound: list[OutboundEvent] = []

        # ---- lifecycle events ----

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

        # ---- commands ----

        if isinstance(event, UICommandEvent):
            outbound.extend(self._handle_command(state, event))
            if event.command == "diagram.reset":
                return outbound

        # ---- transcript ----

        if isinstance(event, (SpeechPartialEvent, SpeechFinalEvent)):
            text = self.transcript_buffer.append(state, event.text)
            kind = "FINAL  " if isinstance(event, SpeechFinalEvent) else "partial"
            if text:
<<<<<<< Updated upstream
                speaker_label = f" [{event.speaker}]" if event.speaker else ""
                logger.info("[%s] speech.%s%s | %r", state.session_id, kind, speaker_label, text)
=======
                logger.info("[%s] speech.%s | %r", state.session_id, kind, text)
>>>>>>> Stashed changes
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=isinstance(event, SpeechFinalEvent),
                        speaker=event.speaker,
                    )
                )

        # ---- trigger check ----

        unread_text = self.transcript_buffer.unread_text(state)
        decision = self.trigger_engine.should_generate(state, event, unread_text)
        if not decision.should_generate:
            return outbound

        logger.info(
            "[%s] trigger=%s | unread=%d chars",
            state.session_id,
            decision.reason,
            len(unread_text),
        )

        # =============================================================
        # 4-STEP PIPELINE
        # =============================================================

        # STEP 1 — delta extraction & fast relevance filter
        delta = state.raw_transcript[state.last_processed_offset :]
        if not delta.strip():
            state.last_processed_offset = len(state.raw_transcript)
            return outbound

        # STEP 2 — rules-based classification
        intent = self.intent_classifier.classify(delta, state)

        # STEP 3 — model fallback (low-confidence, correction, switch)
        route = self.intent_classifier.choose_route(intent, state)
        ai_response: Optional[AIResponse] = None

        if route in ("fallback", "repair") and self.model_orchestrator.is_available():
            state.last_request_id += 1
            ai_response = await self.model_orchestrator.generate(
                delta=delta,
                diagram_type=state.locked_diagram_type or DiagramType.NONE,
                graph_summary=self._build_graph_summary(state),
                scope_summary=state.scope_summary,
                request_id=state.last_request_id,
            )
            if ai_response and ai_response.request_id == state.last_request_id:
                intent = self._merge_ai_result(intent, ai_response)

        state.last_processed_offset = len(state.raw_transcript)

        if intent.scope_relation == ScopeRelation.OUT_OF_SCOPE:
            return outbound
        if intent.action == IntentAction.NOOP and intent.confidence < 0.65:
            return outbound

        self.intent_classifier.update_scope_lock(state, intent)
        outbound.append(IntentResultEvent(result=intent))
        logger.info("[%s] intent=%s confidence=%.2f", state.session_id, intent.diagram_type, intent.confidence)

        if intent.action == IntentAction.NOOP:
            self.trigger_engine.arm_cooldown(state)
            return outbound

        # STEP 4 — deterministic graph planning
        effective_type = state.locked_diagram_type or intent.diagram_type
        if effective_type == DiagramType.NONE:
            effective_type = DiagramType.FLOWCHART

        needs_replace = (
            not state.diagram.nodes
            or state.diagram.diagram_type != effective_type
            or intent.action == IntentAction.REPLACE
        )

        if needs_replace:
            diagram = self._build_full(ai_response, effective_type, state)
            diagram = self.render_adapter.layout_document(diagram)
            self._commit_diagram(state, diagram, effective_type)
            logger.info(
                "[%s] diagram.replace type=%s nodes=%d",
                state.session_id,
                diagram.diagram_type,
                len(diagram.nodes),
            )
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        patch = self._build_patch(
            ai_response, intent, effective_type, unread_text, state
        )
        if patch and patch.ops:
            if patch.base_version != state.diagram.version:
                diagram = self._build_full(ai_response, effective_type, state)
                diagram = self.render_adapter.layout_document(diagram)
                self._commit_diagram(state, diagram, effective_type)
                outbound.append(DiagramReplaceEvent(diagram=diagram))
                return outbound

            state.diagram = self.render_adapter.apply_patch(
                state.diagram, patch
            )
            state.diagram_type = effective_type
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            logger.info("[%s] diagram.patch ops=%d", state.session_id, len(patch.ops))
            outbound.append(DiagramPatchEvent(patch=patch))
            return outbound

        diagram = self._build_full(ai_response, effective_type, state)
        diagram = self.render_adapter.layout_document(diagram)
        self._commit_diagram(state, diagram, effective_type)
        logger.info(
            "[%s] diagram.replace (fallback) type=%s nodes=%d",
            state.session_id,
            diagram.diagram_type,
            len(diagram.nodes),
        )
        outbound.append(DiagramReplaceEvent(diagram=diagram))
        return outbound

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_full(
        self,
        ai_response: Optional[AIResponse],
        effective_type: DiagramType,
        state: SessionState,
    ) -> DiagramDocument:
        if ai_response and ai_response.facts.nodes:
            return self.diagram_generator.generate_from_facts(
                ai_response.facts,
                effective_type,
                state.diagram if state.diagram.nodes else None,
            )
        return self.diagram_generator.generate_document(
            IntentResult(
                diagram_type=effective_type,
                confidence=1.0,
                action=IntentAction.REPLACE,
                reason="rules_fallback",
            ),
            state.raw_transcript,
        )

    def _build_patch(
        self,
        ai_response: Optional[AIResponse],
        intent: IntentResult,
        effective_type: DiagramType,
        unread_text: str,
        state: SessionState,
    ) -> Optional:
        if ai_response and ai_response.facts.nodes:
            return self.diagram_generator.generate_patch_from_facts(
                ai_response.facts, effective_type, state.diagram
            )
        return self.diagram_generator.generate_patch(
            intent, unread_text, state.diagram
        )

    def _merge_ai_result(
        self, rules_intent: IntentResult, ai: AIResponse
    ) -> IntentResult:
        try:
            ai_type = DiagramType(ai.decision.diagram_type)
        except ValueError:
            ai_type = rules_intent.diagram_type
        try:
            ai_scope = ScopeRelation(ai.decision.scope_relation)
        except ValueError:
            ai_scope = rules_intent.scope_relation
        try:
            ai_action = IntentAction(ai.decision.action)
        except ValueError:
            ai_action = rules_intent.action

        if ai.decision.confidence >= 0.65:
            return IntentResult(
                diagram_type=ai_type,
                confidence=ai.decision.confidence,
                action=ai_action,
                reason=ai.reason or rules_intent.reason,
                scope_relation=ai_scope,
            )
        return rules_intent

    def _build_graph_summary(self, state: SessionState) -> str:
        if not state.diagram.nodes:
            return ""
        node_parts = [
            f"{n.id}({n.data.kind}: {n.data.label})"
            for n in state.diagram.nodes[:12]
        ]
        edge_parts = [
            f"{e.source}->{e.target}" for e in state.diagram.edges[:16]
        ]
        dt = state.diagram.diagram_type.value
        lines = [f"{dt}, {len(state.diagram.nodes)} nodes, {len(state.diagram.edges)} edges"]
        if node_parts:
            lines.append(f"Nodes: {', '.join(node_parts)}")
        if edge_parts:
            lines.append(f"Edges: {', '.join(edge_parts)}")
        return "\n".join(lines)

    def _commit_diagram(
        self,
        state: SessionState,
        diagram: DiagramDocument,
        effective_type: DiagramType,
    ) -> None:
        state.diagram = diagram
        state.diagram_type = effective_type
        state.last_applied_version = diagram.version
        self.transcript_buffer.mark_generated(state)
        self.trigger_engine.arm_cooldown(state)

    # ------------------------------------------------------------------
    # Command handling
    # ------------------------------------------------------------------

    def _handle_command(
        self, state: SessionState, event: UICommandEvent
    ) -> list[OutboundEvent]:
        outbound: list[OutboundEvent] = []

        if event.command == "visualize.toggle":
            enabled = event.payload.get("enabled")
            if enabled is None:
                enabled = state.mode != SessionMode.VISUALIZING
            state.mode = (
                SessionMode.VISUALIZING if enabled else SessionMode.STANDBY
            )
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
            state.locked_diagram_type = None
            state.scope_summary = ""
            state.scope_keywords = []
            state.switch_streak = 0
            state.last_request_id = 0
            state.last_applied_version = 0
            state.raw_transcript = ""
            state.last_generated_offset = 0
            state.last_processed_offset = 0
            state.last_generation_at = 0.0
            outbound.append(DiagramReplaceEvent(diagram=state.diagram))
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="diagram_reset",
                    diagram_type=state.diagram_type,
                )
            )
            return outbound

        if event.command.startswith("diagram.type.") and event.payload.get(
            "diagram_type"
        ):
            try:
                new_type = DiagramType(event.payload["diagram_type"])
                state.diagram_type = new_type
                state.locked_diagram_type = new_type
                state.switch_streak = 0
            except ValueError:
                pass
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="diagram_type_set",
                    diagram_type=state.diagram_type,
                )
            )

        return outbound
