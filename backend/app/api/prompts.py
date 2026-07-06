from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.engine.prompt_generator import generate_system_prompt

router = APIRouter()


class PromptGenerateRequest(BaseModel):
    name: str
    identity: str
    perspective: str
    constraints: str


class PromptGenerateResponse(BaseModel):
    system_prompt: str


@router.post("/generate", response_model=PromptGenerateResponse)
async def generate_prompt(data: PromptGenerateRequest):
    prompt = generate_system_prompt(
        name=data.name,
        identity=data.identity,
        perspective=data.perspective,
        constraints=data.constraints,
    )
    return PromptGenerateResponse(system_prompt=prompt)
