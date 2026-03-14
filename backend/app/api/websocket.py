import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.session_manager import SessionManager
from app.schemas.events import ErrorEvent, StatusEvent, parse_inbound_event
from app.services.pipeline import SessionPipeline

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()

    session_manager: SessionManager = websocket.app.state.session_manager
    pipeline: SessionPipeline = websocket.app.state.pipeline

    state = await session_manager.connect(session_id=session_id)
    await websocket.send_json(
        StatusEvent(
            session_id=state.session_id,
            mode=state.mode,
            message="connected",
        ).model_dump(mode="json")
    )

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except Exception:
                await websocket.send_json(
                    ErrorEvent(message="invalid JSON — expected a JSON object").model_dump(mode="json")
                )
                continue

            try:
                event = parse_inbound_event(payload)
            except (ValueError, KeyError) as exc:
                await websocket.send_json(
                    ErrorEvent(message=f"unknown or malformed event: {exc}").model_dump(mode="json")
                )
                continue

            try:
                async with session_manager.session_lock(session_id):
                    state = await session_manager.get_or_create(session_id=session_id)
                    outbound_events = await pipeline.handle_event(state=state, event=event)
            except Exception as exc:
                logger.exception("pipeline error for session %s", session_id)
                await websocket.send_json(
                    ErrorEvent(message=f"pipeline error: {exc}").model_dump(mode="json")
                )
                continue

            for outbound_event in outbound_events:
                await websocket.send_json(outbound_event.model_dump(mode="json"))
    except WebSocketDisconnect:
        await session_manager.disconnect(session_id=session_id)
