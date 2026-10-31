"""Production v5 — تومان migration, payouts, consent, bank hold, articles.

- All stored money becomes integer تومان (was ریال): case_fee_receipts.amount,
  commissions.amount/basis_amount, consultation_requests.fee_amount ÷ 10.
- commission_rules table DROPPED — percentage-only model (custom_rate →
  default_rate); commissions.rule_snapshot column removed.
- payouts: settlement batches with bank-receipt file; commissions.payout_id.
- referral_attributions.consent_at — gates commission + name exposure.
- retired_ref_codes: old marketer codes keep resolving after rotation.
- marketer_profiles: account_name_enc, bank_updated_at, payout_hold_until.
- media_assets.purpose — 'receipt' files are auth-gated, never public.
- articles: category/tags/author/featured image/read-time/canonical/scheduled.
- unique guard: one accrual per (request, marketer) without a receipt +
  indexes for the 10k+ scale.

Idempotent: 0001 creates fresh installs from CURRENT metadata, so every
statement is guarded — on a fresh DB existing objects are skipped and the
money UPDATEs are no-ops on empty tables.

Revision: 0011_prod_v5_toman_payouts
Revises: 0010_fee_receipts_ledger_terms
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_prod_v5_toman_payouts"
down_revision = "0010_fee_receipts_ledger_terms"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_col(table: str, col: str) -> bool:
    return col in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _has_fk(table: str, name: str) -> bool:
    return name in {
        f["name"] for f in sa.inspect(op.get_bind()).get_foreign_keys(table)
    }


def upgrade() -> None:
    # ── money: ریال → تومان (integer division, negative reversals keep sign).
    #    Only rows written under the OLD schema are touched — on a fresh
    #    install the tables are empty so these UPDATEs are no-ops.
    if _has_table("case_fee_receipts"):
        op.execute("UPDATE case_fee_receipts SET amount = amount / 10")
    if _has_table("commissions"):
        op.execute(
            "UPDATE commissions SET amount = amount / 10, basis_amount = basis_amount / 10"
        )
    if _has_table("consultation_requests"):
        op.execute("UPDATE consultation_requests SET fee_amount = fee_amount / 10")

    # ── rules engine removed: percentage-only commissions ──
    if _has_table("commission_rules"):
        op.drop_table("commission_rules")
    if _has_col("commissions", "rule_snapshot"):
        op.drop_column("commissions", "rule_snapshot")

    # ── payouts + linkage ──
    if not _has_table("payouts"):
        op.create_table(
            "payouts",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "marketer_id",
                sa.Uuid(),
                sa.ForeignKey("marketer_profiles.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("amount", sa.BigInteger(), nullable=False),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "tracking_ref", sa.String(120), server_default="", nullable=False
            ),
            sa.Column("note", sa.String(300), server_default="", nullable=False),
            sa.Column(
                "file_id",
                sa.Uuid(),
                sa.ForeignKey("media_assets.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_by", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if not _has_index("payouts", "ix_payouts_marketer_paid"):
        op.create_index(
            "ix_payouts_marketer_paid", "payouts", ["marketer_id", "paid_at"]
        )
    if not _has_col("commissions", "payout_id"):
        op.add_column("commissions", sa.Column("payout_id", sa.Uuid(), nullable=True))
    if not _has_index("commissions", "ix_commissions_payout"):
        op.create_index("ix_commissions_payout", "commissions", ["payout_id"])

    # ── consent timestamp + acquisition channel on attributions ──
    if not _has_col("referral_attributions", "consent_at"):
        op.add_column(
            "referral_attributions",
            sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _has_col("referral_attributions", "channel"):
        op.add_column(
            "referral_attributions",
            sa.Column("channel", sa.String(20), server_default="", nullable=False),
        )

    # ── code rotation keeps history ──
    if not _has_table("retired_ref_codes"):
        op.create_table(
            "retired_ref_codes",
            sa.Column("code", sa.String(24), primary_key=True),
            sa.Column(
                "marketer_id",
                sa.Uuid(),
                sa.ForeignKey("marketer_profiles.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("retired_at", sa.DateTime(timezone=True), nullable=False),
        )

    # ── marketer bank/payout safety ──
    if not _has_col("marketer_profiles", "account_name_enc"):
        op.add_column(
            "marketer_profiles",
            sa.Column("account_name_enc", sa.Text(), server_default="", nullable=False),
        )
    if not _has_col("marketer_profiles", "bank_updated_at"):
        op.add_column(
            "marketer_profiles",
            sa.Column("bank_updated_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _has_col("marketer_profiles", "payout_hold_until"):
        op.add_column(
            "marketer_profiles",
            sa.Column("payout_hold_until", sa.DateTime(timezone=True), nullable=True),
        )

    # ── media purpose gate (receipts never publicly served) ──
    if not _has_col("media_assets", "purpose"):
        op.add_column(
            "media_assets",
            sa.Column(
                "purpose", sa.String(20), server_default="public", nullable=False
            ),
        )
    if not _has_index("media_assets", "ix_media_assets_purpose"):
        op.create_index("ix_media_assets_purpose", "media_assets", ["purpose"])

    # ── articles: specialty fields ──
    for col in (
        sa.Column("canonical", sa.String(300), server_default="", nullable=False),
        sa.Column("category", sa.String(80), server_default="", nullable=False),
        sa.Column("author_name", sa.String(120), server_default="", nullable=False),
        sa.Column("author_bio", sa.String(500), server_default="", nullable=False),
        sa.Column("read_time_min", sa.Integer(), server_default="0", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
    ):
        if not _has_col("articles", col.name):
            op.add_column("articles", col)
    if not _has_col("articles", "tags"):
        op.add_column("articles", sa.Column("tags", sa.JSON(), nullable=True))
        op.execute("UPDATE articles SET tags = '[]'")
        op.alter_column("articles", "tags", existing_type=sa.JSON(), nullable=False)
    if not _has_col("articles", "featured_image_id"):
        op.add_column(
            "articles", sa.Column("featured_image_id", sa.Uuid(), nullable=True)
        )
    if not _has_fk("articles", "fk_articles_featured_image"):
        op.create_foreign_key(
            "fk_articles_featured_image",
            "articles",
            "media_assets",
            ["featured_image_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_index("articles", "ix_articles_category"):
        op.create_index("ix_articles_category", "articles", ["category"])

    # ── dedupe legacy accruals without a receipt (keep earliest) ──
    op.execute(
        """
        UPDATE commissions c SET status = 'cancelled'
        WHERE c.receipt_id IS NULL AND c.entry_type = 'accrual' AND EXISTS (
            SELECT 1 FROM commissions o
            WHERE o.receipt_id IS NULL AND o.entry_type = 'accrual'
              AND o.request_id = c.request_id AND o.marketer_id = c.marketer_id
              AND o.created_at < c.created_at
        )
        """
    )
    if not _has_index("commissions", "uq_commission_nullreceipt"):
        op.create_index(
            "uq_commission_nullreceipt",
            "commissions",
            ["request_id", "marketer_id"],
            unique=True,
            postgresql_where=sa.text("receipt_id IS NULL AND entry_type = 'accrual'"),
        )

    # ── scale indexes ──
    for table, name, cols in (
        ("referral_clicks", "ix_referral_clicks_created", ["created_at"]),
        (
            "referral_clicks",
            "ix_referral_clicks_code_clean",
            ["ref_code", "suspicious"],
        ),
        (
            "referral_attributions",
            "ix_referral_attributions_marketer_created",
            ["marketer_id", "created_at"],
        ),
        (
            "commissions",
            "ix_commissions_marketer_status_created",
            ["marketer_id", "status", "created_at"],
        ),
        (
            "consultation_requests",
            "ix_consultation_requests_user_status",
            ["user_id", "status", "created_at"],
        ),
        ("consultation_requests", "ix_consultation_requests_phone", ["phone"]),
        (
            "inbox_notifications",
            "ix_inbox_notifications_user_read",
            ["user_id", "read_at"],
        ),
    ):
        if not _has_index(table, name):
            op.create_index(name, table, cols)


def downgrade() -> None:
    if _has_index("inbox_notifications", "ix_inbox_notifications_user_read"):
        op.drop_index("ix_inbox_notifications_user_read", "inbox_notifications")
    if _has_index("consultation_requests", "ix_consultation_requests_phone"):
        op.drop_index("ix_consultation_requests_phone", "consultation_requests")
    if _has_index("consultation_requests", "ix_consultation_requests_user_status"):
        op.drop_index("ix_consultation_requests_user_status", "consultation_requests")
    if _has_index("commissions", "ix_commissions_marketer_status_created"):
        op.drop_index("ix_commissions_marketer_status_created", "commissions")
    if _has_index("referral_attributions", "ix_referral_attributions_marketer_created"):
        op.drop_index(
            "ix_referral_attributions_marketer_created", "referral_attributions"
        )
    if _has_index("referral_clicks", "ix_referral_clicks_code_clean"):
        op.drop_index("ix_referral_clicks_code_clean", "referral_clicks")
    if _has_index("referral_clicks", "ix_referral_clicks_created"):
        op.drop_index("ix_referral_clicks_created", "referral_clicks")
    if _has_index("commissions", "uq_commission_nullreceipt"):
        op.drop_index("uq_commission_nullreceipt", "commissions")

    if _has_index("articles", "ix_articles_category"):
        op.drop_index("ix_articles_category", "articles")
    if _has_fk("articles", "fk_articles_featured_image"):
        op.drop_constraint("fk_articles_featured_image", "articles", type_="foreignkey")
    for col in (
        "featured_image_id",
        "tags",
        "scheduled_at",
        "read_time_min",
        "author_bio",
        "author_name",
        "category",
        "canonical",
    ):
        if _has_col("articles", col):
            op.drop_column("articles", col)

    if _has_index("media_assets", "ix_media_assets_purpose"):
        op.drop_index("ix_media_assets_purpose", "media_assets")
    if _has_col("media_assets", "purpose"):
        op.drop_column("media_assets", "purpose")
    if _has_col("marketer_profiles", "payout_hold_until"):
        op.drop_column("marketer_profiles", "payout_hold_until")
    if _has_col("marketer_profiles", "bank_updated_at"):
        op.drop_column("marketer_profiles", "bank_updated_at")
    if _has_col("marketer_profiles", "account_name_enc"):
        op.drop_column("marketer_profiles", "account_name_enc")
    if _has_table("retired_ref_codes"):
        op.drop_table("retired_ref_codes")
    if _has_col("referral_attributions", "channel"):
        op.drop_column("referral_attributions", "channel")
    if _has_col("referral_attributions", "consent_at"):
        op.drop_column("referral_attributions", "consent_at")
    if _has_index("commissions", "ix_commissions_payout"):
        op.drop_index("ix_commissions_payout", "commissions")
    if _has_col("commissions", "payout_id"):
        op.drop_column("commissions", "payout_id")
    if _has_table("payouts"):
        op.drop_table("payouts")

    if not _has_col("commissions", "rule_snapshot"):
        op.add_column(
            "commissions",
            sa.Column("rule_snapshot", sa.Text(), server_default="", nullable=False),
        )
    if not _has_table("commission_rules"):
        op.create_table(
            "commission_rules",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("kind", sa.String(10), server_default="fixed", nullable=False),
            sa.Column("value", sa.BigInteger(), server_default="0", nullable=False),
            sa.Column("tier_min", sa.Integer(), server_default="0", nullable=False),
            sa.Column("marketer_id", sa.Uuid(), nullable=True),
            sa.Column(
                "min_amount", sa.BigInteger(), server_default="0", nullable=False
            ),
            sa.Column(
                "max_amount", sa.BigInteger(), server_default="0", nullable=False
            ),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    op.execute("UPDATE case_fee_receipts SET amount = amount * 10")
    op.execute(
        "UPDATE commissions SET amount = amount * 10, basis_amount = basis_amount * 10"
    )
    op.execute("UPDATE consultation_requests SET fee_amount = fee_amount * 10")
