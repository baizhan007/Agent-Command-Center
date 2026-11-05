# Troubleshooting

**The dashboard shows API disconnected.** Confirm `.env` exists and `.\start.ps1` started both local processes. Check `http://127.0.0.1:8765/api/health`; port 8765 must be free.

**Registering an existing repository returns 403.** Its resolved absolute path must be beneath one of the comma-separated directories in `ACC_ALLOWED_ROOTS`. Creating a new repository in ACC does not require that root restriction. Restart ACC after editing `.env`.

**Creating a new repository fails.** ACC creates missing parent folders automatically. The final target directory must not exist, and the current Windows user must have write permission at the chosen location. Existing repositories must already contain `.git` and be beneath an authorized root.

**API requests return 401.** Enter the configured `ACC_API_TOKEN` in Settings. The browser keeps it in the current tab's session storage.

**A DSH task can access files beyond its selected project.** DSH runs with the current Windows user's permissions. `ACC_ALLOWED_ROOTS` restricts the project paths accepted by ACC, but does not sandbox DSH reads or writes. Check DSH's own effective permission configuration before dispatching work. The Windows `workspace-write` ACL mode on shim `0.2.1-rc.5` does not confine reads.

**Codex does not show ACC project or task tools.** Run `codex mcp list` and confirm `acc-dsh` is configured. Register it with the command in README.md, then restart Codex to refresh its tools. Check that the backend virtual environment has been installed, ACC has initialized its database, and the selected Git project is registered in ACC.

**A task run returns 403.** The registered project's current resolved path must still be beneath `ACC_ALLOWED_ROOTS`; update the allowed roots or re-register the project under an authorized directory.

**Inspect a task run.** Use `GET /api/tasks/{task_id}/runs` or `GET /api/runs/{run_id}` with the ACC bearer token. Redacted logs are written to `ACC_DATA_DIR/runs`.

**Frontend dependency install fails.** Run `node --version` and `npm --version`; ACC uses the checked-in npm lock file and Vite 6 on Node 20+. Delete only `frontend/node_modules` if a local package install is corrupted, then rerun `npm ci`.

**Stop reports the service still responds.** Inspect `.acc-runtime/pids.json` and stop only the listed process IDs; a process may have been restarted outside the ACC launcher.
