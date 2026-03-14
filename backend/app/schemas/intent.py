from enum import Enum
from typing import Optional

from pydantic import BaseModel

from app.schemas.diagram import DiagramType


class IntentAction(str, Enum):
    UPDATE = "update"
    REPLACE = "replace"
    NOOP = "noop"


class ScopeRelation(str, Enum):
    IN_SCOPE = "in_scope"
    OUT_OF_SCOPE = "out_of_scope"
    CORRECTION = "correction"
    SWITCH_CANDIDATE = "switch_candidate"


class IntentResult(BaseModel):
    diagram_type: DiagramType
    confidence: float
    action: IntentAction
    reason: Optional[str] = None
    scope_relation: ScopeRelation = ScopeRelation.IN_SCOPE
