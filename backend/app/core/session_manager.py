import asyncio
from typing import Optional

from app.state.memory_store import MemoryStore
from app.state.session_state import SessionState


class SessionManager:
    def __init__(self, store: Optional[MemoryStore] = None) -> None:
        self.store = store or MemoryStore()
        self._locks: dict[str, asyncio.Lock] = {}

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
