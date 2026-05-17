from pydantic import BaseModel, Field

from molx.config import MAX_SOURCE_URL_LENGTH, MAX_TITLE_LENGTH


class LinkInput(BaseModel):
    url: str = Field(..., min_length=1, max_length=MAX_SOURCE_URL_LENGTH)
    title: str | None = Field(default=None, max_length=MAX_TITLE_LENGTH)
    show_source: bool = False


class LinkMetadataInput(BaseModel):
    title: str | None = Field(default=None, max_length=MAX_TITLE_LENGTH)
    show_source: bool = False


class DisplaySettingsInput(BaseModel):
    style: str
    color: str
    label: str
    surface: str
    rotation: str
    animation: str
