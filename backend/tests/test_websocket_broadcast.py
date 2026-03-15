from fastapi.testclient import TestClient

from app.main import app


def _receive_types(ws, count: int) -> list[str]:
    return [ws.receive_json()["type"] for _ in range(count)]


def test_session_broadcasts_diagram_events_to_other_clients() -> None:
    with TestClient(app) as client:
        client.app.state.pipeline.model_orchestrator._client = None
        client.app.state.pipeline.settings.generation_cooldown_seconds = 0.0
        client.app.state.pipeline.trigger_engine.settings.generation_cooldown_seconds = 0.0

        with client.websocket_connect("/ws/demo-room") as sender, client.websocket_connect(
            "/ws/demo-room"
        ) as listener:
            assert sender.receive_json()["type"] == "status"
            assert listener.receive_json()["type"] == "status"

            sender.send_json(
                {
                    "type": "session.start",
                    "meeting_title": "Enterprise Customer Onboarding Approval Flow",
                }
            )
            assert sender.receive_json()["message"] == "session_started"
            assert listener.receive_json()["message"] == "session_started"

            sender.send_json(
                {
                    "type": "ui.command",
                    "command": "visualize.toggle",
                    "payload": {"enabled": True},
                }
            )
            assert sender.receive_json()["message"] == "visualize_enabled"
            assert listener.receive_json()["message"] == "visualize_enabled"

            sender.send_json(
                {
                    "type": "speech.final",
                    "text": "First sales hands off the deal to solutions engineering.",
                    "speaker": "spk-a",
                }
            )

            assert _receive_types(sender, 1) == [
                "transcript.update",
            ]
            assert _receive_types(listener, 1) == [
                "transcript.update",
            ]

            sender.send_json(
                {
                    "type": "ui.command",
                    "command": "visualize.generate",
                    "payload": {},
                }
            )

            assert _receive_types(sender, 2) == [
                "intent.result",
                "diagram.replace",
            ]
            assert _receive_types(listener, 2) == [
                "intent.result",
                "diagram.replace",
            ]

            sender.send_json(
                {
                    "type": "speech.final",
                    "text": "Then security reviews the integration requirements.",
                    "speaker": "spk-a",
                }
            )

            assert _receive_types(sender, 1) == [
                "transcript.update",
            ]
            assert _receive_types(listener, 1) == [
                "transcript.update",
            ]

            sender.send_json(
                {
                    "type": "ui.command",
                    "command": "visualize.generate",
                    "payload": {},
                }
            )

            assert _receive_types(sender, 2) == [
                "intent.result",
                "diagram.patch",
            ]
            assert _receive_types(listener, 2) == [
                "intent.result",
                "diagram.patch",
            ]


def test_late_joiner_receives_current_diagram_before_future_patches() -> None:
    with TestClient(app) as client:
        client.app.state.pipeline.model_orchestrator._client = None
        client.app.state.pipeline.settings.generation_cooldown_seconds = 0.0
        client.app.state.pipeline.trigger_engine.settings.generation_cooldown_seconds = 0.0

        with client.websocket_connect("/ws/demo-room") as sender:
            initial = sender.receive_json()
            assert initial["type"] == "status"
            assert initial["diagram_type"] == "none"

            sender.send_json(
                {
                    "type": "ui.command",
                    "command": "visualize.toggle",
                    "payload": {"enabled": True},
                }
            )
            toggled = sender.receive_json()
            assert toggled["type"] == "status"
            assert toggled["message"] == "visualize_enabled"

            sender.send_json(
                {
                    "type": "speech.final",
                    "text": "First sales hands off the deal to solutions engineering.",
                    "speaker": "spk-a",
                }
            )

            replace_events = [sender.receive_json()]
            assert [event["type"] for event in replace_events] == [
                "transcript.update",
            ]

            sender.send_json(
                {
                    "type": "ui.command",
                    "command": "visualize.generate",
                    "payload": {},
                }
            )

            replace_events = [sender.receive_json() for _ in range(2)]
            assert [event["type"] for event in replace_events] == [
                "intent.result",
                "diagram.replace",
            ]

            with client.websocket_connect("/ws/demo-room") as late_joiner:
                hydrated_status = late_joiner.receive_json()
                hydrated_replace = late_joiner.receive_json()

                assert hydrated_status["type"] == "status"
                assert hydrated_status["diagram_type"] == "flowchart"
                assert hydrated_replace["type"] == "diagram.replace"
                assert hydrated_replace["diagram"]["version"] == 1
                assert len(hydrated_replace["diagram"]["nodes"]) == 1

                sender.send_json(
                    {
                        "type": "speech.final",
                        "text": "Then security reviews the integration requirements.",
                        "speaker": "spk-a",
                    }
                )

                assert _receive_types(sender, 1) == [
                    "transcript.update",
                ]
                assert _receive_types(late_joiner, 1) == [
                    "transcript.update",
                ]

                sender.send_json(
                    {
                        "type": "ui.command",
                        "command": "visualize.generate",
                        "payload": {},
                    }
                )

                assert _receive_types(sender, 2) == [
                    "intent.result",
                    "diagram.patch",
                ]
                assert _receive_types(late_joiner, 2) == [
                    "intent.result",
                    "diagram.patch",
                ]
