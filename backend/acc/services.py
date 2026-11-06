from sqlalchemy.orm import Session

from .models import Project, Task, TaskRun


def create_task_record(
    session: Session,
    project_id: str,
    title: str,
    description: str,
    priority: int,
    agent: str = "dsh",
    parent_task_id: str | None = None,
) -> Task | None:
    project = session.get(Project, project_id)
    if project is None:
        return None
    if parent_task_id:
        parent = session.get(Task, parent_task_id)
        if parent is None or parent.project_id != project_id:
            return None
    task = Task(
        project_id=project.id,
        title=title.strip(),
        description=description.strip(),
        priority=priority,
        agent=agent,
        parent_task_id=parent_task_id,
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
