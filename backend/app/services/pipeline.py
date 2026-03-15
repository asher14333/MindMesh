import logging
import time
from dataclasses import dataclass, field
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
from app.schemas.intent import IntentAction, IntentResult, IntentSource, ScopeRelation
from app.state.session_state import SessionMode, SessionState

from .diagram_generator import DiagramGenerator
from .intent_classifier import IntentClassifier
from .model_orchestrator import AIResponse, ModelOrchestrator
from .render_adapter import RenderAdapter
from .transcript_buffer import TranscriptBuffer
from .trigger_engine import TriggerEngine

logger = logging.getLogger(__name__)


@dataclass
class GenerationRequest:
    request_id: int
    trigger_reason: Optional[str]
    delta: str
    utterances: list[str]
    end_offset: int
    end_utterance_index: int
    graph_summary: str
    scope_summary: str
    current_diagram: Optional[DiagramDocument]
    attempt_model: bool


@dataclass
class GenerationExecution:
    request: GenerationRequest
    ai_response: Optional[AIResponse]
    latency_ms: int


@dataclass
class PreparedEvent:
    outbound_events: list[OutboundEvent] = field(default_factory=list)
    generation_request: Optional[GenerationRequest] = None


@dataclass
class ResolvedGeneration:
    intent: IntentResult
    ai_response: Optional[AIResponse]
    use_ai_facts: bool
    source_utterances: list[str] = field(default_factory=list)


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
        prepared = self.prepare_event(state, event)
        outbound = list(prepared.outbound_events)
        if not prepared.generation_request:
            return outbound

        execution = await self.run_generation(prepared.generation_request)
        outbound.extend(self.apply_generation_result(state, execution))
        return outbound

    def prepare_event(
        self, state: SessionState, event: InboundEvent
    ) -> PreparedEvent:
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
            return PreparedEvent(outbound_events=outbound)

        if isinstance(event, SessionStopEvent):
            self._invalidate_inflight_requests(state)
            state.mode = SessionMode.STANDBY
            outbound.append(
                StatusEvent(
                    session_id=state.session_id,
                    mode=state.mode,
                    message="session_stopped",
                    diagram_type=state.diagram_type,
                )
            )
            return PreparedEvent(outbound_events=outbound)

        if isinstance(event, UICommandEvent):
            outbound.extend(self._handle_command(state, event))
            if event.command == "diagram.reset":
                return PreparedEvent(outbound_events=outbound)

        if isinstance(event, SpeechPartialEvent):
            text = self.transcript_buffer.preview_partial(state, event.text)
            if text:
                speaker_label = f" [{event.speaker}]" if event.speaker else ""
                logger.info(
                    "[%s] speech.partial%s | dropped=%r",
                    state.session_id,
                    speaker_label,
                    text,
                )

        if isinstance(event, SpeechFinalEvent):
            text = self.transcript_buffer.commit_final(state, event.text)
            if text:
                speaker_label = f" [{event.speaker}]" if event.speaker else ""
                logger.info(
                    "[%s] speech.FINAL%s | %r",
                    state.session_id,
                    speaker_label,
                    text,
                )
                outbound.append(
                    TranscriptUpdateEvent(
                        text=text,
                        is_final=True,
                        speaker=event.speaker,
                    )
                )

        unscheduled_text = self.transcript_buffer.pending_delta(state)
        decision = self.trigger_engine.should_generate(state, event, unscheduled_text)
        if not decision.should_generate:
            return PreparedEvent(outbound_events=outbound)

        unread_text = self.transcript_buffer.unread_text(state)
        unread_utterances = self.transcript_buffer.unread_utterances(state)
        if not unread_text.strip() or not unread_utterances:
            state.last_processed_offset = len(state.committed_transcript)
            return PreparedEvent(outbound_events=outbound)

        self._record_trigger(state, decision.reason)
        state.last_request_id += 1
        request_id = state.last_request_id
        if self.model_orchestrator.is_available():
            state.telemetry.model_calls += 1

        end_offset = len(state.committed_transcript)
        end_utterance_index = len(state.committed_utterances)
        state.last_processed_offset = end_offset

        logger.info(
            "[%s] generation.request request_id=%d trigger=%s unread_chars=%d utterances=%d",
            state.session_id,
            request_id,
            decision.reason or "unknown",
            len(unread_text),
            len(unread_utterances),
        )

        return PreparedEvent(
            outbound_events=outbound,
            generation_request=GenerationRequest(
                request_id=request_id,
                trigger_reason=decision.reason,
                delta="\n".join(unread_utterances),
                utterances=list(unread_utterances),
                end_offset=end_offset,
                end_utterance_index=end_utterance_index,
                graph_summary=self._build_graph_summary(state),
                scope_summary=self._scope_summary_for_prompt(state),
                current_diagram=(
                    state.diagram.model_copy(deep=True)
                    if state.diagram.nodes
                    else None
                ),
                attempt_model=self.model_orchestrator.is_available(),
            ),
        )

    async def run_generation(
        self, request: GenerationRequest
    ) -> GenerationExecution:
        started_at = time.perf_counter()
        ai_response: Optional[AIResponse] = None

        if request.attempt_model:
            ai_response = await self.model_orchestrator.generate(
                delta=request.delta,
                diagram_type=DiagramType.FLOWCHART,
                graph_summary=request.graph_summary,
                scope_summary=request.scope_summary,
                request_id=request.request_id,
                current_diagram=request.current_diagram,
            )

        latency_ms = int((time.perf_counter() - started_at) * 1000)
        return GenerationExecution(
            request=request,
            ai_response=ai_response,
            latency_ms=latency_ms,
        )

    def apply_generation_result(
        self, state: SessionState, execution: GenerationExecution
    ) -> list[OutboundEvent]:
        request = execution.request
        if request.request_id != state.last_request_id:
            logger.info(
                "[%s] generation.discard stale_request request_id=%d current=%d",
                state.session_id,
                request.request_id,
                state.last_request_id,
            )
            return []

        resolved = self._resolve_generation(state, execution)
        outbound: list[OutboundEvent] = [IntentResultEvent(result=resolved.intent)]

        if execution.ai_response and resolved.intent.source == IntentSource.LLM:
            state.telemetry.model_successes += 1

        logger.info(
            "[%s] intent action=%s scope=%s source=%s trigger=%s latency_ms=%s confidence=%.2f",
            state.session_id,
            resolved.intent.action.value,
            resolved.intent.scope_relation.value,
            resolved.intent.source.value,
            resolved.intent.trigger_reason or "unknown",
            resolved.intent.latency_ms,
            resolved.intent.confidence,
        )

        if (
            resolved.intent.scope_relation == ScopeRelation.OUT_OF_SCOPE
            or resolved.intent.action == IntentAction.NOOP
        ):
            self._consume_ignored_delta(state, request)
            return outbound

        effective_type = DiagramType.FLOWCHART
        used_ai_facts = resolved.use_ai_facts

        needs_replace = (
            not state.diagram.nodes
            or state.diagram.diagram_type != effective_type
            or resolved.intent.action == IntentAction.REPLACE
        )

        if needs_replace:
            diagram = self._build_full(
                resolved.ai_response,
                effective_type,
                state,
                use_ai_facts=used_ai_facts,
                source_utterances=resolved.source_utterances,
            )
            diagram = self.render_adapter.layout_document(diagram)
            self._commit_diagram(state, diagram, effective_type, request)
            self._record_generation(
                state=state,
                trigger_reason=request.trigger_reason,
                event_type="replace",
                used_ai_facts=used_ai_facts,
                is_correction=(
                    resolved.intent.scope_relation == ScopeRelation.CORRECTION
                ),
            )
            logger.info(
                "[%s] diagram.replace type=%s nodes=%d",
                state.session_id,
                diagram.diagram_type,
                len(diagram.nodes),
            )
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        candidate_diagram = self._build_full(
            resolved.ai_response,
            effective_type,
            state,
            use_ai_facts=used_ai_facts,
            source_utterances=resolved.source_utterances,
        )
        if self._branch_structure_changed(state.diagram, candidate_diagram):
            diagram = self.render_adapter.layout_document(candidate_diagram)
            self._commit_diagram(state, diagram, effective_type, request)
            self._record_generation(
                state=state,
                trigger_reason=request.trigger_reason,
                event_type="replace",
                used_ai_facts=used_ai_facts,
                is_correction=(
                    resolved.intent.scope_relation == ScopeRelation.CORRECTION
                ),
            )
            logger.info(
                "[%s] diagram.replace reason=branch_structure_change nodes=%d",
                state.session_id,
                len(diagram.nodes),
            )
            outbound.append(DiagramReplaceEvent(diagram=diagram))
            return outbound

        patch = self._build_patch(
            resolved.ai_response,
            effective_type,
            state,
            use_ai_facts=used_ai_facts,
            source_utterances=resolved.source_utterances,
        )
        if patch and patch.ops:
            if patch.base_version != state.diagram.version:
                logger.warning(
                    "[%s] patch.base_version mismatch patch_base=%d state_version=%d -> replace",
                    state.session_id,
                    patch.base_version,
                    state.diagram.version,
                )
                diagram = candidate_diagram
                diagram = self.render_adapter.layout_document(diagram)
                self._commit_diagram(state, diagram, effective_type, request)
                self._record_generation(
                    state=state,
                    trigger_reason=request.trigger_reason,
                    event_type="replace",
                    used_ai_facts=used_ai_facts,
                    is_correction=(
                        resolved.intent.scope_relation == ScopeRelation.CORRECTION
                    ),
                )
                outbound.append(DiagramReplaceEvent(diagram=diagram))
                return outbound

            updated_diagram, emitted_patch = self.render_adapter.apply_patch_with_emitted(
                state.diagram, patch
            )
            self._commit_diagram(state, updated_diagram, effective_type, request)
            self._record_generation(
                state=state,
                trigger_reason=request.trigger_reason,
                event_type="patch",
                used_ai_facts=used_ai_facts,
                is_correction=False,
            )
            logger.info(
                "[%s] diagram.patch ops=%d",
                state.session_id,
                len(patch.ops),
            )
            outbound.append(DiagramPatchEvent(patch=emitted_patch))
            return outbound

        if self._diagrams_equivalent(state.diagram, candidate_diagram):
            self._consume_ignored_delta(state, request)
            return outbound

        diagram = candidate_diagram
        diagram = self.render_adapter.layout_document(diagram)
        self._commit_diagram(state, diagram, effective_type, request)
        self._record_generation(
            state=state,
            trigger_reason=request.trigger_reason,
            event_type="replace",
            used_ai_facts=used_ai_facts,
            is_correction=(
                resolved.intent.scope_relation == ScopeRelation.CORRECTION
            ),
        )
        logger.info(
            "[%s] diagram.replace (fallback) type=%s nodes=%d",
            state.session_id,
            diagram.diagram_type,
            len(diagram.nodes),
        )
        outbound.append(DiagramReplaceEvent(diagram=diagram))
        return outbound

    def _resolve_generation(
        self, state: SessionState, execution: GenerationExecution
    ) -> ResolvedGeneration:
        request = execution.request
        ai_response = execution.ai_response

        if ai_response:
            ai_intent = self._intent_from_ai(
                ai_response,
                trigger_reason=request.trigger_reason,
                latency_ms=execution.latency_ms,
            )
            if (
                ai_intent.scope_relation == ScopeRelation.OUT_OF_SCOPE
                or ai_intent.action == IntentAction.NOOP
            ):
                return ResolvedGeneration(
                    intent=ai_intent,
                    ai_response=ai_response,
                    use_ai_facts=False,
                )
            if self._should_use_ai_facts(ai_response):
                return ResolvedGeneration(
                    intent=ai_intent,
                    ai_response=ai_response,
                    use_ai_facts=True,
                )
            logger.warning(
                "[%s] generation.fallback reason=llm_missing_facts request_id=%d",
                state.session_id,
                request.request_id,
            )

        candidate_delta_utterances = self.diagram_generator.accept_flowchart_utterances(
            [],
            request.utterances,
        )
        candidate_utterances = self.diagram_generator.accept_flowchart_utterances(
            state.accepted_utterances,
            request.utterances,
        )
        fallback_intent = self.intent_classifier.classify_flowchart_fallback(
            request.delta,
            has_candidate_steps=bool(candidate_delta_utterances),
            trigger_reason=request.trigger_reason,
            latency_ms=execution.latency_ms if request.attempt_model else 0,
        )
        return ResolvedGeneration(
            intent=fallback_intent,
            ai_response=None,
            use_ai_facts=False,
            source_utterances=(
                candidate_utterances if candidate_delta_utterances else []
            ),
        )

    def _intent_from_ai(
        self,
        ai: AIResponse,
        *,
        trigger_reason: Optional[str],
        latency_ms: int,
    ) -> IntentResult:
        diagram_type = (
            DiagramType.FLOWCHART
            if ai.decision.diagram_type == "flowchart"
            else DiagramType.NONE
        )
        scope_relation = (
            ScopeRelation.CORRECTION
            if ai.decision.scope_relation == "correction"
            else ScopeRelation.OUT_OF_SCOPE
            if ai.decision.scope_relation == "out_of_scope"
            else ScopeRelation.IN_SCOPE
        )
        action = IntentAction(ai.decision.action)
        if diagram_type == DiagramType.NONE:
            action = IntentAction.NOOP
        return IntentResult(
            diagram_type=diagram_type,
            confidence=ai.decision.confidence,
            action=action,
            reason=ai.reason or "llm_flowchart_primary",
            scope_relation=scope_relation,
            source=IntentSource.LLM,
            trigger_reason=trigger_reason,
            latency_ms=latency_ms,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_full(
        self,
        ai_response: Optional[AIResponse],
        effective_type: DiagramType,
        state: SessionState,
        *,
        use_ai_facts: bool,
        source_utterances: Optional[list[str]] = None,
    ) -> DiagramDocument:
        if use_ai_facts and ai_response:
            return self.diagram_generator.generate_from_facts(
                ai_response.facts,
                effective_type,
                state.diagram if state.diagram.nodes else None,
            )
        return self.diagram_generator.generate_document_from_utterances(
            effective_type,
            source_utterances or self._source_utterances(state, effective_type),
            current=state.diagram if state.diagram.nodes else None,
        )

    def _build_patch(
        self,
        ai_response: Optional[AIResponse],
        effective_type: DiagramType,
        state: SessionState,
        *,
        use_ai_facts: bool,
        source_utterances: Optional[list[str]] = None,
    ) -> Optional[DiagramPatch]:
        if use_ai_facts and ai_response:
            return self.diagram_generator.generate_patch_from_facts(
                ai_response.facts, effective_type, state.diagram
            )
        return self.diagram_generator.generate_patch_from_utterances(
            effective_type,
            source_utterances or self._source_utterances(state, effective_type),
            state.diagram,
        )

    def _should_use_ai_facts(self, ai_response: Optional[AIResponse]) -> bool:
        return bool(ai_response and ai_response.facts.nodes)

    def _build_graph_summary(self, state: SessionState) -> str:
        if not state.diagram.nodes:
            return ""
        node_parts = [
            f"{node.id}({node.data.kind}: {node.data.label})"
            for node in state.diagram.nodes[:12]
        ]
        edge_parts = [
            f"{edge.source}->{edge.target}" for edge in state.diagram.edges[:16]
        ]
        lines = [
            f"{state.diagram.diagram_type.value}, {len(state.diagram.nodes)} nodes, {len(state.diagram.edges)} edges"
        ]
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
        request: GenerationRequest,
    ) -> None:
        state.diagram = diagram
        state.diagram_type = effective_type
        state.last_applied_version = diagram.version
        self._sync_accepted_utterances(state, request.utterances)
        self._refresh_scope_summary(state)
        self.transcript_buffer.mark_generated(
            state,
            offset=request.end_offset,
            utterance_index=request.end_utterance_index,
        )
        self.trigger_engine.arm_cooldown(state)

    def _consume_ignored_delta(
        self, state: SessionState, request: GenerationRequest
    ) -> None:
        self.transcript_buffer.mark_generated(
            state,
            offset=request.end_offset,
            utterance_index=request.end_utterance_index,
        )
        self.trigger_engine.arm_cooldown(state)

    def _invalidate_inflight_requests(self, state: SessionState) -> None:
        state.last_request_id += 1
        state.last_processed_offset = state.last_generated_offset

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
            if not enabled:
                self._invalidate_inflight_requests(state)
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
            self._invalidate_inflight_requests(state)
            state.diagram = DiagramDocument()
            state.diagram_type = DiagramType.NONE
            state.locked_diagram_type = None
            state.scope_summary = ""
            state.scope_keywords = []
            state.switch_streak = 0
            state.last_applied_version = 0
            state.committed_transcript = ""
            state.preview_transcript = ""
            state.committed_utterances = []
            state.accepted_utterances = []
            state.last_generated_offset = 0
            state.last_generated_utterance_index = 0
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
            self._invalidate_inflight_requests(state)
            try:
                state.diagram_type = DiagramType(event.payload["diagram_type"])
                state.locked_diagram_type = None
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

    def _source_utterances(
        self, state: SessionState, effective_type: DiagramType
    ) -> list[str]:
        if effective_type == DiagramType.FLOWCHART:
            return state.accepted_utterances
        return state.committed_utterances

    def _sync_accepted_utterances(
        self, state: SessionState, utterances: Optional[list[str]] = None
    ) -> None:
        if state.diagram.diagram_type != DiagramType.FLOWCHART:
            state.accepted_utterances = []
            return
        state.accepted_utterances = self.diagram_generator.accept_flowchart_utterances(
            state.accepted_utterances,
            utterances or [],
        )

    def _refresh_scope_summary(self, state: SessionState) -> None:
        if state.diagram.nodes:
            state.scope_summary = self._diagram_scope_summary(state.diagram)
            return
        if state.accepted_utterances:
            state.scope_summary = " -> ".join(state.accepted_utterances[:4])
            return
        state.scope_summary = ""

    def _scope_summary_for_prompt(self, state: SessionState) -> str:
        return state.scope_summary or state.meeting_title

    def _diagrams_equivalent(
        self, current: DiagramDocument, candidate: DiagramDocument
    ) -> bool:
        if current.diagram_type != candidate.diagram_type:
            return False
        current_nodes = [
            (
                node.id,
                node.data.label,
                node.data.kind,
                node.data.status,
                node.data.description,
                node.data.lane,
                node.data.actor,
                node.data.time_label,
            )
            for node in current.nodes
        ]
        candidate_nodes = [
            (
                node.id,
                node.data.label,
                node.data.kind,
                node.data.status,
                node.data.description,
                node.data.lane,
                node.data.actor,
                node.data.time_label,
            )
            for node in candidate.nodes
        ]
        if current_nodes != candidate_nodes:
            return False

        current_edges = [
            (edge.id, edge.source, edge.target, edge.label, edge.data.kind)
            for edge in current.edges
        ]
        candidate_edges = [
            (edge.id, edge.source, edge.target, edge.label, edge.data.kind)
            for edge in candidate.edges
        ]
        return current_edges == candidate_edges

    def _branch_structure_changed(
        self, current: DiagramDocument, candidate: DiagramDocument
    ) -> bool:
        return self._branch_signature(current) != self._branch_signature(candidate)

    def _branch_signature(
        self, diagram: DiagramDocument
    ) -> tuple[tuple[str, str, Optional[str]], ...]:
        branch_edges = [
            (edge.source, edge.target, edge.label)
            for edge in diagram.edges
            if edge.data.kind == "branch"
        ]
        return tuple(sorted(branch_edges))

    def _diagram_scope_summary(self, diagram: DiagramDocument) -> str:
        if self._branch_signature(diagram):
            branch_child_ids = {
                edge.target for edge in diagram.edges if edge.data.kind == "branch"
            }
            ordered_nodes = sorted(
                diagram.nodes,
                key=lambda node: (node.position.y, node.position.x, node.id),
            )
            top_labels = [
                node.data.label
                for node in ordered_nodes
                if node.id not in branch_child_ids and node.data.label
            ]
            branch_labels = [
                node.data.label
                for node in ordered_nodes
                if node.id in branch_child_ids and node.data.label
            ]
            if top_labels and branch_labels:
                return (
                    f"{' -> '.join(top_labels)} -> "
                    f"{{{' | '.join(branch_labels)}}}"
                )
            if branch_labels:
                return f"{{{' | '.join(branch_labels)}}}"

        ordered_nodes = sorted(
            diagram.nodes,
            key=lambda node: (node.position.y, node.position.x, node.id),
        )
        labels = [node.data.label for node in ordered_nodes[:4] if node.data.label]
        return " -> ".join(labels)
