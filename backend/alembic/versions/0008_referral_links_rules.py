"""Labeled referral links, click forensics, OTP tokens, richer rules.

Revision ID: 0008_referral_links_rules
Revises: 0007_marketer_channel
"""

import sqlalchemy as sa
from alembic import op

revision = "0008_referral_links_rules"
down_revision = "0007_marketer_channel"
branch_labels = None
depends_on = None


# 0001 materializes the *current* ORM schema — every op must be idempotent.
def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_col(table: str, col: str) -> bool:
    return col in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _add_col(table: str, col: sa.Column) -> None:
    if not _has_col(table, col.name):
        op.add_column(table, col)


def upgrade() -> None:
    # ── referral_links — labeled short links per marketer ────────────
    if not _has_table("referral_links"):
        op.create_table(
            "referral_links",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "marketer_id",
                sa.Uuid(),
                sa.ForeignKey("marketer_profiles.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("label", sa.String(80), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("marketer_id", "label", name="uq_ref_link_label"),
        )
    if not _has_index("referral_links", "ix_referral_links_marketer_id"):
        op.create_index(
            "ix_referral_links_marketer_id", "referral_links", ["marketer_id"]
        )

    # ── referral_clicks — source label, visitor hash, fraud flags ────
    _add_col(
        "referral_clicks",
        sa.Column("link_label", sa.String(80), nullable=False, server_default=""),
    )
    _add_col(
        "referral_clicks",
        sa.Column("visitor_hash", sa.String(64), nullable=False, server_default=""),
    )
    _add_col(
        "referral_clicks",
        sa.Column(
            "suspicious", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    _add_col(
        "referral_clicks",
        sa.Column(
            "suspicious_reason", sa.String(200), nullable=False, server_default=""
        ),
    )
    for ix, cols in (
        ("ix_referral_clicks_link_label", ["link_label"]),
        ("ix_referral_clicks_visitor_hash", ["visitor_hash"]),
        ("ix_referral_clicks_suspicious", ["suspicious"]),
    ):
        if not _has_index("referral_clicks", ix):
            op.create_index(ix, "referral_clicks", cols)

    # ── commission_rules — clamps + validity window ──────────────────
    _add_col(
        "commission_rules",
        sa.Column("min_amount", sa.BigInteger(), nullable=False, server_default="0"),
    )
    _add_col(
        "commission_rules",
        sa.Column("max_amount", sa.BigInteger(), nullable=False, server_default="0"),
    )
    _add_col(
        "commission_rules",
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
    )
    _add_col(
        "commission_rules",
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── commissions — snapshot of the rule that produced the row ─────
    _add_col(
        "commissions",
        sa.Column("rule_snapshot", sa.Text(), nullable=False, server_default=""),
    )

    # ── otp_tokens — phone verification codes (provider-agnostic) ────
    if not _has_table("otp_tokens"):
        op.create_table(
            "otp_tokens",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("phone", sa.String(20), nullable=False),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column(
                "purpose", sa.String(20), nullable=False, server_default="register"
            ),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if not _has_index("otp_tokens", "ix_otp_tokens_phone"):
        op.create_index("ix_otp_tokens_phone", "otp_tokens", ["phone"])


def downgrade() -> None:
    if _has_table("otp_tokens"):
        op.drop_table("otp_tokens")
    for col in ("rule_snapshot",):
        if _has_col("commissions", col):
            op.drop_column("commissions", col)
    for col in ("ends_at", "starts_at", "max_amount", "min_amount"):
        if _has_col("commission_rules", col):
            op.drop_column("commission_rules", col)
    for col in ("suspicious_reason", "suspicious", "visitor_hash", "link_label"):
        if _has_col("referral_clicks", col):
            op.drop_column("referral_clicks", col)
    if _has_table("referral_links"):
        op.drop_table("referral_links")
