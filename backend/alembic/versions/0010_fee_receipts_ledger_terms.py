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

Revision: 0010_fee_receipts_ledger_terms
Revises: 0009_commission_paid_fields
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_fee_receipts_ledger_terms"
down_revision = "0009_commission_paid_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
    op.create_index("ix_case_fee_receipts_request", "case_fee_receipts", ["request_id"])

    op.create_table(
        "marketing_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_marketing_terms_version", "marketing_terms", ["version"], unique=True)

    op.add_column("marketer_profiles", sa.Column("custom_rate", sa.Integer(), nullable=True))
    op.add_column(
        "marketer_profiles",
        sa.Column("accepted_terms_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "marketer_profiles", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "marketer_applications",
        sa.Column("terms_version", sa.Integer(), server_default="0", nullable=False),
    )

    op.add_column(
        "commissions",
        sa.Column("referral_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_commissions_referral",
        "commissions",
        "referral_attributions",
        ["referral_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_commissions_referral", "commissions", ["referral_id"])
    op.add_column(
        "commissions",
        sa.Column("entry_type", sa.String(10), server_default="accrual", nullable=False),
    )
    op.create_index("ix_commissions_entry_type", "commissions", ["entry_type"])
    op.add_column("commissions", sa.Column("receipt_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_commissions_receipt",
        "commissions",
        "case_fee_receipts",
        ["receipt_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_commissions_receipt", "commissions", ["receipt_id"])
    op.add_column("commissions", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.add_column(
        "commissions", sa.Column("rate_bp", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column("commissions", sa.Column("created_by", sa.Uuid(), nullable=True))
    # one accrual PER RECEIPT now — the old one-row-per-case constraint is gone
    op.drop_constraint("uq_commission_request", "commissions", type_="unique")

    op.add_column(
        "referral_attributions",
        sa.Column("flag", sa.String(20), server_default="", nullable=False),
    )
    op.create_index("ix_referral_attributions_flag", "referral_attributions", ["flag"])


def downgrade() -> None:
    op.drop_index("ix_referral_attributions_flag", "referral_attributions")
    op.drop_column("referral_attributions", "flag")

    op.create_unique_constraint(
        "uq_commission_request", "commissions", ["request_type", "request_id"]
    )
    op.drop_column("commissions", "created_by")
    op.drop_column("commissions", "rate_bp")
    op.drop_column("commissions", "parent_id")
    op.drop_constraint("uq_commissions_receipt", "commissions", type_="unique")
    op.drop_constraint("fk_commissions_receipt", "commissions", type_="foreignkey")
    op.drop_column("commissions", "receipt_id")
    op.drop_index("ix_commissions_entry_type", "commissions")
    op.drop_column("commissions", "entry_type")
    op.drop_index("ix_commissions_referral", "commissions")
    op.drop_constraint("fk_commissions_referral", "commissions", type_="foreignkey")
    op.drop_column("commissions", "referral_id")

    op.drop_column("marketer_applications", "terms_version")
    op.drop_column("marketer_profiles", "accepted_at")
    op.drop_column("marketer_profiles", "accepted_terms_version")
    op.drop_column("marketer_profiles", "custom_rate")

    op.drop_table("marketing_terms")
    op.drop_table("case_fee_receipts")
