from app.schemas.diagram import (
    DiagramDocument,
    DiagramEdge,
    DiagramNode,
    DiagramPatch,
    DiagramType,
    EdgeData,
    NodeData,
    PatchOp,
    Position,
)
from app.schemas.intent import IntentAction, IntentResult
from app.services.diagram_generator import DiagramGenerator
from app.services.model_orchestrator import AIFactEdge, AIFactNode, AIFacts
from app.services.render_adapter import RenderAdapter


def _node(node_id: str, label: str, *, kind: str = "step") -> DiagramNode:
    return DiagramNode(
        id=node_id,
        position=Position(x=10.0, y=20.0),
        data=NodeData(label=label, kind=kind),
    )


def test_generate_from_facts_preserves_diagram_id_and_increments_version() -> None:
    generator = DiagramGenerator()
    current = DiagramDocument(
        diagram_id="d-fixed",
        diagram_type=DiagramType.FLOWCHART,
        version=3,
        nodes=[_node("n-existing", "Existing")],
    )
    facts = AIFacts(
        nodes=[
            AIFactNode(key="sales_handoff", label="Sales Handoff"),
            AIFactNode(key="security_review", label="Security Review"),
        ],
        edges=[
            AIFactEdge(
                source_key="sales_handoff",
                target_key="security_review",
            )
        ],
    )

    diagram = generator.generate_from_facts(
        facts,
        DiagramType.FLOWCHART,
        current=current,
    )

    assert diagram.diagram_id == "d-fixed"
    assert diagram.version == 4
    assert [node.id for node in diagram.nodes] == [
        "n-sales-handoff",
        "n-security-review",
    ]
    assert diagram.edges[0].id == "e-sales-handoff--security-review"


def test_generate_patch_from_facts_returns_incremental_patch_for_small_change() -> None:
    generator = DiagramGenerator()
    current = DiagramDocument(
        diagram_id="d-incremental",
        diagram_type=DiagramType.FLOWCHART,
        version=2,
        nodes=[
            _node("n-a", "A"),
            _node("n-b", "B"),
            _node("n-c", "C"),
            _node("n-d", "D"),
        ],
        edges=[
            DiagramEdge(
                id="e-a--b",
                source="n-a",
                target="n-b",
                data=EdgeData(kind="sequence"),
            ),
            DiagramEdge(
                id="e-b--c",
                source="n-b",
                target="n-c",
                data=EdgeData(kind="sequence"),
            ),
            DiagramEdge(
                id="e-c--d",
                source="n-c",
                target="n-d",
                data=EdgeData(kind="sequence"),
            ),
        ],
    )
    facts = AIFacts(
        nodes=[
            AIFactNode(key="a", label="A"),
            AIFactNode(key="b", label="B"),
            AIFactNode(key="c", label="C"),
            AIFactNode(key="d", label="D"),
            AIFactNode(key="e", label="E"),
        ],
        edges=[
            AIFactEdge(source_key="a", target_key="b"),
            AIFactEdge(source_key="b", target_key="c"),
            AIFactEdge(source_key="c", target_key="d"),
            AIFactEdge(source_key="d", target_key="e"),
        ],
    )

    patch = generator.generate_patch_from_facts(
        facts,
        DiagramType.FLOWCHART,
        current,
    )

    assert patch is not None
    assert patch.diagram_id == "d-incremental"
    assert patch.base_version == 2
    assert patch.version == 3
    assert patch.layout_changed is True
    assert [op.op for op in patch.ops] == ["add_node", "add_edge"]


def test_generate_patch_returns_none_for_replace_request() -> None:
    generator = DiagramGenerator()
    current = DiagramDocument(diagram_type=DiagramType.FLOWCHART)
    intent = IntentResult(
        diagram_type=DiagramType.FLOWCHART,
        confidence=0.9,
        action=IntentAction.REPLACE,
        reason="correction",
    )

    patch = generator.generate_patch(intent, "Actually legal happens first.", current)

    assert patch is None


def test_render_adapter_apply_patch_assigns_position_and_removes_incident_edges() -> None:
    adapter = RenderAdapter()
    current = DiagramDocument(
        diagram_id="d-render",
        diagram_type=DiagramType.FLOWCHART,
        version=2,
        layout_version=3,
        nodes=[
            _node("n-a", "A"),
            _node("n-b", "B"),
        ],
        edges=[
            DiagramEdge(
                id="e-a--b",
                source="n-a",
                target="n-b",
                data=EdgeData(kind="sequence"),
            )
        ],
    )
    patch = DiagramPatch(
        diagram_id="d-render",
        diagram_type=DiagramType.FLOWCHART,
        base_version=2,
        version=3,
        layout_changed=True,
        ops=[
            PatchOp(
                op="add_node",
                data=DiagramNode(
                    id="n-c",
                    data=NodeData(label="C"),
                ).model_dump(by_alias=True),
            ),
            PatchOp(
                op="add_edge",
                data=DiagramEdge(
                    id="e-b--c",
                    source="n-b",
                    target="n-c",
                    data=EdgeData(kind="sequence"),
                ).model_dump(),
            ),
            PatchOp(op="remove_node", data={"id": "n-a"}),
        ],
    )

    updated = adapter.apply_patch(current, patch)

    assert updated.version == 3
    assert updated.layout_version == 4
    assert [node.id for node in updated.nodes] == ["n-b", "n-c"]
    assert updated.nodes[1].position != Position()
    assert [edge.id for edge in updated.edges] == ["e-b--c"]
