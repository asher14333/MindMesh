import time
from typing import Optional

from pydantic import BaseModel

from app.config import Settings
from app.schemas.events import SpeechFinalEvent, UICommandEvent
from app.state.session_state import SessionMode, SessionState


class TriggerDecision(BaseModel):
    should_generate: bool
    reason: Optional[str] = None


class TriggerEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def should_generate(
        self, state: SessionState, event: object, unprocessed_text: str
    ) -> TriggerDecision:
        now = time.monotonic()

        if isinstance(event, UICommandEvent):
            if event.command in {"visualize.generate", "pause.detected"}:
                return TriggerDecision(should_generate=bool(unprocessed_text), reason=event.command)
            if event.command == "visualize.toggle" and state.mode == SessionMode.VISUALIZING:
                return TriggerDecision(should_generate=bool(unprocessed_text), reason=event.command)

        if state.mode != SessionMode.VISUALIZING:
            return TriggerDecision(should_generate=False)

        if not unprocessed_text or now < state.cooldown_until:
            return TriggerDecision(should_generate=False)

        if isinstance(event, SpeechFinalEvent):
            return TriggerDecision(should_generate=True, reason="final_transcript")

        return TriggerDecision(should_generate=False)

    def check_pause(self, state: SessionState, unread_text: str) -> bool:
        """
        Returns True when real audio silence has been detected.

        Conditions that must ALL be true:
          - session is in VISUALIZING mode
          - there is unread transcript to generate from
          - the last audio chunk arrived at least `pause_threshold_seconds` ago
          - we are not inside a generation cooldown window

        This is called by the background pause-watcher task in websocket.py
        every 250 ms so the effective detection latency is
        pause_threshold_seconds + up to 250 ms.
        """
        if state.mode != SessionMode.VISUALIZING:
            return False
        if not unread_text:
            return False
        if not state.last_chunk_at:
            # No audio has arrived yet in this session — nothing to pause on.
            return False
        now = time.monotonic()
        if now < state.cooldown_until:
            return False
        return (now - state.last_chunk_at) >= self.settings.pause_threshold_seconds

    def arm_cooldown(self, state: SessionState) -> None:
        state.cooldown_until = time.monotonic() + self.settings.generation_cooldown_seconds
