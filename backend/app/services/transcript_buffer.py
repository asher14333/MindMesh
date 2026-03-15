import time
from typing import Optional

from app.state.session_state import SessionState


class TranscriptBuffer:
    def preview_partial(self, state: SessionState, text: str) -> str:
        normalized = " ".join(text.split())
        if not normalized:
            return ""

        state.preview_transcript = normalized
        state.last_chunk_at = time.monotonic()
        state.telemetry.dropped_partials += 1
        return normalized

    def commit_final(self, state: SessionState, text: str) -> str:
        normalized = " ".join(text.split())
        if not normalized:
            return ""

        separator = "" if not state.committed_transcript else " "
        state.committed_transcript = f"{state.committed_transcript}{separator}{normalized}"
        state.preview_transcript = ""
        state.committed_utterances.append(normalized)
        state.last_chunk_at = time.monotonic()
        state.telemetry.committed_finals += 1
        return normalized

    def unread_text(self, state: SessionState) -> str:
        return state.committed_transcript[state.last_generated_offset :].strip()

    def unread_utterances(self, state: SessionState) -> list[str]:
        return state.committed_utterances[state.last_generated_utterance_index :]

    def pending_delta(self, state: SessionState) -> str:
        return state.committed_transcript[state.last_processed_offset :].strip()

    def mark_generated(
        self,
        state: SessionState,
        *,
        offset: Optional[int] = None,
        utterance_index: Optional[int] = None,
    ) -> None:
        state.last_generated_offset = (
            len(state.committed_transcript) if offset is None else offset
        )
        state.last_generated_utterance_index = (
            len(state.committed_utterances)
            if utterance_index is None
            else utterance_index
        )
        state.last_generation_at = time.monotonic()
