from enum import Enum
from typing import Optional

from pydantic import BaseModel

from app.schemas.diagram import DiagramType


class IntentAction(str, Enum):
    UPDATE = "update"
    REPLACE = "replace"
    NOOP = "noop"


class IntentResult(BaseModel):
    diagram_type: DiagramType
    confidence: float
    action: IntentAction
    reason: Optional[str] = None
