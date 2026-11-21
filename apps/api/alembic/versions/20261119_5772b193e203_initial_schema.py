from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '5772b193e203'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('display_name', sa.String(length=120), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('email_verified_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('plan_tier', sa.String(length=32), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('totp_secret_encrypted', sa.String(length=255), nullable=True),
    sa.Column('totp_enabled', sa.Boolean(), nullable=False),
    sa.Column('failed_login_count', sa.Integer(), nullable=False),
    sa.Column('locked_until', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('last_login_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('locale', sa.String(length=16), nullable=False),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('oauth_accounts',
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('provider_user_id', sa.String(length=255), nullable=False),
    sa.Column('provider_email', sa.String(length=320), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_oauth_accounts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_oauth_accounts')),
    sa.UniqueConstraint('provider', 'provider_user_id', name=op.f('uq_oauth_accounts_provider'))
    )
    with op.batch_alter_table('oauth_accounts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_oauth_accounts_user_id'), ['user_id'], unique=False)

    op.create_table('one_time_tokens',
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('used_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_one_time_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_one_time_tokens'))
    )
    with op.batch_alter_table('one_time_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_one_time_tokens_token_hash'), ['token_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_one_time_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('recovery_codes',
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('used_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_recovery_codes_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recovery_codes'))
    )
    with op.batch_alter_table('recovery_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_recovery_codes_code_hash'), ['code_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_recovery_codes_user_id'), ['user_id'], unique=False)

    op.create_table('refresh_tokens',
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('family_id', sa.String(length=32), nullable=False),
    sa.Column('expires_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=False),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens'))
    )
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_refresh_tokens_family_id'), ['family_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_refresh_tokens_token_hash'), ['token_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_refresh_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('tasks',
    sa.Column('owner_key', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.String(length=32), nullable=True),
    sa.Column('client_ip_hash', sa.String(length=64), nullable=False),
    sa.Column('tool_slug', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('plan_tier', sa.String(length=32), nullable=False),
    sa.Column('options', sa.JSON(), nullable=False),
    sa.Column('progress', sa.Float(), nullable=False),
    sa.Column('progress_label', sa.String(length=120), nullable=False),
    sa.Column('error_code', sa.String(length=64), nullable=True),
    sa.Column('error_message', sa.String(length=500), nullable=True),
    sa.Column('idempotency_key', sa.String(length=128), nullable=True),
    sa.Column('cancel_requested', sa.Boolean(), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('input_bytes', sa.BigInteger(), nullable=False),
    sa.Column('output_bytes', sa.BigInteger(), nullable=False),
    sa.Column('expires_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('queued_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('started_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('finished_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('files_deleted_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_tasks_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks')),
    sa.UniqueConstraint('owner_key', 'idempotency_key', name=op.f('uq_tasks_owner_key'))
    )
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tasks_client_ip_hash'), ['client_ip_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_expires_at'), ['expires_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_owner_key'), ['owner_key'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_tool_slug'), ['tool_slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_user_id'), ['user_id'], unique=False)

    op.create_table('task_files',
    sa.Column('task_id', sa.String(length=32), nullable=False),
    sa.Column('role', sa.String(length=8), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('original_name', sa.String(length=255), nullable=False),
    sa.Column('storage_key', sa.String(length=512), nullable=False),
    sa.Column('declared_size', sa.BigInteger(), nullable=False),
    sa.Column('received_bytes', sa.BigInteger(), nullable=False),
    sa.Column('parts_received', sa.Integer(), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('mime_type', sa.String(length=128), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=True),
    sa.Column('page_count', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('rejection_reason', sa.String(length=255), nullable=True),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('fk_task_files_task_id_tasks'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_task_files'))
    )
    with op.batch_alter_table('task_files', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_task_files_task_id'), ['task_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('task_files', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_task_files_task_id'))

    op.drop_table('task_files')
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tasks_user_id'))
        batch_op.drop_index(batch_op.f('ix_tasks_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_tasks_status'))
        batch_op.drop_index(batch_op.f('ix_tasks_owner_key'))
        batch_op.drop_index(batch_op.f('ix_tasks_expires_at'))
        batch_op.drop_index(batch_op.f('ix_tasks_client_ip_hash'))

    op.drop_table('tasks')
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_user_id'))
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_token_hash'))
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_family_id'))

    op.drop_table('refresh_tokens')
    with op.batch_alter_table('recovery_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_recovery_codes_user_id'))
        batch_op.drop_index(batch_op.f('ix_recovery_codes_code_hash'))

    op.drop_table('recovery_codes')
    with op.batch_alter_table('one_time_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_one_time_tokens_user_id'))
        batch_op.drop_index(batch_op.f('ix_one_time_tokens_token_hash'))

    op.drop_table('one_time_tokens')
    with op.batch_alter_table('oauth_accounts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_oauth_accounts_user_id'))

    op.drop_table('oauth_accounts')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
