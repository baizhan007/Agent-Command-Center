from contextlib import asynccontextmanager
from pathlib import Path
import shutil
import sys
import subprocess

from alembic import command
from alembic.config import Config
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .execution import execute_run, is_authorized_path, is_authorized_project
from .models import Project, Task, TaskRun
from .schemas import DashboardRead, ProjectCreate, ProjectRead, TaskCreate, TaskRead, TaskRunCreate, TaskRunRead
from .services import create_task_record, queue_task_run


def upgrade_database(migration_config: Config) -> None:
    """Adopt the pre-Alembic projects/tasks schema before applying later revisions."""
    database_url = get_settings().database_url
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
    )
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        app_tables = {"projects", "tasks", "task_runs"}
        if "alembic_version" not in tables and tables.intersection(app_tables):
            legacy_tables = {"projects", "tasks"}
            if not legacy_tables.issubset(tables):
                raise RuntimeError("ACC database has an incomplete unversioned schema")
            required_columns = {
                "projects": {"id", "name", "path", "created_at"},
                "tasks": {"id", "project_id", "title", "description", "status", "priority", "created_at", "updated_at"},
            }
            for table, required in required_columns.items():
                if not required.issubset({column["name"] for column in inspector.get_columns(table)}):
                    raise RuntimeError(f"ACC database has an unsupported unversioned {table} schema")
            if "task_runs" in tables:
                raise RuntimeError("ACC database has unversioned task_runs; manual migration review is required")
            command.stamp(migration_config, "0001_initial")
    finally:
        engine.dispose()
    command.upgrade(migration_config, "head")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if not settings.api_token.strip():
        raise RuntimeError("ACC_API_TOKEN must be configured before starting ACC")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    migration_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    migration_config = Config(str(migration_root / "alembic.ini"))
    migration_config.set_main_option("script_location", str(migration_root / "alembic"))
    upgrade_database(migration_config)
    yield


app = FastAPI(title="Agent Command Center", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "null", "acc://app"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    token = get_settings().api_token
    if token and authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="A valid ACC API token is required")


def authorize_project_path(raw: str) -> Path:
    try:
        candidate = Path(raw).expanduser().resolve(strict=True)
    except (OSError, RuntimeError):
        raise HTTPException(status_code=400, detail="Project path does not exist or cannot be resolved") from None
    roots = get_settings().authorized_roots
    if not roots or not any(candidate == root or root in candidate.parents for root in roots):
        raise HTTPException(status_code=403, detail="Path is outside ACC_ALLOWED_ROOTS")
    if not candidate.is_dir():
        raise HTTPException(status_code=400, detail="Project path must be a directory")
    return candidate


def authorize_new_project_path(raw: str) -> Path:
    try:
        candidate = Path(raw).expanduser().resolve(strict=False)
    except (OSError, RuntimeError):
        raise HTTPException(status_code=400, detail="Project path cannot be resolved") from None
    if candidate.exists():
        raise HTTPException(status_code=409, detail="Project folder already exists")
    return candidate


def git_info(path: str) -> tuple[str | None, bool | None]:
    try:
        branch = subprocess.run(["git", "-C", path, "branch", "--show-current"], capture_output=True, text=True, timeout=3, check=True).stdout.strip()
        status = subprocess.run(["git", "-C", path, "status", "--porcelain"], capture_output=True, text=True, timeout=3, check=True).stdout
        return branch or "(detached)", bool(status.strip())
    except (OSError, subprocess.SubprocessError):
        return None, None


@app.get("/api/health")
def health():
    settings = get_settings()
    return {"ok": True, "phase": 2, "auth_required": bool(settings.api_token), "max_parallel": settings.max_parallel}


@app.get("/api/dashboard", response_model=DashboardRead, dependencies=[Depends(require_auth)])
def dashboard(session: Session = Depends(get_session)):
    count = lambda status: session.scalar(select(func.count()).select_from(Task).where(Task.status == status)) or 0
    return DashboardRead(
        projects=session.scalar(select(func.count()).select_from(Project)) or 0,
        agents=0, running_agents=0,
        waiting_tasks=count("pending") + count("waiting"),
        completed_tasks=count("completed"), failed_tasks=count("failed"),
        tokens=0, cost_usd=None,
    )


@app.get("/api/projects", response_model=list[ProjectRead], dependencies=[Depends(require_auth)])
def list_projects(session: Session = Depends(get_session)):
    items = session.scalars(select(Project).order_by(Project.created_at.desc())).all()
    return [ProjectRead(id=item.id, name=item.name, path=item.path, created_at=item.created_at,
                        task_count=len(item.tasks), branch=git_info(item.path)[0], git_dirty=git_info(item.path)[1]) for item in items]


@app.post("/api/projects", response_model=ProjectRead, status_code=201, dependencies=[Depends(require_auth)])
def create_project(payload: ProjectCreate, session: Session = Depends(get_session)):
    path = authorize_new_project_path(payload.path) if payload.create_repository else authorize_project_path(payload.path)
    if not payload.create_repository and not (path / ".git").exists():
        raise HTTPException(status_code=400, detail="Project must be an existing Git repository")
    if session.scalar(select(Project).where(Project.path == str(path))):
        raise HTTPException(status_code=409, detail="This repository is already registered")
    created_repository = False
    try:
        if payload.create_repository:
            try:
                path.mkdir(parents=True)
            except OSError:
                raise HTTPException(status_code=400, detail="Cannot create this folder; check the path and Windows write permissions") from None
            created_repository = True
            try:
                result = subprocess.run(["git", "-C", str(path), "init"], capture_output=True, text=True, timeout=15)
            except OSError:
                raise HTTPException(status_code=400, detail="Git for Windows is required to create a repository") from None
            if result.returncode:
                raise HTTPException(status_code=400, detail="Git could not initialize this folder")
        project = Project(
            name=payload.name,
            path=str(path),
            created_outside_roots=payload.create_repository and not is_authorized_path(str(path), get_settings().authorized_roots),
        )
        session.add(project)
        session.commit()
        session.refresh(project)
    except HTTPException:
        session.rollback()
        if created_repository:
            shutil.rmtree(path, ignore_errors=True)
        raise
    except Exception:
        session.rollback()
        if created_repository:
            shutil.rmtree(path, ignore_errors=True)
        raise
    branch, dirty = git_info(project.path)
    return ProjectRead(id=project.id, name=project.name, path=project.path, created_at=project.created_at,
                       task_count=0, branch=branch, git_dirty=dirty)


@app.delete("/api/projects/{project_id}", status_code=204, dependencies=[Depends(require_auth)])
def delete_project(project_id: str, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()


def task_read(task: Task) -> TaskRead:
    return TaskRead(id=task.id, project_id=task.project_id, project_name=task.project.name,
                    title=task.title, description=task.description, status=task.status,
                    priority=task.priority, created_at=task.created_at, updated_at=task.updated_at)


@app.get("/api/tasks", response_model=list[TaskRead], dependencies=[Depends(require_auth)])
def list_tasks(session: Session = Depends(get_session), project_id: str | None = Query(default=None)):
    query = select(Task).order_by(Task.created_at.desc())
    if project_id:
        query = query.where(Task.project_id == project_id)
    return [task_read(task) for task in session.scalars(query).all()]


@app.post("/api/tasks", response_model=TaskRead, status_code=201, dependencies=[Depends(require_auth)])
def create_task(payload: TaskCreate, session: Session = Depends(get_session)):
    task = create_task_record(
        session, payload.project_id, payload.title, payload.description, payload.priority,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return task_read(task)


@app.get("/api/tasks/{task_id}", response_model=TaskRead, dependencies=[Depends(require_auth)])
def get_task(task_id: str, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_read(task)


@app.post("/api/tasks/{task_id}/runs", response_model=TaskRunRead, status_code=202, dependencies=[Depends(require_auth)])
def start_task_run(task_id: str, background_tasks: BackgroundTasks, payload: TaskRunCreate | None = None, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = session.get(Project, task.project_id)
    if not project or not is_authorized_project(project, get_settings().authorized_roots):
        raise HTTPException(status_code=403, detail="Project path is no longer available or authorized")
    run = queue_task_run(session, task, payload.session_id if payload else None)
    background_tasks.add_task(execute_run, run.id)
    return run


@app.get("/api/tasks/{task_id}/runs", response_model=list[TaskRunRead], dependencies=[Depends(require_auth)])
def list_task_runs(task_id: str, session: Session = Depends(get_session)):
    if session.get(Task, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return session.scalars(select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.started_at.desc())).all()


@app.get("/api/runs/{run_id}", response_model=TaskRunRead, dependencies=[Depends(require_auth)])
def get_task_run(run_id: str, session: Session = Depends(get_session)):
    run = session.get(TaskRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Task run not found")
    return run


@app.delete("/api/tasks/{task_id}", status_code=204, dependencies=[Depends(require_auth)])
def delete_task(task_id: str, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
