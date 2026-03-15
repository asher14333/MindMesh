from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field

from app.schemas.diagram import DiagramDocument, DiagramPatch, DiagramType
from app.schemas.intent import IntentResult
from app.state.session_state import SessionMode


class SessionStartEvent(BaseModel):
    type: Literal["session.start"]
    meeting_title: Optional[str] = None


class SessionStopEvent(BaseModel):
    type: Literal["session.stop"]


class SpeechPartialEvent(BaseModel):
    type: Literal["speech.partial"]
    text: str
    speaker: Optional[str] = None


class SpeechFinalEvent(BaseModel):
    type: Literal["speech.final"]
    text: str
    speaker: Optional[str] = None


class UICommandEvent(BaseModel):
    type: Literal["ui.command"]
    command: str
    payload: dict[str, Any] = Field(default_factory=dict)


class CanvasEditEvent(BaseModel):
    type: Literal["canvas.edit"]
    ops: list[dict[str, Any]] = Field(default_factory=list)


class CollabCursorEvent(BaseModel):
    type: Literal["collab.cursor"]
    user_id: str
    user_name: str = ""
    position: dict[str, float] = Field(default_factory=dict)
    color: str = "#6366f1"


class CollabSelectionEvent(BaseModel):
    type: Literal["collab.selection"]
    user_id: str
    user_name: str = ""
    node_id: Optional[str] = None
    color: str = "#6366f1"


class TranscriptionToggleEvent(BaseModel):
    type: Literal["transcription.toggle"]
    enabled: bool
    user_id: str
    user_name: str = ""


InboundEvent = Union[
    SessionStartEvent,
    SessionStopEvent,
    SpeechPartialEvent,
    SpeechFinalEvent,
    UICommandEvent,
    CanvasEditEvent,
    CollabCursorEvent,
    CollabSelectionEvent,
    TranscriptionToggleEvent,
]


class TranscriptUpdateEvent(BaseModel):
    type: Literal["transcript.update"] = "transcript.update"
    text: str
    is_final: bool = False
    speaker: Optional[str] = None


class IntentResultEvent(BaseModel):
    type: Literal["intent.result"] = "intent.result"
    result: IntentResult


class DiagramPatchEvent(BaseModel):
    type: Literal["diagram.patch"] = "diagram.patch"
    patch: DiagramPatch


class DiagramReplaceEvent(BaseModel):
    type: Literal["diagram.replace"] = "diagram.replace"
    diagram: DiagramDocument


class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    session_id: str
    mode: SessionMode
    message: str
    diagram_type: Optional[DiagramType] = None


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


OutboundEvent = Union[
    TranscriptUpdateEvent,
    IntentResultEvent,
    DiagramPatchEvent,
    DiagramReplaceEvent,
    StatusEvent,
    ErrorEvent,
]


def parse_inbound_event(payload: dict[str, Any]) -> InboundEvent:
    event_type = payload.get("type")
    model_map = {
        "session.start": SessionStartEvent,
        "session.stop": SessionStopEvent,
        "speech.partial": SpeechPartialEvent,
        "speech.final": SpeechFinalEvent,
        "ui.command": UICommandEvent,
        "canvas.edit": CanvasEditEvent,
        "collab.cursor": CollabCursorEvent,
        "collab.selection": CollabSelectionEvent,
        "transcription.toggle": TranscriptionToggleEvent,
    }

    model = model_map.get(event_type)
    if model is None:
        raise ValueError(f"Unsupported event type: {event_type!r}")
    return model.model_validate(payload)
