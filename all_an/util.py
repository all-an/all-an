from datetime import UTC, datetime


def iso(moment: datetime) -> str:
    """The format JavaScript's toISOString() produces, which is what clients already parse."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_int(value) -> int | None:
    """An int from an int or a numeric string (form fields arrive as strings); anything else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None
