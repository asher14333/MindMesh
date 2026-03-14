from enum import Enum

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
    partial_transcript: str = ""
    last_triggered_offset: int = 0
    last_generated_offset: int = 0
    last_chunk_at: float = 0.0
    last_generation_at: float = 0.0
    cooldown_until: float = 0.0
    connections: int = 0
    diagram: DiagramDocument = Field(default_factory=DiagramDocument)
