import logging
from typing import Optional

from app.config import Settings
from app.schemas.diagram import DiagramDocument, DiagramPatch, DiagramType
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

        if isinstance(event, SpeechPartialEvent):
            text = self.transcript_buffer.preview_partial(state, event.text)
            if text:
                speaker_label = f" [{event.speaker}]" if event.speaker else ""
                logger.info("[%s] speech.partial%s | dropped=%r", state.session_id, speaker_label, text)

        if isinstance(event, SpeechFinalEvent):
            text = self.transcript_buffer.commit_final(state, event.text)
            if text:
                speaker_label = f" [{event.speaker}]" if event.speaker else ""
                logger.info("[%s] speech.FINAL%s | %r", state.session_id, speaker_label, text)
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=True,
                        speaker=event.speaker,
                    )
                )

        # ---- trigger check ----

        unread_text = self.transcript_buffer.unread_text(state)
        decision = self.trigger_engine.should_generate(state, event, unread_text)
        if not decision.should_generate:
            return outbound
        self._record_trigger(state, decision.reason)

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
        delta = self.transcript_buffer.pending_delta(state)
        if not delta.strip():
            state.last_processed_offset = len(state.committed_transcript)
            return outbound

        # STEP 2 — rules-based classification
        intent = self.intent_classifier.classify(delta, state)

        # STEP 3 — model-assisted interpretation when available
        ai_response: Optional[AIResponse] = None

        if self.model_orchestrator.is_available():
            state.last_request_id += 1
            state.telemetry.model_calls += 1
            ai_response = await self.model_orchestrator.generate(
                delta=delta,
                diagram_type=state.locked_diagram_type or intent.diagram_type,
                graph_summary=self._build_graph_summary(state),
                scope_summary=state.scope_summary,
                request_id=state.last_request_id,
            )
            if ai_response and ai_response.request_id == state.last_request_id:
                state.telemetry.model_successes += 1
                intent = self._merge_ai_result(intent, ai_response)

        state.last_processed_offset = len(state.committed_transcript)

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
        used_ai_facts = bool(ai_response and ai_response.facts.nodes)

        if needs_replace:
            diagram = self._build_full(ai_response, effective_type, state)
            diagram = self.render_adapter.layout_document(diagram)
            self._commit_diagram(state, diagram, effective_type)
            self._record_generation(
                state=state,
                trigger_reason=decision.reason,
                event_type="replace",
                used_ai_facts=used_ai_facts,
                is_correction=intent.scope_relation == ScopeRelation.CORRECTION,
            )
            logger.info(
                "[%s] diagram.replace type=%s nodes=%d",
                state.session_id,
                diagram.diagram_type,
                len(diagram.nodes),
            )
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        patch = self._build_patch(ai_response, effective_type, state)
        if patch and patch.ops:
            if patch.base_version != state.diagram.version:
                logger.warning(
                    "[%s] patch.base_version mismatch patch_base=%d state_version=%d -> replace",
                    state.session_id,
                    patch.base_version,
                    state.diagram.version,
                )
                diagram = self._build_full(ai_response, effective_type, state)
                diagram = self.render_adapter.layout_document(diagram)
                self._commit_diagram(state, diagram, effective_type)
                self._record_generation(
                    state=state,
                    trigger_reason=decision.reason,
                    event_type="replace",
                    used_ai_facts=used_ai_facts,
                    is_correction=intent.scope_relation == ScopeRelation.CORRECTION,
                )
                outbound.append(DiagramReplaceEvent(diagram=diagram))
                return outbound

            state.diagram = self.render_adapter.apply_patch(state.diagram, patch)
            state.diagram_type = effective_type
            self.transcript_buffer.mark_generated(state)
            self.trigger_engine.arm_cooldown(state)
            self._record_generation(
                state=state,
                trigger_reason=decision.reason,
                event_type="patch",
                used_ai_facts=used_ai_facts,
                is_correction=False,
            )
            logger.info("[%s] diagram.patch ops=%d", state.session_id, len(patch.ops))
            outbound.append(DiagramPatchEvent(patch=patch))
            return outbound

        diagram = self._build_full(ai_response, effective_type, state)
        diagram = self.render_adapter.layout_document(diagram)
        self._commit_diagram(state, diagram, effective_type)
        self._record_generation(
            state=state,
            trigger_reason=decision.reason,
            event_type="replace",
            used_ai_facts=used_ai_facts,
            is_correction=intent.scope_relation == ScopeRelation.CORRECTION,
        )
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
        return self.diagram_generator.generate_document_from_utterances(
            effective_type,
            state.committed_utterances,
            current=state.diagram if state.diagram.nodes else None,
        )

    def _build_patch(
        self,
        ai_response: Optional[AIResponse],
        effective_type: DiagramType,
        state: SessionState,
    ) -> Optional[DiagramPatch]:
        if ai_response and ai_response.facts.nodes:
            return self.diagram_generator.generate_patch_from_facts(
                ai_response.facts, effective_type, state.diagram
            )
        return self.diagram_generator.generate_patch_from_utterances(
            effective_type,
            state.committed_utterances,
            state.diagram,
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

    def _record_trigger(self, state: SessionState, reason: Optional[str]) -> None:
        key = reason or "unknown"
        counts = state.telemetry.trigger_counts
        counts[key] = counts.get(key, 0) + 1

    def _record_generation(
        self,
        state: SessionState,
        trigger_reason: Optional[str],
        event_type: str,
        used_ai_facts: bool,
        is_correction: bool,
    ) -> None:
        if not used_ai_facts:
            state.telemetry.fallback_generations += 1
        if event_type == "replace":
            state.telemetry.diagram_replaces += 1
            if is_correction:
                state.telemetry.correction_replaces += 1
        elif event_type == "patch":
            state.telemetry.diagram_patches += 1

        logger.info(
            "[%s] telemetry trigger=%s finals=%d dropped_partials=%d model=%d/%d fallback=%d replace=%d patch=%d correction_replace=%d",
            state.session_id,
            trigger_reason or "unknown",
            state.telemetry.committed_finals,
            state.telemetry.dropped_partials,
            state.telemetry.model_successes,
            state.telemetry.model_calls,
            state.telemetry.fallback_generations,
            state.telemetry.diagram_replaces,
            state.telemetry.diagram_patches,
            state.telemetry.correction_replaces,
        )

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
            state.committed_transcript = ""
            state.preview_transcript = ""
            state.committed_utterances = []
            state.last_generated_offset = 0
            state.last_processed_offset = 0
            state.last_chunk_at = 0.0
            state.last_generation_at = 0.0
            state.cooldown_until = 0.0
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
