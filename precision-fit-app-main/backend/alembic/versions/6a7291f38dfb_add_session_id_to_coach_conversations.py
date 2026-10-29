"""add_session_id_to_coach_conversations

Revision ID: 6a7291f38dfb
Revises: a10937cbeea6
Create Date: 2026-10-16 20:42:47.959675

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a7291f38dfb'
down_revision: Union[str, Sequence[str], None] = 'a10937cbeea6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('coach_conversations', sa.Column('session_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_coach_conversations_session_id'), 'coach_conversations', ['session_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_coach_conversations_session_id'), table_name='coach_conversations')
    op.drop_column('coach_conversations', 'session_id')
