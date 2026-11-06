export type Project = {
  id: string
  name: string
  path: string
  task_count: number
  branch: string | null
  git_dirty: boolean | null
}
export type Task = {
  id: string
  project_id: string
  project_name: string
  title: string
  description: string
  status: string
  priority: number
  agent: 'codex' | 'dsh'
  parent_task_id: string | null
  created_at: string
}
export type TaskRun = {
  id: string
  task_id: string
  status: string
  session_id: string | null
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  result: string | null
  error: string | null
  log_path: string | null
}
export type Page = 'Overview' | 'Projects' | 'Tasks' | 'Settings'
export type Language = 'en' | 'zh'
export type AgentInfo = {
  settings: { codex_model: string | null; dsh_profile: string | null }
  codex: {
    status: string
    pid: number | null
    process_count: number
    owned_by_acc: boolean
    workspace: string | null
    started_at: string | null
    installed: boolean
    models: { id: string; name: string }[]
  }
  dsh: {
    status: string
    installed: boolean
    running_tasks: number
    profiles: { id: string; provider: string; model: string }[]
  }
}

export const statusLabel: Record<string, string> = {
  pending: 'Pending',
  waiting: 'Waiting',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
