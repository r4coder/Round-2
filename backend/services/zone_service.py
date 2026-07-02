"""
Zone business logic — validation and computation.
Shared between create and update endpoints to avoid duplication.
"""
from typing import Optional


def validate_zone_payload(data: dict) -> Optional[str]:
    """
    Validate zone creation/update payload.
    Returns an error message string if invalid, None if valid.
    """
    mower_count = data.get("mower_count")

    if mower_count is None:
        return "mower_count is required."

    try:
        mower_count = int(mower_count)
    except (TypeError, ValueError):
        return "mower_count must be an integer."

    if mower_count < 1:
        return "A zone must have at least one assigned mower."

    zone_type = data.get("type")
    valid_types = {"Fairway", "Rough", "Perimeter", "Exclusion"}
    if zone_type and zone_type not in valid_types:
        return f"Zone type must be one of: {', '.join(sorted(valid_types))}."

    status = data.get("status")
    valid_statuses = {"Active", "Inactive"}
    if status and status not in valid_statuses:
        return f"Status must be one of: {', '.join(sorted(valid_statuses))}."

    return None


def compute_understaffed(acreage: float, mower_count: int) -> bool:
    """A zone is understaffed when acreage exceeds mower_count × 2 acres."""
    return acreage > mower_count * 2
