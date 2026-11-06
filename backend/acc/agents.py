"""Local discovery and lifecycle controls for Codex and DSH."""

from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import threading
import csv
import sys
import time
from urllib.parse import urlencode
from functools import lru_cache
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .config import get_settings


_lock = threading.Lock()
_codex_process: subprocess.Popen | None = None
_codex_launch: dict[str, Any] = {"status": "stopped", "pid": None, "workspace": None, "started_at": None}
_PROFILE_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_UNSET = object()
_desktop_cache: tuple[float, bool] = (0, False)


def _windows_codex_available() -> bool:
    """Discover Store and conventional protocol registrations without launching Codex."""
    global _desktop_cache
    if time.monotonic() - _desktop_cache[0] < 30:
        return _desktop_cache[1]
    available = False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"codex\shell\open\command"):
            available = True
    except (ImportError, OSError):
        pass
    if not available:
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                 "Get-AppxPackage -Name OpenAI.Codex | Select-Object -ExpandProperty InstallLocation"],
                capture_output=True, text=True, timeout=5, check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            available = result.returncode == 0 and bool(result.stdout.strip())
        except (OSError, subprocess.SubprocessError):
            pass
    _desktop_cache = (time.monotonic(), available)
    return available


def _codex_installed() -> bool:
    return _windows_codex_available() if sys.platform == "win32" else _codex_binary() is not None


def _settings_path() -> Path:
    return get_settings().data_dir / "agent-settings.json"


def load_agent_settings() -> dict[str, str | None]:
    try:
        value = json.loads(_settings_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        value = {}
    return {
        "codex_model": value.get("codex_model") if isinstance(value.get("codex_model"), str) else None,
        "dsh_profile": value.get("dsh_profile") if isinstance(value.get("dsh_profile"), str) else None,
    }


def save_agent_settings(*, codex_model: str | None | object = _UNSET, dsh_profile: str | None | object = _UNSET) -> dict[str, str | None]:
    current = load_agent_settings()
    if codex_model is not _UNSET:
        current["codex_model"] = codex_model
    if dsh_profile is not _UNSET:
        current["dsh_profile"] = dsh_profile
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(current, indent=2), encoding="utf-8")
    os.replace(temporary, path)
    return current


def _codex_binary() -> str | None:
    return shutil.which("codex")


def _read_app_server_response(lines: queue.Queue[str | None], request_id: int, timeout: float) -> dict[str, Any] | None:
    deadline = datetime.now(timezone.utc).timestamp() + timeout
    while datetime.now(timezone.utc).timestamp() < deadline:
        try:
            line = lines.get(timeout=max(0.01, deadline - datetime.now(timezone.utc).timestamp()))
        except queue.Empty:
            return None
        if line is None:
            return None
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("id") == request_id:
            result = message.get("result")
            return result if isinstance(result, dict) else None
    return None


@lru_cache(maxsize=1)
def codex_models() -> list[dict[str, str]]:
    executable = _codex_binary()
    if not executable:
        return []
    process = None
    try:
        process = subprocess.Popen(
            [executable, "app-server", "--stdio"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        lines: queue.Queue[str | None] = queue.Queue()

        def read_stdout() -> None:
            for line in process.stdout or []:
                lines.put(line)
            lines.put(None)

        threading.Thread(target=read_stdout, daemon=True).start()
        process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "clientInfo": {"name": "agent_command_center", "version": "0.1.0"},
        }}) + "\n")
        process.stdin.flush()
        if _read_app_server_response(lines, 1, 8) is None:
            return []
        process.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "initialized", "params": {}}) + "\n")
        process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "model/list", "params": {}}) + "\n")
        process.stdin.flush()
        result = _read_app_server_response(lines, 2, 8)
        if result is None:
            return []
        models = result.get("data", result.get("models", []))
        if not isinstance(models, list):
            return []
        return [
            {"id": item["id"], "name": item.get("displayName") or item.get("name") or item["id"]}
            for item in models
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        ]
    except (OSError, BrokenPipeError, subprocess.SubprocessError, ValueError):
        return []
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass


def _find_provider_model(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, dict):
        config = value.get("config")
        if isinstance(config, dict) and ("provider" in config or "model" in config):
            provider, model = config.get("provider"), config.get("model")
            return (provider if isinstance(provider, str) else None, model if isinstance(model, str) else None)
        for nested in value.values():
            provider, model = _find_provider_model(nested)
            if provider or model:
                return provider, model
    elif isinstance(value, list):
        for nested in value:
            provider, model = _find_provider_model(nested)
            if provider or model:
                return provider, model
    return None, None


def dsh_profiles() -> list[dict[str, str]]:
    home = Path(os.environ.get("DSH_HOME") or Path.home() / ".dsh")
    profiles = home / "profiles"
    items = []
    if not profiles.is_dir():
        return items
    for folder in sorted(profiles.iterdir()):
        if not folder.is_dir() or not _PROFILE_NAME.fullmatch(folder.name):
            continue
        config_path = folder / "cordis.patch.yml"
        try:
            config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            continue
        provider, model = _find_provider_model(config)
        if provider or model:
            items.append({"id": folder.name, "provider": provider or "Unknown", "model": model or "Configured"})
    return items


def _codex_process_count() -> int:
    if os.name != "nt":
        return 0
    try:
        result = subprocess.run(
            ["tasklist.exe", "/FI", "IMAGENAME eq codex.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=3, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return 0
    try:
        return sum(1 for row in csv.reader(result.stdout.splitlines()) if row and row[0].casefold() == "codex.exe")
    except csv.Error:
        return 0


def codex_status() -> dict[str, Any]:
    with _lock:
        process = _codex_process
        launch = dict(_codex_launch)
        launch["process_count"] = _codex_process_count()
        if process is not None and process.poll() is None:
            launch["status"] = "running"
            launch["owned_by_acc"] = True
        elif launch["status"] == "running":
            launch["status"] = "detected" if launch["process_count"] else "launched"
            launch["owned_by_acc"] = False
            _codex_launch["status"] = "launched"
        elif launch["process_count"]:
            launch["status"] = "detected"
            launch["owned_by_acc"] = False
        else:
            launch["status"] = "launched" if launch["status"] == "launched" else "stopped"
            launch["owned_by_acc"] = False
        launch["installed"] = _codex_installed()
        return launch


def start_codex(workspace: Path, model: str | None) -> dict[str, Any]:
    global _codex_process, _codex_launch
    workspace = workspace.resolve()
    if not workspace.is_dir():
        raise ValueError("Workspace folder is no longer available")
    if sys.platform == "win32":
        # The desktop route prepares a local project draft; it does not send a prompt,
        # restart the app, or change the model of an existing conversation.
        uri = "codex://threads/new?" + urlencode({"path": str(workspace)})
        with _lock:
            try:
                os.startfile(uri)
            except OSError:
                raise RuntimeError("Could not open the Codex desktop app. Install Codex and check its codex:// protocol registration, then retry.") from None
            _codex_launch = {"status": "launched", "pid": None, "workspace": str(workspace),
                             "started_at": datetime.now(timezone.utc).isoformat(), "installed": True,
                             "owned_by_acc": False, "open_method": "desktop_protocol"}
            return dict(_codex_launch)
    executable = _codex_binary()
    if not executable:
        raise RuntimeError("Codex CLI was not found on PATH")
    if model and model not in {item["id"] for item in codex_models()}:
        raise ValueError("Selected Codex model is not available in the local model catalog")
    args = [executable, "app"]
    if model:
        args.extend(["-c", f'model="{model}"'])
    args.append(str(workspace))
    with _lock:
        try:
            process = subprocess.Popen(args, cwd=str(workspace), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        except OSError as exc:
            raise RuntimeError(f"Could not launch Codex ({exc.__class__.__name__})") from None
        _codex_process = process
        _codex_launch = {"status": "running" if process.poll() is None else "launched", "pid": process.pid,
                         "workspace": str(workspace), "started_at": datetime.now(timezone.utc).isoformat(),
                         "installed": True}
        return dict(_codex_launch)


def stop_codex() -> dict[str, Any]:
    global _codex_process, _codex_launch
    with _lock:
        process = _codex_process
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        _codex_process = None
        _codex_launch = {"status": "stopped", "pid": None, "workspace": None, "started_at": None,
                         "installed": _codex_installed()}
        return dict(_codex_launch)
