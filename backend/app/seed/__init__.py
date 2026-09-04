from __future__ import annotations

from app.seed.dx_pack import seed_dx_pack
from app.seed.test_pack import seed_test_pack


async def run_seed():
    await seed_dx_pack()
    await seed_test_pack()
