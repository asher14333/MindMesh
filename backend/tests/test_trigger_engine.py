import time
import unittest

from app.config import Settings
from app.schemas.events import SpeechFinalEvent, SpeechPartialEvent, UICommandEvent
from app.services.trigger_engine import TriggerEngine
from app.state.session_state import SessionMode, SessionState


class TriggerEngineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings(
            pause_threshold_seconds=1.0,
            min_new_chars=12,
            generation_cooldown_seconds=2.0,
        )
        self.engine = TriggerEngine(settings=self.settings)
        self.state = SessionState(
            session_id="trigger-test",
            mode=SessionMode.VISUALIZING,
        )

    def test_standby_blocks_automatic_generation(self) -> None:
        self.state.mode = SessionMode.STANDBY

        decision = self.engine.should_generate_after_event(
            self.state,
            SpeechFinalEvent(type="speech.final", text="Hello world."),
            "Hello world.",
        )

        self.assertFalse(decision.should_generate)

    def test_manual_generate_bypasses_cooldown(self) -> None:
        self.state.cooldown_until = time.monotonic() + 30

        decision = self.engine.should_generate_after_event(
            self.state,
            UICommandEvent(type="ui.command", command="visualize.generate", payload={}),
            "Unread final transcript.",
        )

        self.assertTrue(decision.should_generate)
        self.assertEqual(decision.reason, "visualize.generate")
        self.assertTrue(decision.bypass_cooldown)

    def test_automatic_generation_respects_cooldown(self) -> None:
        self.state.cooldown_until = time.monotonic() + 30

        decision = self.engine.should_generate_after_event(
            self.state,
            SpeechFinalEvent(type="speech.final", text="Hello world."),
            "Hello world.",
        )

        self.assertFalse(decision.should_generate)

    def test_pause_flush_runs_before_new_speech_event(self) -> None:
        self.state.last_chunk_at = time.monotonic() - 5

        decision = self.engine.should_generate_before_event(
            self.state,
            SpeechPartialEvent(type="speech.partial", text="fresh partial"),
            "Committed unread transcript",
        )

        self.assertTrue(decision.should_generate)
        self.assertEqual(decision.reason, "pause_timeout")

    def test_speech_partial_never_auto_generates(self) -> None:
        decision = self.engine.should_generate_after_event(
            self.state,
            SpeechPartialEvent(type="speech.partial", text="very long partial transcript"),
            "very long partial transcript",
        )

        self.assertFalse(decision.should_generate)

    def test_visualize_toggle_flushes_backlog_only_on_enable_transition(self) -> None:
        decision = self.engine.should_generate_after_event(
            self.state,
            UICommandEvent(
                type="ui.command",
                command="visualize.toggle",
                payload={"enabled": True},
            ),
            "Unread transcript.",
            previous_mode=SessionMode.STANDBY,
        )

        self.assertTrue(decision.should_generate)
        self.assertEqual(decision.reason, "visualize_toggle")
