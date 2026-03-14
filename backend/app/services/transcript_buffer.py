import time

from app.state.session_state import SessionState


class TranscriptBuffer:
    def append(self, state: SessionState, text: str) -> str:
        normalized = " ".join(text.split())
        if not normalized:
            return ""

        separator = "" if not state.raw_transcript else " "
        state.raw_transcript = f"{state.raw_transcript}{separator}{normalized}"
        state.last_chunk_at = time.monotonic()
        return normalized

    def unread_text(self, state: SessionState) -> str:
        return state.raw_transcript[state.last_generated_offset :].strip()

    def mark_generated(self, state: SessionState) -> None:
        state.last_generated_offset = len(state.raw_transcript)
        state.last_generation_at = time.monotonic()
