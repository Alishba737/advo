"""Modular role definitions for ADVO.

Each role (citizen, student, lawyer) lives in its own module so behaviour,
prompts, tools and access rules can evolve independently.
"""

from __future__ import annotations

from typing import Literal

from packages.roles.citizen import CITIZEN_SYSTEM_PROMPT, ROLE_CONFIG as CITIZEN_CONFIG
from packages.roles.student import STUDENT_SYSTEM_PROMPT, ROLE_CONFIG as STUDENT_CONFIG
from packages.roles.lawyer import LAWYER_SYSTEM_PROMPT, ROLE_CONFIG as LAWYER_CONFIG

UserMode = Literal["citizen", "student", "lawyer"]

MODE_PROMPTS: dict[UserMode, str] = {
    "citizen": CITIZEN_SYSTEM_PROMPT,
    "student": STUDENT_SYSTEM_PROMPT,
    "lawyer": LAWYER_SYSTEM_PROMPT,
}

ROLE_CONFIGS = {
    "citizen": CITIZEN_CONFIG,
    "student": STUDENT_CONFIG,
    "lawyer": LAWYER_CONFIG,
}


def get_system_prompt(mode: str, project_instructions: str | None = None) -> str:
    """Return the system prompt for a role, optionally augmented by project instructions."""
    base = MODE_PROMPTS.get(mode, CITIZEN_SYSTEM_PROMPT)
    if not project_instructions or not project_instructions.strip():
        return base

    project_block = f"""
## Project Instructions
The user is working inside a project with the following custom instructions.
Follow these instructions in addition to your role guidelines:

{project_instructions.strip()}
"""
    return base + project_block
