#!/usr/bin/env python3
"""
Simulate SessionPipeline behavior and print outbound JSON events.

This script is intended to quickly validate the backend diagram contract
(`diagram.replace` / `diagram.patch`) consumed by React Flow.

Usage examples:
  python scripts/simulate_react_flow_json.py
  python scripts/simulate_react_flow_json.py --diagram-only
  python scripts/simulate_react_flow_json.py --scenario-file scripts/scenario.json
  python scripts/simulate_react_flow_json.py --strict
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import Settings
from app.schemas.events import parse_inbound_event
from app.services.pipeline import SessionPipeline
from app.state.session_state import SessionMode, SessionState

DIAGRAM_EVENT_TYPES = {"diagram.replace", "diagram.patch"}


def _default_scenario() -> list[dict[str, Any]]:
    return [
        {
            "type": "session.start",
            "meeting_title": "Demo pipeline simulation",
        },
        {
            "type": "ui.command",
            "command": "visualize.toggle",
            "payload": {"enabled": True},
        },
        {
            "type": "speech.final",
            "text": "First sales hands off the deal to solutions engineering.",
        },
        {
            "type": "speech.final",
            "text": "Then security reviews the integration requirements.",
        },
        {
            "type": "speech.final",
            "text": "After security sign-off, legal approves the MSA.",
        },
        {
            "type": "speech.final",
            "text": "Finally provisioning starts and customer success is notified.",
        },
    ]


def _load_scenario(path: str) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("events"), list):
        return payload["events"]
    raise ValueError("Scenario must be a list of events or an object with an 'events' array.")


def _validate_diagram_event(event: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    event_type = event.get("type")

    if event_type == "diagram.replace":
        diagram = event.get("diagram")
        if not isinstance(diagram, dict):
            return ["diagram.replace missing 'diagram' object"]
        for key in ("diagram_type", "nodes", "edges", "version"):
            if key not in diagram:
                errors.append(f"diagram.replace missing diagram.{key}")

        for index, node in enumerate(diagram.get("nodes", [])):
            if not isinstance(node, dict):
                errors.append(f"diagram.replace nodes[{index}] is not an object")
                continue
            for key in ("id", "position", "data"):
                if key not in node:
                    errors.append(f"diagram.replace nodes[{index}] missing {key}")

        for index, edge in enumerate(diagram.get("edges", [])):
            if not isinstance(edge, dict):
                errors.append(f"diagram.replace edges[{index}] is not an object")
                continue
            for key in ("id", "source", "target"):
                if key not in edge:
                    errors.append(f"diagram.replace edges[{index}] missing {key}")

    elif event_type == "diagram.patch":
        patch = event.get("patch")
        if not isinstance(patch, dict):
            return ["diagram.patch missing 'patch' object"]
        for key in ("diagram_type", "base_version", "ops", "version"):
            if key not in patch:
                errors.append(f"diagram.patch missing patch.{key}")

        ops = patch.get("ops", [])
        if not isinstance(ops, list):
            errors.append("diagram.patch patch.ops is not a list")
        else:
            for index, op in enumerate(ops):
                if not isinstance(op, dict):
                    errors.append(f"diagram.patch ops[{index}] is not an object")
                    continue
                if "op" not in op:
                    errors.append(f"diagram.patch ops[{index}] missing op")
                if "data" not in op:
                    errors.append(f"diagram.patch ops[{index}] missing data")

    return errors


def _state_snapshot(state: SessionState) -> dict[str, Any]:
    return {
        "mode": state.mode.value,
        "diagram_type": state.diagram_type.value,
        "locked_diagram_type": (
            state.locked_diagram_type.value if state.locked_diagram_type else None
        ),
        "diagram_version": state.diagram.version,
        "nodes": len(state.diagram.nodes),
        "edges": len(state.diagram.edges),
        "last_generated_offset": state.last_generated_offset,
        "last_processed_offset": state.last_processed_offset,
    }


async def _run_simulation(args: argparse.Namespace) -> dict[str, Any]:
    scenario = (
        _load_scenario(args.scenario_file)
        if args.scenario_file
        else _default_scenario()
    )
    env_settings = Settings()
    settings = Settings(
        generation_cooldown_seconds=0.0,
        min_new_chars=999,
        llm_api_key=env_settings.llm_api_key if args.use_llm else None,
        llm_base_url=env_settings.llm_base_url,
        llm_model=env_settings.llm_model,
        llm_timeout_seconds=env_settings.llm_timeout_seconds,
        llm_max_retries=env_settings.llm_max_retries,
    )

    pipeline = SessionPipeline(settings)
    llm_available = pipeline.model_orchestrator.is_available()
    if args.use_llm and not llm_available:
        raise RuntimeError(
            "--use-llm was set but no LLM client is available. "
            "Set MINDMESH_LLM_API_KEY in backend/.env or your shell environment."
        )

    state = SessionState(session_id=args.session_id, mode=SessionMode.STANDBY)
    llm_calls_attempted = 0
    if llm_available:
        original_generate = pipeline.model_orchestrator.generate

        async def counted_generate(*g_args: Any, **g_kwargs: Any) -> Any:
            nonlocal llm_calls_attempted
            llm_calls_attempted += 1
            return await original_generate(*g_args, **g_kwargs)

        pipeline.model_orchestrator.generate = counted_generate  # type: ignore[method-assign]

    steps: list[dict[str, Any]] = []
    validation_errors: list[str] = []

    for index, raw_event in enumerate(scenario, start=1):
        event = parse_inbound_event(raw_event)
        outbound = await pipeline.handle_event(state, event)
        outbound_json = [item.model_dump(mode="json") for item in outbound]

        if args.diagram_only:
            outbound_json = [
                item for item in outbound_json if item.get("type") in DIAGRAM_EVENT_TYPES
            ]

        for item in outbound_json:
            if item.get("type") in DIAGRAM_EVENT_TYPES:
                for error in _validate_diagram_event(item):
                    validation_errors.append(f"step {index}: {error}")

        step_result: dict[str, Any] = {
            "step": index,
            "inbound": raw_event,
            "outbound": outbound_json,
        }
        if args.include_state:
            step_result["state"] = _state_snapshot(state)
        steps.append(step_result)

    return {
        "ok": len(validation_errors) == 0,
        "session_id": state.session_id,
        "llm_requested": args.use_llm,
        "llm_available": llm_available,
        "llm_model": settings.llm_model if llm_available else None,
        "llm_calls_attempted": llm_calls_attempted,
        "diagram_event_types": sorted(DIAGRAM_EVENT_TYPES),
        "validation_errors": validation_errors,
        "steps": steps,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Simulate pipeline output JSON for React Flow payload checks."
    )
    parser.add_argument(
        "--scenario-file",
        type=str,
        default=None,
        help="Path to scenario JSON file (list of inbound events or {events: [...]})",
    )
    parser.add_argument(
        "--session-id",
        type=str,
        default="sim-demo",
        help="Session ID used for the simulation state.",
    )
    parser.add_argument(
        "--diagram-only",
        action="store_true",
        help="Keep only diagram.replace/diagram.patch events in each step output.",
    )
    parser.add_argument(
        "--include-state",
        action="store_true",
        help="Include compact session state snapshot after each step.",
    )
    parser.add_argument(
        "--use-llm",
        action="store_true",
        help="Allow configured LLM key/base URL instead of forcing rules-only mode.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when validation detects diagram payload issues.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        result = asyncio.run(_run_simulation(args))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1

    print(json.dumps(result, indent=2))
    if args.strict and not result["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
