from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class DiagramType(str, Enum):
    FLOWCHART = "flowchart"
    TIMELINE = "timeline"
    MINDMAP = "mindmap"
    ORGCHART = "orgchart"
    NONE = "none"


class Position(BaseModel):
    x: float
    y: float


class DiagramNode(BaseModel):
    id: str
    label: str
    kind: str = "step"
    status: Optional[str] = None
    position: Position = Field(default_factory=lambda: Position(x=0, y=0))
    metadata: dict[str, Any] = Field(default_factory=dict)


class DiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class DiagramDocument(BaseModel):
    diagram_type: DiagramType = DiagramType.NONE
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)
    version: int = 0


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
    diagram_type: DiagramType
    ops: list[PatchOp] = Field(default_factory=list)
    version: int = 0
    reason: Optional[str] = None
