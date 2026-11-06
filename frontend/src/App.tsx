import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderGit2,
  KeyRound,
  LoaderCircle,
  Play,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

import type { Project, Task, TaskRun, Language, AgentInfo } from './lib/domain'
import { tr, translations } from './lib/i18n'
import { TaskDetails } from './components/task-details'
import { Sidebar, Topbar } from './components/app-shell'
import { DesktopTitlebar } from './components/desktop-titlebar'
import { Overview } from './components/overview'
import { TaskFilters } from './components/task-filters'
import { Dialog } from './components/dialog'
import { useNavigation } from './hooks/use-navigation'
import { TaskTable, ProjectTable, EmptyState } from './components/workbench'

function App() {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem('acc-language') as Language) || 'zh',
  )
  const [page, setPage] = useNavigation()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [online, setOnline] = useState(false)
  const [onboardingApiReady, setOnboardingApiReady] = useState(false)
  const desktopToken = window.accDesktop?.apiToken ?? ''
  const [token, setToken] = useState(
    () => desktopToken || sessionStorage.getItem('acc-token') || '',
  )
  const [tokenDraft, setTokenDraft] = useState(
    () => desktopToken || sessionStorage.getItem('acc-token') || '',
  )
  const [authRequired, setAuthRequired] = useState(
    () => !desktopToken && !sessionStorage.getItem('acc-token'),
  )
  const [showToken, setShowToken] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [modal, setModal] = useState<'project' | 'task' | null>(null)
  const [runHistory, setRunHistory] = useState<{ task: Task; runs?: TaskRun[] } | null>(null)
  const [confirmation, setConfirmation] = useState<{ kind: 'task' | 'project'; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [agentRefreshing, setAgentRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [savingPreferences, setSavingPreferences] = useState<ReadonlySet<string>>(new Set())
  const preferenceRequests = useRef(new Set<string>())
  const [projectDraft, setProjectDraft] = useState({
    name: '',
    path: '',
    mode: 'existing' as 'existing' | 'new',
  })
  const [taskDraft, setTaskDraft] = useState({
    project_id: '',
    title: '',
    description: '',
    priority: 2,
  })
  const [agentSetup, setAgentSetup] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('acc-agent-setup') ?? '{}') as { workspaceId?: string }
    } catch {
      return {}
    }
  })
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
  const [agentBusy, setAgentBusy] = useState(false)
  const [codexOpening, setCodexOpening] = useState(false)
  const [codexOpenError, setCodexOpenError] = useState('')
  const codexOpenQueue = useRef<Promise<boolean>>(Promise.resolve(false))
  const codexRequestId = useRef(0)
  const dispatching = useRef(new Set<string>())
  const [dispatchingIds, setDispatchingIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [agentError, setAgentError] = useState('')
  const [onboardingOpen, setOnboardingOpen] = useState(
    () =>
      localStorage.getItem('acc-onboarding-complete') !== '1' &&
      sessionStorage.getItem('acc-onboarding-dismissed') !== '1',
  )
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2>(0)

  const api = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${window.accDesktop?.apiBaseUrl ?? ''}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(desktopToken || token ? { Authorization: `Bearer ${desktopToken || token}` } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) setAuthRequired(true)
      throw new Error(body.detail || `Request failed (${response.status})`)
    }
    return response.status === 204 ? (undefined as T) : response.json()
  }

  const refresh = async () => {
    try {
      const [projectData, taskData] = await Promise.all([
        api<Project[]>('/projects'),
        api<Task[]>('/tasks'),
      ])
      setProjects(projectData)
      setTasks(taskData)
      setAgentSetup((current) =>
        current.workspaceId && !projectData.some((project) => project.id === current.workspaceId)
          ? { ...current, workspaceId: '' }
          : current,
      )
      setOnline(true)
      setOnboardingApiReady(true)
      setAuthRequired(false)
      setConnectionError('')
      setLastUpdated(new Date())
      return true
    } catch (cause) {
      setOnline(false)
      setOnboardingApiReady(false)
      if (cause instanceof Error) setConnectionError(cause.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  const refreshAgentStatus = async (manual = false) => {
    if (manual) setAgentRefreshing(true)
    try {
      setAgentInfo(await api<AgentInfo>('/agents'))
      setAgentError('')
      return true
    } catch (cause) {
      if (cause instanceof Error) setAgentError(cause.message)
      return false
    } finally { if (manual) setAgentRefreshing(false) }
  }

  useEffect(() => {
    if (!desktopToken && !token) {
      setProjects([])
      setTasks([])
      setAgentInfo(null)
      setOnline(false)
      setLoading(false)
      setOnboardingApiReady(false)
      return
    }
    setLoading(true)
    void refresh()
    void refreshAgentStatus()
    const timer = window.setInterval(() => {
      void refresh()
      void refreshAgentStatus()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [token, desktopToken])
  useEffect(() => {
    if (formError) document.getElementById('form-error')?.focus()
  }, [formError])
  useEffect(() => {
    if (desktopToken) return
    if (token) sessionStorage.setItem('acc-token', token)
    else sessionStorage.removeItem('acc-token')
  }, [desktopToken, token])
  useEffect(() => {
    localStorage.setItem('acc-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])
  useEffect(() => {
    localStorage.setItem('acc-agent-setup', JSON.stringify(agentSetup))
    if (!agentSetup.workspaceId) {
      codexRequestId.current += 1
      setCodexOpening(false)
      setCodexOpenError('')
    }
  }, [agentSetup])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refreshAll = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const results = await Promise.all([refresh(), refreshAgentStatus()])
      if (results.every(Boolean)) setNotice('Workspace refreshed')
    } finally { setRefreshing(false) }
  }
  const requestDelete = (kind: 'task' | 'project', id: string, name: string) => {
    setDeleteError('')
    setConfirmation({ kind, id, name })
  }
  const confirmDelete = async () => {
    if (!confirmation || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api(`/${confirmation.kind === 'task' ? 'tasks' : 'projects'}/${confirmation.id}`, { method: 'DELETE' })
      if (confirmation.kind === 'project') {
        setProjects(current => current.filter(project => project.id !== confirmation.id))
        setTasks(current => current.filter(task => task.project_id !== confirmation.id))
        setAgentSetup(current => current.workspaceId === confirmation.id ? {} : current)
      } else setTasks(current => current.filter(task => task.id !== confirmation.id))
      setConfirmation(null)
      setNotice(confirmation.kind === 'task' ? 'Task deleted' : 'Project removed')
      await refresh()
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Delete failed')
    } finally { setDeleting(false) }
  }

  const workspaceId = agentSetup.workspaceId ?? ''
  const workspace = projects.find((project) => project.id === workspaceId)
  const scopedTasks = useMemo(
    () => tasks.filter((task) => !workspaceId || task.project_id === workspaceId),
    [tasks, workspaceId],
  )
  const scopedProjects = projects.filter((project) => !workspaceId || project.id === workspaceId)
  const visibleTasks = useMemo(
    () =>
      scopedTasks
        .filter(
          (task) =>
            (statusFilter === 'all' ||
              (statusFilter === 'queue'
                ? ['pending', 'waiting', 'queued'].includes(task.status)
                : task.status === statusFilter)) &&
            (task.title + ' ' + task.project_name + ' ' + task.status)
              .toLowerCase()
              .includes(deferredQuery.trim().toLowerCase()),
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [scopedTasks, deferredQuery, statusFilter],
  )
  const onboardingConnected =
    onboardingApiReady && (Boolean(desktopToken) || tokenDraft.trim() === token)
  const openModal = (kind: 'project' | 'task') => {
    setFormError('')
    setModal(kind)
    if (kind === 'task')
      setTaskDraft((current) => ({
        ...current,
        project_id:
          workspaceId ||
          (projects.some((project) => project.id === current.project_id) ? current.project_id : ''),
      }))
  }
  const closeModal = () => {
    if (!submitting) {
      setModal(null)
      setFormError('')
    }
  }
  const selectWorkspace = (workspaceId: string) => {
    if (workspaceId === agentSetup.workspaceId) return
    codexRequestId.current += 1
    setCodexOpenError('')
    setNotice('')
    setAgentSetup((current) => ({ ...current, workspaceId }))
    if (workspaceId) void startCodex(workspaceId)
  }
  const shellProps = {
    page,
    onNavigate: setPage,
    language,
    onLanguage: setLanguage,
    projects,
    taskCount: scopedTasks.length,
    online,
    workspaceId: agentSetup.workspaceId,
    onWorkspace: selectWorkspace,
    codexOpening: codexOpening || agentBusy,
    codexOpenError,
    onOpenCodex: () => void startCodex(),
    onAddProject: () => openModal('project'),
    onHelp: () => {
      setOnboardingStep(0)
      setOnboardingOpen(true)
    },
  }

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFormError('')
    try {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectDraft.name,
          path: projectDraft.path,
          create_repository: projectDraft.mode === 'new',
        }),
      })
      setModal(null)
      setProjectDraft({ name: '', path: '', mode: 'existing' })
      setNotice('Project registered')
      await refresh()
      if (localStorage.getItem('acc-onboarding-complete') !== '1') {
        setAgentSetup((current) => ({ ...current, workspaceId: project.id }))
        setOnboardingStep(1)
        setOnboardingOpen(true)
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Project registration failed')
    } finally {
      setSubmitting(false)
    }
  }
  const submitTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFormError('')
    try {
      await api<Task>('/tasks', { method: 'POST', body: JSON.stringify(taskDraft) })
      setModal(null)
      setTaskDraft({ project_id: '', title: '', description: '', priority: 2 })
      setNotice('Task created')
      await refresh()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Task creation failed')
    } finally {
      setSubmitting(false)
    }
  }
  const runTask = async (id: string) => {
    const task = tasks.find((item) => item.id === id)
    if (
      !task ||
      dispatching.current.has(id) ||
      ['queued', 'running', 'waiting'].includes(task.status)
    )
      return
    dispatching.current.add(id)
    setDispatchingIds(new Set(dispatching.current))
    try {
      const run = await api<TaskRun>(`/tasks/${id}/runs`, { method: 'POST' })
      setRunHistory({ task, runs: [run] })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task dispatch failed')
    } finally {
      dispatching.current.delete(id)
      setDispatchingIds(new Set(dispatching.current))
    }
  }
  const saveAgentPreference = async (key: 'codex_model' | 'dsh_profile', value: string) => {
    if (preferenceRequests.current.size) return
    preferenceRequests.current.add(key)
    setSavingPreferences(new Set(preferenceRequests.current))
    try {
      const result = await api<{ settings: AgentInfo['settings'] }>('/agents/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value || null }),
      })
      setAgentInfo((current) => (current ? { ...current, settings: result.settings } : current))
      setNotice('Settings saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings update failed')
    } finally {
      preferenceRequests.current.delete(key)
      setSavingPreferences(new Set(preferenceRequests.current))
    }
  }
  function startCodex(targetId = agentSetup.workspaceId): Promise<boolean> {
    if (agentBusy || !targetId) return Promise.resolve(false)
    const requestId = ++codexRequestId.current
    setCodexOpening(true)
    setCodexOpenError('')
    // Serialize OS handoffs. Skip superseded requests and ignore stale feedback;
    // the final selected workspace is always sent after any in-flight handoff.
    const request = codexOpenQueue.current.catch(() => false).then(async () => {
      if (requestId !== codexRequestId.current) return false
      try {
        await api('/agents/codex/start', {
          method: 'POST',
          body: JSON.stringify({ workspace_id: targetId }),
        })
        if (requestId === codexRequestId.current) {
          setNotice(`${tr('Codex open request sent', language)} · ${projects.find(p => p.id === targetId)?.name ?? targetId}`)
          void refreshAgentStatus()
        }
        return true
      } catch (cause) {
        if (requestId === codexRequestId.current)
          setCodexOpenError(cause instanceof Error ? cause.message : tr('Codex launch failed', language))
        return false
      } finally {
        // A newer request owns the busy state; clearing the selection owns none.
        if (requestId === codexRequestId.current) setCodexOpening(false)
      }
    })
    codexOpenQueue.current = request
    return request
  }
  const stopCodex = async () => {
    if (agentBusy || codexOpening || !agentInfo?.codex.owned_by_acc) return
    setAgentBusy(true)
    try {
      await api('/agents/codex/stop', { method: 'POST' })
      await refreshAgentStatus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Codex stop failed')
    } finally {
      setAgentBusy(false)
    }
  }
  const applyBrowserToken = () => {
    const nextToken = tokenDraft.trim()
    setToken(nextToken)
    if (nextToken === token) {
      void refresh()
      void refreshAgentStatus()
    }
    setError('')
    setPage('Overview')
  }
  const updateTokenDraft = (value: string) => {
    setTokenDraft(value)
    setOnboardingApiReady(false)
    setOnline(false)
  }
  const clearBrowserToken = () => {
    setTokenDraft('')
    setToken('')
    setAuthRequired(true)
    setOnline(false)
  }
  const skipOnboarding = () => {
    sessionStorage.setItem('acc-onboarding-dismissed', '1')
    setOnboardingOpen(false)
  }
  const finishOnboarding = () => {
    localStorage.setItem('acc-onboarding-complete', '1')
    sessionStorage.removeItem('acc-onboarding-dismissed')
    setOnboardingOpen(false)
    setPage('Overview')
  }
  const nextOnboardingStep = () => {
    if (onboardingStep === 0) {
      if (!onboardingConnected) return
      setOnboardingStep(1)
    } else if (onboardingStep === 1) {
      if (!agentSetup.workspaceId) {
        setError('No workspace selected')
        return
      }
      setOnboardingStep(2)
    } else finishOnboarding()
  }
  const startFromOnboarding = async () => {
    if (agentSetup.workspaceId && agentInfo?.codex.installed && !(await startCodex())) return
    finishOnboarding()
  }
  const inspectTaskRuns = (task: Task) => setRunHistory({ task })

  return (
    <div className={'app-shell' + (window.accDesktop?.platform === 'win32' ? ' desktop-shell' : '')}>
      {window.accDesktop?.platform === 'win32' && <DesktopTitlebar />}
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        {tr('Skip to content', language)}
      </a>
      <Sidebar {...shellProps} />
      <main className="main-area" id="main-content" tabIndex={-1}>
        <Topbar {...shellProps} />
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{tr(page === 'Overview' ? 'Your agent workspace' : page, language)}</h1>
              <p>
                {tr(
                  page === 'Overview'
                    ? 'See what needs attention and keep work moving.'
                    : page === 'Projects'
                      ? 'Repositories registered to this local workspace.'
                      : page === 'Tasks'
                        ? 'Track and organize work across your projects.'
                        : 'Local service configuration and access.',
                  language,
                )}
              </p>
            </div>
            <div className="heading-actions">
              <button className="button ghost refresh-workspace" disabled={refreshing || loading || authRequired}
                aria-label={tr('Refresh workspace', language)}
                title={tr('Refresh workspace', language) + (lastUpdated ? ' · ' + tr('Last synced', language) + ' ' + lastUpdated.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US') : '')}
                onClick={() => void refreshAll()}>
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} aria-hidden="true" />
                {tr(refreshing ? 'Refreshing…' : 'Refresh', language)}
              </button>
              {page !== 'Settings' && (
                <>
                  <button className="button secondary" onClick={() => openModal('project')}>
                    <Plus aria-hidden="true" size={15} /> {tr('Add project', language)}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => openModal('task')}
                    disabled={projects.length === 0}
                  >
                    <Sparkles aria-hidden="true" size={15} /> {tr('New task', language)}
                  </button>
                </>
              )}
            </div>
          </div>
          {authRequired && !desktopToken && (
            <div className="auth-banner" role="status">
              <div className="auth-banner-icon">
                <KeyRound aria-hidden="true" size={17} />
              </div>
              <div>
                <b>{tr('Authentication required', language)}</b>
                <p>
                  {tr(
                    'Enter the ACC API token to load projects, tasks, and agent status in this browser.',
                    language,
                  )}
                </p>
              </div>
              <button className="button primary compact" onClick={() => setPage('Settings')}>
                {tr('Configure token', language)} <ArrowUpRight aria-hidden="true" size={14} />
              </button>
            </div>
          )}
          {(error || connectionError || agentError) && (
            <div className="error-banner" role="alert">
              <AlertCircle aria-hidden="true" size={16} />
              <span>{language === 'zh' ? (translations[error || connectionError || agentError] ?? (error || connectionError || agentError)) : (error || connectionError || agentError)}</span>
              {(connectionError || agentError) && <button className="text-button" disabled={refreshing} onClick={() => void refreshAll()}>{tr('Retry', language)}</button>}
              <button
                aria-label={tr('Dismiss', language)}
                title={tr('Dismiss', language)}
                onClick={() => { setError(''); setConnectionError(''); setAgentError('') }}
              >
                <X aria-hidden="true" size={15} />
              </button>
            </div>
          )}
          {page === 'Overview' && (
            <Overview
              projects={projects}
              tasks={tasks}
              workspaceId={agentSetup.workspaceId}
              agentInfo={agentInfo}
              agentBusy={agentBusy || codexOpening}
              agentRefreshing={agentRefreshing}
              savingPreferences={savingPreferences}
              loading={loading}
              online={online}
              language={language}
              onPreference={saveAgentPreference}
              onStop={() => void stopCodex()}
              onRefresh={() => void refreshAgentStatus(true)}
              onInspect={inspectTaskRuns}
              onTasks={(status = 'all') => {
                setQuery('')
                setStatusFilter(status)
                setPage('Tasks')
              }}
              onCreate={() => openModal(projects.length ? 'task' : 'project')}
            />
          )}
          {page === 'Projects' && (
            <section className="panel full-panel">
              <div className="panel-header">
                <div>
                  <h2>{workspace?.name ?? tr('All projects', language)}</h2>
                  <p>
                    {scopedProjects.length} {tr('repositories', language)}
                  </p>
                </div>
                <button className="button secondary compact" onClick={() => openModal('project')}>
                  <Plus aria-hidden="true" size={15} /> {tr('Add project', language)}
                </button>
              </div>
              {scopedProjects.length ? (
                <ProjectTable
                  projects={scopedProjects}
                  onDelete={(id) => requestDelete('project', id, projects.find(project => project.id === id)?.name ?? id)}
                  language={language}
                />
              ) : (
                <EmptyState
                  title={tr('No projects registered', language)}
                  text={tr(
                    'Register an existing Git repository under an authorized root.',
                    language,
                  )}
                  action={tr('Add project', language)}
                  onClick={() => openModal('project')}
                />
              )}
            </section>
          )}
          {page === 'Tasks' && (
            <section className="panel full-panel">
              <div className="panel-header">
                <div>
                  <h2>{tr('All tasks', language)}</h2>
                  <p>
                    {tr('Active workspace', language)} ·{' '}
                    {workspace?.name ?? tr('All workspaces', language)}
                  </p>
                </div>
                <span className="queue-count">{scopedTasks.length}</span>
              </div>
              <div className="task-views" role="group" aria-label={tr('Task views', language)}>
                {[
                  ['all', 'All tasks'],
                  ['queue', 'Waiting to run'],
                  ['running', 'Running'],
                  ['failed', 'Failed'],
                  ['completed', 'Completed'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={statusFilter === value ? 'selected' : ''}
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                  >
                    {tr(label, language)}
                    <span>
                      {value === 'all'
                        ? scopedTasks.length
                        : scopedTasks.filter((task) => value === 'queue'
                          ? ['pending', 'waiting', 'queued'].includes(task.status)
                          : task.status === value).length}
                    </span>
                  </button>
                ))}
              </div>
              <TaskFilters
                query={query}
                onQuery={setQuery}
                status={statusFilter}
                onStatus={setStatusFilter}
                language={language}
                count={visibleTasks.length}
              />
              <TaskTable
                tasks={visibleTasks}
                dispatchingIds={dispatchingIds}
                onRun={runTask}
                onInspect={inspectTaskRuns}
                onCreate={
                  !query && statusFilter === 'all'
                    ? () => openModal(projects.length ? 'task' : 'project')
                    : undefined
                }
                emptyAction={tr(projects.length ? 'Create task' : 'Add project', language)}
                emptyMessage={tr(
                  query || statusFilter !== 'all'
                    ? 'No tasks match your search.'
                    : projects.length
                      ? 'No tasks yet'
                      : 'Add a project before creating tasks.',
                  language,
                )}
                onDelete={(id) => requestDelete('task', id, tasks.find(task => task.id === id)?.title ?? id)}
                language={language}
              />
            </section>
          )}
          {page === 'Settings' && (
            <section className="panel settings-panel">
              <div className="panel-header">
                <div>
                  <h2>{tr('Agent workspace', language)}</h2>
                  <p>{tr('Launch Codex in the selected workspace.', language)}</p>
                </div>
                <span className="mcp-tag">{tr('Codex via MCP', language)}</span>
              </div>
              <div className="agent-settings-grid">
                <div className="settings-workspace">
                  <span>{tr('Active workspace', language)}</span>
                  <b>{workspace?.name ?? tr('All workspaces', language)}</b>
                  <small>{tr('Change workspace in the top bar.', language)}</small>
                </div>
                <label>
                  {tr('Codex model', language)}
                  <select
                    disabled={!agentInfo || savingPreferences.size > 0}
                    value={agentInfo?.settings.codex_model ?? ''}
                    onChange={(e) => void saveAgentPreference('codex_model', e.target.value)}
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
                    disabled={!agentInfo || savingPreferences.size > 0}
                    value={
                      agentInfo?.settings.dsh_profile ??
                      (agentInfo?.dsh.profiles.some((profile) => profile.id === 'headless')
                        ? 'headless'
                        : '')
                    }
                    onChange={(e) => void saveAgentPreference('dsh_profile', e.target.value)}
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
              <div className="agent-controls">
                <div className="agent-runtime-status">
                  <span
                    className={`runtime-dot ${agentInfo?.codex.process_count ? 'active' : ''}`}
                  />
                  <div>
                    <b>Codex</b>
                    <small>
                      {!agentInfo
                        ? tr('Checking status', language)
                        : tr(
                            agentInfo.codex.status === 'running'
                              ? 'Codex running'
                              : agentInfo.codex.status === 'detected'
                                ? 'Codex process detected'
                                : agentInfo.codex.status === 'launched'
                                  ? 'Codex open request sent'
                                  : 'Codex stopped',
                            language,
                          )}
                      {agentInfo?.codex.pid ? ` · PID ${agentInfo.codex.pid}` : ''}
                      {agentInfo?.codex.status === 'detected'
                        ? ` · ${agentInfo.codex.process_count}`
                        : ''}
                    </small>
                  </div>
                  <span className={`runtime-dot ${agentInfo?.dsh.running_tasks ? 'active' : ''}`} />
                  <div>
                    <b>DSH</b>
                    <small>
                      {!agentInfo
                        ? tr('Checking status', language)
                        : !agentInfo.dsh.installed
                          ? tr('Not installed', language)
                          : agentInfo.dsh.running_tasks
                            ? `${agentInfo.dsh.running_tasks} · ${tr('Active DSH runs', language)}`
                            : tr('DSH ready', language)}
                    </small>
                  </div>
                </div>
                <div className="agent-control-buttons">
                  <button
                    className="button secondary compact"
                    onClick={() => void stopCodex()}
                    disabled={
                      agentBusy || codexOpening ||
                      !agentInfo?.codex.owned_by_acc ||
                      agentInfo.codex.status !== 'running'
                    }
                    aria-label={tr('Stop Codex launcher', language)}
                    title={tr('Stop Codex launcher', language)}
                  >
                    <Power aria-hidden="true" size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={agentRefreshing}
                    onClick={() => void refreshAgentStatus(true)}
                    aria-label={tr('Refresh status', language)}
                    title={tr('Refresh status', language)}
                  >
                    <RefreshCw className={agentRefreshing ? 'spin' : ''} aria-hidden="true" size={15} />
                  </button>
                </div>
              </div>
              <p className="setting-hint">{tr('Switching workspaces automatically opens the project in Codex. Desktop model follows Codex settings.', language)}</p>
              <div className="settings-divider" />
              <div className="panel-header">
                <div>
                  <h2>{tr('Local service', language)}</h2>
                  <p>{tr('Connection and workspace security', language)}</p>
                </div>
                <span className={`health-tag ${online ? 'healthy' : 'offline'}`}>
                  <i />
                  {tr(online ? 'Connected' : 'Disconnected', language)}
                </span>
              </div>
              <div className="setting-row">
                <div>
                  <b>{tr('ACC API token', language)}</b>
                  <p>
                    {tr(
                      'Used by the browser when the local API requires authentication.',
                      language,
                    )}
                  </p>
                </div>
                {desktopToken ? (
                  <div className="token-source">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <div>
                      <b>{tr('Desktop token injection is active.', language)}</b>
                      <small>
                        {tr(
                          'The desktop app supplies its local token through the secure preload bridge.',
                          language,
                        )}
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="token-control">
                    <input
                      aria-label={tr('ACC API token', language)}
                      type={showToken ? 'text' : 'password'}
                      value={tokenDraft}
                      onChange={(e) => setTokenDraft(e.target.value)}
                      placeholder={tr('Enter token from .env', language)}
                    />
                    <button
                      className="button secondary compact"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {tr(showToken ? 'Hide' : 'Show', language)}
                    </button>
                    <button
                      className="button primary compact"
                      disabled={!tokenDraft.trim()}
                      onClick={applyBrowserToken}
                    >
                      {tr('Apply token', language)}
                    </button>
                    {token && (
                      <button className="button secondary compact" onClick={clearBrowserToken}>
                        {tr('Clear token', language)}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="setting-row">
                <div>
                  <b>{tr('Project roots', language)}</b>
                  <p>
                    {tr(
                      desktopToken
                        ? 'Desktop app authorizes folders under your home directory by default.'
                        : 'ACC_ALLOWED_ROOTS defines which local directories can be registered.',
                      language,
                    )}
                  </p>
                </div>
                <span className="setting-value">
                  {tr(
                    desktopToken ? 'Managed in desktop settings' : 'Configured in backend .env',
                    language,
                  )}
                </span>
              </div>
              <div className="settings-foot">
                <ShieldCheck aria-hidden="true" size={16} />{' '}
                {tr(
                  'Service binds to localhost. Never expose this API to a public network.',
                  language,
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {onboardingOpen && (
        <Dialog onboarding label={tr('Welcome to ACC', language)} onClose={skipOnboarding}>
          <div className="onboarding-head">
            <div>
              <span className="modal-kicker">ACC · FIRST RUN</span>
              <h2 id="onboarding-title">{tr('Welcome to ACC', language)}</h2>
              <p>{tr('Let’s prepare your local agent workspace.', language)}</p>
            </div>
            <button
              className="icon-button"
              aria-label={tr('Skip for now', language)}
              title={tr('Skip for now', language)}
              onClick={skipOnboarding}
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <div className="onboarding-progress">
            <span className="onboarding-progress-label">
              {tr(`Step ${onboardingStep + 1} of 3`, language)}
            </span>
            <div>
              {[0, 1, 2].map((step) => (
                <i className={step <= onboardingStep ? 'active' : ''} key={step} />
              ))}
            </div>
          </div>
          {onboardingStep === 0 && (
            <div className="onboarding-step">
              <div className="onboarding-icon">
                <KeyRound aria-hidden="true" size={22} />
              </div>
              <h3>{tr('Connect the API', language)}</h3>
              <p>{tr('Use the local API to load your projects and agent status.', language)}</p>
              {desktopToken ? (
                <div className={`onboarding-ready ${onboardingConnected ? '' : 'pending'}`}>
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <div>
                    <b>
                      {tr(
                        onboardingConnected ? 'Desktop app is ready' : 'Checking status',
                        language,
                      )}
                    </b>
                    <small>{tr('Desktop token injection is active.', language)}</small>
                  </div>
                </div>
              ) : (
                <div className="onboarding-token">
                  <label>
                    {tr('Browser token', language)}
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={tokenDraft}
                      onChange={(event) => updateTokenDraft(event.target.value)}
                      placeholder={tr('Enter token from .env', language)}
                    />
                  </label>
                  <div>
                    <button
                      className="button secondary compact"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {tr(showToken ? 'Hide' : 'Show', language)}
                    </button>
                    <button
                      className="button primary compact"
                      disabled={!tokenDraft.trim()}
                      onClick={applyBrowserToken}
                    >
                      <CheckCircle2 aria-hidden="true" size={14} />
                      {tr('Apply token', language)}
                    </button>
                  </div>
                  <span
                    className={`onboarding-connection ${onboardingConnected ? 'connected' : ''}`}
                  >
                    <i />
                    {tr(onboardingConnected ? 'API connected' : 'API disconnected', language)}
                  </span>
                </div>
              )}
            </div>
          )}
          {onboardingStep === 1 && (
            <div className="onboarding-step">
              <div className="onboarding-icon">
                <FolderGit2 aria-hidden="true" size={22} />
              </div>
              <h3>{tr('Choose your workspace', language)}</h3>
              <p>
                {tr('Select the repository and models that this session should use.', language)}
              </p>
              {projects.length ? (
                <div className="onboarding-fields">
                  <label>
                    {tr('Active workspace', language)}
                    <select
                      value={agentSetup.workspaceId ?? ''}
                      onChange={(event) =>
                        setAgentSetup({ ...agentSetup, workspaceId: event.target.value })
                      }
                    >
                      <option value="">{tr('No workspace selected', language)}</option>
                      {projects.map((project) => (
                        <option value={project.id} key={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr('Codex model', language)}
                    <select
                      disabled={!agentInfo || savingPreferences.size > 0}
                      value={agentInfo?.settings.codex_model ?? ''}
                      onChange={(event) =>
                        void saveAgentPreference('codex_model', event.target.value)
                      }
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
                      disabled={!agentInfo || savingPreferences.size > 0}
                      value={
                        agentInfo?.settings.dsh_profile ??
                        (agentInfo?.dsh.profiles.some((profile) => profile.id === 'headless')
                          ? 'headless'
                          : '')
                      }
                      onChange={(event) =>
                        void saveAgentPreference('dsh_profile', event.target.value)
                      }
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
              ) : (
                <div className="onboarding-empty">
                  <p>
                    {tr('No projects are registered yet. Add one before continuing.', language)}
                  </p>
                  <button
                    className="button primary compact"
                    onClick={() => {
                      setOnboardingOpen(false)
                      setModal('project')
                    }}
                  >
                    <Plus aria-hidden="true" size={14} />
                    {tr('Add your first project', language)}
                  </button>
                </div>
              )}
            </div>
          )}
          {onboardingStep === 2 && (
            <div className="onboarding-step">
              <div className="onboarding-icon">
                <Bot aria-hidden="true" size={22} />
              </div>
              <h3>{tr('Start your first mission', language)}</h3>
              <p>
                {tr(
                  'Codex will lead the work. DSH can run delegated tasks in the background.',
                  language,
                )}
              </p>
              <div className="onboarding-summary">
                <div>
                  <span>{tr('Active workspace', language)}</span>
                  <b>
                    {projects.find((project) => project.id === agentSetup.workspaceId)?.name ??
                      tr('No workspace selected', language)}
                  </b>
                </div>
                <div>
                  <span>{tr('Codex model', language)}</span>
                  <b>{agentInfo?.settings.codex_model || tr('(default)', language)}</b>
                </div>
                <div>
                  <span>{tr('DSH profile', language)}</span>
                  <b>{agentInfo?.settings.dsh_profile || 'headless'}</b>
                </div>
              </div>
              <p className="onboarding-note">
                {tr('You can change these choices later in Settings.', language)}
              </p>
            </div>
          )}
          <div className="onboarding-foot">
            <button className="button ghost compact" onClick={skipOnboarding}>
              {tr('Skip for now', language)}
            </button>
            <div>
              {onboardingStep > 0 && (
                <button
                  className="button secondary compact"
                  onClick={() => setOnboardingStep((onboardingStep - 1) as 0 | 1 | 2)}
                >
                  <ArrowUpRight aria-hidden="true" size={14} className="rotate-180" />
                  {tr('Back', language)}
                </button>
              )}
              {onboardingStep < 2 ? (
                <button
                  className="button primary compact"
                  disabled={onboardingStep === 0 ? !onboardingConnected : !agentSetup.workspaceId}
                  onClick={nextOnboardingStep}
                >
                  {tr('Continue', language)} <ChevronRight aria-hidden="true" size={14} />
                </button>
              ) : (
                <button
                  className="button primary compact"
                  disabled={agentBusy}
                  onClick={() => void startFromOnboarding()}
                >
                  <Play aria-hidden="true" size={14} />
                  {tr(
                    agentInfo?.codex.installed
                      ? 'Start Codex and enter the workbench'
                      : 'Enter the workbench',
                    language,
                  )}
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {modal && (
        <Dialog
          label={tr(modal === 'project' ? 'Register a project' : 'Create a task', language)}
          onClose={closeModal}
        >
          <div className="modal-head">
            <div>
              <span className="modal-kicker">{tr('WORKSPACE', language)}</span>
              <h2>
                {tr(
                  modal === 'project'
                    ? projectDraft.mode === 'new'
                      ? 'Create local project'
                      : 'Register a project'
                    : 'Create a task',
                  language,
                )}
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label={tr('Close', language)}
              title={tr('Close', language)}
              onClick={closeModal}
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          {formError && (
            <div id="form-error" className="error-banner" role="alert" tabIndex={-1}>
              <AlertCircle size={16} aria-hidden="true" />
              <span>{tr(formError, language)}</span>
            </div>
          )}
          {modal === 'project' ? (
            <form onSubmit={submitProject} aria-busy={submitting}>
              <fieldset disabled={submitting}>
                <div>
                  <span className="field-label">
                    {tr('Select how this project should be added.', language)}
                  </span>
                  <div
                    className="project-mode"
                    role="group"
                    aria-label={tr('Select how this project should be added.', language)}
                  >
                    <button
                      type="button"
                      className={projectDraft.mode === 'existing' ? 'selected' : ''}
                      aria-pressed={projectDraft.mode === 'existing'}
                      onClick={() => setProjectDraft({ ...projectDraft, mode: 'existing' })}
                    >
                      <FolderGit2 aria-hidden="true" size={14} />
                      {tr('Existing repository', language)}
                    </button>
                    <button
                      type="button"
                      className={projectDraft.mode === 'new' ? 'selected' : ''}
                      aria-pressed={projectDraft.mode === 'new'}
                      onClick={() => setProjectDraft({ ...projectDraft, mode: 'new' })}
                    >
                      <Plus aria-hidden="true" size={14} />
                      {tr('New local repository', language)}
                    </button>
                  </div>
                </div>
                <label>
                  {tr('Project name', language)}
                  <input
                    required
                    maxLength={120}
                    value={projectDraft.name}
                    onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })}
                    placeholder={tr('Network diagnostics', language)}
                  />
                </label>
                <label>
                  {tr('Repository path', language)}
                  <input
                    required
                    value={projectDraft.path}
                    onChange={(e) => setProjectDraft({ ...projectDraft, path: e.target.value })}
                    placeholder={
                      projectDraft.mode === 'new'
                        ? 'D:\\Projects\\new-project'
                        : 'D:\\Projects\\network-tool'
                    }
                  />
                  <small>
                    {tr(
                      projectDraft.mode === 'new'
                        ? 'Choose a new folder inside an authorized directory. The folder must not exist yet.'
                        : 'Choose an existing Git repository inside an authorized directory.',
                      language,
                    )}
                  </small>
                </label>
                <div className="modal-foot">
                  <button type="button" className="button secondary" onClick={closeModal}>
                    {tr('Cancel', language)}
                  </button>
                  <button className="button primary">
                    <FolderGit2 aria-hidden="true" size={15} />{' '}
                    {tr(
                      submitting
                        ? 'Saving…'
                        : projectDraft.mode === 'new'
                          ? 'Create repository'
                          : 'Register existing repository',
                      language,
                    )}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <form onSubmit={submitTask} aria-busy={submitting}>
              <fieldset disabled={submitting}>
                <label>
                  {tr('Project', language)}
                  <select
                    required
                    value={taskDraft.project_id}
                    onChange={(e) => setTaskDraft({ ...taskDraft, project_id: e.target.value })}
                  >
                    <option value="">{tr('Select a project', language)}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr('Task title', language)}
                  <input
                    required
                    maxLength={160}
                    value={taskDraft.title}
                    onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
                    placeholder={tr('Implement interface discovery', language)}
                  />
                </label>
                <label>
                  {tr('Task description', language)}
                  <textarea
                    required
                    maxLength={20000}
                    value={taskDraft.description}
                    onChange={(e) => setTaskDraft({ ...taskDraft, description: e.target.value })}
                    placeholder={tr('Describe the scope and acceptance criteria.', language)}
                  />
                </label>
                <div className="form-split">
                  <label>
                    {tr('Priority', language)}
                    <select
                      value={taskDraft.priority}
                      onChange={(e) =>
                        setTaskDraft({ ...taskDraft, priority: Number(e.target.value) })
                      }
                    >
                      <option value="1">{tr('Urgent', language)}</option>
                      <option value="2">{tr('Normal', language)}</option>
                      <option value="3">{tr('Low', language)}</option>
                      <option value="4">{tr('Backlog', language)}</option>
                    </select>
                  </label>
                  <div className="pending-hint">
                    <Clock3 aria-hidden="true" size={14} /> {tr('Starts as Pending', language)}
                  </div>
                </div>
                <div className="modal-foot">
                  <button type="button" className="button secondary" onClick={closeModal}>
                    {tr('Cancel', language)}
                  </button>
                  <button className="button primary">
                    <Plus aria-hidden="true" size={15} />{' '}
                    {tr(submitting ? 'Saving…' : 'Create task', language)}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </Dialog>
      )}
      {runHistory && (
        <TaskDetails key={runHistory.task.id}
          task={tasks.find(task => task.id === runHistory.task.id) ?? runHistory.task}
          initialRuns={runHistory.runs}
          loadRuns={(id, signal) => api<TaskRun[]>(`/tasks/${id}/runs`, { signal })}
          onClose={() => setRunHistory(null)} language={language} />
      )}
      {confirmation && (
        <Dialog label={tr(confirmation.kind === 'task' ? 'Delete task' : 'Remove project', language)}
          className="confirm-modal" initialFocus="[data-cancel]"
          onClose={() => { if (!deleting) setConfirmation(null) }}>
          <div className="confirm-icon"><Trash2 size={22} aria-hidden="true" /></div>
          <h2>{tr(confirmation.kind === 'task' ? 'Delete task' : 'Remove project', language)}</h2>
          <p className="confirm-target">{confirmation.name}</p>
          <p className="confirm-description">{tr(confirmation.kind === 'task'
            ? 'The task and its run records will be permanently removed.'
            : 'The project and its task records will be removed. Repository files will be kept.', language)}</p>
          {deleteError && <div className="error-banner" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{tr(deleteError, language)}</span></div>}
          <div className="modal-foot" aria-busy={deleting}>
            <button data-cancel className="button secondary" disabled={deleting} onClick={() => setConfirmation(null)}>{tr('Cancel', language)}</button>
            <button className="button danger" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
              {tr(deleting ? 'Deleting…' : confirmation.kind === 'task' ? 'Delete task' : 'Remove project', language)}
            </button>
          </div>
        </Dialog>
      )}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {notice && <div className="toast"><Check size={17} aria-hidden="true" /><span>{tr(notice, language)}</span>
          <button className="icon-button" aria-label={tr('Dismiss', language)} onClick={() => setNotice('')}><X size={15} aria-hidden="true" /></button>
        </div>}
      </div>
    </div>
  )
}

export default App
