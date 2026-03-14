from app.schemas.diagram import (
    DiagramDocument,
    DiagramEdge,
    DiagramNode,
    DiagramPatch,
    DiagramType,
    Position,
)


class RenderAdapter:
    def layout_document(self, diagram: DiagramDocument) -> DiagramDocument:
        total = len(diagram.nodes)
        positioned = [
            node.model_copy(
                update={
                    "position": self._position_for(
                        diagram.diagram_type, idx, total
                    )
                }
            )
            for idx, node in enumerate(diagram.nodes)
        ]
        return diagram.model_copy(
            update={
                "nodes": positioned,
                "layout_version": diagram.layout_version + 1,
            }
        )

    def apply_patch(
        self, current: DiagramDocument, patch: DiagramPatch
    ) -> DiagramDocument:
        nodes = list(current.nodes)
        edges = list(current.edges)

        for op in patch.ops:
            if op.op == "add_node":
                new_node = DiagramNode.model_validate(op.data)
                new_node = new_node.model_copy(
                    update={
                        "position": self._position_for(
                            patch.diagram_type, len(nodes), len(nodes) + 1
                        )
                    }
                )
                nodes.append(new_node)

            elif op.op == "update_node":
                updated = DiagramNode.model_validate(op.data)
                nodes = self._replace_by_id(nodes, updated)

            elif op.op == "add_edge":
                edges.append(DiagramEdge.model_validate(op.data))

            elif op.op == "update_edge":
                updated = DiagramEdge.model_validate(op.data)
                edges = self._replace_by_id(edges, updated)

            elif op.op == "remove_node":
                removed_id = op.data["id"]
                nodes = [n for n in nodes if n.id != removed_id]
                edges = [
                    e
                    for e in edges
                    if e.source != removed_id and e.target != removed_id
                ]

            elif op.op == "remove_edge":
                edges = [e for e in edges if e.id != op.data["id"]]

        return DiagramDocument(
            diagram_id=current.diagram_id,
            diagram_type=patch.diagram_type,
            nodes=nodes,
            edges=edges,
            version=max(current.version, patch.version),
            layout_version=current.layout_version
            + (1 if patch.layout_changed else 0),
        )

    # ------------------------------------------------------------------

    @staticmethod
    def _replace_by_id(items: list, replacement):  # type: ignore[type-arg]
        return [
            replacement if item.id == replacement.id else item
            for item in items
        ]

    @staticmethod
    def _position_for(
        diagram_type: DiagramType, index: int, total: int = 0
    ) -> Position:
        if diagram_type == DiagramType.TIMELINE:
            return Position(x=180 + index * 220, y=220)

        if diagram_type == DiagramType.MINDMAP:
            if index == 0:
                return Position(x=420, y=300)
            offset = index - 1
            return Position(
                x=120 + (offset % 3) * 260,
                y=80 + (offset // 3) * 180,
            )

        if diagram_type == DiagramType.ORGCHART:
            if index == 0:
                return Position(x=420, y=80)
            offset = index - 1
            cols = max(3, total - 1) if total > 1 else 3
            return Position(
                x=120 + (offset % cols) * 240,
                y=220 + (offset // cols) * 160,
            )

        return Position(x=120 + index * 240, y=200)
