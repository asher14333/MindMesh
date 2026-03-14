import unittest

from app.services.transcript_buffer import TranscriptBuffer
from app.state.session_state import SessionState


class TranscriptBufferTest(unittest.TestCase):
    def setUp(self) -> None:
        self.buffer = TranscriptBuffer()
        self.state = SessionState(session_id="buffer-test")

    def test_partial_replaces_partial_without_touching_raw_transcript(self) -> None:
        self.buffer.append_partial(self.state, "draft transcript")
        self.buffer.append_partial(self.state, "updated transcript")

        self.assertEqual(self.state.raw_transcript, "")
        self.assertEqual(self.state.partial_transcript, "updated transcript")

    def test_final_commits_once_and_clears_partial(self) -> None:
        self.buffer.append_partial(self.state, "same words")
        committed = self.buffer.append_final(self.state, "same words")

        self.assertEqual(committed, "same words")
        self.assertEqual(self.state.raw_transcript, "same words")
        self.assertEqual(self.state.partial_transcript, "")

    def test_unread_trigger_and_diagram_offsets_can_diverge(self) -> None:
        self.buffer.append_final(self.state, "First step")
        self.buffer.mark_triggered(self.state)
        self.buffer.append_final(self.state, "Second step")

        self.assertEqual(self.buffer.unread_for_trigger(self.state), "Second step")
        self.assertEqual(
            self.buffer.unread_for_diagram(self.state),
            "First step Second step",
        )

    def test_reset_clears_transcript_offsets_and_timers(self) -> None:
        self.buffer.append_final(self.state, "Committed text")
        self.buffer.append_partial(self.state, "Partial text")
        self.buffer.mark_triggered(self.state)
        self.buffer.mark_generated(self.state)
        self.state.cooldown_until = 123.0

        self.buffer.reset(self.state)

        self.assertEqual(self.state.raw_transcript, "")
        self.assertEqual(self.state.partial_transcript, "")
        self.assertEqual(self.state.last_triggered_offset, 0)
        self.assertEqual(self.state.last_generated_offset, 0)
        self.assertEqual(self.state.last_chunk_at, 0.0)
        self.assertEqual(self.state.last_generation_at, 0.0)
        self.assertEqual(self.state.cooldown_until, 0.0)
