import logging
import re
from typing import Optional

from app.schemas.diagram import (
    DiagramDocument,
    DiagramEdge,
    DiagramNode,
    DiagramPatch,
    DiagramType,
    EdgeData,
    NodeData,
    PatchOp,
)
from app.schemas.intent import IntentAction, IntentResult
from app.services.model_orchestrator import AIFactEdge, AIFactNode, AIFacts

logger = logging.getLogger(__name__)


class DiagramGenerator:
    MAX_NODES = 12
    MAX_LABEL = 56

    # ------------------------------------------------------------------
    # AI facts → DiagramDocument / DiagramPatch
    # ------------------------------------------------------------------

    def generate_from_facts(
        self,
        facts: AIFacts,
        diagram_type: DiagramType,
        current: Optional[DiagramDocument] = None,
    ) -> DiagramDocument:
        logger.info(
            "diagram_generator: using AI facts path (generate_from_facts) | "
            "diagram_type=%s nodes=%s edges=%s current_version=%s",
            diagram_type.value,
            len(facts.nodes),
            len(facts.edges),
            current.version if current else 0,
        )
        nodes: list[DiagramNode] = []
        for fact in facts.nodes[: self.MAX_NODES]:
            nodes.append(self._fact_to_node(fact))

        node_ids = {n.id for n in nodes}
        edges: list[DiagramEdge] = []
        for fact in facts.edges:
            edge = self._fact_to_edge(fact)
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)

        version = (current.version + 1) if current else 1
        diagram_id = current.diagram_id if current else None

        doc = DiagramDocument(
            diagram_type=diagram_type,
            nodes=nodes,
            edges=edges,
            version=version,
        )
        if diagram_id:
            doc.diagram_id = diagram_id
        return doc

    def generate_patch_from_facts(
        self,
        facts: AIFacts,
        diagram_type: DiagramType,
        current: DiagramDocument,
    ) -> Optional[DiagramPatch]:
        logger.info(
            "diagram_generator: using AI facts path (generate_patch_from_facts) | "
            "diagram_type=%s facts_nodes=%s facts_edges=%s current_nodes=%s current_version=%s",
            diagram_type.value,
            len(facts.nodes),
            len(facts.edges),
            len(current.nodes),
            current.version,
        )
        current_node_map = {n.id: n for n in current.nodes}
        current_edge_map = {e.id: e for e in current.edges}
        ops: list[PatchOp] = []

        new_node_ids: set[str] = set()
        for fact in facts.nodes[: self.MAX_NODES]:
            node = self._fact_to_node(fact)
            new_node_ids.add(node.id)

            if node.id in current_node_map:
                existing = current_node_map[node.id]
                if self._node_changed(existing, node):
                    ops.append(
                        PatchOp(
                            op="update_node",
                            data=node.model_dump(by_alias=True),
                        )
                    )
            else:
                ops.append(
                    PatchOp(
                        op="add_node",
                        data=node.model_dump(by_alias=True),
                    )
                )

        for node_id in current_node_map:
            if node_id not in new_node_ids:
                ops.append(PatchOp(op="remove_node", data={"id": node_id}))

        all_valid_nodes = new_node_ids | set(current_node_map.keys())
        new_edge_ids: set[str] = set()
        for fact in facts.edges:
            edge = self._fact_to_edge(fact)
            if edge.source not in all_valid_nodes or edge.target not in all_valid_nodes:
                continue
            new_edge_ids.add(edge.id)

            if edge.id in current_edge_map:
                existing = current_edge_map[edge.id]
                if existing.label != edge.label or existing.data.kind != edge.data.kind:
                    ops.append(
                        PatchOp(op="update_edge", data=edge.model_dump())
                    )
            else:
                ops.append(PatchOp(op="add_edge", data=edge.model_dump()))

        for edge_id in current_edge_map:
            if edge_id not in new_edge_ids:
                ops.append(PatchOp(op="remove_edge", data={"id": edge_id}))

        if not ops:
            logger.debug(
                "diagram_generator: AI facts patch produced no ops (noop), returning None"
            )
            return None

        layout_ops = sum(1 for op in ops if op.op in ("add_node", "remove_node"))
        allowed_layout_ops = max(2, int(len(current.nodes) * 0.3))
        if current.nodes and layout_ops > allowed_layout_ops:
            logger.info(
                "diagram_generator: AI facts patch skipped (structural change >30%%) | "
                "layout_ops=%s current_nodes=%s allowed=%s → caller should use replace",
                layout_ops,
                len(current.nodes),
                allowed_layout_ops,
            )
            return None

        return DiagramPatch(
            diagram_id=current.diagram_id,
            diagram_type=diagram_type,
            base_version=current.version,
            ops=ops,
            version=current.version + 1,
            reason="ai_incremental",
            layout_changed=layout_ops > 0,
        )

    # ------------------------------------------------------------------
    # Rules-only fallback (no LLM)
    # ------------------------------------------------------------------

    def generate_document(
        self, intent: IntentResult, transcript: str
    ) -> DiagramDocument:
        utterances = self._utterances_from_transcript(transcript)
        return self.generate_document_from_utterances(
            intent.diagram_type,
            utterances,
        )

    def generate_patch(
        self,
        intent: IntentResult,
        transcript_delta: str,
        current: DiagramDocument,
    ) -> Optional[DiagramPatch]:
        if (
            intent.action == IntentAction.REPLACE
            or current.diagram_type != intent.diagram_type
        ):
            logger.debug(
                "diagram_generator: rules patch skipped (replace or type mismatch) | "
                "action=%s current_type=%s intent_type=%s",
                intent.action.value,
                current.diagram_type.value,
                intent.diagram_type.value,
            )
            return None
        utterances = self._utterances_from_transcript(transcript_delta)
        if not utterances:
            return None
        return self.generate_patch_from_utterances(
            intent.diagram_type,
            utterances,
            current,
        )

    def generate_document_from_utterances(
        self,
        diagram_type: DiagramType,
        utterances: list[str],
        current: Optional[DiagramDocument] = None,
    ) -> DiagramDocument:
        facts = self._facts_from_utterances(diagram_type, utterances)
        logger.info(
            "diagram_generator: using rules fallback (generate_document_from_utterances) | "
            "diagram_type=%s utterances=%s nodes=%s",
            diagram_type.value,
            len(utterances),
            len(facts.nodes),
        )
        return self.generate_from_facts(facts, diagram_type, current=current)

    def generate_patch_from_utterances(
        self,
        diagram_type: DiagramType,
        utterances: list[str],
        current: DiagramDocument,
    ) -> Optional[DiagramPatch]:
        facts = self._facts_from_utterances(diagram_type, utterances)
        logger.info(
            "diagram_generator: using rules fallback (generate_patch_from_utterances) | "
            "diagram_type=%s utterances=%s nodes=%s",
            diagram_type.value,
            len(utterances),
            len(facts.nodes),
        )
        patch = self.generate_patch_from_facts(facts, diagram_type, current)
        if patch:
            patch.reason = "rules_incremental"
        return patch

    # ------------------------------------------------------------------
    # Fact → schema helpers
    # ------------------------------------------------------------------

    def _fact_to_node(self, fact: AIFactNode) -> DiagramNode:
        return DiagramNode(
            id=self._derive_node_id(fact.key),
            data=NodeData(
                label=self._truncate(fact.label),
                kind=fact.kind,
                status=fact.status,
                description=fact.description,
                lane=fact.lane,
                actor=fact.actor,
                time_label=fact.time_label,
            ),
        )

    def _fact_to_edge(self, fact: AIFactEdge) -> DiagramEdge:
        src_id = self._derive_node_id(fact.source_key)
        tgt_id = self._derive_node_id(fact.target_key)
        return DiagramEdge(
            id=self._derive_edge_id(fact.source_key, fact.target_key),
            source=src_id,
            target=tgt_id,
            data=EdgeData(kind=fact.kind),
            label=fact.label,
        )

    @staticmethod
    def _derive_node_id(key: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", key.lower().strip()).strip("-")
        return f"n-{slug}"

    @staticmethod
    def _derive_edge_id(src_key: str, tgt_key: str) -> str:
        s = re.sub(r"[^a-z0-9]+", "-", src_key.lower().strip()).strip("-")
        t = re.sub(r"[^a-z0-9]+", "-", tgt_key.lower().strip()).strip("-")
        return f"e-{s}--{t}"

    def _node_changed(self, a: DiagramNode, b: DiagramNode) -> bool:
        return (
            a.data.label != b.data.label
            or a.data.kind != b.data.kind
            or a.data.status != b.data.status
            or a.data.description != b.data.description
            or a.data.lane != b.data.lane
            or a.data.actor != b.data.actor
            or a.data.time_label != b.data.time_label
        )

    # ------------------------------------------------------------------
    # Rules-based builders
    # ------------------------------------------------------------------

    def _facts_from_utterances(
        self, diagram_type: DiagramType, utterances: list[str]
    ) -> AIFacts:
        normalized = self._normalize_utterances(utterances)
        if diagram_type == DiagramType.MINDMAP:
            return self._mindmap_facts(normalized)
        if diagram_type == DiagramType.ORGCHART:
            return self._orgchart_facts(normalized)
        if diagram_type == DiagramType.TIMELINE:
            return self._timeline_facts(normalized)
        return self._flowchart_facts(normalized)

    def _flowchart_facts(self, utterances: list[str]) -> AIFacts:
        facts = AIFacts()
        previous_key: Optional[str] = None
        for idx, utterance in enumerate(utterances[: self.MAX_NODES], start=1):
            label = self._clean_flow_label(utterance)
            key = self._semantic_key(label, fallback=f"step_{idx}")
            facts.nodes.append(
                AIFactNode(
                    key=key,
                    label=label,
                    kind="step",
                )
            )
            if previous_key:
                facts.edges.append(
                    AIFactEdge(
                        source_key=previous_key,
                        target_key=key,
                        kind="sequence",
                    )
                )
            previous_key = key
        return facts

    def _timeline_facts(self, utterances: list[str]) -> AIFacts:
        facts = AIFacts()
        previous_key: Optional[str] = None
        for idx, utterance in enumerate(utterances[: self.MAX_NODES], start=1):
            label = self._clean_flow_label(utterance)
            key = self._semantic_key(label, fallback=f"milestone_{idx}")
            facts.nodes.append(
                AIFactNode(
                    key=key,
                    label=label,
                    kind="milestone",
                    time_label=self._time_label_for(utterance),
                )
            )
            if previous_key:
                facts.edges.append(
                    AIFactEdge(
                        source_key=previous_key,
                        target_key=key,
                        kind="sequence",
                    )
                )
            previous_key = key
        return facts

    def _mindmap_facts(self, utterances: list[str]) -> AIFacts:
        facts = AIFacts(
            nodes=[AIFactNode(key="meeting_topic", label="Meeting Topic", kind="root")]
        )
        for idx, utterance in enumerate(utterances[: self.MAX_NODES - 1], start=1):
            label = self._clean_flow_label(utterance)
            key = self._semantic_key(label, fallback=f"branch_{idx}")
            facts.nodes.append(
                AIFactNode(
                    key=key,
                    label=label,
                    kind="branch",
                )
            )
            facts.edges.append(
                AIFactEdge(
                    source_key="meeting_topic",
                    target_key=key,
                    kind="depends_on",
                )
            )
        return facts

    def _orgchart_facts(self, utterances: list[str]) -> AIFacts:
        facts = AIFacts()
        seen_people: set[str] = set()

        for utterance in utterances:
            relation = self._org_relation_from_utterance(utterance)
            if relation is None:
                continue

            person_label, manager_label = relation
            person_key = self._semantic_key(person_label, fallback="person")
            manager_key = self._semantic_key(manager_label, fallback="manager")

            if person_key not in seen_people:
                facts.nodes.append(
                    AIFactNode(
                        key=person_key,
                        label=person_label,
                        kind="person",
                        actor=person_label,
                    )
                )
                seen_people.add(person_key)
            if manager_key not in seen_people:
                facts.nodes.append(
                    AIFactNode(
                        key=manager_key,
                        label=manager_label,
                        kind="person",
                        actor=manager_label,
                    )
                )
                seen_people.add(manager_key)

            facts.edges.append(
                AIFactEdge(
                    source_key=person_key,
                    target_key=manager_key,
                    kind="reports_to",
                )
            )

        if facts.nodes:
            return facts

        facts.nodes.append(AIFactNode(key="team_root", label="Team", kind="root"))
        for idx, utterance in enumerate(utterances[: self.MAX_NODES - 1], start=1):
            label = self._clean_flow_label(utterance)
            key = self._semantic_key(label, fallback=f"person_{idx}")
            facts.nodes.append(
                AIFactNode(
                    key=key,
                    label=label,
                    kind="person",
                    actor=label,
                )
            )
            facts.edges.append(
                AIFactEdge(
                    source_key=key,
                    target_key="team_root",
                    kind="reports_to",
                )
            )
        return facts

    # ------------------------------------------------------------------
    # Text helpers
    # ------------------------------------------------------------------

    def _utterances_from_transcript(self, transcript: str) -> list[str]:
        parts = re.split(r"(?<=[.!?])\s+", transcript.strip())
        return [part.strip() for part in parts if part.strip()]

    def _normalize_utterances(self, utterances: list[str]) -> list[str]:
        normalized: list[str] = []
        for utterance in utterances:
            cleaned = " ".join(utterance.split())
            if not cleaned:
                continue
            if self._is_correction(cleaned):
                replacement = self._strip_correction_prefix(cleaned)
                if normalized:
                    normalized[-1] = replacement
                else:
                    normalized.append(replacement)
                continue
            normalized.append(cleaned)
        return normalized[: self.MAX_NODES] or ["Awaiting transcript"]

    def _clean_flow_label(self, text: str) -> str:
        cleaned = self._strip_correction_prefix(text)
        cleaned = cleaned.strip().rstrip(".!?")
        cleaned = re.sub(
            r"^(first|then|next|finally)\s+",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        if re.match(r"^(after|before|once)\b", cleaned, flags=re.IGNORECASE):
            parts = cleaned.split(",", 1)
            if len(parts) == 2 and parts[1].strip():
                cleaned = parts[1].strip()
        cleaned = cleaned[:1].upper() + cleaned[1:] if cleaned else "Awaiting transcript"
        return self._truncate(cleaned)

    def _org_relation_from_utterance(
        self, utterance: str
    ) -> Optional[tuple[str, str]]:
        cleaned = self._strip_correction_prefix(utterance).strip().rstrip(".!?")
        report_match = re.search(
            r"\b(?P<person>[A-Za-z][A-Za-z0-9&/ -]+?)\s+reports to\s+(?P<manager>[A-Za-z][A-Za-z0-9&/ -]+?)(?:\s+in\s+the\s+(?:organization|org)\s+chart)?$",
            cleaned,
            flags=re.IGNORECASE,
        )
        if report_match:
            return (
                self._titleize(report_match.group("person")),
                self._titleize(report_match.group("manager")),
            )

        manage_match = re.search(
            r"\b(?P<manager>[A-Za-z][A-Za-z0-9&/ -]+?)\s+manages\s+(?P<person>[A-Za-z][A-Za-z0-9&/ -]+?)(?:\s+in\s+the\s+(?:organization|org)\s+chart)?$",
            cleaned,
            flags=re.IGNORECASE,
        )
        if manage_match:
            return (
                self._titleize(manage_match.group("person")),
                self._titleize(manage_match.group("manager")),
            )
        return None

    def _time_label_for(self, utterance: str) -> Optional[str]:
        match = re.search(
            r"\b(today|tomorrow|yesterday|q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|week \d+|month \d+)\b",
            utterance,
            flags=re.IGNORECASE,
        )
        if not match:
            return None
        return self._titleize(match.group(1))

    def _semantic_key(self, text: str, fallback: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
        return slug or fallback

    def _is_correction(self, text: str) -> bool:
        return bool(
            re.match(
                r"^(actually|sorry|correction|instead|rather|no[, ]|wait[, ])\b",
                text,
                flags=re.IGNORECASE,
            )
        )

    def _strip_correction_prefix(self, text: str) -> str:
        return re.sub(
            r"^(actually|sorry|correction|instead|rather|wait|no)\b[,\s:.-]*",
            "",
            text.strip(),
            flags=re.IGNORECASE,
        )

    def _titleize(self, text: str) -> str:
        normalized = " ".join(text.split()).strip(" ,.")
        return normalized[:1].upper() + normalized[1:] if normalized else normalized

    def _truncate(self, text: str) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= self.MAX_LABEL:
            return normalized
        return f"{normalized[: self.MAX_LABEL - 1].rstrip()}\u2026"
