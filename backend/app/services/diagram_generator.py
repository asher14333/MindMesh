import re

from app.schemas.diagram import DiagramDocument, DiagramEdge, DiagramNode, DiagramPatch, DiagramType, PatchOp
from app.schemas.intent import IntentAction, IntentResult


class DiagramGenerator:
    def generate_document(self, intent: IntentResult, transcript: str) -> DiagramDocument:
        diagram_type = intent.diagram_type

        if diagram_type == DiagramType.MINDMAP:
            return self._build_mindmap(transcript)
        if diagram_type == DiagramType.ORGCHART:
            return self._build_orgchart(transcript)

        nodes, edges = self._build_linear_graph(transcript, diagram_type)
        return DiagramDocument(
            diagram_type=diagram_type,
            nodes=nodes,
            edges=edges,
            version=1,
        )

    def generate_patch(
        self, intent: IntentResult, transcript_delta: str, current: DiagramDocument
    ) -> DiagramPatch:
        if intent.action == IntentAction.REPLACE or current.diagram_type != intent.diagram_type:
            return DiagramPatch(diagram_type=intent.diagram_type, reason="replace_requested")

        label = self._truncate_label(transcript_delta)
        node_id = f"n{len(current.nodes) + 1}"
        ops = [
            PatchOp(
                op="add_node",
                data={"id": node_id, "label": label, "kind": "step"},
            )
        ]

        if current.nodes:
            previous = current.nodes[-1]
            ops.append(
                PatchOp(
                    op="add_edge",
                    data={
                        "id": f"e{len(current.edges) + 1}",
                        "source": previous.id,
                        "target": node_id,
                    },
                )
            )

        return DiagramPatch(
            diagram_type=intent.diagram_type,
            ops=ops,
            version=current.version + 1,
            reason="append",
        )

    def _build_linear_graph(
        self, transcript: str, diagram_type: DiagramType
    ) -> tuple[list[DiagramNode], list[DiagramEdge]]:
        steps = self._extract_steps(transcript)
        nodes = [
            DiagramNode(id=f"n{index}", label=label, kind="step")
            for index, label in enumerate(steps, start=1)
        ]
        edges = [
            DiagramEdge(id=f"e{index}", source=f"n{index}", target=f"n{index + 1}")
            for index in range(1, len(nodes))
        ]
        return nodes, edges

    def _build_mindmap(self, transcript: str) -> DiagramDocument:
        parts = self._extract_steps(transcript)
        root = DiagramNode(id="n1", label="Meeting Topic", kind="root")
        nodes = [root]
        edges: list[DiagramEdge] = []
        for index, label in enumerate(parts[:6], start=2):
            nodes.append(DiagramNode(id=f"n{index}", label=label, kind="branch"))
            edges.append(DiagramEdge(id=f"e{index - 1}", source="n1", target=f"n{index}"))
        return DiagramDocument(diagram_type=DiagramType.MINDMAP, nodes=nodes, edges=edges, version=1)

    def _build_orgchart(self, transcript: str) -> DiagramDocument:
        nodes = [DiagramNode(id="n1", label="Team", kind="root")]
        edges: list[DiagramEdge] = []
        parts = self._extract_steps(transcript)
        for index, label in enumerate(parts[:5], start=2):
            nodes.append(DiagramNode(id=f"n{index}", label=label, kind="person"))
            edges.append(DiagramEdge(id=f"e{index - 1}", source="n1", target=f"n{index}"))
        return DiagramDocument(
            diagram_type=DiagramType.ORGCHART,
            nodes=nodes,
            edges=edges,
            version=1,
        )

    def _extract_steps(self, text: str) -> list[str]:
        cleaned = text.strip()
        if not cleaned:
            return ["Awaiting transcript"]

        normalized = re.sub(r"\b(first|then|after|next|finally)\b", "|", cleaned, flags=re.IGNORECASE)
        parts = re.split(r"[|.!?]\s*", normalized)
        steps = [self._truncate_label(part) for part in parts if part.strip()]
        return steps[:8] or [self._truncate_label(cleaned)]

    def _truncate_label(self, text: str, limit: int = 56) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[: limit - 1].rstrip()}..."
