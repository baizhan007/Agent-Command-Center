from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, Lock

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .dsh import DshHeadlessAdapter, redact
from .models import Project, Task, TaskRun

_semaphore_lock = Lock()
_semaphores: dict[int, BoundedSemaphore] = {}


def execution_semaphore(limit: int) -> BoundedSemaphore:
    normalized_limit = max(1, limit)
    with _semaphore_lock:
        return _semaphores.setdefault(normalized_limit, BoundedSemaphore(normalized_limit))


def persist_log(settings, run: TaskRun) -> None:
    log_dir = settings.data_dir / "runs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{run.id}.log"
    log_file.write_text((run.result or "") + ("\n" + run.error if run.error else ""), encoding="utf-8")
    run.log_path = str(log_file)


def is_authorized_path(path: str, roots: list[Path]) -> bool:
    try:
        candidate = Path(path).resolve(strict=True)
        resolved_roots = [root.resolve(strict=True) for root in roots]
    except (OSError, RuntimeError):
        return False
    return bool(resolved_roots) and any(candidate == root or root in candidate.parents for root in resolved_roots)


def is_authorized_project(project: Project, roots: list[Path]) -> bool:
    if is_authorized_path(project.path, roots):
        return True
    if not project.created_outside_roots:
        return False
    try:
        candidate = Path(project.path).resolve(strict=True)
        return candidate.is_dir() and (candidate / ".git").exists()
    except (OSError, RuntimeError):
        return False


def execute_run(run_id: str) -> None:
    settings = get_settings()
    with SessionLocal() as session:
        run = session.get(TaskRun, run_id)
        if run is None:
            return
        task = session.scalar(select(Task).where(Task.id == run.task_id))
        if task is None:
            run.status, run.error = "failed", "Task was removed before execution"
            run.finished_at = datetime.now(timezone.utc)
            session.commit()
            return
        project = session.get(Project, task.project_id)
        if project is None or not is_authorized_project(project, settings.authorized_roots):
            run.status, run.error = "failed", "Project path is no longer within ACC_ALLOWED_ROOTS"
            run.finished_at = datetime.now(timezone.utc)
            task.status = "failed"
            try:
                persist_log(settings, run)
            except OSError:
                run.error += "; run log could not be written"
            session.commit()
            return
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        task.status = "running"
        session.commit()
        try:
            semaphore = execution_semaphore(settings.max_parallel)
            semaphore.acquire()
            try:
                project = session.get(Project, task.project_id)
                if project is None or not is_authorized_project(project, settings.authorized_roots):
                    raise RuntimeError("Project path is no longer within ACC_ALLOWED_ROOTS")
                result = DshHeadlessAdapter(settings.dsh_executable).run(
                    f"{task.title}\n\n{task.description}", Path(project.path), settings.task_timeout_seconds, run.session_id,
                )
            finally:
                semaphore.release()
            run.result = result.output[-100_000:]
            run.exit_code = result.exit_code
            run.status = "completed" if result.exit_code == 0 else "failed"
            if result.exit_code != 0:
                run.error = f"DSH exited with status {result.exit_code}"
            task.status = run.status
        except Exception as exc:
            run.status = "failed"
            run.error = redact(str(exc))[-4000:]
            task.status = "failed"
        finally:
            try:
                persist_log(settings, run)
            except OSError:
                run.error = (run.error + "; " if run.error else "") + "run log could not be written"
                run.status = "failed"
                task.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            session.commit()
