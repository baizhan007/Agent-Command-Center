import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from acc import mcp_server
from acc.database import Base
from acc.models import Project, TaskRun


@pytest.fixture
def mcp_db(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(mcp_server, "SessionLocal", factory)
    monkeypatch.setenv("ACC_ALLOWED_ROOTS", str(tmp_path))
    from acc.config import get_settings
    get_settings.cache_clear()

    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".git").mkdir()
    with factory() as session:
        project = Project(name="Repo", path=str(repo))
        session.add(project)
        session.commit()
        project_id = project.id

    yield factory, project_id, repo

    get_settings.cache_clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_mcp_task_lifecycle_uses_acc_records(mcp_db, monkeypatch):
    factory, project_id, _ = mcp_db
    dispatched = []
    monkeypatch.setattr(mcp_server._executor, "submit", lambda function, run_id: dispatched.append((function, run_id)))

    projects = json.loads(mcp_server.list_projects())
    assert projects[0]["id"] == project_id

    task = json.loads(mcp_server.create_task(project_id, "Inspect", "Check the repository", priority=1))
    assert task["project_id"] == project_id
    assert task["status"] == "pending"
    assert json.loads(mcp_server.list_tasks(project_id))[0]["id"] == task["id"]

    run = json.loads(mcp_server.start_task_run(task["id"], "dsh-session-1"))
    assert run["status"] == "queued"
    assert run["session_id"] == "dsh-session-1"
    assert dispatched == [(mcp_server.execute_run, run["id"])]

    with factory() as session:
        saved_run = session.get(TaskRun, run["id"])
        assert saved_run is not None
        assert saved_run.task.status == "waiting"

    assert json.loads(mcp_server.get_task_run(run["id"]))["id"] == run["id"]
    assert json.loads(mcp_server.list_task_runs(task["id"]))[0]["id"] == run["id"]


def test_mcp_rejects_unknown_or_unauthorized_tasks(mcp_db, tmp_path, monkeypatch):
    _, project_id, _ = mcp_db
    monkeypatch.setattr(mcp_server._executor, "submit", lambda *args: pytest.fail("must not dispatch"))
    task = json.loads(mcp_server.create_task(project_id, "Inspect", "Check the repository"))

    with pytest.raises(ValueError, match="Task not found"):
        mcp_server.start_task_run("missing")

    monkeypatch.setenv("ACC_ALLOWED_ROOTS", str(tmp_path / "elsewhere"))
    from acc.config import get_settings
    get_settings.cache_clear()
    with pytest.raises(ValueError, match="authorized"):
        mcp_server.start_task_run(task["id"])
    get_settings.cache_clear()
