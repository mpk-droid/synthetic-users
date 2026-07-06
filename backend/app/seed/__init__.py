from __future__ import annotations

from app.seed.dx_pack import seed_dx_pack


async def run_seed():
    await seed_dx_pack()
