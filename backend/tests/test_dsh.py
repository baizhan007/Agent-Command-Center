import subprocess

import pytest
import yaml

from acc.dsh import DshError, DshHeadlessAdapter, DshTimeout


def test_headless_command_uses_only_verified_local_flags():
    adapter = DshHeadlessAdapter("dsh.cmd")
    assert adapter.command("inspect repo", "session-1") == [
        "dsh.cmd", "--profile", "headless", "--json", "--session-id", "session-1", "inspect repo",
    ]
    assert adapter.command("task")[-1] == "task"


def test_windows_shim_runs_through_cmd_and_reads_task_from_stdin(monkeypatch, tmp_path):
    adapter = DshHeadlessAdapter("dsh.cmd")
    shim = str(tmp_path / "DSH Desktop" / "dsh.cmd")
    monkeypatch.setattr("acc.dsh.shutil.which", lambda executable: shim)
    captured = {}

    class Process:
        pid = 123
        returncode = 0

        def communicate(self, input=None, timeout=None):
            captured["input"] = input
            captured["timeout"] = timeout
            return '{"type":"text","text":"ok"}', ""

    def fake_popen(args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return Process()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    result = adapter.run("task text with & shell characters", tmp_path, 10, "session-1")

    assert result.exit_code == 0
    assert captured["args"].endswith(f'""{shim}" --profile headless --json --session-id session-1 -"')
    assert captured["input"] == "task text with & shell characters"
    assert captured["kwargs"]["stdin"] == subprocess.PIPE


def test_adapter_rejects_shell_metacharacters_in_session_id(tmp_path):
    with pytest.raises(DshError, match="session ID"):
        DshHeadlessAdapter("dsh.cmd").run("task", tmp_path, 10, "session & whoami")


def test_adapter_returns_success_and_redacts_inherited_credentials(monkeypatch, tmp_path):
    monkeypatch.setenv("PROVIDER_API_KEY", "private-value")
    monkeypatch.setenv("ACC_API_TOKEN", "acc-private")
    captured = {}

    class Process:
        pid = 123
        returncode = 0

        def communicate(self, input=None, timeout=None):
            captured["timeout"] = timeout
            return '{"type":"text","text":"ok private-value"}', ""

    def fake_popen(args, **kwargs):
        captured.update(kwargs)
        return Process()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    result = DshHeadlessAdapter().run("task", tmp_path, 10)
    assert result.exit_code == 0
    assert "[REDACTED]" in result.output
    assert "private-value" not in result.output
    assert "ACC_API_TOKEN" not in captured["env"]
    assert "DSH_PERMISSION_MODE" not in captured["env"]


def test_adapter_decodes_utf8_output_without_windows_locale_errors(monkeypatch, tmp_path):
    captured = {}

    class Process:
        pid = 123
        returncode = 0

        def communicate(self, input=None, timeout=None):
            return '{"type":"text","text":"你好"}', ""

    def fake_popen(args, **kwargs):
        captured.update(kwargs)
        return Process()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    result = DshHeadlessAdapter().run("task", tmp_path, 10)

    assert result.output == '{"type":"text","text":"你好"}'
    assert captured["encoding"] == "utf-8"
    assert captured["errors"] == "replace"


def test_adapter_loads_credential_store_key_for_dsh_and_redacts_output(monkeypatch, tmp_path):
    key = "local-test-key"
    (tmp_path / ".credentials.yaml").write_text(
        yaml.safe_dump({"refs": {"DEEPSEEK_API_KEY": key}}), encoding="utf-8",
    )
    monkeypatch.setenv("DSH_HOME", str(tmp_path))
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    captured = {}

    class Process:
        pid = 123
        returncode = 0

        def communicate(self, input=None, timeout=None):
            return f'{{"type":"text","text":"{key}"}}', ""

    def fake_popen(args, **kwargs):
        captured.update(kwargs)
        return Process()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    result = DshHeadlessAdapter().run("task", tmp_path, 10)

    assert captured["env"]["DEEPSEEK_API_KEY"] == key
    assert key not in result.output
    assert "[REDACTED]" in result.output


def test_adapter_environment_key_overrides_credential_store(monkeypatch, tmp_path):
    (tmp_path / ".credentials.yaml").write_text(
        yaml.safe_dump({"refs": {"DEEPSEEK_API_KEY": "stored-key"}}), encoding="utf-8",
    )
    monkeypatch.setenv("DSH_HOME", str(tmp_path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "environment-key")
    captured = {}

    class Process:
        pid = 123
        returncode = 0

        def communicate(self, input=None, timeout=None):
            return "ok", ""

    monkeypatch.setattr(subprocess, "Popen", lambda args, **kwargs: (captured.update(kwargs) or Process()))
    DshHeadlessAdapter().run("task", tmp_path, 10)

    assert captured["env"]["DEEPSEEK_API_KEY"] == "environment-key"


def test_adapter_preserves_failure_exit_code(monkeypatch, tmp_path):
    class Process:
        pid = 123
        returncode = 7

        def communicate(self, input=None, timeout=None):
            return "failed", ""

    monkeypatch.setattr(subprocess, "Popen", lambda args, **kwargs: Process())
    result = DshHeadlessAdapter().run("task", tmp_path, 10)
    assert result.exit_code == 7


def test_adapter_converts_timeout(monkeypatch, tmp_path):
    class Process:
        pid = 123
        returncode = -9
        calls = 0

        def communicate(self, input=None, timeout=None):
            self.calls += 1
            if self.calls == 1:
                raise subprocess.TimeoutExpired("dsh", timeout)
            return "", ""

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: Process())
    terminated = []
    monkeypatch.setattr("acc.dsh.terminate_process_tree", lambda process: terminated.append(process.pid))
    with pytest.raises(DshTimeout):
        DshHeadlessAdapter().run("task", tmp_path, 1)
    assert terminated == [123]
