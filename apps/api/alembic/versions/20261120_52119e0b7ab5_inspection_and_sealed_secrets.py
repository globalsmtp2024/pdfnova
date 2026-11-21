from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '52119e0b7ab5'
down_revision: str | None = '3375fe261b12'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('task_files', schema=None) as batch_op:
        batch_op.add_column(sa.Column('encrypted', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('inspection', sa.JSON(), nullable=True))

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('secrets_sealed', sa.String(length=8192), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('secrets_sealed')

    with op.batch_alter_table('task_files', schema=None) as batch_op:
        batch_op.drop_column('inspection')
        batch_op.drop_column('encrypted')

