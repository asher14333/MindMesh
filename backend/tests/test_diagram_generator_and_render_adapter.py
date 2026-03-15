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


def test_generate_patch_from_utterances_uses_stable_semantic_ids() -> None:
    generator = DiagramGenerator()
    current = generator.generate_document_from_utterances(
        DiagramType.FLOWCHART,
        ["First sales hands off the deal to solutions engineering."],
    )

    patch = generator.generate_patch_from_utterances(
        DiagramType.FLOWCHART,
        [
            "First sales hands off the deal to solutions engineering.",
            "Then security reviews the integration requirements.",
        ],
        current,
    )

    assert patch is not None
    assert [op.op for op in patch.ops] == ["add_node", "add_edge"]
    assert patch.ops[0].data["id"] == "n-security-reviews-the-integration-requirements"


def test_generate_document_from_utterances_replaces_last_step_on_correction() -> None:
    generator = DiagramGenerator()

    diagram = generator.generate_document_from_utterances(
        DiagramType.FLOWCHART,
        [
            "First sales hands off the deal to solutions engineering.",
            "Actually legal approves the MSA first.",
        ],
    )

    assert [node.data.label for node in diagram.nodes] == ["Legal approves the MSA first"]


def test_generate_document_from_utterances_builds_orgchart_relationship() -> None:
    generator = DiagramGenerator()

    diagram = generator.generate_document_from_utterances(
        DiagramType.ORGCHART,
        ["Alice reports to Bob in the organization chart."],
    )

    assert [node.data.label for node in diagram.nodes] == ["Alice", "Bob"]
    assert [(edge.source, edge.target, edge.data.kind) for edge in diagram.edges] == [
        ("n-alice", "n-bob", "reports_to")
    ]


def test_generate_document_from_utterances_extracts_timeline_time_label() -> None:
    generator = DiagramGenerator()

    diagram = generator.generate_document_from_utterances(
        DiagramType.TIMELINE,
        ["Q1 kickoff happens in January."],
    )

    assert diagram.nodes[0].data.label == "Q1 kickoff happens in January"
    assert diagram.nodes[0].data.time_label == "Q1"


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


def test_render_adapter_rewrites_emitted_patch_with_final_node_positions() -> None:
    adapter = RenderAdapter()
    current = DiagramDocument(
        diagram_id="d-render-emit",
        diagram_type=DiagramType.FLOWCHART,
        version=1,
        nodes=[_node("n-a", "A")],
    )
    patch = DiagramPatch(
        diagram_id="d-render-emit",
        diagram_type=DiagramType.FLOWCHART,
        base_version=1,
        version=2,
        layout_changed=True,
        ops=[
            PatchOp(
                op="add_node",
                data=DiagramNode(
                    id="n-b",
                    data=NodeData(label="B"),
                ).model_dump(by_alias=True),
            ),
            PatchOp(
                op="update_node",
                data=DiagramNode(
                    id="n-a",
                    data=NodeData(label="A updated"),
                ).model_dump(by_alias=True),
            ),
        ],
    )

    updated, emitted = adapter.apply_patch_with_emitted(current, patch)

    add_node = next(op for op in emitted.ops if op.op == "add_node")
    update_node = next(op for op in emitted.ops if op.op == "update_node")

    assert add_node.data["position"] == updated.nodes[1].position.model_dump()
    assert update_node.data["position"] == updated.nodes[0].position.model_dump()
