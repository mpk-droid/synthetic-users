"""Deterministic scoring, deduplication, and report aggregation."""

from __future__ import annotations

import difflib
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


def score_run(
    all_findings: list[dict],
    any_blocked: bool,
) -> tuple[str, str, list[str], dict[str, list[str]]]:
    """Score a completed run.

    Returns (score, rationale, action_items, persona_agreement).
    Score is one of "GREEN", "YELLOW", "RED".
    """
    deduped, agreement = _deduplicate(all_findings)

    severity_order = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
    deduped.sort(
        key=lambda f: (
            severity_order.get(f["severity"], 0),
            len(agreement.get(f["title"], [])),
        ),
        reverse=True,
    )

    score = _compute_score(deduped, any_blocked)
    rationale = _build_rationale(score, deduped, any_blocked)
    action_items = _build_action_items(deduped, agreement)

    return score, rationale, action_items, agreement


def _deduplicate(
    findings: list[dict],
) -> tuple[list[dict], dict[str, list[str]]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        key = f"{f.get('category', '')}|{f.get('file_path', '') or ''}"
        groups[key].append(f)

    deduped: list[dict] = []
    agreement: dict[str, list[str]] = defaultdict(list)

    for group_findings in groups.values():
        merged = _merge_group(group_findings)
        for finding, personas in merged:
            deduped.append(finding)
            agreement[finding["title"]] = personas

    return deduped, dict(agreement)


def _merge_group(findings: list[dict]) -> list[tuple[dict, list[str]]]:
    severity_order = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
    clusters: list[tuple[dict, list[str]]] = []

    for finding in findings:
        merged = False
        for i, (existing, personas) in enumerate(clusters):
            ratio = difflib.SequenceMatcher(
                None, finding["title"].lower(), existing["title"].lower()
            ).ratio()
            if ratio > 0.7:
                if severity_order.get(finding["severity"], 0) > severity_order.get(
                    existing["severity"], 0
                ):
                    existing["severity"] = finding["severity"]
                    if finding.get("suggestion"):
                        existing["suggestion"] = finding["suggestion"]
                persona = finding.get("_persona", "")
                if persona and persona not in personas:
                    personas.append(persona)
                merged = True
                break

        if not merged:
            persona = finding.get("_persona", "")
            clusters.append((finding, [persona] if persona else []))

    return clusters


def _compute_score(findings: list[dict], any_blocked: bool) -> str:
    if any_blocked:
        return "RED"

    counts: dict[str, int] = defaultdict(int)
    for f in findings:
        counts[f["severity"]] += 1

    if counts["critical"] > 0:
        return "RED"
    if counts["high"] >= 3:
        return "RED"
    if counts["high"] > 0:
        return "YELLOW"
    if counts["medium"] >= 5:
        return "YELLOW"
    return "GREEN"


def _build_rationale(
    score: str, findings: list[dict], any_blocked: bool
) -> str:
    if any_blocked:
        return "RED: At least one persona's journey was blocked by a critical failure."

    counts: dict[str, int] = defaultdict(int)
    for f in findings:
        counts[f["severity"]] += 1

    if score == "RED":
        if counts["critical"] > 0:
            return (
                f"RED: {counts['critical']} critical finding(s) "
                f"require immediate attention."
            )
        return (
            f"RED: {counts['high']} high-severity findings "
            f"indicate significant issues."
        )

    if score == "YELLOW":
        if counts["high"] > 0:
            return (
                f"YELLOW: {counts['high']} high-severity finding(s) "
                f"need attention before production use."
            )
        return (
            f"YELLOW: {counts['medium']} medium-severity findings "
            f"suggest room for improvement."
        )

    total = sum(counts.values())
    if total == 0:
        return "GREEN: No issues found across all personas."
    return f"GREEN: {total} minor finding(s) only — target is in good shape."


def _build_action_items(
    findings: list[dict], agreement: dict[str, list[str]]
) -> list[str]:
    items = []
    for finding in findings[:10]:
        personas = agreement.get(finding["title"], [])
        persona_str = f" (flagged by: {', '.join(personas)})" if personas else ""
        suggestion_str = (
            f" — {finding['suggestion']}" if finding.get("suggestion") else ""
        )
        items.append(
            f"[{finding['severity'].upper()}] "
            f"{finding['title']}{suggestion_str}{persona_str}"
        )
    return items
