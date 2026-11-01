"""Attach a private receipt file (فیش بانکی) to case fee receipts.

- case_fee_receipts.file_id → media_assets.id ON DELETE SET NULL
- guarded for fresh installs where 0001 already creates the column

Revision: 0013_fee_receipt_file
Revises: 0012_check_constraints
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_fee_receipt_file"
down_revision = "0012_check_constraints"
branch_labels = None
depends_on = None


def _cols(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "file_id" in _cols("case_fee_receipts"):
        return
    with op.batch_alter_table("case_fee_receipts") as batch:
        batch.add_column(sa.Column("file_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_fee_receipt_file", "media_assets", ["file_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    if "file_id" not in _cols("case_fee_receipts"):
        return
    with op.batch_alter_table("case_fee_receipts") as batch:
        batch.drop_constraint("fk_fee_receipt_file", type_="foreignkey")
        batch.drop_column("file_id")
