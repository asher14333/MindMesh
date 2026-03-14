import time
import unittest

from app.config import Settings
from app.schemas.events import SpeechFinalEvent, SpeechPartialEvent, UICommandEvent
from app.services.pipeline import SessionPipeline
from app.state.session_state import SessionMode, SessionState


class SessionPipelineTest(unittest.IsolatedAsyncioTestCase):
    async def test_standby_backlog_flushes_on_visualize_enable(self) -> None:
        pipeline = SessionPipeline(settings=Settings(min_new_chars=200))
        state = SessionState(session_id="pipeline-toggle")

        standby_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(
                type="speech.final",
                text="First sales hands off the deal to solutions engineering.",
            ),
        )
        self.assertEqual([event.type for event in standby_events], ["transcript.update"])

        enable_events = await pipeline.handle_event(
            state,
            UICommandEvent(
                type="ui.command",
                command="visualize.toggle",
                payload={"enabled": True},
            ),
        )

        self.assertEqual(
            [event.type for event in enable_events],
            ["status", "intent.result", "diagram.replace"],
        )

    async def test_manual_commands_do_not_regenerate_without_new_committed_text(self) -> None:
        pipeline = SessionPipeline(settings=Settings())
        state = SessionState(
            session_id="pipeline-manual",
            mode=SessionMode.VISUALIZING,
        )

        initial_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(
                type="speech.final",
                text="First sales hands off the deal to solutions engineering.",
            ),
        )
        self.assertEqual(
            [event.type for event in initial_events],
            ["transcript.update", "intent.result", "diagram.replace"],
        )

        generate_events = await pipeline.handle_event(
            state,
            UICommandEvent(type="ui.command", command="visualize.generate", payload={}),
        )
        pause_events = await pipeline.handle_event(
            state,
            UICommandEvent(type="ui.command", command="pause.detected", payload={}),
        )

        self.assertEqual(generate_events, [])
        self.assertEqual(pause_events, [])

    async def test_partial_then_final_does_not_duplicate_raw_transcript(self) -> None:
        pipeline = SessionPipeline(settings=Settings(min_new_chars=500))
        state = SessionState(
            session_id="pipeline-partial",
            mode=SessionMode.VISUALIZING,
        )

        partial_events = await pipeline.handle_event(
            state,
            SpeechPartialEvent(type="speech.partial", text="draft transcript"),
        )
        updated_partial_events = await pipeline.handle_event(
            state,
            SpeechPartialEvent(type="speech.partial", text="updated transcript"),
        )
        final_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(type="speech.final", text="updated transcript"),
        )

        self.assertEqual([event.type for event in partial_events], ["transcript.update"])
        self.assertEqual([event.type for event in updated_partial_events], ["transcript.update"])
        self.assertEqual([event.type for event in final_events], ["transcript.update"])
        self.assertEqual(state.raw_transcript, "updated transcript")
        self.assertEqual(state.partial_transcript, "")

    async def test_diagram_reset_returns_session_to_clean_first_generation_state(self) -> None:
        pipeline = SessionPipeline(settings=Settings())
        state = SessionState(
            session_id="pipeline-reset",
            mode=SessionMode.VISUALIZING,
        )

        initial_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(
                type="speech.final",
                text="First sales hands off the deal to solutions engineering.",
            ),
        )
        self.assertEqual(
            [event.type for event in initial_events],
            ["transcript.update", "intent.result", "diagram.replace"],
        )

        reset_events = await pipeline.handle_event(
            state,
            UICommandEvent(type="ui.command", command="diagram.reset", payload={}),
        )

        self.assertEqual([event.type for event in reset_events], ["diagram.replace", "status"])
        self.assertEqual(state.raw_transcript, "")
        self.assertEqual(state.partial_transcript, "")
        self.assertEqual(state.last_triggered_offset, 0)
        self.assertEqual(state.last_generated_offset, 0)
        self.assertEqual(state.last_chunk_at, 0.0)
        self.assertEqual(state.last_generation_at, 0.0)
        self.assertEqual(state.cooldown_until, 0.0)

        post_reset_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(
                type="speech.final",
                text="Then security reviews the integration requirements.",
            ),
        )
        self.assertEqual(
            [event.type for event in post_reset_events],
            ["transcript.update", "intent.result", "diagram.replace"],
        )

    async def test_pause_flush_generates_once_and_leaves_new_final_unread(self) -> None:
        pipeline = SessionPipeline(
            settings=Settings(
                pause_threshold_seconds=0.1,
                min_new_chars=500,
                generation_cooldown_seconds=1.0,
            )
        )
        state = SessionState(
            session_id="pipeline-pause",
            mode=SessionMode.VISUALIZING,
        )

        first_line = "First sales hands off the deal to solutions engineering"
        second_line = "Then security reviews the integration requirements."

        first_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(type="speech.final", text=first_line),
        )
        self.assertEqual([event.type for event in first_events], ["transcript.update"])

        old_transcript = state.raw_transcript
        old_length = len(old_transcript)
        state.last_chunk_at = time.monotonic() - 1.0

        second_events = await pipeline.handle_event(
            state,
            SpeechFinalEvent(type="speech.final", text=second_line),
        )

        event_types = [event.type for event in second_events]
        self.assertEqual(event_types.count("intent.result"), 1)
        self.assertEqual(
            len([event_type for event_type in event_types if event_type.startswith("diagram.")]),
            1,
        )
        self.assertEqual(event_types[-1], "transcript.update")
        self.assertEqual(state.last_triggered_offset, old_length)
        self.assertEqual(state.last_generated_offset, old_length)
        self.assertEqual(pipeline.transcript_buffer.unread_for_trigger(state), second_line)
        self.assertEqual(pipeline.transcript_buffer.unread_for_diagram(state), second_line)
