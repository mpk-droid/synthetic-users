"""Sandboxed tools available to persona agents during journey execution."""

from __future__ import annotations

import asyncio
import difflib
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


class ToolError(Exception):
    pass


TOOL_SCHEMAS: list[dict] = [
    {
        "name": "read_file",
        "description": "Read a file from the target directory. Path is relative to the target root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": "List contents of a directory within the target directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to directory (default: root)",
                    "default": ".",
                },
            },
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run an allowlisted shell command in the target directory. "
            "Allowed: make targets, cat, grep, ls, find, head, tail, wc, oc, helm, pytest, uv."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to run",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (optional)",
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "http_request",
        "description": "Make an HTTP request. Restricted to localhost and cluster route URLs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "description": "HTTP method"},
                "url": {"type": "string", "description": "Request URL"},
                "body": {
                    "type": "string",
                    "description": "Request body (optional)",
                },
                "headers": {
                    "type": "object",
                    "description": "Request headers (optional)",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["method", "url"],
        },
    },
    {
        "name": "report_finding",
        "description": (
            "Report an issue found during evaluation. "
            "Evidence MUST be verbatim text from a prior tool output."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low", "info"],
                },
                "category": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "evidence": {
                    "type": "string",
                    "description": "Verbatim text from a prior tool output",
                },
                "file_path": {"type": "string"},
                "line_range": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                },
                "suggestion": {"type": "string"},
            },
            "required": [
                "severity",
                "category",
                "title",
                "description",
                "evidence",
            ],
        },
    },
    {
        "name": "complete_phase",
        "description": "Signal that the current phase is complete with a summary.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Summary of what was found in this phase",
                },
            },
            "required": ["summary"],
        },
    },
]

_TOOL_SCHEMA_MAP: dict[str, dict] = {t["name"]: t for t in TOOL_SCHEMAS}

ALLOWLIST_PREFIXES = (
    "make init",
    "make env",
    "make test",
    "make dry-run",
    "make build",
    "make deploy",
    "make undeploy",
    "cat ",
    "grep ",
    "ls ",
    "find ",
    "head ",
    "tail ",
    "wc ",
    "oc get",
    "oc logs",
    "oc describe",
    "helm template",
    "python -m pytest",
    "uv ",
)

BLOCKLIST_PATTERNS = (
    "rm -rf",
    "sudo",
    "oc delete namespace",
    "oc delete project",
    "curl.*metadata",
    "wget.*metadata",
    "chmod 777",
    "> /dev/",
    "mkfs",
    "dd if=",
)

MAX_FILE_CHARS = 10000
MAX_OUTPUT_CHARS = 5000


def get_tools_for_phase(available_tool_names: list[str]) -> list[dict]:
    """Return tool schemas for the given tool names."""
    return [
        _TOOL_SCHEMA_MAP[name]
        for name in available_tool_names
        if name in _TOOL_SCHEMA_MAP
    ]


@dataclass
class ToolContext:
    """Runtime context for tool execution during a persona's journey."""

    target_dir: str
    target_url: str | None = None
    cluster_url: str | None = None
    command_timeout: int = 120
    build_timeout: int = 300
    tool_outputs: list[tuple[str, str]] = field(default_factory=list)
    findings: list[dict] = field(default_factory=list)

    def record_tool_output(self, tool_name: str, output: str) -> None:
        self.tool_outputs.append((tool_name, output))

    def verify_evidence(self, evidence: str) -> bool:
        normalized_evidence = _normalize_whitespace(evidence.lower())
        for _, output in self.tool_outputs:
            normalized_output = _normalize_whitespace(output.lower())
            if normalized_evidence in normalized_output:
                return True
        for _, output in self.tool_outputs:
            ratio = difflib.SequenceMatcher(
                None, normalized_evidence, _normalize_whitespace(output.lower())
            ).ratio()
            if ratio > 0.6:
                return True
        return False


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


async def execute_tool(
    name: str,
    arguments: dict,
    ctx: ToolContext,
    phase: str,
    persona: str,
) -> tuple[str, bool]:
    """Execute a tool. Returns (result_text, is_complete_phase)."""
    try:
        if name == "read_file":
            result = _tool_read_file(arguments, ctx)
        elif name == "list_directory":
            result = _tool_list_directory(arguments, ctx)
        elif name == "run_command":
            result = await _tool_run_command(arguments, ctx)
        elif name == "http_request":
            result = await _tool_http_request(arguments, ctx)
        elif name == "report_finding":
            result = _tool_report_finding(arguments, ctx, phase, persona)
        elif name == "complete_phase":
            return arguments.get("summary", "Phase complete."), True
        else:
            return f"Unknown tool: {name}", False
    except ToolError as e:
        return f"Tool error: {e}", False
    except Exception as e:
        logger.exception("Tool %s failed", name)
        return f"Tool execution failed: {e}", False

    return result, False


def _tool_read_file(arguments: dict, ctx: ToolContext) -> str:
    path = arguments.get("path", "")
    resolved = _resolve_safe_path(path, ctx.target_dir)
    content = resolved.read_text(errors="replace")
    if len(content) > MAX_FILE_CHARS:
        content = (
            content[:MAX_FILE_CHARS]
            + f"\n... [truncated at {MAX_FILE_CHARS} chars]"
        )
    return content


def _tool_list_directory(arguments: dict, ctx: ToolContext) -> str:
    path = arguments.get("path", ".")
    resolved = _resolve_safe_path(path, ctx.target_dir)
    if not resolved.is_dir():
        raise ToolError(f"Not a directory: {path}")
    entries = []
    for item in sorted(resolved.iterdir()):
        indicator = "/" if item.is_dir() else ""
        entries.append(f"{item.name}{indicator}")
    return "\n".join(entries) if entries else "(empty directory)"


async def _tool_run_command(arguments: dict, ctx: ToolContext) -> str:
    command = arguments.get("command", "")

    for pattern in BLOCKLIST_PATTERNS:
        if pattern in command:
            raise ToolError(f"Blocked command pattern: {pattern}")

    if not any(command.startswith(prefix) for prefix in ALLOWLIST_PREFIXES):
        raise ToolError(
            f"Command not in allowlist. Allowed prefixes: "
            f"{', '.join(ALLOWLIST_PREFIXES)}"
        )

    timeout = arguments.get("timeout", ctx.command_timeout)
    if command.startswith(("make build", "make deploy")):
        timeout = max(timeout, ctx.build_timeout)

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=ctx.target_dir,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = stdout.decode(errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise ToolError(f"Command timed out after {timeout}s: {command}")

    if len(output) > MAX_OUTPUT_CHARS:
        output = (
            output[:MAX_OUTPUT_CHARS]
            + f"\n... [truncated at {MAX_OUTPUT_CHARS} chars]"
        )
    return f"{output}\n[exit code: {proc.returncode}]"


async def _tool_http_request(arguments: dict, ctx: ToolContext) -> str:
    method = arguments.get("method", "GET").upper()
    url = arguments.get("url", "")
    body = arguments.get("body")
    headers = arguments.get("headers", {})

    _validate_url(url, ctx)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, url, content=body, headers=headers)
    result = f"HTTP {response.status_code}\n{response.text}"
    if len(result) > MAX_OUTPUT_CHARS:
        result = (
            result[:MAX_OUTPUT_CHARS]
            + f"\n... [truncated at {MAX_OUTPUT_CHARS} chars]"
        )
    return result


def _tool_report_finding(
    arguments: dict, ctx: ToolContext, phase: str, persona: str
) -> str:
    evidence = arguments["evidence"]
    verified = ctx.verify_evidence(evidence)

    finding = {
        "severity": arguments["severity"],
        "category": arguments["category"],
        "title": arguments["title"],
        "description": arguments["description"],
        "evidence": evidence,
        "file_path": arguments.get("file_path"),
        "line_range": arguments.get("line_range"),
        "suggestion": arguments.get("suggestion"),
        "phase": phase,
        "verified": verified,
    }
    ctx.findings.append(finding)

    status = (
        "verified"
        if verified
        else "UNVERIFIED (evidence not found in tool outputs)"
    )
    return f"Finding recorded [{arguments['severity']}]: {arguments['title']} ({status})"


def _resolve_safe_path(relative: str, target_dir: str) -> Path:
    if ".." in relative.split(os.sep):
        raise ToolError(f"Path traversal not allowed: {relative}")

    root = Path(target_dir).resolve()
    resolved = (root / relative).resolve()

    if not resolved.is_relative_to(root):
        raise ToolError(f"Path escapes target directory: {relative}")
    if resolved.is_symlink():
        target = resolved.resolve()
        if not target.is_relative_to(root):
            raise ToolError(f"Symlink target outside target directory: {relative}")
    if not resolved.exists():
        raise ToolError(f"Path does not exist: {relative}")

    return resolved


def _validate_url(url: str, ctx: ToolContext) -> None:
    parsed = urlparse(url)
    host = parsed.hostname or ""

    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        return
    if ctx.target_url and host and ctx.target_url in url:
        return
    if ctx.cluster_url and host and ctx.cluster_url in url:
        return

    raise ToolError(f"URL not allowed (only localhost and cluster routes): {url}")
