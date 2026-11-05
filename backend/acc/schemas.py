from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    path: str = Field(min_length=1, max_length=2048)
    create_repository: bool = False

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        return value.strip()


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    path: str
    created_at: datetime
    task_count: int = 0
    branch: str | None = None
    git_dirty: bool | None = None


class TaskCreate(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=20000)
    priority: int = Field(default=2, ge=1, le=4)

    @field_validator("title", "description")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    project_name: str
    title: str
    description: str
    status: str
    priority: int
    created_at: datetime
    updated_at: datetime


class TaskRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    status: str
    session_id: str | None
    started_at: datetime | None
    finished_at: datetime | None
    exit_code: int | None
    result: str | None
    error: str | None
    log_path: str | None


class TaskRunCreate(BaseModel):
    session_id: str | None = Field(default=None, min_length=1, max_length=160)


class DashboardRead(BaseModel):
    projects: int
    agents: int
    running_agents: int
    waiting_tasks: int
    completed_tasks: int
    failed_tasks: int
    tokens: int
    cost_usd: float | None
