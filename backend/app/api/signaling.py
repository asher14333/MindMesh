"""
WebRTC signaling server.

Each room is a dict of  peer_id → WebSocket.

Message protocol (client → server):
  { "type": "relay", "to": "<peer_id>", "data": { ...SDP/ICE payload } }

Message protocol (server → client):
  { "type": "peers.list",  "peers": [{ "peer_id": "...", "user_id": "..." }] }
  { "type": "peer.joined", "peer_id": "...", "user_id": "..." }
  { "type": "peer.left",   "peer_id": "..." }
  { "type": "relay",       "from": "<peer_id>", "data": { ...SDP/ICE payload } }
"""

import logging
import uuid
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

# room_id → { peer_id: (websocket, user_id) }
_rooms: dict[str, dict[str, tuple[WebSocket, str]]] = defaultdict(dict)


@router.websocket("/ws/room/{room_id}")
async def signaling_endpoint(
    websocket: WebSocket,
    room_id: str,
    user_id: Optional[str] = Query(default=None),
) -> None:
    await websocket.accept()

    peer_id = str(uuid.uuid4())
    display_id = user_id or peer_id[:8]
    room = _rooms[room_id]

    # Send the joining peer the list of people already in the room
    existing = [
        {"peer_id": pid, "user_id": uid}
        for pid, (_, uid) in room.items()
    ]
    await websocket.send_json({"type": "peers.list", "peers": existing, "your_peer_id": peer_id})

    # Tell everyone else that a new peer joined
    join_msg = {"type": "peer.joined", "peer_id": peer_id, "user_id": display_id}
    for pid, (ws, _) in list(room.items()):
        try:
            await ws.send_json(join_msg)
        except Exception:
            pass

    room[peer_id] = (websocket, display_id)
    logger.info("room=%s  peer_joined=%s  user=%s  total=%d", room_id, peer_id, display_id, len(room))

    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except Exception:
                break

            msg_type = msg.get("type")

            if msg_type == "relay":
                target_peer = msg.get("to")
                data = msg.get("data", {})
                if target_peer and target_peer in room:
                    target_ws, _ = room[target_peer]
                    try:
                        await target_ws.send_json({"type": "relay", "from": peer_id, "data": data})
                    except Exception:
                        pass
                else:
                    await websocket.send_json(
                        {"type": "error", "message": f"peer {target_peer!r} not found in room"}
                    )

    except WebSocketDisconnect:
        pass
    finally:
        room.pop(peer_id, None)
        if not room:
            _rooms.pop(room_id, None)

        logger.info("room=%s  peer_left=%s  total=%d", room_id, peer_id, len(room))
        leave_msg = {"type": "peer.left", "peer_id": peer_id}
        for pid, (ws, _) in list(room.items()):
            try:
                await ws.send_json(leave_msg)
            except Exception:
                pass
