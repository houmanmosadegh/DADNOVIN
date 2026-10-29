"""Public account, marketer, wallet and payout schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from ..utils.phone import is_valid_iranian_phone, normalize_phone


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    phone: str
    password: str = Field(min_length=8, max_length=128)
    ref_code: str = Field(default="", max_length=24)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = normalize_phone(v)
        if not is_valid_iranian_phone(v):
            raise ValueError("شماره موبایل معتبر نیست.")
        return v


class LoginPhoneIn(BaseModel):
    """Unified login — `identifier` is a mobile number or a staff username."""

    identifier: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def _identifier(cls, v: str) -> str:
        return normalize_phone(v) if is_valid_iranian_phone(normalize_phone(v)) else v.strip()


class ForgotIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class ProfilePatchIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=3, max_length=120)
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = normalize_phone(v)
        if not is_valid_iranian_phone(v):
            raise ValueError("شماره موبایل معتبر نیست.")
        return v


class PasswordChangeIn(BaseModel):
    current: str = Field(min_length=1, max_length=128)
    new: str = Field(min_length=8, max_length=128)


class MarketerApplyIn(BaseModel):
    note: str = Field(default="", max_length=1000)
    channel: str = Field(default="", max_length=200)
    terms: bool = False


class MarketerReviewIn(BaseModel):
    note: str = Field(default="", max_length=1000)


class PayoutIn(BaseModel):
    amount: int = Field(gt=0)


class PayoutReviewIn(BaseModel):
    payment_ref: str = Field(default="", max_length=80)


class BankDetailsIn(BaseModel):
    iban: str = Field(default="", max_length=34)
    card: str = Field(default="", max_length=19)


class CommissionRuleIn(BaseModel):
    kind: str = Field(pattern="^(fixed|percent)$")
    value: int = Field(ge=0)
    tier_min: int = Field(default=0, ge=0)
    marketer_id: uuid.UUID | None = None


class FeeIn(BaseModel):
    fee_amount: int = Field(ge=0)


class AccountMeOut(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    roles: list[str]
    is_marketer: bool
    ref_code: str = ""
    marketer_status: str = ""  # ''|pending|approved|rejected
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CommissionRuleOut(BaseModel):
    id: uuid.UUID
    kind: str
    value: int
    tier_min: int
    marketer_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
