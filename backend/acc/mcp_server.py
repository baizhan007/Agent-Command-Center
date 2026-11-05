"""Local MCP interface for ACC projects, tasks, and DSH task runs."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select


ACC_ROOT = Path(__file__).resolve().parents[2]
for _name, _value in dotenv_values(ACC_ROOT / ".env").items():
    if _name and _name.startswith("ACC_") and _name != "ACC_API_TOKEN" and _value is not None:
        os.environ.setdefault(_name, _value)

from .config import get_settings
from .database import SessionLocal
from .execution import execute_run, is_authorized_project
from .models import Project, Task, TaskRun
from .schemas import TaskCreate, TaskRead, TaskRunCreate, TaskRunRead
from .services import create_task_record, queue_task_run


mcp = FastMCP("agent_command_center")
_executor = ThreadPoolExecutor(max_workers=max(1, get_settings().max_parallel))


def _json(data: object) -> str:
    return json.dumps(data, ensure_ascii=False, default=lambda value: value.isoformat() if isinstance(value, datetime) else str(value))


def _task_dict(task: Task) -> dict[str, object]:
    return TaskRead(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        created_at=task.created_at,
        updated_at=task.updated_at,
    ).model_dump(mode="json")


def _run_dict(run: TaskRun) -> dict[str, object]:
    return TaskRunRead.model_validate(run).model_dump(mode="json")


def list_projects() -> str:
    """List projects registered in ACC, including their local paths."""
    with SessionLocal() as session:
        projects = session.scalars(select(Project).order_by(Project.created_at.desc())).all()
        return _json([
            {
                "id": project.id,
                "name": project.name,
                "path": project.path,
                "created_at": project.created_at,
                "task_count": len(project.tasks),
            }
            for project in projects
        ])


def list_tasks(project_id: str | None = None) -> str:
    """List ACC tasks, optionally filtered to one registered project."""
    with SessionLocal() as session:
        query = select(Task).order_by(Task.created_at.desc())
        if project_id:
            query = query.where(Task.project_id == project_id)
        return _json([_task_dict(task) for task in session.scalars(query).all()])


def create_task(project_id: str, title: str, description: str, priority: int = 2) -> str:
    """Create a durable ACC task for a registered project."""
    payload = TaskCreate(
        project_id=project_id,
        title=title,
        description=description,
        priority=priority,
    )
    with SessionLocal() as session:
        task = create_task_record(
            session, payload.project_id, payload.title, payload.description, payload.priority,
        )
        if task is None:
            raise ValueError("Project not found")
        return _json(_task_dict(task))


def start_task_run(task_id: str, session_id: str | None = None) -> str:
    """Queue a DSH Headless run for an ACC task and return its run record."""
    payload = TaskRunCreate(session_id=session_id)
    with SessionLocal() as session:
        task = session.get(Task, task_id)
        if task is None:
            raise ValueError("Task not found")
        project = session.get(Project, task.project_id)
        if project is None or not is_authorized_project(project, get_settings().authorized_roots):
            raise ValueError("Project path is no longer available or authorized")
        if not (Path(project.path) / ".git").exists():
            raise ValueError("Project must be an existing Git repository")
        run = queue_task_run(session, task, payload.session_id)
        run_id = run.id
        response = _run_dict(run)

    try:
        _executor.submit(execute_run, run_id)
    except RuntimeError as exc:
        with SessionLocal() as session:
            failed_run = session.get(TaskRun, run_id)
            if failed_run:
                failed_run.status = "failed"
                failed_run.error = "ACC could not schedule the task run"
                failed_run.finished_at = datetime.now(timezone.utc)
                failed_task = session.get(Task, failed_run.task_id)
                if failed_task:
                    failed_task.status = "failed"
                session.commit()
                response = _run_dict(failed_run)
        raise ValueError("ACC could not schedule the task run") from exc
    return _json(response)


def get_task_run(run_id: str) -> str:
    """Read the current status, result, and error for an ACC run."""
    with SessionLocal() as session:
        run = session.get(TaskRun, run_id)
        if run is None:
            raise ValueError("Task run not found")
        return _json(_run_dict(run))


def list_task_runs(task_id: str) -> str:
    """List runs for an ACC task, newest first."""
    with SessionLocal() as session:
        if session.get(Task, task_id) is None:
            raise ValueError("Task not found")
        runs = session.scalars(
            select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.started_at.desc())
        ).all()
        return _json([_run_dict(run) for run in runs])


for _name, _function, _title, _read_only in [
    ("acc_list_projects", list_projects, "List ACC projects", True),
    ("acc_list_tasks", list_tasks, "List ACC tasks", True),
    ("acc_create_task", create_task, "Create an ACC task", False),
    ("acc_start_task_run", start_task_run, "Start a DSH run for an ACC task", False),
    ("acc_get_task_run", get_task_run, "Get an ACC run", True),
    ("acc_list_task_runs", list_task_runs, "List runs for an ACC task", True),
]:
    mcp.tool(name=_name, title=_title, annotations={"readOnlyHint": _read_only})(_function)


if __name__ == "__main__":
    mcp.run(transport="stdio")
