from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from acc.config import get_settings
from acc.main import upgrade_database


def test_initial_migration_creates_project_and_task_tables(tmp_path, monkeypatch):
    monkeypatch.setenv("ACC_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    try:
        config = Config("alembic.ini")
        command.upgrade(config, "head")
        engine = create_engine(get_settings().database_url)
        assert set(inspect(engine).get_table_names()) == {"alembic_version", "projects", "tasks", "task_runs"}
        engine.dispose()
    finally:
        get_settings.cache_clear()


def test_legacy_unversioned_database_is_adopted_without_losing_records(tmp_path, monkeypatch):
    monkeypatch.setenv("ACC_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    engine = create_engine(get_settings().database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE projects (
                    id VARCHAR(32) PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    created_at DATETIME NOT NULL
                )
            """))
            connection.execute(text("""
                CREATE TABLE tasks (
                    id VARCHAR(32) PRIMARY KEY,
                    project_id VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    title VARCHAR(160) NOT NULL,
                    description TEXT NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    priority INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """))
            connection.execute(text(
                "INSERT INTO projects (id, name, path, created_at) VALUES ('project-1', 'Legacy', 'C:/legacy', '2026-01-01')"
            ))
            connection.execute(text(
                "INSERT INTO tasks (id, project_id, title, description, status, priority, created_at, updated_at) "
                "VALUES ('task-1', 'project-1', 'Keep me', 'Legacy task', 'pending', 2, '2026-01-01', '2026-01-01')"
            ))

        config = Config("alembic.ini")
        upgrade_database(config)

        inspector = inspect(engine)
        assert {"alembic_version", "projects", "tasks", "task_runs"}.issubset(inspector.get_table_names())
        assert "created_outside_roots" in {column["name"] for column in inspector.get_columns("projects")}
        task_columns = {column["name"] for column in inspector.get_columns("tasks")}
        assert {"agent", "parent_task_id"}.issubset(task_columns)
        with engine.connect() as connection:
            assert connection.execute(text("SELECT name FROM projects WHERE id='project-1'")).scalar_one() == "Legacy"
            assert connection.execute(text("SELECT title FROM tasks WHERE id='task-1'")).scalar_one() == "Keep me"
            assert connection.execute(text("SELECT created_outside_roots FROM projects WHERE id='project-1'")).scalar_one() == 0
            assert connection.execute(text("SELECT agent FROM tasks WHERE id='task-1'")).scalar_one() == "dsh"
    finally:
        engine.dispose()
        get_settings.cache_clear()
