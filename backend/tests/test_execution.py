from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import acc.execution as execution
from acc.database import Base
from acc.models import Project, Task, TaskRun


def test_worker_persists_result_and_recovers_adapter_failure(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(execution, "SessionLocal", factory)
    monkeypatch.setenv("ACC_ALLOWED_ROOTS", str(tmp_path))
    monkeypatch.setenv("ACC_DATA_DIR", str(tmp_path / "data"))
    from acc.config import get_settings
    get_settings.cache_clear()
    repo = tmp_path / "repo"
    repo.mkdir()
    with factory() as session:
        project = Project(name="Repo", path=str(repo))
        task = Task(project=project, title="Inspect", description="details")
        run = TaskRun(task=task)
        session.add(run)
        session.commit()
        run_id = run.id

    monkeypatch.setattr(execution.DshHeadlessAdapter, "run", lambda *args, **kwargs: type("Result", (), {"output": "actual adapter output", "exit_code": 0})())
    execution.execute_run(run_id)
    with factory() as session:
        run = session.get(TaskRun, run_id)
        task = session.get(Task, run.task_id)
        assert run.status == "completed"
        assert run.result == "actual adapter output"
        assert run.log_path and (tmp_path / "data" / "runs" / f"{run_id}.log").exists()
        assert task.status == "completed"

    run2 = TaskRun(task_id=task.id)
    with factory() as session:
        session.add(run2)
        session.commit()
        run2_id = run2.id
    monkeypatch.setattr(execution.DshHeadlessAdapter, "run", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("adapter crashed")))
    execution.execute_run(run2_id)
    with factory() as session:
        recovered = session.get(TaskRun, run2_id)
        assert recovered.status == "failed"
        assert recovered.error == "adapter crashed"

    run3 = TaskRun(task_id=task.id)
    with factory() as session:
        session.add(run3)
        session.commit()
        run3_id = run3.id
    monkeypatch.setattr(execution.DshHeadlessAdapter, "run", lambda *args, **kwargs: type("Result", (), {"output": "ran without filesystem acknowledgement", "exit_code": 0})())
    execution.execute_run(run3_id)
    with factory() as session:
        dispatched = session.get(TaskRun, run3_id)
        assert dispatched.status == "completed"
        assert dispatched.result == "ran without filesystem acknowledgement"
    get_settings.cache_clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_worker_accepts_acc_created_project_outside_allowed_roots(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(execution, "SessionLocal", factory)
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / ".git").mkdir()
    monkeypatch.setenv("ACC_ALLOWED_ROOTS", str(allowed))
    monkeypatch.setenv("ACC_DATA_DIR", str(tmp_path / "data"))
    from acc.config import get_settings
    get_settings.cache_clear()
    with factory() as session:
        project = Project(name="Repo", path=str(outside), created_outside_roots=True)
        task = Task(project=project, title="Inspect", description="details")
        run = TaskRun(task=task)
        session.add(run)
        session.commit()
        run_id = run.id

    monkeypatch.setattr(execution.DshHeadlessAdapter, "run", lambda *args, **kwargs: type("Result", (), {"output": "ran outside configured roots", "exit_code": 0})())
    execution.execute_run(run_id)
    with factory() as session:
        run = session.get(TaskRun, run_id)
        assert run.status == "completed"
        assert run.result == "ran outside configured roots"
        assert run.log_path and (tmp_path / "data" / "runs" / f"{run_id}.log").exists()

    get_settings.cache_clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
