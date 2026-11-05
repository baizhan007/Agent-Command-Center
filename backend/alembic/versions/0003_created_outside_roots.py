"""Allow explicitly created repositories outside configured roots."""

from alembic import op
import sqlalchemy as sa


revision = "0003_created_outside_roots"
down_revision = "0002_task_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("created_outside_roots", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("projects", "created_outside_roots")
