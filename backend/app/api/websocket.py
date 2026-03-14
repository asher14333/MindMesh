import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.session_manager import SessionManager
from app.schemas.events import ErrorEvent, StatusEvent, UICommandEvent, parse_inbound_event
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
    session_manager.register_ws(session_id, websocket)
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
<<<<<<< Updated upstream
            except (ValueError, KeyError) as exc:
                await websocket.send_json(
                    ErrorEvent(message=f"unknown or malformed event: {exc}").model_dump(mode="json")
=======
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
<<<<<<< Updated upstream
                    payload = outbound_event.model_dump(mode="json")
                    # Send back to the sender
                    await websocket.send_json(payload)
                    # Broadcast transcript.update to everyone else in the session
                    # so all clients see each other's speech labeled by speaker
                    if payload.get("type") == "transcript.update":
                        await session_manager.broadcast(session_id, payload, exclude=websocket)
=======
                    await websocket.send_json(outbound_event.model_dump(mode="json"))
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        session_manager.unregister_ws(session_id, websocket)
=======
>>>>>>> Stashed changes
        await session_manager.disconnect(session_id=session_id)
