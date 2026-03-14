from typing import Optional

from app.state.session_state import SessionState


class MemoryStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def set(self, session_id: str, state: SessionState) -> None:
        self._sessions[session_id] = state

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
