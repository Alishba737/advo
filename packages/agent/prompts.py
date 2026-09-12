"""System prompts for ADVO's three user modes.

DEPRECATED: role prompts now live in packages.roles.* and are re-exported here
for backwards compatibility.
"""

from __future__ import annotations

from packages.roles import (
    MODE_PROMPTS,
    get_system_prompt,
    CITIZEN_SYSTEM_PROMPT,
    STUDENT_SYSTEM_PROMPT,
    LAWYER_SYSTEM_PROMPT,
)

__all__ = [
    "MODE_PROMPTS",
    "get_system_prompt",
    "CITIZEN_SYSTEM_PROMPT",
    "STUDENT_SYSTEM_PROMPT",
    "LAWYER_SYSTEM_PROMPT",
]
