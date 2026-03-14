import asyncio
import logging
from typing import Any, Optional

from app.state.memory_store import MemoryStore
from app.state.session_state import SessionState

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self, store: Optional[MemoryStore] = None) -> None:
        self.store = store or MemoryStore()
        self._locks: dict[str, asyncio.Lock] = {}
        # session_id → set of active WebSocket connections
        self._connections: dict[str, set[Any]] = {}

    async def get_or_create(
        self, session_id: str, meeting_title: Optional[str] = None
    ) -> SessionState:
        state = self.store.get(session_id)
        if state is None:
            state = SessionState(session_id=session_id)
            self.store.set(session_id, state)
        if meeting_title:
            state.meeting_title = meeting_title
        return state

    async def connect(
        self, session_id: str, meeting_title: Optional[str] = None
    ) -> SessionState:
        state = await self.get_or_create(session_id=session_id, meeting_title=meeting_title)
        state.connections += 1
        return state

    def register_ws(self, session_id: str, ws: Any) -> None:
        """Register a WebSocket connection so it receives broadcast events."""
        self._connections.setdefault(session_id, set()).add(ws)

    def unregister_ws(self, session_id: str, ws: Any) -> None:
        """Remove a WebSocket connection from the broadcast registry."""
        self._connections.get(session_id, set()).discard(ws)

    async def broadcast(self, session_id: str, payload: dict, exclude: Any = None) -> None:
        """Send payload to every registered WebSocket for this session except `exclude`."""
        for ws in list(self._connections.get(session_id, set())):
            if ws is exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass  # connection already closed — will be cleaned up on disconnect

    async def disconnect(self, session_id: str) -> None:
        state = self.store.get(session_id)
        if state is None:
            return

        state.connections = max(0, state.connections - 1)
        if state.connections == 0:
            self.store.delete(session_id)
            self._locks.pop(session_id, None)

    def session_lock(self, session_id: str) -> asyncio.Lock:
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]
