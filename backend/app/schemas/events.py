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


class SpeechFinalEvent(BaseModel):
    type: Literal["speech.final"]
    text: str


class UICommandEvent(BaseModel):
    type: Literal["ui.command"]
    command: str
    payload: dict[str, Any] = Field(default_factory=dict)


InboundEvent = Union[
    SessionStartEvent,
    SessionStopEvent,
    SpeechPartialEvent,
    SpeechFinalEvent,
    UICommandEvent,
]


class TranscriptUpdateEvent(BaseModel):
    type: Literal["transcript.update"] = "transcript.update"
    text: str
    is_final: bool = False


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


OutboundEvent = Union[
    TranscriptUpdateEvent,
    IntentResultEvent,
    DiagramPatchEvent,
    DiagramReplaceEvent,
    StatusEvent,
]


def parse_inbound_event(payload: dict[str, Any]) -> InboundEvent:
    event_type = payload.get("type")
    model_map = {
        "session.start": SessionStartEvent,
        "session.stop": SessionStopEvent,
        "speech.partial": SpeechPartialEvent,
        "speech.final": SpeechFinalEvent,
        "ui.command": UICommandEvent,
    }

    model = model_map.get(event_type)
    if model is None:
        raise ValueError(f"Unsupported event type: {event_type!r}")
    return model.model_validate(payload)
