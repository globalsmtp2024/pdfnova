from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "47c770341081"
down_revision: str | None = "feb82a0db986"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ai_base_url", sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column("ai_model", sa.String(length=120), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("ai_model")
        batch_op.drop_column("ai_base_url")
