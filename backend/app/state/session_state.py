from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.diagram import DiagramDocument, DiagramType


class SessionMode(str, Enum):
    STANDBY = "standby"
    VISUALIZING = "visualizing"


class SessionTelemetry(BaseModel):
    dropped_partials: int = 0
    committed_finals: int = 0
    model_calls: int = 0
    model_successes: int = 0
    fallback_generations: int = 0
    diagram_replaces: int = 0
    diagram_patches: int = 0
    correction_replaces: int = 0
    trigger_counts: dict[str, int] = Field(default_factory=dict)


class SessionState(BaseModel):
    session_id: str
    meeting_title: str = "Untitled Meeting"
    mode: SessionMode = SessionMode.STANDBY
    diagram_type: DiagramType = DiagramType.NONE
    committed_transcript: str = ""
    preview_transcript: str = ""
    committed_utterances: list[str] = Field(default_factory=list)
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
    telemetry: SessionTelemetry = Field(default_factory=SessionTelemetry)
