"""create_scheduled_workouts

Revision ID: a6b6048c80cb
Revises: 9d92193d78de
Create Date: 2026-10-12 16:54:06.957889

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6b6048c80cb'
down_revision: Union[str, Sequence[str], None] = '9d92193d78de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'scheduled_workouts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('workout_id', sa.String(), nullable=True),
        sa.Column('workout_name', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('completed_session_id', sa.String(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['completed_session_id'], ['workout_sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'scheduled_date', name='uq_user_scheduled_date')
    )
    op.create_index(op.f('ix_scheduled_workouts_id'), 'scheduled_workouts', ['id'], unique=False)
    op.create_index(op.f('ix_scheduled_workouts_user_id'), 'scheduled_workouts', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_scheduled_workouts_user_id'), table_name='scheduled_workouts')
    op.drop_index(op.f('ix_scheduled_workouts_id'), table_name='scheduled_workouts')
    op.drop_table('scheduled_workouts')
