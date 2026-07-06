"""Run engine — executes persona agents through journey phases."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import anthropic

from app.engine.supervisor import score_run
from app.engine.tools import ToolContext, execute_tool, get_tools_for_phase

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 50


def _build_client(
    config: dict,
) -> anthropic.AsyncAnthropic | anthropic.AsyncAnthropicVertex:
    vertex_project = config.get("vertex_project_id") or os.environ.get(
        "ANTHROPIC_VERTEX_PROJECT_ID"
    )
    vertex_region = config.get("vertex_region") or os.environ.get(
        "CLOUD_ML_REGION", os.environ.get("ANTHROPIC_VERTEX_REGION")
    )

    if vertex_project:
        logger.info(
            "Using Vertex AI (project=%s, region=%s)", vertex_project, vertex_region
        )
        return anthropic.AsyncAnthropicVertex(
            project_id=vertex_project,
            region=vertex_region or "us-east5",
        )
    return anthropic.AsyncAnthropic()


async def run_persona_phase(
    client: anthropic.AsyncAnthropic | anthropic.AsyncAnthropicVertex,
    system_prompt: str,
    phase_instructions: str,
    phase_name: str,
    persona_name: str,
    tool_names: list[str],
    tool_ctx: ToolContext,
    model: str,
    max_tokens: int = 4096,
) -> str:
    """Run a single persona through a single journey phase. Returns the phase summary."""
    tool_schemas = get_tools_for_phase(tool_names)
    messages: list[dict] = [{"role": "user", "content": phase_instructions}]

    logger.info("%s starting phase: %s", persona_name, phase_name)

    summary = ""
    for _ in range(MAX_ITERATIONS):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
            tools=tool_schemas,
        )

        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        if response.stop_reason == "end_turn":
            text_parts = [
                block.text
                for block in assistant_content
                if hasattr(block, "text")
            ]
            summary = "\n".join(text_parts) if text_parts else "Phase complete."
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            phase_complete = False
            for block in assistant_content:
                if block.type == "tool_use":
                    result_text, is_complete = await execute_tool(
                        block.name,
                        block.input,
                        tool_ctx,
                        phase_name,
                        persona_name,
                    )
                    tool_ctx.record_tool_output(block.name, result_text)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_text,
                        }
                    )
                    if is_complete:
                        summary = result_text
                        phase_complete = True

            messages.append({"role": "user", "content": tool_results})
            if phase_complete:
                break

    logger.info("%s completed phase: %s", persona_name, phase_name)
    return summary


async def execute_run(
    run_id: str,
    personas: list[dict],
    phases: list[dict],
    model: str,
    config: dict,
    target_dir: str | None,
    target_url: str | None,
    update_callback=None,
):
    """Execute a full run: all personas through all phases.

    Args:
        run_id: The run's UUID (for status updates).
        personas: List of dicts with id, name, system_prompt.
        phases: List of dicts with name, instructions, available_tools,
                requires_target_running, order.
        model: Anthropic model ID.
        config: Job config dict (timeouts, vertex settings, etc.).
        target_dir: Path to target code directory (for file-reading tools).
        target_url: URL of running target (for HTTP tools).
        update_callback: Async callable(run_id, updates_dict) to persist
                         status changes to the database.
    """
    client = _build_client(config)
    max_tokens = config.get("max_tokens", 4096)
    command_timeout = config.get("command_timeout", 120)
    build_timeout = config.get("build_timeout", 300)

    if update_callback:
        await update_callback(
            run_id,
            {"status": "running", "started_at": datetime.now(timezone.utc)},
        )

    all_findings: list[dict] = []
    persona_results: list[dict] = []
    any_blocked = False

    sorted_phases = sorted(phases, key=lambda p: p["order"])

    for persona in personas:
        persona_name = persona["name"]
        system_prompt = persona["system_prompt"]
        persona_id = persona["id"]

        tool_ctx = ToolContext(
            target_dir=target_dir or "",
            target_url=target_url,
            cluster_url=config.get("cluster_url"),
            command_timeout=command_timeout,
            build_timeout=build_timeout,
        )

        phase_summaries = {}
        blocked = False
        blocked_phase = None
        blocked_reason = None

        if update_callback:
            await update_callback(
                run_id,
                {"persona_id": persona_id, "persona_status": "running"},
            )

        for phase in sorted_phases:
            phase_name = phase["name"]

            if phase.get("requires_target_running") and not target_url:
                phase_summaries[phase_name] = "Skipped: target not running"
                continue

            try:
                summary = await run_persona_phase(
                    client=client,
                    system_prompt=system_prompt,
                    phase_instructions=phase["instructions"],
                    phase_name=phase_name,
                    persona_name=persona_name,
                    tool_names=phase.get("available_tools", []),
                    tool_ctx=tool_ctx,
                    model=model,
                    max_tokens=max_tokens,
                )
                phase_summaries[phase_name] = summary
            except Exception as e:
                logger.exception(
                    "%s blocked at phase %s", persona_name, phase_name
                )
                phase_summaries[phase_name] = f"BLOCKED: {e}"
                blocked = True
                blocked_phase = phase_name
                blocked_reason = str(e)
                any_blocked = True
                break

        for f in tool_ctx.findings:
            f["_persona"] = persona_name

        all_findings.extend(tool_ctx.findings)

        persona_results.append(
            {
                "persona_id": persona_id,
                "phase_summaries": phase_summaries,
                "findings": tool_ctx.findings,
                "blocked": blocked,
                "blocked_phase": blocked_phase,
                "blocked_reason": blocked_reason,
            }
        )

        if update_callback:
            status = "blocked" if blocked else "completed"
            await update_callback(
                run_id,
                {
                    "persona_id": persona_id,
                    "persona_status": status,
                    "phase_summaries": phase_summaries,
                    "blocked_phase": blocked_phase,
                    "blocked_reason": blocked_reason,
                    "findings": tool_ctx.findings,
                },
            )

    score, rationale, action_items, agreement = score_run(
        all_findings, any_blocked
    )

    if update_callback:
        await update_callback(
            run_id,
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
                "score": score,
                "score_rationale": rationale,
            },
        )

    return {
        "score": score,
        "rationale": rationale,
        "action_items": action_items,
        "agreement": agreement,
        "persona_results": persona_results,
    }
