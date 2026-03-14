import time
from typing import Optional

from pydantic import BaseModel

from app.config import Settings
from app.schemas.events import SpeechFinalEvent, SpeechPartialEvent, UICommandEvent
from app.state.session_state import SessionMode, SessionState


class TriggerDecision(BaseModel):
    should_generate: bool = False
    reason: Optional[str] = None
    bypass_cooldown: bool = False


class TriggerEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def should_generate_before_event(
        self, state: SessionState, event: object, unprocessed_text: str
    ) -> TriggerDecision:
        now = time.monotonic()
        if not isinstance(event, (SpeechPartialEvent, SpeechFinalEvent)):
            return TriggerDecision()

        if not self._can_auto_generate(state, unprocessed_text, now):
            return TriggerDecision()

        if state.last_chunk_at <= 0:
            return TriggerDecision()

        if now - state.last_chunk_at >= self.settings.pause_threshold_seconds:
            return TriggerDecision(should_generate=True, reason="pause_timeout")

        return TriggerDecision()

    def should_generate_after_event(
        self,
        state: SessionState,
        event: object,
        unprocessed_text: str,
        previous_mode: Optional[SessionMode] = None,
    ) -> TriggerDecision:
        now = time.monotonic()

        if isinstance(event, UICommandEvent):
            if (
                event.command == "visualize.toggle"
                and previous_mode != SessionMode.VISUALIZING
                and state.mode == SessionMode.VISUALIZING
                and self._can_auto_generate(state, unprocessed_text, now)
            ):
                return TriggerDecision(should_generate=True, reason="visualize_toggle")

            if event.command == "visualize.generate" and self._can_manual_generate(
                state, unprocessed_text
            ):
                return TriggerDecision(
                    should_generate=True,
                    reason="visualize.generate",
                    bypass_cooldown=True,
                )

            if event.command == "pause.detected" and self._can_manual_generate(
                state, unprocessed_text
            ):
                return TriggerDecision(
                    should_generate=True,
                    reason="pause.detected",
                    bypass_cooldown=True,
                )

            return TriggerDecision()

        if isinstance(event, SpeechPartialEvent):
            return TriggerDecision()

        if not self._can_auto_generate(state, unprocessed_text, now):
            return TriggerDecision()

        if isinstance(event, SpeechFinalEvent):
            if unprocessed_text.endswith((".", "!", "?")):
                return TriggerDecision(should_generate=True, reason="final_sentence_boundary")

            if len(unprocessed_text) >= self.settings.min_new_chars:
                return TriggerDecision(should_generate=True, reason="final_length_threshold")

        return TriggerDecision()

    def arm_cooldown(self, state: SessionState) -> None:
        state.cooldown_until = time.monotonic() + self.settings.generation_cooldown_seconds

    def _can_auto_generate(
        self, state: SessionState, unprocessed_text: str, now: float
    ) -> bool:
        return (
            state.mode == SessionMode.VISUALIZING
            and bool(unprocessed_text)
            and now >= state.cooldown_until
        )

    def _can_manual_generate(self, state: SessionState, unprocessed_text: str) -> bool:
        return state.mode == SessionMode.VISUALIZING and bool(unprocessed_text)
