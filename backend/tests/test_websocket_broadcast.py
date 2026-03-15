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

            assert _receive_types(sender, 3) == [
                "transcript.update",
                "intent.result",
                "diagram.replace",
            ]
            assert _receive_types(listener, 3) == [
                "transcript.update",
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

            assert _receive_types(sender, 3) == [
                "transcript.update",
                "intent.result",
                "diagram.patch",
            ]
            assert _receive_types(listener, 3) == [
                "transcript.update",
                "intent.result",
                "diagram.patch",
            ]
