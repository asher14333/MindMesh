from app.schemas.diagram import (
    DiagramDocument,
    DiagramEdge,
    DiagramNode,
    DiagramPatch,
    DiagramType,
    Position,
)


class RenderAdapter:
    FLOWCHART_START_X = 120
    FLOWCHART_NODE_WIDTH = 240
    FLOWCHART_GAP = 40
    FLOWCHART_Y = 200

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
        updated, _ = self.apply_patch_with_emitted(current, patch)
        return updated

    def apply_patch_with_emitted(
        self, current: DiagramDocument, patch: DiagramPatch
    ) -> tuple[DiagramDocument, DiagramPatch]:
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
                existing = next((node for node in nodes if node.id == updated.id), None)
                if existing is not None and updated.position == Position():
                    updated = updated.model_copy(
                        update={"position": existing.position}
                    )
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

        updated_document = DiagramDocument(
            diagram_id=current.diagram_id,
            diagram_type=patch.diagram_type,
            nodes=nodes,
            edges=edges,
            version=max(current.version, patch.version),
            layout_version=current.layout_version
            + (1 if patch.layout_changed else 0),
        )
        node_map = {node.id: node for node in updated_document.nodes}
        emitted_ops = []

        for op in patch.ops:
            if op.op in {"add_node", "update_node"}:
                node_id = op.data.get("id")
                rewritten_node = node_map.get(node_id)
                if rewritten_node is not None:
                    emitted_ops.append(
                        op.model_copy(
                            update={
                                "data": rewritten_node.model_dump(by_alias=True)
                            }
                        )
                    )
                    continue
            emitted_ops.append(op)

        return updated_document, patch.model_copy(update={"ops": emitted_ops})

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

        return Position(
            x=RenderAdapter.FLOWCHART_START_X
            + index
            * (RenderAdapter.FLOWCHART_NODE_WIDTH + RenderAdapter.FLOWCHART_GAP),
            y=RenderAdapter.FLOWCHART_Y,
        )
