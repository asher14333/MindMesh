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

        layout_ops = sum(
            1 for op in ops if op.op in ("add_node", "remove_node")
        )
        if current.nodes and layout_ops / len(current.nodes) > 0.3:
            logger.info(
                "diagram_generator: AI facts patch skipped (structural change >30%%) | "
                "layout_ops=%s current_nodes=%s ratio=%.2f → caller should use replace",
                layout_ops,
                len(current.nodes),
                layout_ops / len(current.nodes),
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
        logger.info(
            "diagram_generator: using rules fallback (generate_document) | "
            "diagram_type=%s reason=%s transcript_len=%s",
            intent.diagram_type.value,
            intent.reason or "unknown",
            len(transcript),
        )
        dt = intent.diagram_type
        if dt == DiagramType.MINDMAP:
            return self._build_mindmap(transcript)
        if dt == DiagramType.ORGCHART:
            return self._build_orgchart(transcript)
        if dt == DiagramType.TIMELINE:
            return self._build_timeline(transcript)
        nodes, edges = self._build_linear_graph(transcript)
        return DiagramDocument(
            diagram_type=dt, nodes=nodes, edges=edges, version=1
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

        logger.info(
            "diagram_generator: using rules fallback (generate_patch) | "
            "diagram_type=%s current_version=%s delta_len=%s",
            intent.diagram_type.value,
            current.version,
            len(transcript_delta),
        )
        label = self._truncate(transcript_delta)
        node_id = f"n-append-{len(current.nodes) + 1}"
        node = DiagramNode(
            id=node_id, data=NodeData(label=label, kind="step")
        )
        ops: list[PatchOp] = [
            PatchOp(op="add_node", data=node.model_dump(by_alias=True))
        ]

        if current.nodes:
            prev = current.nodes[-1]
            edge = DiagramEdge(
                id=f"e-{prev.id}--{node_id}",
                source=prev.id,
                target=node_id,
                data=EdgeData(kind="sequence"),
            )
            ops.append(PatchOp(op="add_edge", data=edge.model_dump()))

        return DiagramPatch(
            diagram_id=current.diagram_id,
            diagram_type=intent.diagram_type,
            base_version=current.version,
            ops=ops,
            version=current.version + 1,
            reason="append",
            layout_changed=True,
        )

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
        )

    # ------------------------------------------------------------------
    # Rules-based builders
    # ------------------------------------------------------------------

    def _build_linear_graph(
        self, transcript: str
    ) -> tuple[list[DiagramNode], list[DiagramEdge]]:
        steps = self._extract_steps(transcript)
        nodes = [
            DiagramNode(
                id=f"n-step-{i}",
                data=NodeData(label=label, kind="step"),
            )
            for i, label in enumerate(steps, 1)
        ]
        edges = [
            DiagramEdge(
                id=f"e-step-{i}--step-{i + 1}",
                source=f"n-step-{i}",
                target=f"n-step-{i + 1}",
                data=EdgeData(kind="sequence"),
            )
            for i in range(1, len(nodes))
        ]
        return nodes, edges

    def _build_mindmap(self, transcript: str) -> DiagramDocument:
        parts = self._extract_steps(transcript)
        root = DiagramNode(
            id="n-root", data=NodeData(label="Meeting Topic", kind="root")
        )
        nodes: list[DiagramNode] = [root]
        edges: list[DiagramEdge] = []
        for i, label in enumerate(parts[:6], 1):
            nid = f"n-branch-{i}"
            nodes.append(
                DiagramNode(id=nid, data=NodeData(label=label, kind="branch"))
            )
            edges.append(
                DiagramEdge(
                    id=f"e-root--branch-{i}",
                    source="n-root",
                    target=nid,
                    data=EdgeData(kind="depends_on"),
                )
            )
        return DiagramDocument(
            diagram_type=DiagramType.MINDMAP,
            nodes=nodes,
            edges=edges,
            version=1,
        )

    def _build_orgchart(self, transcript: str) -> DiagramDocument:
        parts = self._extract_steps(transcript)
        root = DiagramNode(
            id="n-org-root", data=NodeData(label="Team", kind="root")
        )
        nodes: list[DiagramNode] = [root]
        edges: list[DiagramEdge] = []
        for i, label in enumerate(parts[:5], 1):
            nid = f"n-person-{i}"
            nodes.append(
                DiagramNode(
                    id=nid, data=NodeData(label=label, kind="person")
                )
            )
            edges.append(
                DiagramEdge(
                    id=f"e-org-root--person-{i}",
                    source="n-org-root",
                    target=nid,
                    data=EdgeData(kind="reports_to"),
                )
            )
        return DiagramDocument(
            diagram_type=DiagramType.ORGCHART,
            nodes=nodes,
            edges=edges,
            version=1,
        )

    def _build_timeline(self, transcript: str) -> DiagramDocument:
        parts = self._extract_steps(transcript)
        nodes = [
            DiagramNode(
                id=f"n-milestone-{i}",
                data=NodeData(label=label, kind="milestone"),
            )
            for i, label in enumerate(parts[:8], 1)
        ]
        edges = [
            DiagramEdge(
                id=f"e-milestone-{i}--milestone-{i + 1}",
                source=f"n-milestone-{i}",
                target=f"n-milestone-{i + 1}",
                data=EdgeData(kind="sequence"),
            )
            for i in range(1, len(nodes))
        ]
        return DiagramDocument(
            diagram_type=DiagramType.TIMELINE,
            nodes=nodes,
            edges=edges,
            version=1,
        )

    # ------------------------------------------------------------------
    # Text helpers
    # ------------------------------------------------------------------

    def _extract_steps(self, text: str) -> list[str]:
        cleaned = text.strip()
        if not cleaned:
            return ["Awaiting transcript"]
        normalized = re.sub(
            r"\b(first|then|after|next|finally)\b",
            "|",
            cleaned,
            flags=re.IGNORECASE,
        )
        parts = re.split(r"[|.!?]\s*", normalized)
        steps = [self._truncate(p) for p in parts if p.strip()]
        return steps[: self.MAX_NODES] or [self._truncate(cleaned)]

    def _truncate(self, text: str) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= self.MAX_LABEL:
            return normalized
        return f"{normalized[: self.MAX_LABEL - 1].rstrip()}\u2026"
