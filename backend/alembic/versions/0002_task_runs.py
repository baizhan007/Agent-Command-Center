"""Persist DSH task executions."""

from alembic import op
import sqlalchemy as sa

revision = "0002_task_runs"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_runs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("task_id", sa.String(length=32), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("session_id", sa.String(length=160)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("exit_code", sa.Integer()),
        sa.Column("result", sa.Text()),
        sa.Column("error", sa.Text()),
        sa.Column("log_path", sa.Text()),
    )
    op.create_index("ix_task_runs_task_id", "task_runs", ["task_id"])
    op.create_index("ix_task_runs_status", "task_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_task_runs_status", table_name="task_runs")
    op.drop_index("ix_task_runs_task_id", table_name="task_runs")
    op.drop_table("task_runs")
