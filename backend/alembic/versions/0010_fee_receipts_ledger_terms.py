"""Fee-receipt commission ledger, versioned marketing terms, referral flags.

- case_fee_receipts: attorney-fee payments received by the office (installments)
- marketing_terms: append-only versioned terms text
- marketer_profiles: custom_rate + accepted_terms_version/accepted_at
- marketer_applications: terms_version
- commissions: becomes an append-only ledger — entry_type (accrual|reversal),
  receipt_id (unique idempotency), parent_id (reversal→accrual), rate_bp,
  referral_id, created_by. The old (request_type,request_id) UNIQUE is dropped:
  a case now accrues one entry PER RECEIPT instead of one row ever.
- referral_attributions.flag: '' | 'review' (flagged rows make no commissions)

Idempotent: 0001 creates fresh installs from the CURRENT metadata, so every
op here is guarded — on a fresh DB everything is already present and skipped.

Revision: 0010_fee_receipts_ledger_terms
Revises: 0009_commission_paid_fields
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_fee_receipts_ledger_terms"
down_revision = "0009_commission_paid_fields"
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


def _has_uq(table: str, name: str) -> bool:
    return name in {
        c["name"] for c in sa.inspect(op.get_bind()).get_unique_constraints(table)
    }


def upgrade() -> None:
    if not _has_table("case_fee_receipts"):
        op.create_table(
            "case_fee_receipts",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "request_id",
                sa.Uuid(),
                sa.ForeignKey("consultation_requests.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("amount", sa.BigInteger(), nullable=False),
            sa.Column("note", sa.String(300), server_default="", nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if not _has_index("case_fee_receipts", "ix_case_fee_receipts_request"):
        op.create_index(
            "ix_case_fee_receipts_request", "case_fee_receipts", ["request_id"]
        )

    if not _has_table("marketing_terms"):
        op.create_table(
            "marketing_terms",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("version", sa.Integer(), nullable=False, unique=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if not _has_index("marketing_terms", "ix_marketing_terms_version"):
        op.create_index(
            "ix_marketing_terms_version", "marketing_terms", ["version"], unique=True
        )

    if not _has_col("marketer_profiles", "custom_rate"):
        op.add_column(
            "marketer_profiles", sa.Column("custom_rate", sa.Integer(), nullable=True)
        )
    if not _has_col("marketer_profiles", "accepted_terms_version"):
        op.add_column(
            "marketer_profiles",
            sa.Column(
                "accepted_terms_version",
                sa.Integer(),
                server_default="0",
                nullable=False,
            ),
        )
    if not _has_col("marketer_profiles", "accepted_at"):
        op.add_column(
            "marketer_profiles",
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _has_col("marketer_applications", "terms_version"):
        op.add_column(
            "marketer_applications",
            sa.Column(
                "terms_version", sa.Integer(), server_default="0", nullable=False
            ),
        )

    if not _has_col("commissions", "referral_id"):
        op.add_column(
            "commissions",
            sa.Column("referral_id", sa.Uuid(), nullable=True),
        )
    if not _has_fk("commissions", "fk_commissions_referral"):
        op.create_foreign_key(
            "fk_commissions_referral",
            "commissions",
            "referral_attributions",
            ["referral_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_index("commissions", "ix_commissions_referral"):
        op.create_index("ix_commissions_referral", "commissions", ["referral_id"])
    if not _has_col("commissions", "entry_type"):
        op.add_column(
            "commissions",
            sa.Column(
                "entry_type", sa.String(10), server_default="accrual", nullable=False
            ),
        )
    if not _has_index("commissions", "ix_commissions_entry_type"):
        op.create_index("ix_commissions_entry_type", "commissions", ["entry_type"])
    if not _has_col("commissions", "receipt_id"):
        op.add_column("commissions", sa.Column("receipt_id", sa.Uuid(), nullable=True))
    if not _has_fk("commissions", "fk_commissions_receipt"):
        op.create_foreign_key(
            "fk_commissions_receipt",
            "commissions",
            "case_fee_receipts",
            ["receipt_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_uq("commissions", "uq_commissions_receipt"):
        op.create_unique_constraint(
            "uq_commissions_receipt", "commissions", ["receipt_id"]
        )
    if not _has_col("commissions", "parent_id"):
        op.add_column("commissions", sa.Column("parent_id", sa.Uuid(), nullable=True))
    if not _has_col("commissions", "rate_bp"):
        op.add_column(
            "commissions",
            sa.Column("rate_bp", sa.Integer(), server_default="0", nullable=False),
        )
    if not _has_col("commissions", "created_by"):
        op.add_column("commissions", sa.Column("created_by", sa.Uuid(), nullable=True))
    # one accrual PER RECEIPT now — the old one-row-per-case constraint is gone
    if _has_uq("commissions", "uq_commission_request"):
        op.drop_constraint("uq_commission_request", "commissions", type_="unique")

    if not _has_col("referral_attributions", "flag"):
        op.add_column(
            "referral_attributions",
            sa.Column("flag", sa.String(20), server_default="", nullable=False),
        )
    if not _has_index("referral_attributions", "ix_referral_attributions_flag"):
        op.create_index(
            "ix_referral_attributions_flag", "referral_attributions", ["flag"]
        )


def downgrade() -> None:
    if _has_index("referral_attributions", "ix_referral_attributions_flag"):
        op.drop_index("ix_referral_attributions_flag", "referral_attributions")
    if _has_col("referral_attributions", "flag"):
        op.drop_column("referral_attributions", "flag")

    if not _has_uq("commissions", "uq_commission_request"):
        op.create_unique_constraint(
            "uq_commission_request", "commissions", ["request_type", "request_id"]
        )
    if _has_col("commissions", "created_by"):
        op.drop_column("commissions", "created_by")
    if _has_col("commissions", "rate_bp"):
        op.drop_column("commissions", "rate_bp")
    if _has_col("commissions", "parent_id"):
        op.drop_column("commissions", "parent_id")
    if _has_uq("commissions", "uq_commissions_receipt"):
        op.drop_constraint("uq_commissions_receipt", "commissions", type_="unique")
    if _has_fk("commissions", "fk_commissions_receipt"):
        op.drop_constraint("fk_commissions_receipt", "commissions", type_="foreignkey")
    if _has_col("commissions", "receipt_id"):
        op.drop_column("commissions", "receipt_id")
    if _has_index("commissions", "ix_commissions_entry_type"):
        op.drop_index("ix_commissions_entry_type", "commissions")
    if _has_col("commissions", "entry_type"):
        op.drop_column("commissions", "entry_type")
    if _has_index("commissions", "ix_commissions_referral"):
        op.drop_index("ix_commissions_referral", "commissions")
    if _has_fk("commissions", "fk_commissions_referral"):
        op.drop_constraint("fk_commissions_referral", "commissions", type_="foreignkey")
    if _has_col("commissions", "referral_id"):
        op.drop_column("commissions", "referral_id")

    if _has_col("marketer_applications", "terms_version"):
        op.drop_column("marketer_applications", "terms_version")
    if _has_col("marketer_profiles", "accepted_at"):
        op.drop_column("marketer_profiles", "accepted_at")
    if _has_col("marketer_profiles", "accepted_terms_version"):
        op.drop_column("marketer_profiles", "accepted_terms_version")
    if _has_col("marketer_profiles", "custom_rate"):
        op.drop_column("marketer_profiles", "custom_rate")

    if _has_table("marketing_terms"):
        op.drop_table("marketing_terms")
    if _has_table("case_fee_receipts"):
        op.drop_table("case_fee_receipts")
