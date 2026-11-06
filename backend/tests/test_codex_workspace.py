"""Workspace handoff is an OS open request, never a new owned desktop process."""

from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest

from acc import agents


@pytest.fixture
def desktop(monkeypatch):
    monkeypatch.setattr(agents, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(agents, "_codex_process", None)
    monkeypatch.setattr(agents, "_codex_launch", {"status": "stopped", "pid": None, "workspace": None, "started_at": None})
    monkeypatch.setattr(agents, "_codex_installed", lambda: True)
    monkeypatch.setattr(agents, "_codex_binary", lambda: None)
    monkeypatch.setattr(agents, "_codex_process_count", lambda: 2)
    opened = []
    monkeypatch.setattr(agents.os, "startfile", opened.append, raising=False)
    return opened


def test_windows_handoff_encodes_the_registered_directory_without_cli(tmp_path, desktop):
    workspace = tmp_path / "项目 space & # + %"
    workspace.mkdir()
    result = agents.start_codex(workspace, "saved-model")
    uri = urlsplit(desktop[0])
    assert (uri.scheme, uri.netloc, uri.path, uri.fragment) == ("codex", "threads", "/new", "")
    assert parse_qs(uri.query) == {"path": [str(workspace.resolve())]}
    assert result["status"] == "launched"
    assert result["workspace"] == str(workspace.resolve())
    assert result["pid"] is None
    assert result["owned_by_acc"] is False


def test_switching_again_always_hands_off_the_new_directory(tmp_path, desktop):
    second = tmp_path / "second"
    second.mkdir()
    agents.start_codex(tmp_path, None)
    agents.start_codex(second, None)
    agents.start_codex(second, None)  # A deliberate retry must reach the app too.
    assert len(desktop) == 3
    assert parse_qs(urlsplit(desktop[-1]).query)["path"] == [str(second.resolve())]
    assert agents.codex_status()["workspace"] == str(second.resolve())
    assert agents.codex_status()["owned_by_acc"] is False


def test_missing_protocol_reports_failure_and_preserves_last_success(tmp_path, desktop, monkeypatch):
    agents.start_codex(tmp_path, None)
    before = dict(agents._codex_launch)

    def fail(_uri):
        raise OSError("No association")

    monkeypatch.setattr(agents.os, "startfile", fail)
    with pytest.raises(RuntimeError, match="protocol registration"):
        agents.start_codex(tmp_path, None)
    assert agents._codex_launch == before


def test_missing_directory_never_launches(tmp_path, desktop):
    with pytest.raises(ValueError, match="no longer available"):
        agents.start_codex(tmp_path / "removed", None)
    assert desktop == []


def test_stop_after_handoff_does_not_terminate_external_codex(tmp_path, desktop, monkeypatch):
    agents.start_codex(tmp_path, None)
    monkeypatch.setattr(agents.subprocess, "Popen", lambda *a, **kw: pytest.fail("External Codex must not be killed"))
    agents.stop_codex()
    assert agents.codex_status()["status"] == "detected"


def test_handoff_api_requires_auth_and_surfaces_launch_errors(client, monkeypatch):
    web, root = client
    repo = root / "workspace"
    repo.mkdir()
    import subprocess
    import acc.main as main
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    headers = {"Authorization": "Bearer test-token"}
    project = web.post("/api/projects", headers=headers, json={"name": "Workspace", "path": str(repo)}).json()
    payload = {"workspace_id": project["id"]}
    assert web.post("/api/agents/codex/start", json=payload).status_code == 401

    def fail(*_args):
        raise RuntimeError("Protocol unavailable")

    monkeypatch.setattr(main, "start_codex", fail)
    response = web.post("/api/agents/codex/start", headers=headers, json=payload)
    assert response.status_code == 503
    assert response.json()["detail"] == "Protocol unavailable"
    monkeypatch.setattr(main, "is_authorized_project", lambda *args: False)
    assert web.post("/api/agents/codex/start", headers=headers, json=payload).status_code == 403
