"""Auth schemas."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MIN_PASSWORD_LEN = 10
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.\-\u0600-\u06FF]{3,80}$")


class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str = ""


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    email: str
    full_name: str
    phone: str = ""
    is_active: bool
    roles: list[RoleOut]
    created_at: datetime


class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    email: str
    full_name: str
    roles: list[RoleOut]


class UserCreateIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=MIN_PASSWORD_LEN, max_length=200)
    email: str = Field(default="", max_length=255)
    full_name: str = Field(default="", max_length=120)
    role_ids: list[int] = Field(default_factory=list)

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_RE.match(v):
            raise ValueError("نام کاربری فقط می‌تواند شامل حروف، عدد و _.‑ باشد.")
        return v

    @field_validator("password")
    @classmethod
    def _not_common(cls, v: str) -> str:
        if not re.search(r"[A-Za-zآ-ی]", v) or not re.search(r"\d", v):
            raise ValueError("رمز باید شامل حرف و عدد باشد.")
        return v


class UserUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    role_ids: list[int] | None = None
    password: str | None = Field(default=None, min_length=MIN_PASSWORD_LEN, max_length=200)
