"""
Manual WebSocket smoke test for MindMesh.

Usage:
    python tests/ws_smoke.py

Requires the server to be running:
    uvicorn app.main:app --reload

Tests the full demo scenario:
  1. Connect → receive initial status
  2. Send session.start
  3. Send transcript while in standby (should NOT trigger generation)
  4. Send visualize.toggle → enable visualizing mode
  5. Send transcript → should trigger intent + diagram.replace
  6. Send more transcript → should trigger diagram.patch
  7. Send diagram.reset command
  8. Send session.stop
"""

import asyncio
import json

import websockets

WS_URL = "ws://localhost:8000/ws/demo-session"

TRANSCRIPT_LINES = [
    "First sales hands off the deal to solutions engineering.",
    "Then security reviews the integration requirements.",
    "After security sign-off, legal approves the MSA.",
    "Finally provisioning starts and customer success is notified.",
]


def pretty(label: str, data: dict) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {label}")
    print(f"{'─' * 60}")
    print(json.dumps(data, indent=2))


async def receive_all_pending(ws, timeout: float = 0.4) -> list[dict]:
    """Drain all pending messages within a short timeout window."""
    messages = []
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            messages.append(json.loads(raw))
        except asyncio.TimeoutError:
            break
    return messages


async def main() -> None:
    print(f"Connecting to {WS_URL} ...")
    async with websockets.connect(WS_URL) as ws:

        # --- 1. Initial status on connect ---
        raw = await ws.recv()
        event = json.loads(raw)
        pretty("RECV: initial status", event)
        assert event["type"] == "status", f"Expected status, got {event['type']}"
        assert event["mode"] == "standby"

        # --- 2. session.start ---
        await ws.send(json.dumps({
            "type": "session.start",
            "meeting_title": "Enterprise Customer Onboarding Approval Flow",
        }))
        for msg in await receive_all_pending(ws):
            pretty("RECV: after session.start", msg)

        # --- 3. Transcript in standby (should echo but NOT generate) ---
        print("\n[standby mode] Sending transcript — expect transcript.update only, no diagram events")
        await ws.send(json.dumps({"type": "speech.final", "text": TRANSCRIPT_LINES[0]}))
        for msg in await receive_all_pending(ws):
            pretty("RECV: standby transcript", msg)
            assert msg["type"] != "diagram.replace", "Should NOT generate in standby"

        # --- 4. Enable visualizing mode ---
        await ws.send(json.dumps({
            "type": "ui.command",
            "command": "visualize.toggle",
            "payload": {"enabled": True},
        }))
        for msg in await receive_all_pending(ws):
            pretty("RECV: after visualize.toggle", msg)

        # --- 5. First transcript in visualizing mode → diagram.replace ---
        print("\n[visualizing mode] Sending transcript — expect intent.result + diagram.replace")
        await ws.send(json.dumps({"type": "speech.final", "text": TRANSCRIPT_LINES[1]}))
        messages = await receive_all_pending(ws, timeout=2.0)
        types_seen = [m["type"] for m in messages]
        for msg in messages:
            pretty(f"RECV: {msg['type']}", msg)
        assert "intent.result" in types_seen, f"Expected intent.result, got {types_seen}"
        has_diagram = "diagram.replace" in types_seen or "diagram.patch" in types_seen
        assert has_diagram, f"Expected diagram event, got {types_seen}"

        # --- 6. Second transcript → diagram.patch ---
        print("\n[visualizing mode] Sending more transcript — expect diagram.patch")
        await ws.send(json.dumps({"type": "speech.final", "text": TRANSCRIPT_LINES[2]}))
        messages = await receive_all_pending(ws, timeout=2.0)
        for msg in messages:
            pretty(f"RECV: {msg['type']}", msg)

        # --- 7. Manual generate command ---
        await ws.send(json.dumps({
            "type": "ui.command",
            "command": "visualize.generate",
            "payload": {},
        }))
        for msg in await receive_all_pending(ws, timeout=2.0):
            pretty(f"RECV: manual generate → {msg['type']}", msg)

        # --- 8. diagram.reset ---
        await ws.send(json.dumps({
            "type": "ui.command",
            "command": "diagram.reset",
            "payload": {},
        }))
        for msg in await receive_all_pending(ws):
            pretty(f"RECV: after diagram.reset → {msg['type']}", msg)

        # --- 9. Unknown event type → expect error event back ---
        print("\n[error handling] Sending unknown event type")
        await ws.send(json.dumps({"type": "does.not.exist", "foo": "bar"}))
        for msg in await receive_all_pending(ws):
            pretty(f"RECV: unknown event → {msg['type']}", msg)
            assert msg["type"] == "error", f"Expected error event, got {msg['type']}"

        # --- 10. session.stop ---
        await ws.send(json.dumps({"type": "session.stop"}))
        for msg in await receive_all_pending(ws):
            pretty(f"RECV: after session.stop → {msg['type']}", msg)

    print("\n✓ Smoke test passed\n")


if __name__ == "__main__":
    asyncio.run(main())
