<<<<<<< Updated upstream
=======
import asyncio
>>>>>>> Stashed changes
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.session_manager import SessionManager
<<<<<<< Updated upstream
from app.schemas.events import ErrorEvent, StatusEvent, parse_inbound_event
=======
from app.schemas.events import ErrorEvent, StatusEvent, UICommandEvent, parse_inbound_event
>>>>>>> Stashed changes
from app.services.pipeline import SessionPipeline

logger = logging.getLogger(__name__)

router = APIRouter()


async def _pause_watcher(
    session_id: str,
    websocket: WebSocket,
    session_manager: "SessionManager",
    pipeline: "SessionPipeline",
) -> None:
    """
    Background task: polls every 250 ms and synthesizes a `pause.detected`
    UICommandEvent when real audio silence is detected.

    Effective detection latency = pause_threshold_seconds + up to 250 ms.
    The task exits cleanly on CancelledError (normal shutdown) or any
    send-side error (client already gone).
    """
    synthetic = UICommandEvent(type="ui.command", command="pause.detected", payload={})
    while True:
        await asyncio.sleep(0.25)
        try:
            async with session_manager.session_lock(session_id):
                state = await session_manager.get_or_create(session_id=session_id)
                unread = pipeline.transcript_buffer.unread_text(state)
                if not pipeline.trigger_engine.check_pause(state, unread):
                    continue
                outbound_events = await pipeline.handle_event(state=state, event=synthetic)
            for ev in outbound_events:
                await websocket.send_json(ev.model_dump(mode="json"))
        except asyncio.CancelledError:
            return
        except Exception:
            # WebSocket already closed or session gone — stop quietly
            return


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

    # Start the background pause-detection watcher concurrently
    pause_task = asyncio.create_task(
        _pause_watcher(session_id, websocket, session_manager, pipeline)
    )

    try:
        while True:
<<<<<<< Updated upstream
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
=======
            # --- receive ---
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                break

            # --- parse ---
            try:
                event = parse_inbound_event(payload)
            except Exception as exc:
                await websocket.send_json(
                    ErrorEvent(message=f"Invalid event: {exc}").model_dump(mode="json")
>>>>>>> Stashed changes
                )
                continue

            # --- pipeline ---
            try:
                async with session_manager.session_lock(session_id):
                    state = await session_manager.get_or_create(session_id=session_id)
                    outbound_events = await pipeline.handle_event(state=state, event=event)
                for outbound_event in outbound_events:
                    await websocket.send_json(outbound_event.model_dump(mode="json"))
            except Exception as exc:
                logger.exception("Pipeline error for session %s", session_id)
                try:
                    await websocket.send_json(
                        ErrorEvent(message="Internal error").model_dump(mode="json")
                    )
                except Exception:
                    pass
    finally:
        pause_task.cancel()
        await asyncio.gather(pause_task, return_exceptions=True)
        await session_manager.disconnect(session_id=session_id)
