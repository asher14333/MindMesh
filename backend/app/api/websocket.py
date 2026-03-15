import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.session_manager import SessionManager
from app.schemas.events import (
    DiagramReplaceEvent,
    ErrorEvent,
    StatusEvent,
    UICommandEvent,
    parse_inbound_event,
)
from app.services.pipeline import GenerationRequest, PreparedEvent, SessionPipeline

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_BROADCAST_TYPES = {
    "status",
    "transcript.update",
    "intent.result",
    "diagram.replace",
    "diagram.patch",
}


def _summarize_inbound_event(event: object) -> str:
    event_type = getattr(event, "type", event.__class__.__name__)
    if event_type in {"speech.final", "speech.partial"}:
        text = getattr(event, "text", "")
        speaker = getattr(event, "speaker", None) or "-"
        return f"{event_type} speaker={speaker} len={len(text)} text={text!r}"
    if event_type == "ui.command":
        command = getattr(event, "command", "unknown")
        payload = getattr(event, "payload", {})
        return f"ui.command command={command} payload={payload}"
    if event_type == "session.start":
        meeting_title = getattr(event, "meeting_title", None) or "-"
        return f"session.start meeting_title={meeting_title!r}"
    return str(event_type)


def _summarize_outbound_payload(payload: dict) -> str:
    payload_type = payload.get("type", "unknown")
    if payload_type == "status":
        return (
            f"status mode={payload.get('mode')} message={payload.get('message')} "
            f"diagram_type={payload.get('diagram_type')}"
        )
    if payload_type == "transcript.update":
        text = payload.get("text", "")
        return (
            f"transcript.update final={payload.get('is_final')} "
            f"speaker={payload.get('speaker') or '-'} len={len(text)} text={text!r}"
        )
    if payload_type == "intent.result":
        result = payload.get("result", {})
        return (
            f"intent.result diagram_type={result.get('diagram_type')} "
            f"action={result.get('action')} confidence={result.get('confidence')} "
            f"scope={result.get('scope_relation')} source={result.get('source')} "
            f"trigger={result.get('trigger_reason')} latency_ms={result.get('latency_ms')}"
        )
    if payload_type == "diagram.replace":
        diagram = payload.get("diagram", {})
        return (
            f"diagram.replace version={diagram.get('version')} "
            f"nodes={len(diagram.get('nodes', []))} edges={len(diagram.get('edges', []))}"
        )
    if payload_type == "diagram.patch":
        patch = payload.get("patch", {})
        return (
            f"diagram.patch base={patch.get('base_version')} version={patch.get('version')} "
            f"ops={len(patch.get('ops', []))} reason={patch.get('reason')}"
        )
    if payload_type == "error":
        return f"error message={payload.get('message')!r}"
    return payload_type


async def _send_outbound_events(
    session_id: str,
    websocket: WebSocket,
    session_manager: "SessionManager",
    outbound_events: list,
) -> None:
    for event in outbound_events:
        payload = event.model_dump(mode="json")
        logger.info("[%s] ws.send %s", session_id, _summarize_outbound_payload(payload))
        await session_manager.send_json(websocket, payload)
        if payload.get("type") in SESSION_BROADCAST_TYPES:
            await session_manager.broadcast(session_id, payload, exclude=websocket)


def _track_task(tasks: set[asyncio.Task], task: asyncio.Task) -> None:
    tasks.add(task)
    task.add_done_callback(tasks.discard)


async def _execute_generation_request(
    session_id: str,
    websocket: WebSocket,
    session_manager: "SessionManager",
    pipeline: "SessionPipeline",
    request: GenerationRequest,
) -> None:
    try:
        execution = await pipeline.run_generation(request)
        async with session_manager.session_lock(session_id):
            state = await session_manager.get_or_create(session_id=session_id)
            outbound_events = pipeline.apply_generation_result(state, execution)
        if not outbound_events:
            logger.info(
                "[%s] ws.noop generation request_id=%d",
                session_id,
                request.request_id,
            )
            return
        await _send_outbound_events(
            session_id=session_id,
            websocket=websocket,
            session_manager=session_manager,
            outbound_events=outbound_events,
        )
    except asyncio.CancelledError:
        return
    except Exception:
        logger.exception(
            "Pipeline generation error for session %s request %d",
            session_id,
            request.request_id,
        )
        try:
            await session_manager.send_json(
                websocket,
                ErrorEvent(message="Internal error").model_dump(mode="json"),
            )
        except Exception:
            pass


async def _dispatch_prepared_event(
    session_id: str,
    websocket: WebSocket,
    session_manager: "SessionManager",
    pipeline: "SessionPipeline",
    prepared: PreparedEvent,
    generation_tasks: set[asyncio.Task],
) -> None:
    if prepared.outbound_events:
        await _send_outbound_events(
            session_id=session_id,
            websocket=websocket,
            session_manager=session_manager,
            outbound_events=prepared.outbound_events,
        )

    if prepared.generation_request:
        task = asyncio.create_task(
            _execute_generation_request(
                session_id,
                websocket,
                session_manager,
                pipeline,
                prepared.generation_request,
            )
        )
        _track_task(generation_tasks, task)


async def _pause_watcher(
    session_id: str,
    websocket: WebSocket,
    session_manager: "SessionManager",
    pipeline: "SessionPipeline",
    generation_tasks: set[asyncio.Task],
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
                unread = pipeline.transcript_buffer.pending_delta(state)
                if not pipeline.trigger_engine.check_pause(state, unread):
                    continue
                prepared = pipeline.prepare_event(state=state, event=synthetic)
            await _dispatch_prepared_event(
                session_id=session_id,
                websocket=websocket,
                session_manager=session_manager,
                pipeline=pipeline,
                prepared=prepared,
                generation_tasks=generation_tasks,
            )
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
    generation_tasks: set[asyncio.Task] = set()

    state = await session_manager.connect(session_id=session_id)
    session_manager.register_ws(session_id, websocket)
    logger.info(
        "[%s] ws.connected mode=%s diagram_type=%s version=%d connections=%d",
        session_id,
        state.mode,
        state.diagram_type,
        state.diagram.version,
        state.connections,
    )
    await session_manager.send_json(
        websocket,
        StatusEvent(
            session_id=state.session_id,
            mode=state.mode,
            message="connected",
            diagram_type=state.diagram_type,
        ).model_dump(mode="json"),
    )
    if state.diagram.nodes:
        logger.info(
            "Session %s hydrating client with diagram version=%d nodes=%d",
            session_id,
            state.diagram.version,
            len(state.diagram.nodes),
        )
        await session_manager.send_json(
            websocket,
            DiagramReplaceEvent(diagram=state.diagram).model_dump(mode="json"),
        )

    # Start the background pause-detection watcher concurrently
    pause_task = asyncio.create_task(
        _pause_watcher(
            session_id,
            websocket,
            session_manager,
            pipeline,
            generation_tasks,
        )
    )

    try:
        while True:
            # --- receive ---
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                logger.info("[%s] ws.client_disconnected", session_id)
                break
            except Exception:
                logger.exception("[%s] ws.receive_json failed", session_id)
                break

            # --- parse ---
            try:
                event = parse_inbound_event(payload)
            except (ValueError, KeyError) as exc:
                logger.warning(
                    "[%s] ws.parse_error error=%s payload=%r",
                    session_id,
                    exc,
                    payload,
                )
                await session_manager.send_json(
                    websocket,
                    ErrorEvent(message=f"unknown or malformed event: {exc}").model_dump(mode="json"),
                )
                continue
            logger.info("[%s] ws.recv %s", session_id, _summarize_inbound_event(event))

            # --- pipeline ---
            try:
                async with session_manager.session_lock(session_id):
                    state = await session_manager.get_or_create(session_id=session_id)
                    prepared = pipeline.prepare_event(state=state, event=event)
                if not prepared.outbound_events and not prepared.generation_request:
                    logger.info("[%s] ws.noop no outbound events", session_id)
                await _dispatch_prepared_event(
                    session_id=session_id,
                    websocket=websocket,
                    session_manager=session_manager,
                    pipeline=pipeline,
                    prepared=prepared,
                    generation_tasks=generation_tasks,
                )
            except Exception:
                logger.exception("Pipeline error for session %s", session_id)
                try:
                    await session_manager.send_json(
                        websocket,
                        ErrorEvent(message="Internal error").model_dump(mode="json"),
                    )
                except Exception:
                    pass
    finally:
        pause_task.cancel()
        pending_generation_tasks = tuple(generation_tasks)
        for task in pending_generation_tasks:
            task.cancel()
        await asyncio.gather(pause_task, return_exceptions=True)
        await asyncio.gather(*pending_generation_tasks, return_exceptions=True)
        session_manager.unregister_ws(session_id, websocket)
        await session_manager.disconnect(session_id=session_id)
        logger.info("[%s] ws.closed", session_id)
