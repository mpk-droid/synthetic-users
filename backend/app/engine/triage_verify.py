"""Spot-check verification for orchestrator triage."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile

from app.engine.tools import ToolContext, ToolError, _tool_read_file, _tool_run_command

logger = logging.getLogger(__name__)

MISSING_KEYWORDS = (
    "missing",
    "not found",
    "no readme",
    "absent",
    "lacks",
    "does not exist",
    "doesn't exist",
    "not present",
)

SUBJECTIVE_HINTS = (
    "confusing",
    "unclear",
    "hard to understand",
    "difficult to follow",
    "poorly organized",
    "subjective",
)


def evidence_quality_check(finding: dict) -> tuple[bool, str]:
    """Basic evidence shape check."""
    evidence = (finding.get("evidence") or "").strip()
    title = (finding.get("title") or "").strip()
    description = (finding.get("description") or "").strip()

    if len(evidence) < 20:
        return False, "Evidence is too short or missing."
    if evidence.lower() == title.lower():
        return (
            False,
            "Evidence only repeats the title and does not cite tool output.",
        )
    if len(description) < 10:
        return False, "Description is too vague."
    if evidence.lower() == description.lower():
        return (
            False,
            "Evidence duplicates the description without citing tool output.",
        )
    return True, ""


def _claims_missing(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in MISSING_KEYWORDS)


def _is_subjective(finding: dict) -> bool:
    blob = " ".join(
        [
            finding.get("title", ""),
            finding.get("description", ""),
            finding.get("category", ""),
        ]
    ).lower()
    return any(hint in blob for hint in SUBJECTIVE_HINTS)


def _evidence_snippet(evidence: str) -> str:
    lines = [line.strip() for line in evidence.splitlines() if line.strip()]
    if not lines:
        return ""
    return max(lines, key=len)[:240]


def _extract_command(evidence: str) -> str | None:
    patterns = [
        r"(?:^|\n)\$\s*(.+)$",
        r"(?:command|ran|run):\s*`?([^`\n]+)`?",
        r"`([^`]+)`",
    ]
    for pattern in patterns:
        match = re.search(pattern, evidence, re.IGNORECASE | re.MULTILINE)
        if match:
            command = match.group(1).strip()
            if command and len(command) < 200:
                return command
    return None


def _output_supports_claim(finding: dict, output: str) -> bool:
    evidence = (finding.get("evidence") or "").lower()
    output_lower = output.lower()
    snippet = _evidence_snippet(finding.get("evidence", "")).lower()
    if snippet and snippet in output_lower:
        return True
    for token in ("error", "failed", "failure", "not found", "no such file"):
        if token in evidence and token in output_lower:
            return True
    return len(output.strip()) > 0 and len(evidence) > 20


async def prepare_workspace(repo_url: str) -> str | None:
    """Clone the target repo for orchestrator spot-checks."""
    workspace = tempfile.mkdtemp(prefix="su-triage-")
    try:
        proc = await asyncio.create_subprocess_exec(
            "git",
            "clone",
            "--depth",
            "1",
            repo_url,
            workspace,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning(
                "Triage clone failed for %s: %s",
                repo_url,
                stderr.decode(errors="replace")[:300],
            )
            shutil.rmtree(workspace, ignore_errors=True)
            return None
        return workspace
    except Exception:
        logger.exception("Failed to prepare triage workspace")
        shutil.rmtree(workspace, ignore_errors=True)
        return None


def cleanup_workspace(workspace: str | None) -> None:
    if workspace:
        shutil.rmtree(workspace, ignore_errors=True)


async def spot_check_cluster(
    cluster_finding: dict,
    personas: list[str],
    ctx: ToolContext | None,
) -> tuple[str, str]:
    """Return verification_status and verification_note."""
    severity = cluster_finding.get("severity", "")
    if severity == "nits" and len(personas) >= 2:
        return "consensus_only", "Reported by multiple personas."

    if _is_subjective(cluster_finding):
        if len(personas) >= 2:
            return "consensus_only", "Subjective issue with multi-persona agreement."
        return "unverified", "Subjective finding; skipped reproduction."

    if ctx is None:
        ok, reason = evidence_quality_check(cluster_finding)
        if ok:
            return "unverified", "Repository unavailable for spot-check."
        return "unverified", reason

    file_path = cluster_finding.get("file_path")
    title_blob = " ".join(
        [
            cluster_finding.get("title", ""),
            cluster_finding.get("description", ""),
        ]
    )

    if file_path:
        try:
            content = _tool_read_file({"path": file_path}, ctx)
            exists = True
        except ToolError as exc:
            exists = False
            content = str(exc)

        if _claims_missing(title_blob):
            if exists:
                return "contradicted", f"Cited path exists: {file_path}"
            return "verified", f"Confirmed missing path: {file_path}"

        if not exists:
            return "contradicted", f"Cited file does not exist: {file_path}"

        snippet = _evidence_snippet(cluster_finding.get("evidence", ""))
        if snippet and snippet.lower() in content.lower():
            return "verified", "Evidence snippet found in cited file."
        return "unverified", "Could not match evidence to cited file contents."

    command = _extract_command(cluster_finding.get("evidence", ""))
    if command:
        try:
            output = await _tool_run_command({"command": command}, ctx)
            if _output_supports_claim(cluster_finding, output):
                return "verified", "Re-ran cited command successfully."
            return "unverified", "Command ran but output did not clearly support claim."
        except ToolError as exc:
            if _claims_missing(title_blob) or "error" in title_blob.lower():
                return "verified", f"Command failed as reported: {exc}"
            return "unverified", f"Could not re-run command: {exc}"

    ok, reason = evidence_quality_check(cluster_finding)
    if not ok:
        return "unverified", reason
    return "unverified", "No file or command to spot-check."
