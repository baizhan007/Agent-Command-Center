import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import acc.main as acc_main
from acc.database import Base, get_session
from acc.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(acc_main.command, "upgrade", lambda *args: None)

    monkeypatch.setenv("ACC_ALLOWED_ROOTS", str(tmp_path))
    monkeypatch.setenv("ACC_API_TOKEN", "test-token")
    from acc.config import get_settings
    get_settings.cache_clear()

    def override_session():
        with TestingSession() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client, tmp_path
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
    get_settings.cache_clear()
