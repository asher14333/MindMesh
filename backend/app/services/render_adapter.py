from app.schemas.diagram import DiagramDocument, DiagramEdge, DiagramNode, DiagramPatch, DiagramType, PatchOp, Position


class RenderAdapter:
    def layout_document(self, diagram: DiagramDocument) -> DiagramDocument:
        positioned_nodes = []
        for index, node in enumerate(diagram.nodes):
            positioned_nodes.append(node.model_copy(update={"position": self._position_for(diagram.diagram_type, index)}))
        return diagram.model_copy(update={"nodes": positioned_nodes})

    def apply_patch(self, current: DiagramDocument, patch: DiagramPatch) -> DiagramDocument:
        nodes = list(current.nodes)
        edges = list(current.edges)

        for operation in patch.ops:
            if operation.op == "add_node":
                nodes.append(DiagramNode.model_validate(operation.data))
            elif operation.op == "update_node":
                nodes = self._replace_model(nodes, DiagramNode.model_validate(operation.data))
            elif operation.op == "add_edge":
                edges.append(DiagramEdge.model_validate(operation.data))
            elif operation.op == "update_edge":
                edges = self._replace_model(edges, DiagramEdge.model_validate(operation.data))
            elif operation.op == "remove_node":
                nodes = [node for node in nodes if node.id != operation.data["id"]]
                removed_ids = {operation.data["id"]}
                edges = [
                    edge
                    for edge in edges
                    if edge.source not in removed_ids and edge.target not in removed_ids
                ]
            elif operation.op == "remove_edge":
                edges = [edge for edge in edges if edge.id != operation.data["id"]]

        updated = DiagramDocument(
            diagram_type=patch.diagram_type,
            nodes=nodes,
            edges=edges,
            version=max(current.version, patch.version),
        )
        return self.layout_document(updated)

    def _replace_model(self, items: list, replacement):
        return [replacement if item.id == replacement.id else item for item in items]

    def _position_for(self, diagram_type: DiagramType, index: int) -> Position:
        if diagram_type == DiagramType.TIMELINE:
            return Position(x=180 + (index * 220), y=220)
        if diagram_type == DiagramType.MINDMAP:
            if index == 0:
                return Position(x=420, y=220)
            offset = index - 1
            return Position(x=160 + ((offset % 3) * 240), y=80 + ((offset // 3) * 180))
        if diagram_type == DiagramType.ORGCHART:
            if index == 0:
                return Position(x=420, y=80)
            offset = index - 1
            return Position(x=160 + ((offset % 3) * 240), y=220 + ((offset // 3) * 160))
        return Position(x=120 + (index * 240), y=200)
