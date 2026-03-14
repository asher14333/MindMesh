import time

from pydantic import BaseModel

from app.config import Settings
from app.schemas.events import SpeechFinalEvent, UICommandEvent
from app.state.session_state import SessionMode, SessionState


class TriggerDecision(BaseModel):
    should_generate: bool
    reason: str | None = None


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

        if unprocessed_text.endswith((".", "!", "?")):
            return TriggerDecision(should_generate=True, reason="sentence_boundary")

        if len(unprocessed_text) >= self.settings.min_new_chars:
            return TriggerDecision(should_generate=True, reason="enough_new_text")

        return TriggerDecision(should_generate=False)

    def arm_cooldown(self, state: SessionState) -> None:
        state.cooldown_until = time.monotonic() + self.settings.generation_cooldown_seconds
