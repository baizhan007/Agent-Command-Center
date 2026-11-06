import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderGit2,
  GitBranch,
  Power,
  RefreshCw,
  Settings2,
} from 'lucide-react'
import type { AgentInfo, Language, Project, Task } from '../lib/domain'
import { statusLabel } from '../lib/domain'
import { tr } from '../lib/i18n'
import { AgentTree, EmptyState } from './workbench'

type OverviewProps = {
  projects: Project[]
  tasks: Task[]
  workspaceId?: string
  agentInfo: AgentInfo | null
  agentBusy: boolean
  agentRefreshing: boolean
  savingPreferences: ReadonlySet<string>
  loading: boolean
  online: boolean
  language: Language
  onPreference: (key: 'codex_model' | 'dsh_profile', value: string) => void
  onStop: () => void
  onRefresh: () => void
  onInspect: (task: Task) => void
  onTasks: (status?: string) => void
  onCreate: () => void
}

export function Overview({
  projects,
  tasks,
  workspaceId,
  agentInfo,
  agentBusy,
  agentRefreshing,
  savingPreferences,
  loading,
  online,
  language,
  onPreference,
  onStop,
  onRefresh,
  onInspect,
  onTasks,
  onCreate,
}: OverviewProps) {
  const workspace = projects.find((project) => project.id === workspaceId)
  const scoped = tasks.filter((task) => !workspaceId || task.project_id === workspaceId)
  const newestFirst = (items: Task[]) =>
    [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const failed = newestFirst(scoped.filter((task) => task.status === 'failed'))
  const running = newestFirst(scoped.filter((task) => task.status === 'running'))
  const queued = scoped.filter((task) => ['pending', 'waiting', 'queued'].includes(task.status))
  const completed = newestFirst(
    scoped.filter((task) => task.agent === 'dsh' && task.status === 'completed'),
  )
  const metrics = [
    {
      label: 'Needs attention',
      value: failed.length,
      icon: CircleAlert,
      tone: 'coral',
      status: 'failed',
    },
    { label: 'Running', value: running.length, icon: Activity, tone: 'blue', status: 'running' },
    { label: 'Waiting to run', value: queued.length, icon: Clock3, tone: 'amber', status: 'queue' },
    {
      label: 'Completed',
      value: scoped.filter((task) => task.status === 'completed').length,
      icon: CheckCheck,
      tone: 'success',
      status: 'completed',
    },
  ]
  const codexStatus = !agentInfo
    ? 'Checking status'
    : agentInfo.codex.status === 'running'
      ? 'Codex running'
      : agentInfo.codex.status === 'detected'
        ? 'Codex process detected'
        : agentInfo.codex.status === 'launched'
          ? 'Codex open request sent'
          : 'Codex stopped'
  const modelName =
    agentInfo?.codex.models.find((model) => model.id === agentInfo.settings.codex_model)?.name ??
    agentInfo?.settings.codex_model ??
    tr('(default)', language)

  const taskRows = (items: Task[]) => (
    <div className="workbench-task-list">
      {items.slice(0, 5).map((task) => (
        <button key={task.id} className="workbench-task" onClick={() => onInspect(task)}>
          <span className={'agent-tree-icon ' + task.agent}>
            <Bot size={17} aria-hidden="true" />
          </span>
          <span className="workbench-task-copy">
            <b>{task.title}</b>
            <small>
              {task.project_name} · {task.agent === 'codex' ? 'Codex' : 'DSH'}
            </small>
          </span>
          <span className={'status-badge ' + task.status}>
            <i />
            {tr(statusLabel[task.status] ?? task.status, language)}
          </span>
          <ChevronRight className="task-open" size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
  const loadingRows = (
    <div className="loading-state" role="status">
      <div className="skeleton skeleton-row" />
      <span className="sr-only">{tr('Loading workspace', language)}</span>
    </div>
  )

  return (
    <>
      <div className="metrics-grid" aria-busy={loading}>
        {metrics.map((metric) => (
          <button
            className="metric-card"
            key={metric.label}
            onClick={() => onTasks(metric.status)}
            disabled={loading}
          >
            <span className="metric-label">
              <metric.icon
                size={16}
                className={'metric-symbol ' + metric.tone}
                aria-hidden="true"
              />
              {tr(metric.label, language)}
            </span>
            <span className="metric-value">
              {loading ? (
                <span className="skeleton metric-skeleton" />
              ) : (
                metric.value.toLocaleString()
              )}
            </span>
            <ArrowUpRight className="metric-link" size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="workbench-grid">
        <div className="workbench-column tree-column">
          <section className="panel attention-panel">
            <div className="panel-header">
              <div>
                <h2>{tr('Needs attention', language)}</h2>
                <p>
                  {tr(
                    'Failed tasks in this workspace. Open a task to inspect the error.',
                    language,
                  )}
                </p>
              </div>
              <span className={'queue-count ' + (failed.length ? 'attention-count' : '')}>
                {loading ? '—' : failed.length}
              </span>
            </div>
            {loading ? (
              loadingRows
            ) : failed.length ? (
              taskRows(failed)
            ) : (
              <div className="inline-empty">
                <CheckCheck size={20} aria-hidden="true" />
                <div>
                  <b>{tr('No failed tasks', language)}</b>
                  <p>{tr('Tasks that fail will appear here.', language)}</p>
                </div>
              </div>
            )}
            {failed.length > 5 && (
              <button className="section-more text-button" onClick={() => onTasks('failed')}>
                {tr('View all failed tasks', language)}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            )}
          </section>
          <section className="panel running-panel">
            <div className="panel-header">
              <div>
                <h2>{tr('Running now', language)}</h2>
                <p>{tr('Current execution, across Codex and DSH.', language)}</p>
              </div>
              <button className="text-button" onClick={() => onTasks('running')}>
                {tr('View all', language)}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
            {loading ? (
              loadingRows
            ) : running.length ? (
              taskRows(running)
            ) : !scoped.length ? (
              <EmptyState
                title={tr('No tasks yet', language)}
                text={tr(
                  projects.length
                    ? 'Create a task or start a mission from Codex.'
                    : 'Add a project before creating tasks.',
                  language,
                )}
                action={tr(projects.length ? 'Create task' : 'Add project', language)}
                onClick={onCreate}
              />
            ) : (
              <div className="inline-empty neutral">
                <Activity size={20} aria-hidden="true" />
                <div>
                  <b>{tr('No tasks running', language)}</b>
                  <p>{tr('Open the task list to choose your next task.', language)}</p>
                </div>
                <button className="text-button" onClick={() => onTasks()}>
                  {tr('All tasks', language)}
                </button>
              </div>
            )}
            {queued.length > 0 && (
              <button className="queue-strip" onClick={() => onTasks('queue')}>
                <Clock3 size={15} aria-hidden="true" />
                <span>
                  {queued.length} · {tr('Waiting to run', language)}
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            )}
          </section>
          <details className="panel disclosure-panel collaboration-panel">
            <summary>
              <GitBranch size={17} aria-hidden="true" />
              <span>
                <b>{tr('Collaboration tree', language)}</b>
                <small>{tr('Expand to see missions and delegated work', language)}</small>
              </span>
              <span className="queue-count">{loading ? '—' : scoped.length}</span>
              <ChevronRight className="disclosure-chevron" size={17} aria-hidden="true" />
            </summary>
            {loading ? (
              loadingRows
            ) : (
              <AgentTree tasks={scoped} onInspect={onInspect} language={language} />
            )}
          </details>
          <details className="panel disclosure-panel completed-panel">
            <summary>
              <CheckCheck size={17} aria-hidden="true" />
              <span>
                <b>{tr('Completed DSH tasks', language)}</b>
                <small>{tr('Execution completed; review is not tracked.', language)}</small>
              </span>
              <span className="queue-count">{loading ? '—' : completed.length}</span>
              <ChevronRight className="disclosure-chevron" size={17} aria-hidden="true" />
            </summary>
            {loading ? (
              loadingRows
            ) : completed.length ? (
              taskRows(completed)
            ) : (
              <div className="inline-empty neutral">{tr('No completed DSH tasks', language)}</div>
            )}
            {completed.length > 5 && (
              <button className="section-more text-button" onClick={() => onTasks('completed')}>
                {tr('View all completed tasks', language)}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            )}
          </details>
        </div>
        <aside className="workbench-column setup-column">
          <section className="panel agents-panel">
            <div className="panel-header">
              <div>
                <h2>{tr('Agent status', language)}</h2>
                <p>{tr('Local processes · all workspaces', language)}</p>
              </div>
              <button
                className="icon-button"
                disabled={agentRefreshing}
                onClick={onRefresh}
                aria-label={tr('Refresh status', language)}
              >
                <RefreshCw size={16} className={agentRefreshing ? 'spin' : ''} aria-hidden="true" />
              </button>
            </div>
            <div className="process-card">
              <span className={'runtime-dot ' + (agentInfo?.codex.process_count ? 'active' : '')} />
              <div>
                <b>
                  Codex <span className="agent-role">{tr('Primary agent', language)}</span>
                </b>
                <small>{tr(codexStatus, language)}</small>
              </div>
            </div>
            <div className="process-card">
              <span className={'runtime-dot ' + (agentInfo?.dsh.running_tasks ? 'active' : '')} />
              <div>
                <b>
                  DSH <span className="agent-role">{tr('Worker agent', language)}</span>
                </b>
                <small>
                  {!agentInfo
                    ? tr('Checking status', language)
                    : !agentInfo.dsh.installed
                      ? tr('Not installed', language)
                      : agentInfo.dsh.running_tasks
                        ? agentInfo.dsh.running_tasks + ' · ' + tr('Active DSH runs', language)
                        : tr('DSH ready', language)}
                </small>
              </div>
            </div>
            <div className="service-line">
              <span>
                <Activity size={14} aria-hidden="true" /> ACC API
              </span>
              <span className={online ? 'text-success' : 'text-error'}>
                {tr(online ? 'Connected' : 'Disconnected', language)}
              </span>
            </div>
          </section>
          <section className="panel setup-panel">
            <div className="panel-header">
              <div>
                <h2>{tr('Session setup', language)}</h2>
                <p>{workspace?.name ?? tr('All workspaces', language)}</p>
              </div>
              <Settings2 size={17} aria-hidden="true" />
            </div>
            <dl className="session-facts">
              <div>
                <dt>{tr('Codex model', language)}</dt>
                <dd>{agentInfo ? modelName : tr('Checking status', language)}</dd>
              </div>
              <div>
                <dt>{tr('DSH profile', language)}</dt>
                <dd>
                  {agentInfo
                    ? (agentInfo.settings.dsh_profile ?? tr('(default)', language))
                    : tr('Checking status', language)}
                </dd>
              </div>
            </dl>
            <details className="session-options">
              <summary>
                {tr('Adjust configuration', language)}
                <ChevronRight className="disclosure-chevron" size={15} aria-hidden="true" />
              </summary>
              <div className="workbench-fields">
                <label>
                  {tr('Codex model', language)}
                  <select
                    disabled={!agentInfo || agentBusy || savingPreferences.size > 0}
                    value={agentInfo?.settings.codex_model ?? ''}
                    onChange={(event) => onPreference('codex_model', event.target.value)}
                  >
                    <option value="">{tr('(default)', language)}</option>
                    {(agentInfo?.codex.models ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr('DSH profile', language)}
                  <select
                    disabled={!agentInfo || agentBusy || savingPreferences.size > 0}
                    value={agentInfo?.settings.dsh_profile ?? ''}
                    onChange={(event) => onPreference('dsh_profile', event.target.value)}
                  >
                    <option value="">{tr('(default)', language)}</option>
                    {(agentInfo?.dsh.profiles ?? []).map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.id} · {profile.provider} · {profile.model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
            <div className="workbench-actions">
              <button
                className="icon-button"
                onClick={onStop}
                disabled={
                  agentBusy ||
                  !agentInfo?.codex.owned_by_acc ||
                  agentInfo.codex.status !== 'running'
                }
                aria-label={tr('Stop Codex launcher', language)}
                title={tr('Stop Codex launcher', language)}
              >
                <Power size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="setup-hint">
              <FolderGit2 size={14} aria-hidden="true" />
              <span>
                {workspace?.path ??
                  tr('Select a workspace in the top bar to launch Codex.', language)}
              </span>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
