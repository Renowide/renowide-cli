"""
Sample tool — summarise.

Replace with your own intelligence. The shape is what Renowide expects:

  1. Validate input (raise ValidationError on bad input)
  2. Do the work
  3. Log material decisions to ctx.audit
  4. Return the result
"""

from __future__ import annotations

import re
from typing import Any

from renowide_agent_sdk import (
    AgentContext,
    BudgetExceededError,
    Tool,
    ValidationError,
)

CREDITS_PER_RUN = 20


async def summarise(input: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    text = input.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("text must be a non-empty string", field="text")
    max_bullets = int(input.get("max_bullets", 7))
    if max_bullets < 1 or max_bullets > 10:
        raise ValidationError("max_bullets must be between 1 and 10", field="max_bullets")

    if ctx.hire.remaining_credits < CREDITS_PER_RUN:
        raise BudgetExceededError(CREDITS_PER_RUN, ctx.hire.remaining_credits)

    ctx.audit.log(
        "summarise_started",
        {"source_length": len(text), "max_bullets": max_bullets},
    )

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    bullets = [re.sub(r"\s+", " ", s)[:140] for s in sentences[:max_bullets]]

    ctx.audit.log(
        "summarise_completed",
        {"bullet_count": len(bullets), "credits_consumed": CREDITS_PER_RUN},
    )

    return {"bullets": bullets, "source_tokens": round(len(text) / 4)}


summarise_tool = Tool(
    name="summarise",
    handler=summarise,
    description="Reduce any text to 5–7 bullet points, <=200 tokens.",
    governance="auto",
)
