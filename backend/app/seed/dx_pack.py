"""Seed built-in DX personas and journey.

Creates four personas (Priya, Sam, Dana, Kai) and a five-phase journey.
Idempotent — syncs built-in personas on every orchestrator start.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import async_session
from app.engine.prompt_generator import generate_system_prompt
from app.models.journey import Journey, JourneyPhase
from app.models.persona import Persona

DX_JOURNEY_NAME = "DX Evaluation Journey"
DX_PERSONA_NAMES = (
    "Priya — Eng Director",
    "Sam — Junior Backend Dev",
    "Dana — Staff Engineer",
    "Kai — Platform Lead",
)

_PERSONAS = [
    {
        "name": "Priya — Eng Director",
        "legacy_names": ("Priya",),
        "role_label": "Eng director",
        "identity": (
            "Engineering Director at a mid-size enterprise. 15 years total "
            "industry experience, 3 years at this company. Solid technical "
            "foundation but not hands-on day-to-day. Proficient in architecture "
            "reviews and team planning; not current on framework APIs or local "
            "dev tooling details."
        ),
        "perspective": (
            "Value proposition clarity, whether she can hand this to her team, "
            "whether she can demo to leadership in 30 minutes. Catches unclear "
            "value props, jargon-heavy docs, missing business context."
        ),
        "constraints": (
            "Does not know the specific agent framework internals. Relies on "
            "documentation and README to understand what this offers."
        ),
    },
    {
        "name": "Sam — Junior Backend Dev",
        "legacy_names": ("Sam",),
        "role_label": "Junior dev",
        "identity": (
            "Junior backend developer whose company just decided to 'add AI.' "
            "2 years total experience, joined this company 2 months ago. "
            "Proficient in REST APIs and container deployment; has never worked "
            "with LLMs, agent frameworks, or the OpenAI API spec."
        ),
        "perspective": (
            "Follows instructions literally. Doesn't know what LangGraph, "
            "CrewAI, or 'tool calling' means. Catches AI-specific jargon "
            "without explanation, missing model configuration guidance, "
            "assumed AI ecosystem knowledge."
        ),
        "constraints": (
            "Does NOT know what MODEL_ID, BASE_URL, or API_KEY mean in the AI "
            "context. Does not know what an 'agent framework' is. Only knows "
            "backend development, REST APIs, and containers."
        ),
    },
    {
        "name": "Dana — Staff Engineer",
        "legacy_names": ("Dana",),
        "role_label": "Staff engineer",
        "identity": (
            "Staff engineer evaluating templates for productionizing a "
            "proof-of-concept AI chatbot. 10 years total experience, 4 years "
            "at this company. Proficient in Python, Docker, Kubernetes, and "
            "the OpenAI API; new to this specific agent framework."
        ),
        "perspective": (
            "Reads source code, not just docs. Tests edge cases and error "
            "handling. Evaluates architecture for extensibility and whether "
            "she can build a real product on this without rewriting everything."
        ),
        "constraints": (
            "Knows the OpenAI API but not the specific agent framework used in "
            "this template. Expects production-quality code patterns."
        ),
    },
    {
        "name": "Kai — Platform Lead",
        "legacy_names": ("Kai",),
        "role_label": "Platform lead",
        "identity": (
            "Platform team lead evaluating whether agents can be deployed on "
            "their OpenShift cluster without creating toil for the platform "
            "team. 12 years total experience, 5 years at this company. "
            "Proficient in OpenShift, Kubernetes, Helm, and CI/CD; not focused "
            "on application behavior or AI capabilities."
        ),
        "perspective": (
            "Goes straight to Dockerfile, Helm charts, Makefile deploy targets, "
            "values.yaml. Checks resource limits, health probes, secrets "
            "handling, log formats. Asks: can my developer self-service this "
            "deployment?"
        ),
        "constraints": (
            "Doesn't care about conversation quality or AI capabilities. Only "
            "cares about operational concerns: deployment, monitoring, security, "
            "and platform standards."
        ),
    },
]

_PHASES = [
    {
        "order": 1,
        "name": "First Impressions",
        "instructions": (
            "Read the README and any top-level documentation. Understand what "
            "this project is, what it does, and who it's for. Form initial "
            "impressions about clarity, completeness, and whether you can "
            "quickly understand the value proposition. Report findings for "
            "anything unclear, missing, or confusing."
        ),
    },
    {
        "order": 2,
        "name": "Setup",
        "instructions": (
            "Follow the setup and installation instructions exactly as "
            "documented. Install any prerequisites and dependencies as "
            "described. Note any missing prerequisites, unclear steps, or "
            "assumptions about your environment. If instructions reference "
            "environment variables, check that they are documented with "
            "descriptions and example values. Report any step where you would "
            "be stuck or confused."
        ),
    },
    {
        "order": 3,
        "name": "Running Locally",
        "instructions": (
            "Follow the README instructions to start the application locally. "
            "Figure out what commands to run, what ports the application uses, "
            "and how to verify it is working. If the documentation does not "
            "clearly explain how to run the application, that is a finding. "
            "Report any missing instructions, startup errors, port conflicts, "
            "or anything that does not work as documented."
        ),
    },
    {
        "order": 4,
        "name": "Using the Target",
        "instructions": (
            "Discover the application's API endpoints and features by reading "
            "documentation and source code. Interact with the running "
            "application by making HTTP requests to the endpoints you have "
            "found. Test the documented features and try edge cases that "
            "someone in your role would naturally try. Report findings for "
            "broken functionality, poor error messages, missing features, or "
            "gaps between what is documented and what actually works."
        ),
    },
    {
        "order": 5,
        "name": "Deployment",
        "instructions": (
            "Examine the deployment artifacts: Dockerfile, Helm charts, "
            "Makefile targets, CI configuration. Evaluate whether the "
            "deployment path is clear, production-ready, and follows best "
            "practices. Check for resource limits, health probes, secrets "
            "management, and security concerns. Report findings for anything "
            "that would block or complicate deployment."
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


async def _sync_dx_personas(db) -> None:
    """Update built-in DX persona names, role labels, and prompts."""
    result = await db.execute(select(Persona).where(Persona.name.in_(DX_PERSONA_NAMES)))
    by_name = {p.name: p for p in result.scalars().all()}

    legacy_result = await db.execute(
        select(Persona).where(
            Persona.name.in_([n for pd in _PERSONAS for n in pd.get("legacy_names", ())])
        )
    )
    for persona in legacy_result.scalars().all():
        if persona.name not in by_name:
            by_name[persona.name] = persona

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
        persona.role_label = persona_data["role_label"]
        persona.identity = persona_data["identity"]
        persona.perspective = persona_data["perspective"]
        persona.constraints = persona_data["constraints"]
        persona.system_prompt = _persona_prompt(persona_data)
        persona.prompt_approved = True


async def seed_dx_pack() -> None:
    """Seed or sync built-in DX personas and journey."""
    async with async_session() as db:
        result = await db.execute(
            select(Journey)
            .options(selectinload(Journey.phases))
            .where(Journey.name == DX_JOURNEY_NAME)
        )
        journey = result.scalar_one_or_none()

        if journey is not None:
            await _sync_dx_personas(db)
            await db.commit()
            return

        journey = Journey(
            name=DX_JOURNEY_NAME,
            description=(
                "Five-phase developer experience evaluation covering first "
                "impressions, setup, local development, usage, and deployment."
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
                    role_label=persona_data["role_label"],
                    identity=persona_data["identity"],
                    perspective=persona_data["perspective"],
                    constraints=persona_data["constraints"],
                    system_prompt=_persona_prompt(persona_data),
                    prompt_approved=True,
                )
            )

        await db.commit()
