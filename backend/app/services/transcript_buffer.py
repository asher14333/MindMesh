import time

from app.state.session_state import SessionState


class TranscriptBuffer:
    def append_partial(self, state: SessionState, text: str) -> str:
        normalized = self._normalize(text)
        if not normalized:
            state.partial_transcript = ""
            return ""

        state.partial_transcript = normalized
        state.last_chunk_at = time.monotonic()
        return normalized

    def append_final(self, state: SessionState, text: str) -> str:
        normalized = self._normalize(text)
        state.partial_transcript = ""
        if not normalized:
            return ""

        separator = "" if not state.raw_transcript else " "
        state.raw_transcript = f"{state.raw_transcript}{separator}{normalized}"
        state.last_chunk_at = time.monotonic()
        return normalized

    def unread_for_trigger(self, state: SessionState) -> str:
        return state.raw_transcript[state.last_triggered_offset :].strip()

    def unread_for_diagram(self, state: SessionState) -> str:
        return state.raw_transcript[state.last_generated_offset :].strip()

    def mark_triggered(self, state: SessionState) -> None:
        state.last_triggered_offset = len(state.raw_transcript)

    def mark_generated(self, state: SessionState) -> None:
        state.last_generated_offset = len(state.raw_transcript)
        state.last_generation_at = time.monotonic()

    def reset(self, state: SessionState) -> None:
        state.raw_transcript = ""
        state.partial_transcript = ""
        state.last_triggered_offset = 0
        state.last_generated_offset = 0
        state.last_chunk_at = 0.0
        state.last_generation_at = 0.0
        state.cooldown_until = 0.0

    def _normalize(self, text: str) -> str:
        return " ".join(text.split())
