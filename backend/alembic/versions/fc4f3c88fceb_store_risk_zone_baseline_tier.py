"""store risk zone baseline tier

Revision ID: fc4f3c88fceb
Revises: df03d5c68653
Create Date: 2026-10-15 23:47:39.254529
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'fc4f3c88fceb'
down_revision: Union[str, Sequence[str], None] = 'df03d5c68653'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'risk_zones',
        sa.Column('last_sos_risk_level', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('risk_zones', 'last_sos_risk_level')