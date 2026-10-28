"""initial schema — all tables derived from the ORM metadata.

Models are the single source of truth for the schema; this migration
materializes them so production never relies on create_all at runtime.

Revision ID: 0001_initial
Revises:
Create Date: 2025-10-28
"""

from alembic import op

from main import models  # noqa: F401
from main.db.base import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
