from sqlalchemy.orm import Session

from .models import Project, Task, TaskRun


def create_task_record(
    session: Session,
    project_id: str,
    title: str,
    description: str,
    priority: int,
) -> Task | None:
    project = session.get(Project, project_id)
    if project is None:
        return None
    task = Task(
        project_id=project.id,
        title=title.strip(),
        description=description.strip(),
        priority=priority,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def queue_task_run(session: Session, task: Task, session_id: str | None = None) -> TaskRun:
    run = TaskRun(task_id=task.id, status="queued", session_id=session_id)
    task.status = "waiting"
    session.add(run)
    session.commit()
    session.refresh(run)
    return run
