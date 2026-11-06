from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid4().hex)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    path: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    created_outside_roots: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    tasks: Mapped[list["Task"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid4().hex[:12])
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    agent: Mapped[str] = mapped_column(String(40), default="dsh", index=True, nullable=False)
    parent_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    priority: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)
    project: Mapped[Project] = relationship(back_populates="tasks")
    parent: Mapped["Task | None"] = relationship(remote_side="Task.id", back_populates="children")
    children: Mapped[list["Task"]] = relationship(back_populates="parent")


class TaskRun(Base):
    __tablename__ = "task_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid4().hex)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(160))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exit_code: Mapped[int | None] = mapped_column(Integer)
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    log_path: Mapped[str | None] = mapped_column(Text)
    task: Mapped[Task] = relationship()
