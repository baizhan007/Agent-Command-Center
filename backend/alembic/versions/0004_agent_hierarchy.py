"""Add agent ownership and parent links to tasks."""

from alembic import op
import sqlalchemy as sa


revision = "0004_agent_hierarchy"
down_revision = "0003_created_outside_roots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("agent", sa.String(length=40), server_default="dsh", nullable=False))
        batch.add_column(sa.Column("parent_task_id", sa.String(length=32), nullable=True))
        batch.create_foreign_key(
            "fk_tasks_parent_task_id_tasks", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL",
        )
    op.create_index("ix_tasks_agent", "tasks", ["agent"])
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"])


def downgrade() -> None:
    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    op.drop_index("ix_tasks_agent", table_name="tasks")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_constraint("fk_tasks_parent_task_id_tasks", type_="foreignkey")
        batch.drop_column("parent_task_id")
        batch.drop_column("agent")
