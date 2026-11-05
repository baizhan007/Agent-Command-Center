# Agent Command Center (ACC)

ACC is a local project and task control plane. The FastAPI API persists projects, tasks, and DSH run records in SQLite; the React console shows repository state, task status, and service health.

## Requirements

- Windows 11 and PowerShell
- Python 3.11+
- Node.js 20.19+, 22.12+, or 24+ for Vite; installed Node 22.12.0 is compatible
- Git for Windows

## Install and run

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
# Set ACC_ALLOWED_ROOTS to trusted parent directories. install.ps1 generates ACC_API_TOKEN.
notepad .env
.\start.ps1
```

Open <http://127.0.0.1:5173>. Stop both local services with `.\stop.ps1`. API health is available at `http://127.0.0.1:8765/api/health`.

## Desktop application

The Windows desktop app runs the ACC API locally and opens the console in its own window. Install dependencies with `.\install.ps1`, then build the portable desktop package with `.\build-desktop.ps1`. The ZIP is written to `frontend\release`; extract it and run `Agent Command Center.exe`. For desktop development, run `npm run desktop:dev` from `frontend` after `.\install.ps1`. The desktop app keeps its database, token, and settings under the current user's application data directory. In Projects, choose either to register an existing Git repository beneath an authorized root or create a new local repository anywhere the current Windows user can write. Missing parent folders are created automatically, and the target folder must be new. New repositories are initialized with `git init`; ACC does not publish them to GitHub.

The console language can be switched between English and Chinese from the top-right selector. The choice is saved on the device.

In Tasks, use the run-history icon on a task row to inspect DSH status, session ID, exit code, output, and errors. The open run-history view refreshes while the task is running.

`ACC_ALLOWED_ROOTS` limits registration of existing repositories. A repository created by ACC outside those roots is explicitly marked in ACC's database so tasks can run in that selected repository. This does not sandbox DSH: it runs with the current Windows user's permissions. Project removal deletes only its ACC record and associated task records; it does not delete repository files. The web app stores the configured API token in session storage for the current browser tab; enter the token from `.env` under Settings.

## DSH execution

Phase 2 invokes the installed shim with the locally verified command form: `dsh --profile headless --json [--session-id ID] TASK`. Before dispatch, ACC verifies the project path is still valid and either within `ACC_ALLOWED_ROOTS` or explicitly created outside those roots by ACC. Run history and redacted output are stored beneath `ACC_DATA_DIR/runs` and in SQLite. `ACC_TASK_TIMEOUT_SECONDS` controls the process timeout; timed out DSH process trees are terminated.

Direct DSH execution runs with the current Windows user's permissions; `ACC_ALLOWED_ROOTS` constrains which project directory ACC accepts but does not sandbox DSH filesystem access. The installed DSH Desktop shim `0.2.1-rc.5` has partial Windows ACL enforcement, so DSH may read files outside the selected project. DSH's effective permissions come from its own configuration and environment. Provider credentials must be supplied to DSH through environment variables or its secure credential store; ACC does not accept credentials through the API or UI, does not copy `ACC_API_TOKEN` to DSH, and redacts credentials from output before persistence.

For the Headless API-key route, the adapter uses `DEEPSEEK_API_KEY` from the process environment when set, otherwise it reads that reference from DSH's local `.credentials.yaml` and passes it only to the DSH child process. The active Headless provider and model are configured in DSH's `profiles/headless/cordis.patch.yml`.

## Manage ACC tasks from Codex

ACC includes a local stdio MCP server exposing project, task, and run-management tools. Register it once from PowerShell after `.\install.ps1`:

```powershell
codex mcp add acc-dsh --env PYTHONPATH=D:\AI\Agent-Command-Center\backend -- "D:\AI\Agent-Command-Center\backend\.venv\Scripts\python.exe" -m acc.mcp_server
codex mcp list
```

The tools are `acc_list_projects`, `acc_list_tasks`, `acc_create_task`, `acc_start_task_run`, `acc_get_task_run`, and `acc_list_task_runs`. They use the same SQLite records and DSH execution path as the ACC API, so runs started by Codex appear in the desktop and web console. Restart Codex after adding or changing the MCP server so its tool list refreshes. DSH still runs with the current Windows user's permissions; `ACC_ALLOWED_ROOTS` restricts accepted project paths but is not a filesystem sandbox. Do not send Provider API keys as task text; configure them in the DSH environment or secure credential store.

Dashboard token and cost metrics remain unknown rather than simulated. Worktrees, cancellation, streaming, usage, and cost accounting are not implemented.

## Development

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
cd ..\frontend
npm run build
```

Architecture and next-phase boundaries: [docs/architecture.md](docs/architecture.md). Environment setup and troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md).
