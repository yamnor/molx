import json

from fastapi import HTTPException

DISPLAY_OPTIONS = {
    "style": ("ball-stick", "stick", "sphere", "line", "cartoon"),
    "color": ("element", "chain", "residue", "single"),
    "label": ("off", "atom", "residue"),
    "surface": ("off", "on"),
    "rotation": ("off", "on"),
    "animation": ("off", "on"),
}
DEFAULT_DISPLAY_SETTINGS = {
    "style": "ball-stick",
    "color": "element",
    "label": "off",
    "surface": "off",
    "rotation": "off",
    "animation": "on",
}


def normalize_display_settings(settings: dict | None) -> dict | None:
    if not isinstance(settings, dict):
        return None

    normalized = {}
    for key, allowed_values in DISPLAY_OPTIONS.items():
        value = settings.get(key, DEFAULT_DISPLAY_SETTINGS[key])
        if value not in allowed_values:
            raise HTTPException(status_code=400, detail=f"Invalid display setting: {key}")
        normalized[key] = value
    return normalized


def parse_display_settings(raw_settings: str | None) -> dict | None:
    if not raw_settings:
        return None
    try:
        settings = json.loads(raw_settings)
    except json.JSONDecodeError:
        return None
    try:
        return normalize_display_settings(settings)
    except HTTPException:
        return None

