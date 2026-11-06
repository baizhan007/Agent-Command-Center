import subprocess

import acc.main as acc_main
from acc.models import Project


def auth():
    return {"Authorization": "Bearer test-token"}


def test_health_and_auth_boundary(client):
    web, _ = client
    assert web.get("/api/health").json()["phase"] == 2
    assert web.get("/api/projects").status_code == 401
    assert web.get("/api/projects", headers=auth()).json() == []


def test_agent_catalog_and_preferences_are_local_and_persisted(client, monkeypatch):
    web, _ = client
    monkeypatch.setattr(acc_main, "codex_models", lambda: [{"id": "model-a", "name": "Model A"}])
    monkeypatch.setattr(acc_main, "dsh_profiles", lambda: [{"id": "headless", "provider": "pixel", "model": "flash"}])
    catalog = web.get("/api/agents", headers=auth())
    assert catalog.status_code == 200
    assert catalog.json()["codex"]["models"] == [{"id": "model-a", "name": "Model A"}]
    saved = web.patch("/api/agents/settings", headers=auth(), json={"codex_model": "model-a", "dsh_profile": "headless"})
    assert saved.status_code == 200
    assert saved.json()["settings"] == {"codex_model": "model-a", "dsh_profile": "headless"}
    assert web.get("/api/agents", headers=auth()).json()["settings"] == saved.json()["settings"]
    assert web.patch("/api/agents/settings", headers=auth(), json={"dsh_profile": "missing"}).status_code == 422
    cleared = web.patch("/api/agents/settings", headers=auth(), json={"dsh_profile": None})
    assert cleared.json()["settings"]["dsh_profile"] is None


def test_codex_start_uses_registered_workspace_and_selected_model(client, monkeypatch):
    web, root = client
    repo = root / "codex-start"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    project = web.post("/api/projects", headers=auth(), json={"name": "Codex", "path": str(repo)}).json()
    monkeypatch.setattr(acc_main, "load_agent_settings", lambda: {"codex_model": "model-a", "dsh_profile": None})
    launched = []
    monkeypatch.setattr(acc_main, "start_codex", lambda workspace, model: launched.append((workspace, model)) or {"status": "running", "pid": 123})

    response = web.post("/api/agents/codex/start", headers=auth(), json={"workspace_id": project["id"]})
    assert response.status_code == 200
    assert launched == [(repo.resolve(), "model-a")]
    assert web.post("/api/agents/codex/start", headers=auth(), json={"workspace_id": "missing"}).status_code == 404


def test_codex_launcher_passes_selected_model_and_workspace(tmp_path, monkeypatch):
    from acc import agents
    from types import SimpleNamespace

    monkeypatch.setattr(agents, "sys", SimpleNamespace(platform="darwin"))
    monkeypatch.setattr(agents, "_codex_binary", lambda: "codex.exe")
    monkeypatch.setattr(agents, "codex_models", lambda: [{"id": "model-a", "name": "Model A"}])
    monkeypatch.setattr(agents, "_codex_process", None)
    monkeypatch.setattr(agents, "_codex_launch", {"status": "stopped", "pid": None, "workspace": None, "started_at": None})
    captured = {}

    class Process:
        pid = 456

        def poll(self):
            return None

    monkeypatch.setattr(subprocess, "Popen", lambda args, **kwargs: (captured.update(args=args, kwargs=kwargs) or Process()))
    result = agents.start_codex(tmp_path, "model-a")

    assert captured["args"] == ["codex.exe", "app", "-c", 'model="model-a"', str(tmp_path)]
    assert captured["kwargs"]["cwd"] == str(tmp_path)
    assert result["pid"] == 456
    assert result["status"] == "running"


def test_codex_status_distinguishes_external_processes_from_acc_launcher(monkeypatch):
    from acc import agents

    monkeypatch.setattr(agents, "_codex_process", None)
    monkeypatch.setattr(agents, "_codex_launch", {"status": "stopped", "pid": None, "workspace": None, "started_at": None})
    monkeypatch.setattr(agents, "_codex_process_count", lambda: 2)
    monkeypatch.setattr(agents, "_codex_binary", lambda: "codex.exe")
    monkeypatch.setattr(agents, "_codex_installed", lambda: True)

    status = agents.codex_status()
    assert status["status"] == "detected"
    assert status["process_count"] == 2
    assert status["owned_by_acc"] is False


def test_project_and_task_lifecycle(client):
    web, root = client
    repo = root / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)

    created = web.post("/api/projects", headers=auth(), json={"name": "Network tool", "path": str(repo)})
    assert created.status_code == 201, created.text
    project = created.json()
    assert project["branch"]
    assert project["git_dirty"] is False

    task_response = web.post("/api/tasks", headers=auth(), json={
        "project_id": project["id"], "title": "Detect interfaces", "description": "List network interfaces", "priority": 1,
    })
    assert task_response.status_code == 201, task_response.text
    task = task_response.json()
    assert task["status"] == "pending"
    assert task["agent"] == "dsh"
    assert task["parent_task_id"] is None
    assert task["project_name"] == "Network tool"
    assert web.get("/api/dashboard", headers=auth()).json()["waiting_tasks"] == 1
    assert len(web.get("/api/tasks?project_id=" + project["id"], headers=auth()).json()) == 1
    assert web.delete("/api/tasks/" + task["id"], headers=auth()).status_code == 204


def test_api_persists_agent_hierarchy(client):
    web, root = client
    repo = root / "agent-tree"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    project = web.post("/api/projects", headers=auth(), json={"name": "Agent tree", "path": str(repo)}).json()
    mission = web.post("/api/tasks", headers=auth(), json={
        "project_id": project["id"], "title": "Build feature", "description": "Coordinate implementation", "agent": "codex",
    }).json()
    child_response = web.post("/api/tasks", headers=auth(), json={
        "project_id": project["id"], "title": "Inspect API", "description": "Review endpoints",
        "agent": "dsh", "parent_task_id": mission["id"],
    })

    assert child_response.status_code == 201, child_response.text
    child = child_response.json()
    assert child["agent"] == "dsh"
    assert child["parent_task_id"] == mission["id"]


def test_new_project_creates_and_registers_local_git_repository(client):
    web, root = client
    repo = root / "new-project"
    response = web.post("/api/projects", headers=auth(), json={
        "name": "New project", "path": str(repo), "create_repository": True,
    })

    assert response.status_code == 201, response.text
    assert (repo / ".git").is_dir()
    project = response.json()
    assert project["path"] == str(repo)
    assert project["branch"]
    assert project["git_dirty"] is False


def test_new_project_rejects_existing_folder_without_modifying_it(client):
    web, root = client
    project_dir = root / "existing-folder"
    project_dir.mkdir()
    marker = project_dir / "keep.txt"
    marker.write_text("keep", encoding="utf-8")

    response = web.post("/api/projects", headers=auth(), json={
        "name": "Existing folder", "path": str(project_dir), "create_repository": True,
    })

    assert response.status_code == 409
    assert marker.read_text(encoding="utf-8") == "keep"
    assert not (project_dir / ".git").exists()


def test_new_project_creates_and_registers_repository_outside_allowed_root(client, monkeypatch):
    web, root = client
    outside = root.parent / "new-parent" / "nested" / "outside-new-project"
    response = web.post("/api/projects", headers=auth(), json={
        "name": "Outside", "path": str(outside), "create_repository": True,
    })

    assert response.status_code == 201, response.text
    assert (outside / ".git").is_dir()
    project = response.json()
    task = web.post("/api/tasks", headers=auth(), json={
        "project_id": project["id"], "title": "Check outside project", "description": "Run in the new repository",
    }).json()
    dispatched = []
    monkeypatch.setattr(acc_main, "execute_run", lambda run_id: dispatched.append(run_id))
    run = web.post(f"/api/tasks/{task['id']}/runs", headers=auth())
    assert run.status_code == 202, run.text
    assert dispatched == [run.json()["id"]]


def test_new_project_removes_new_folder_if_git_initialization_fails(client, monkeypatch):
    web, root = client
    project_dir = root / "failed-init"

    monkeypatch.setattr(acc_main.subprocess, "run", lambda *args, **kwargs: (_ for _ in ()).throw(FileNotFoundError()))
    response = web.post("/api/projects", headers=auth(), json={
        "name": "Failed init", "path": str(project_dir), "create_repository": True,
    })

    assert response.status_code == 400
    assert "Git for Windows" in response.json()["detail"]
    assert not project_dir.exists()


def test_project_path_must_be_authorized(client, tmp_path):
    web, _ = client
    outside = tmp_path.parent / "outside-repo"
    outside.mkdir(exist_ok=True)
    subprocess.run(["git", "init", str(outside)], check=True, capture_output=True)
    response = web.post("/api/projects", headers=auth(), json={"name": "Outside", "path": str(outside)})
    assert response.status_code == 403


def test_nonexistent_project_path_is_rejected(client, tmp_path):
    web, root = client
    response = web.post("/api/projects", headers=auth(), json={"name": "Missing", "path": str(root / "missing")})
    assert response.status_code == 400


def test_missing_project_is_rejected(client):
    web, _ = client
    response = web.post("/api/tasks", headers=auth(), json={
        "project_id": "missing", "title": "Task", "description": "Do something",
    })
    assert response.status_code == 404


def test_run_can_be_queued_without_filesystem_acknowledgement(client, monkeypatch):
    web, root = client
    repo = root / "repo-run"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    project = web.post("/api/projects", headers=auth(), json={"name": "Runnable", "path": str(repo)}).json()
    task = web.post("/api/tasks", headers=auth(), json={
        "project_id": project["id"], "title": "Check", "description": "Check safely",
    }).json()

    dispatched = []
    monkeypatch.setattr(acc_main, "execute_run", lambda run_id: dispatched.append(run_id))
    queued = web.post(f"/api/tasks/{task['id']}/runs", headers=auth())
    assert queued.status_code == 202
    assert dispatched == [queued.json()["id"]]
