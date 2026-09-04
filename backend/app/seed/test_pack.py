"""Seed built-in smoke-test personas and journey.

Three lightweight personas and a two-phase journey against a tiny public repo.
Idempotent — creates on first run, syncs persona names/prompts on later starts.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.session import async_session
from app.engine.prompt_generator import generate_system_prompt
from app.models.journey import Journey, JourneyPhase
from app.models.persona import ExpertiseLevel, Persona

SMOKE_TEST_REPO_URL = "https://github.com/mpk-droid/synthetic-users-smoke-test.git"
SMOKE_TEST_JOURNEY_NAME = "Smoke Test Journey"
SMOKE_PERSONA_NAMES = ("Alex (Test)", "Blake (Test)", "Casey (Test)")

_PERSONAS = [
    {
        "name": "Alex (Test)",
        "legacy_names": ("Alex",),
        "identity": "QA engineer running quick smoke tests before a release.",
        "perspective": "Checks that docs exist and are readable. Flags only obvious gaps.",
        "constraints": "Skims; does not deep-dive into implementation.",
        "expertise_level": ExpertiseLevel.novice,
    },
    {
        "name": "Blake (Test)",
        "legacy_names": ("Blake",),
        "identity": "Developer validating that a new CI pipeline works end-to-end.",
        "perspective": "Confirms repo structure matches README claims. Notes missing files.",
        "constraints": "Does not install dependencies or run long commands.",
        "expertise_level": ExpertiseLevel.intermediate,
    },
    {
        "name": "Casey (Test)",
        "legacy_names": ("Casey",),
        "identity": "Tech lead spot-checking a sample repo before a demo.",
        "perspective": "Wants a clear one-line purpose statement and a sane layout.",
        "constraints": "Time-boxed to a few minutes; keeps evaluation shallow.",
        "expertise_level": ExpertiseLevel.intermediate,
    },
]

_PHASES = [
    {
        "order": 1,
        "name": "README Check",
        "instructions": (
            "Smoke test — keep this short. Read the README only (use read_file). "
            "In one or two sentences, state what this repo is for. "
            "Report at most one finding if the README is missing or unclear. "
            "Do not install anything or run builds. "
            "Call complete_phase as soon as you can summarize the README."
        ),
    },
    {
        "order": 2,
        "name": "File Scan",
        "instructions": (
            "Smoke test — keep this short. List the repository root (list_directory). "
            "Confirm the README is present and note any unexpected missing files "
            "mentioned in the README. Use at most 2–3 tool calls total, then "
            "call complete_phase."
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
    await db.commit()


async def seed_test_pack() -> None:
    """Seed or sync built-in smoke-test personas and journey."""
    async with async_session() as db:
        result = await db.execute(
            select(Journey).where(Journey.name == SMOKE_TEST_JOURNEY_NAME)
        )
        if result.scalar_one_or_none() is not None:
            await _sync_smoke_personas(db)
            return

        journey = Journey(
            name=SMOKE_TEST_JOURNEY_NAME,
            description=(
                "Two-phase quick check: README then root file scan. "
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
