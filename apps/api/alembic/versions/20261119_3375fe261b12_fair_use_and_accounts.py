from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '3375fe261b12'
down_revision: str | None = '5772b193e203'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('ai_usage_events',
    sa.Column('owner_key', sa.String(length=64), nullable=False),
    sa.Column('client_ip_hash', sa.String(length=64), nullable=False),
    sa.Column('tool_slug', sa.String(length=64), nullable=False),
    sa.Column('used_own_key', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_usage_events'))
    )
    with op.batch_alter_table('ai_usage_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_ai_usage_events_client_ip_hash'), ['client_ip_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_usage_events_owner_key'), ['owner_key'], unique=False)

    op.create_table('api_keys',
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('prefix', sa.String(length=16), nullable=False),
    sa.Column('key_hash', sa.String(length=64), nullable=False),
    sa.Column('last_used_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_api_keys_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_api_keys'))
    )
    with op.batch_alter_table('api_keys', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_api_keys_key_hash'), ['key_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_api_keys_user_id'), ['user_id'], unique=False)

    op.create_table('contact_messages',
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('topic', sa.String(length=40), nullable=False),
    sa.Column('message', sa.String(length=5000), nullable=False),
    sa.Column('client_ip_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.String(length=32), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_contact_messages_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contact_messages'))
    )
    with op.batch_alter_table('contact_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_contact_messages_client_ip_hash'), ['client_ip_hash'], unique=False)

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('retention_seconds', sa.Integer(), nullable=False, server_default='3600'))
        batch_op.add_column(sa.Column('priority', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('api_key_id', sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f('ix_tasks_api_key_id'), ['api_key_id'], unique=False)
        batch_op.create_foreign_key(batch_op.f('fk_tasks_api_key_id_api_keys'), 'api_keys', ['api_key_id'], ['id'], ondelete='SET NULL')
        batch_op.drop_column('plan_tier')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('retention_extended', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('ai_provider', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('ai_api_key_encrypted', sa.String(length=1024), nullable=True))
        batch_op.add_column(sa.Column('ai_key_last4', sa.String(length=8), nullable=True))
        batch_op.drop_column('plan_tier')



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('plan_tier', sa.VARCHAR(length=32), nullable=False, server_default='free'))
        batch_op.drop_column('ai_key_last4')
        batch_op.drop_column('ai_api_key_encrypted')
        batch_op.drop_column('ai_provider')
        batch_op.drop_column('retention_extended')

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('plan_tier', sa.VARCHAR(length=32), nullable=False, server_default='free'))
        batch_op.drop_constraint(batch_op.f('fk_tasks_api_key_id_api_keys'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_tasks_api_key_id'))
        batch_op.drop_column('api_key_id')
        batch_op.drop_column('priority')
        batch_op.drop_column('retention_seconds')

    with op.batch_alter_table('contact_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_contact_messages_client_ip_hash'))

    op.drop_table('contact_messages')
    with op.batch_alter_table('api_keys', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_api_keys_user_id'))
        batch_op.drop_index(batch_op.f('ix_api_keys_key_hash'))

    op.drop_table('api_keys')
    with op.batch_alter_table('ai_usage_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ai_usage_events_owner_key'))
        batch_op.drop_index(batch_op.f('ix_ai_usage_events_client_ip_hash'))

    op.drop_table('ai_usage_events')
