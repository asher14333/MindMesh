from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.diagram import DiagramDocument, DiagramType


class SessionMode(str, Enum):
    STANDBY = "standby"
    VISUALIZING = "visualizing"


class SessionState(BaseModel):
    session_id: str
    meeting_title: str = "Untitled Meeting"
    mode: SessionMode = SessionMode.STANDBY
    diagram_type: DiagramType = DiagramType.NONE
    raw_transcript: str = ""
    last_generated_offset: int = 0
    last_chunk_at: float = 0.0
    last_generation_at: float = 0.0
    cooldown_until: float = 0.0
    connections: int = 0
    diagram: DiagramDocument = Field(default_factory=DiagramDocument)

    locked_diagram_type: Optional[DiagramType] = None
    scope_summary: str = ""
    scope_keywords: list[str] = Field(default_factory=list)
    semantic_index: dict[str, str] = Field(default_factory=dict)
    last_processed_offset: int = 0
    switch_streak: int = 0
    last_request_id: int = 0
    last_applied_version: int = 0
