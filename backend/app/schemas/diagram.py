from enum import Enum
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class DiagramType(str, Enum):
    FLOWCHART = "flowchart"
    TIMELINE = "timeline"
    MINDMAP = "mindmap"
    ORGCHART = "orgchart"
    NONE = "none"


class Position(BaseModel):
    x: float = 0.0
    y: float = 0.0


class ViewportHint(BaseModel):
    x: float = 0.0
    y: float = 0.0
    zoom: float = 1.0


class NodeData(BaseModel):
    label: str
    kind: str = "step"
    status: Optional[str] = None
    description: Optional[str] = None
    lane: Optional[str] = None
    actor: Optional[str] = None
    time_label: Optional[str] = None
    confidence: Optional[float] = None
    source_span: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DiagramNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: str = "default"
    position: Position = Field(default_factory=Position)
    hidden: bool = False
    parent_id: Optional[str] = Field(default=None, alias="parentId")
    data: NodeData


class EdgeData(BaseModel):
    kind: Optional[str] = None
    confidence: Optional[float] = None


class DiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str = "default"
    label: Optional[str] = None
    hidden: bool = False
    animated: bool = False
    data: EdgeData = Field(default_factory=EdgeData)


class DiagramDocument(BaseModel):
    diagram_id: str = Field(default_factory=lambda: f"d-{uuid4().hex[:8]}")
    diagram_type: DiagramType = DiagramType.NONE
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)
    version: int = 0
    layout_version: int = 0
    viewport_hint: Optional[ViewportHint] = None


class PatchOp(BaseModel):
    op: Literal[
        "add_node",
        "update_node",
        "add_edge",
        "update_edge",
        "remove_node",
        "remove_edge",
    ]
    data: dict[str, Any]


class DiagramPatch(BaseModel):
    diagram_id: Optional[str] = None
    diagram_type: DiagramType = DiagramType.NONE
    base_version: int = 0
    ops: list[PatchOp] = Field(default_factory=list)
    version: int = 0
    reason: Optional[str] = None
    layout_changed: bool = False
    viewport_hint: Optional[ViewportHint] = None
