import os
import re
import shutil
import signal
import subprocess
from dataclasses import dataclass
from pathlib import Path

import yaml


_SECRET_PATTERN = re.compile(r"(?i)(api[_-]?key|access[_-]?token|secret|password)(\s*[:=]\s*)([^\s,;]+)")


class DshError(RuntimeError):
    pass


class DshTimeout(DshError):
    pass


def _credential_store_api_key(env: dict[str, str]) -> str | None:
    home = Path(env.get("DSH_HOME") or Path.home() / ".dsh")
    path = home / ".credentials.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, yaml.YAMLError):
        raise DshError("Could not read the DSH credential store") from None
    refs = data.get("refs") if isinstance(data, dict) else None
    key = refs.get("DEEPSEEK_API_KEY") if isinstance(refs, dict) else None
    return key.strip() if isinstance(key, str) and key.strip() else None


@dataclass(frozen=True)
class DshResult:
    output: str
    exit_code: int
    session_id: str | None = None


class DshHeadlessAdapter:
    """Adapter for the installed Desktop shim's locally verified headless CLI."""

    def __init__(self, executable: str = "dsh"):
        self.executable = executable

    def command(self, task_text: str, session_id: str | None = None) -> list[str]:
        args = [self.executable, "--profile", "headless", "--json"]
        if session_id:
            args.extend(["--session-id", session_id])
        args.append(task_text)
        return args

    def windows_shim_command(self, session_id: str | None = None) -> str:
        executable = shutil.which(self.executable) or self.executable
        command = [f'"{executable}"', "--profile", "headless", "--json"]
        if session_id:
            command.extend(["--session-id", session_id])
        command.append("-")
        comspec = os.environ.get("ComSpec", "cmd.exe")
        return f'{comspec} /d /s /c "{" ".join(command)}"'

    def run(self, task_text: str, cwd: Path, timeout: int, session_id: str | None = None) -> DshResult:
        if session_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", session_id):
            raise DshError("DSH session ID contains unsupported characters")
        env = os.environ.copy()
        redaction_env = env.copy()
        env.pop("ACC_API_TOKEN", None)
        if not env.get("DEEPSEEK_API_KEY"):
            key = _credential_store_api_key(env)
            if key:
                env["DEEPSEEK_API_KEY"] = key
        redaction_env.update(env)
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        process_options = {"creationflags": creationflags}
        if os.name != "nt":
            process_options["start_new_session"] = True
        executable = shutil.which(self.executable) or self.executable
        is_windows_batch = os.name == "nt" and Path(executable).suffix.lower() in {".cmd", ".bat"}
        args = self.windows_shim_command(session_id) if is_windows_batch else self.command(task_text, session_id)
        try:
            process = subprocess.Popen(
                args, cwd=str(cwd), env=env,
                stdin=subprocess.PIPE if is_windows_batch else subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                encoding="utf-8", errors="replace",
                **process_options,
            )
        except OSError as exc:
            raise DshError(f"Could not start DSH: {exc.__class__.__name__}") from None
        try:
            stdout, stderr = process.communicate(input=task_text if is_windows_batch else None, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            terminate_process_tree(process)
            process.communicate()
            raise DshTimeout(f"DSH exceeded the {timeout}s task timeout") from exc
        output = redact(stdout + ("\n" + stderr if stderr else ""), redaction_env)
        return DshResult(output=output, exit_code=process.returncode, session_id=session_id)


def terminate_process_tree(process: subprocess.Popen) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False)
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def redact(value: str, env: dict[str, str] | None = None) -> str:
    output = value
    for name, secret in (env or os.environ).items():
        if secret and re.search(r"KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL", name, re.I):
            output = output.replace(secret, "[REDACTED]")
    return _SECRET_PATTERN.sub(r"\1\2[REDACTED]", output)
