"""Seed built-in smoke-test personas and journey.

Three personas and a four-phase journey against a small demo-service repo.
Idempotent — syncs personas and journey phases on every orchestrator start.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import async_session
from app.engine.prompt_generator import generate_system_prompt
from app.models.journey import Journey, JourneyPhase
from app.models.persona import ExpertiseLevel, Persona

SMOKE_TEST_REPO_URL = "https://github.com/mpk-droid/synthetic-users-smoke-test.git"
SMOKE_TEST_JOURNEY_NAME = "Smoke Test Journey"
SMOKE_PERSONA_NAMES = ("Alex (Test)", "Blake (Test)", "Casey (Test)")
LEGACY_SMOKE_PHASE_NAMES = ("README Check", "File Scan")

_PERSONAS = [
    {
        "name": "Alex (Test)",
        "legacy_names": ("Alex",),
        "identity": "QA engineer validating a service repo before release.",
        "perspective": (
            "Checks documentation accuracy, setup steps, and whether a new tester "
            "could run the project without guessing."
        ),
        "constraints": (
            "Follows README and docs literally. Reports gaps between documented "
            "and actual behavior."
        ),
        "expertise_level": ExpertiseLevel.novice,
    },
    {
        "name": "Blake (Test)",
        "legacy_names": ("Blake",),
        "identity": "Backend developer reviewing a small Python HTTP service.",
        "perspective": (
            "Inspects project layout, dependencies, config, and whether CI/Docker "
            "artifacts match what the README claims."
        ),
        "constraints": (
            "Reads source files and config. May run short shell commands to verify "
            "setup steps when safe."
        ),
        "expertise_level": ExpertiseLevel.intermediate,
    },
    {
        "name": "Casey (Test)",
        "legacy_names": ("Casey",),
        "identity": "Tech lead doing a pre-demo quality spot-check.",
        "perspective": (
            "Looks for security smells, missing files referenced in docs, and "
            "blockers that would embarrass the team in a demo."
        ),
        "constraints": (
            "Time-boxed but thorough enough to catch obvious DX and security issues. "
            "Uses tools to verify claims in documentation."
        ),
        "expertise_level": ExpertiseLevel.intermediate,
    },
]

_PHASES = [
    {
        "order": 1,
        "name": "Documentation Review",
        "instructions": (
            "Read README.md and any files under docs/ (use read_file, list_directory). "
            "Summarize what this project does and who it is for. "
            "Check whether the documented layout, prerequisites, and quick-start steps "
            "are clear. Report findings for missing, contradictory, or broken documentation. "
            "Take time to read carefully — aim for a substantive review before calling complete_phase."
        ),
    },
    {
        "order": 2,
        "name": "Project Structure",
        "instructions": (
            "Explore the repository tree (list_directory recursively from the root). "
            "Compare the actual layout to what README and docs claim. "
            "Check for dependency files (requirements.txt, pyproject.toml, Makefile, "
            "Dockerfile, docker-compose.yml, CI config). "
            "Report missing files, unexpected files, or structural issues. "
            "Read key config files if present."
        ),
    },
    {
        "order": 3,
        "name": "Code Review",
        "instructions": (
            "Read the application source under src/ (and tests/ if present). "
            "Look for security issues (hardcoded secrets, debug mode in production paths), "
            "error handling gaps, and mismatches between code and documentation. "
            "Report concrete findings with file paths and evidence from tool output."
        ),
    },
    {
        "order": 4,
        "name": "Setup Verification",
        "instructions": (
            "Attempt to follow the documented setup path: check Makefile targets, "
            "try installing dependencies or running documented commands where reasonable. "
            "You do not need a full production deploy — verify what works and what blocks you. "
            "Report findings for broken commands, missing files, or steps that would stop a new developer."
        ),
    },
]


def _persona_prompt(persona_data: dict) -> str:
    return generate_system_prompt(
        name=persona_data["name"],
        identity=persona_data["identity"],
        perspective=persona_data["perspective"],
        constraints=persona_data["constraints"],
    )


async def _sync_smoke_personas(db) -> None:
    """Update smoke-test persona names and prompts (handles renames)."""
    result = await db.execute(select(Persona).where(Persona.name.in_(SMOKE_PERSONA_NAMES)))
    by_name = {p.name: p for p in result.scalars().all()}

    legacy_result = await db.execute(
        select(Persona).where(
            Persona.name.in_(
                [n for pd in _PERSONAS for n in pd.get("legacy_names", ())]
            )
        )
    )
    for p in legacy_result.scalars().all():
        if p.name not in by_name:
            by_name[p.name] = p

    for persona_data in _PERSONAS:
        persona = by_name.get(persona_data["name"])
        if persona is None:
            for legacy in persona_data.get("legacy_names", ()):
                persona = by_name.get(legacy)
                if persona is not None:
                    break
        if persona is None:
            continue
        persona.name = persona_data["name"]
        persona.identity = persona_data["identity"]
        persona.perspective = persona_data["perspective"]
        persona.constraints = persona_data["constraints"]
        persona.expertise_level = persona_data["expertise_level"]
        persona.system_prompt = _persona_prompt(persona_data)
        persona.prompt_approved = True


async def _sync_smoke_journey(journey: Journey, db) -> None:
    """Update smoke-test journey phases (handles phase renames and additions)."""
    by_name = {p.name: p for p in journey.phases}
    target_names = {p["name"] for p in _PHASES}

    for phase_data in _PHASES:
        phase = by_name.get(phase_data["name"])
        if phase is None:
            db.add(JourneyPhase(journey_id=journey.id, **phase_data))
        else:
            phase.order = phase_data["order"]
            phase.instructions = phase_data["instructions"]

    for legacy_name in LEGACY_SMOKE_PHASE_NAMES:
        if legacy_name in by_name and legacy_name not in target_names:
            await db.delete(by_name[legacy_name])

    journey.description = (
        "Four-phase smoke evaluation: docs, structure, code, setup. "
        f"Use with {SMOKE_TEST_REPO_URL}"
    )


async def seed_test_pack() -> None:
    """Seed or sync built-in smoke-test personas and journey."""
    async with async_session() as db:
        result = await db.execute(
            select(Journey)
            .options(selectinload(Journey.phases))
            .where(Journey.name == SMOKE_TEST_JOURNEY_NAME)
        )
        journey = result.scalar_one_or_none()

        if journey is not None:
            await _sync_smoke_journey(journey, db)
            await _sync_smoke_personas(db)
            await db.commit()
            return

        journey = Journey(
            name=SMOKE_TEST_JOURNEY_NAME,
            description=(
                "Four-phase smoke evaluation: docs, structure, code, setup. "
                f"Use with {SMOKE_TEST_REPO_URL}"
            ),
        )
        db.add(journey)
        await db.flush()

        for phase_data in _PHASES:
            db.add(JourneyPhase(journey_id=journey.id, **phase_data))

        for persona_data in _PERSONAS:
            db.add(
                Persona(
                    name=persona_data["name"],
                    identity=persona_data["identity"],
                    perspective=persona_data["perspective"],
                    constraints=persona_data["constraints"],
                    expertise_level=persona_data["expertise_level"],
                    system_prompt=_persona_prompt(persona_data),
                    prompt_approved=True,
                )
            )

        await db.commit()
