"""Public accounts, referrals, commissions, wallet ledger, payouts.

Revision ID: 0006_accounts_referrals
Revises: 0005_unified_requests
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_accounts_referrals"
down_revision = "0005_unified_requests"
branch_labels = None
depends_on = None


# 0001 materializes the *current* ORM schema, so every op here must be
# idempotent — guard with inspector checks like 0003 does.
def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_col(table: str, col: str) -> bool:
    return col in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _has_fk(table: str, name: str) -> bool:
    return name in {f["name"] for f in sa.inspect(op.get_bind()).get_foreign_keys(table)}


def upgrade() -> None:
    # ── users.phone for public accounts ────────────────────────────
    if not _has_col("users", "phone"):
        op.add_column(
            "users",
            sa.Column("phone", sa.String(20), nullable=False, server_default=""),
        )
    if not _has_index("users", "ix_users_phone"):
        op.create_index("ix_users_phone", "users", ["phone"])
    # unique only for non-empty phones — staff rows share ""
    if not _has_index("users", "uq_users_phone_nonempty"):
        op.create_index(
            "uq_users_phone_nonempty",
            "users",
            ["phone"],
            unique=True,
            postgresql_where=sa.text("phone != ''"),
            sqlite_where=sa.text("phone != ''"),
        )
    if not _has_col("users", "referred_code"):
        op.add_column(
            "users",
            sa.Column("referred_code", sa.String(24), nullable=False, server_default=""),
        )

    # ── consultations: ownership + referral snapshot ───────────────
    if not _has_col("consultation_requests", "user_id"):
        op.add_column(
            "consultation_requests", sa.Column("user_id", sa.Uuid(), nullable=True)
        )
    if not _has_fk("consultation_requests", "fk_consult_user"):
        op.create_foreign_key(
            "fk_consult_user",
            "consultation_requests",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_index("consultation_requests", "ix_consultation_requests_user_id"):
        op.create_index(
            "ix_consultation_requests_user_id", "consultation_requests", ["user_id"]
        )
    if not _has_col("consultation_requests", "ref_code"):
        op.add_column(
            "consultation_requests",
            sa.Column("ref_code", sa.String(24), nullable=False, server_default=""),
        )
    if not _has_col("consultation_requests", "referrer_id"):
        op.add_column(
            "consultation_requests", sa.Column("referrer_id", sa.Uuid(), nullable=True)
        )
    if not _has_col("consultation_requests", "client_ip"):
        op.add_column(
            "consultation_requests",
            sa.Column("client_ip", sa.String(45), nullable=False, server_default=""),
        )
    if not _has_col("consultation_requests", "client_ua"):
        op.add_column(
            "consultation_requests",
            sa.Column("client_ua", sa.String(300), nullable=False, server_default=""),
        )
    if not _has_col("consultation_requests", "fee_amount"):
        op.add_column(
            "consultation_requests",
            sa.Column("fee_amount", sa.BigInteger(), nullable=False, server_default="0"),
        )

    # ── marketer applications & profiles ───────────────────────────
    if not _has_table("marketer_applications"):
        op.create_table(
        "marketer_applications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    if not _has_index("marketer_applications", "ix_marketer_applications_status"):
        op.create_index(
            "ix_marketer_applications_status", "marketer_applications", ["status"]
        )
    # user_id index comes from index=True on the column

    if not _has_table("marketer_profiles"):
        op.create_table(
        "marketer_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ref_code", sa.String(24), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("iban_enc", sa.Text(), server_default="", nullable=False),
        sa.Column("card_enc", sa.Text(), server_default="", nullable=False),
        sa.Column("approved_by", sa.Uuid(), nullable=True),
        sa.Column("fraud_flag", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_marketer_user"),
        sa.UniqueConstraint("ref_code", name="uq_marketer_refcode"),
    )
    if not _has_index("marketer_profiles", "ix_marketer_profiles_ref_code"):
        op.create_index(
            "ix_marketer_profiles_ref_code", "marketer_profiles", ["ref_code"]
        )

    if not _has_table("referral_clicks"):
        op.create_table(
        "referral_clicks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("ref_code", sa.String(24), index=True, nullable=False),
        sa.Column("ip", sa.String(45), server_default="", nullable=False),
        sa.Column("user_agent", sa.String(300), server_default="", nullable=False),
        sa.Column("landing_path", sa.String(200), server_default="/", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    if not _has_table("referral_attributions"):
        op.create_table(
        "referral_attributions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "marketer_id",
            sa.Uuid(),
            sa.ForeignKey("marketer_profiles.id"),
            index=True,
            nullable=False,
        ),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("request_id", sa.Uuid(), index=True, nullable=False),
        sa.Column("ref_code", sa.String(24), nullable=False),
        sa.Column("ip", sa.String(45), server_default="", nullable=False),
        sa.Column("user_agent", sa.String(300), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("request_type", "request_id", name="uq_attrib_request"),
    )

    # ── commissions ────────────────────────────────────────────────
    if not _has_table("commission_rules"):
        op.create_table(
        "commission_rules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(10), server_default="fixed", nullable=False),
        sa.Column("value", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("tier_min", sa.Integer(), server_default="0", nullable=False),
        sa.Column("marketer_id", sa.Uuid(), index=True, nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    if not _has_table("commissions"):
        op.create_table(
        "commissions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "marketer_id",
            sa.Uuid(),
            sa.ForeignKey("marketer_profiles.id"),
            index=True,
            nullable=False,
        ),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("request_id", sa.Uuid(), index=True, nullable=False),
        sa.Column("basis_kind", sa.String(10), server_default="fixed", nullable=False),
        sa.Column("basis_amount", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("amount", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("status", sa.String(15), server_default="pending", nullable=False),
        sa.Column("hold_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "request_type", "request_id", name="uq_commission_request"
        ),
    )
    if not _has_index("commissions", "ix_commissions_status"):
        op.create_index("ix_commissions_status", "commissions", ["status"])

    # ── wallet ledger & payouts ────────────────────────────────────
    if not _has_table("wallet_ledger"):
        op.create_table(
        "wallet_ledger",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "marketer_id",
            sa.Uuid(),
            sa.ForeignKey("marketer_profiles.id"),
            index=True,
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), index=True, nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("ref_type", sa.String(20), server_default="", nullable=False),
        sa.Column("ref_id", sa.Uuid(), nullable=True),
        sa.Column("memo", sa.String(300), server_default="", nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_ledger_idem"),
    )

    if not _has_table("payout_requests"):
        op.create_table(
        "payout_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "marketer_id",
            sa.Uuid(),
            sa.ForeignKey("marketer_profiles.id"),
            index=True,
            nullable=False,
        ),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(15), server_default="pending", nullable=False),
        sa.Column("iban_masked", sa.String(40), server_default="", nullable=False),
        sa.Column("payment_ref", sa.String(80), server_default="", nullable=False),
        sa.Column("reject_reason", sa.String(300), server_default="", nullable=False),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    if not _has_index("payout_requests", "ix_payout_requests_status"):
        op.create_index("ix_payout_requests_status", "payout_requests", ["status"])

    # ── notifications & password reset ─────────────────────────────
    if not _has_table("inbox_notifications"):
        op.create_table(
        "inbox_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("kind", sa.String(30), server_default="info", nullable=False),
        sa.Column("link", sa.String(200), server_default="", nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    if not _has_table("password_reset_tokens"):
        op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_reset_token"),
    )
    if not _has_index("password_reset_tokens", "ix_password_reset_tokens_token_hash"):
        op.create_index(
            "ix_password_reset_tokens_token_hash",
            "password_reset_tokens",
            ["token_hash"],
        )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")
    op.drop_table("inbox_notifications")
    op.drop_table("payout_requests")
    op.drop_table("wallet_ledger")
    op.drop_table("commissions")
    op.drop_table("commission_rules")
    op.drop_table("referral_attributions")
    op.drop_table("referral_clicks")
    op.drop_table("marketer_profiles")
    op.drop_table("marketer_applications")
    op.drop_column("consultation_requests", "fee_amount")
    op.drop_column("consultation_requests", "client_ua")
    op.drop_column("consultation_requests", "client_ip")
    op.drop_column("consultation_requests", "referrer_id")
    op.drop_column("consultation_requests", "ref_code")
    op.drop_constraint("fk_consult_user", "consultation_requests", type_="foreignkey")
    op.drop_column("consultation_requests", "user_id")
    op.drop_index("ix_users_phone", table_name="users")
    op.drop_index("uq_users_phone_nonempty", table_name="users")
    op.drop_column("users", "referred_code")
    op.drop_column("users", "phone")
