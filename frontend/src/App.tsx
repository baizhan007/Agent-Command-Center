import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowUpRight, Bot, ChevronDown, CircleHelp,
  Clock3, Command, FolderGit2, GitBranch, LayoutDashboard, ListTodo, Plus, ScrollText,
  Play, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { Button } from './components/ui/button'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Project = { id: string; name: string; path: string; task_count: number; branch: string | null; git_dirty: boolean | null }
type Task = { id: string; project_id: string; project_name: string; title: string; description: string; status: string; priority: number; created_at: string }
type TaskRun = { id: string; task_id: string; status: string; session_id: string | null; started_at: string | null; finished_at: string | null; exit_code: number | null; result: string | null; error: string | null; log_path: string | null }
type Stats = { projects: number; waiting_tasks: number; completed_tasks: number; failed_tasks: number }
type Page = 'Overview' | 'Projects' | 'Tasks' | 'Settings'
type Language = 'en' | 'zh'

const translations: Record<string, string> = {
  'Local workspace': '本地工作区', 'Personal instance': '个人实例', WORKSPACE: '工作区', PROJECTS: '项目',
  'Local AI workbench': '本地 AI 开发工作台', 'LOCAL AI WORKBENCH': '本地 AI 工作台',
  'API connected': 'API 已连接', 'API disconnected': 'API 未连接',
  Workspace: '工作区', 'Local account': '本地账户', 'LOCAL CONTROL PLANE': '本地控制中心', Settings: '设置',
  'Manage local code projects, send coding tasks to DSH, and review the results here.': '在这里管理本地代码仓库，把开发任务交给 DSH 执行，并查看执行结果。',
  'Repositories registered to this local workspace.': '已添加到此工作区的代码仓库。',
  'Track and organize work across your projects.': '跟踪并管理各项目的任务。',
  'Local service configuration and access.': '本地服务配置与访问权限。',
  'Add project': '添加项目', 'New task': '新建任务', Projects: '项目', 'registered repositories': '个已登记仓库',
  'Active tasks': '进行中的任务', 'Pending, queued, or running': '待处理、排队或运行中', 'Failed tasks': '失败任务',
  'Waiting tasks': '等待中的任务', 'queued for execution': '个等待执行',
  Completed: '已完成', failed: '失败', Pending: '待处理', Waiting: '等待中', Queued: '排队中', Running: '运行中', Cancelled: '已取消', 'Recent tasks': '最近任务', 'Latest activity across your projects': '各项目的最新动态',
  'View all': '查看全部', 'System status': '系统状态', 'Local service health': '本地服务运行状态', Operational: '运行正常', Offline: '离线',
  'Project access is restricted to configured directories.': '项目访问范围受配置的目录限制。',
  'A valid ACC API token is required': '需要有效的 ACC API 令牌。',
  'Workspace status': '工作区状态', 'ACC API': 'ACC API', 'DSH mode': 'DSH 模式',
  'DSH runs with the current Windows user permissions.': 'DSH 使用当前 Windows 用户权限执行。',
  'Git repositories available to ACC': 'ACC 可访问的 Git 仓库', 'Manage projects': '管理项目', 'No projects registered': '尚未添加项目',
  'Add a local Git repository to start organizing work.': '添加本地 Git 仓库以开始管理工作。', 'All projects': '全部项目', repositories: '个仓库',
  'Register an existing Git repository under an authorized root.': '添加授权目录下已有的 Git 仓库。',
  'All tasks': '全部任务', 'Filter tasks': '筛选任务', 'total · run status and results are persisted by the API': '个任务 · 运行状态和结果由 API 保存',
  'Local service': '本地服务', 'Connection and workspace security': '连接与工作区安全', Connected: '已连接', Disconnected: '未连接',
  'ACC API token': 'ACC API 令牌', 'Used by the browser when the local API requires authentication.': '本地 API 要求身份验证时使用。',
  'Enter token from .env': '请输入本地 API 令牌', Hide: '隐藏', Show: '显示',
  'No tasks yet': '暂无任务', 'Create your first task': '创建第一个任务',
  'Add a project before creating tasks.': '请先添加项目，再创建任务。',
  'No tasks match your search.': '没有符合搜索条件的任务。',
  '(default)': '（默认）', 'Project roots': '项目授权目录', 'ACC_ALLOWED_ROOTS defines which local directories can be registered.': 'ACC_ALLOWED_ROOTS 用于限制可添加的本地目录。',
  'Configured in backend .env': '在后端 .env 中配置', 'Service binds to localhost. Never expose this API to a public network.': '服务仅监听本机，请勿将 API 暴露到公网。',
  'Dismiss': '关闭', 'Register a project': '添加项目', 'Create a task': '创建任务',
  'Project name': '项目名称', 'Repository path': '仓库路径', 'Use an existing Git repository inside an authorized root.': '请输入授权目录下已有的 Git 仓库。',
  Cancel: '取消', 'Register project': '登记项目', Project: '项目', 'Select a project': '选择项目', 'Task title': '任务标题',
  'Task description': '任务描述', Priority: '优先级', Urgent: '紧急', Normal: '普通', Low: '低', Backlog: '待办',
  'Starts as Pending': '初始状态：待处理', 'Create task': '创建任务', Task: '任务', Status: '状态', Created: '创建时间',
  'No tasks match this view.': '没有符合条件的任务。', Branch: '分支', Tasks: '任务', 'Working tree': '工作区状态', Changes: '有修改', Clean: '干净',
  'Unavailable': '不可用', 'Run with DSH': '使用 DSH 运行', 'Delete task': '删除任务', 'Remove project record': '移除项目记录',
  'Delete this task record?': '确定删除此任务记录吗？', 'Filter options': '筛选选项', 'Help': '帮助', 'Overview': '总览',
  'Project registration failed': '项目添加失败', 'Task creation failed': '任务创建失败', 'Task dispatch failed': '任务提交失败', 'Delete failed': '删除失败',
  'Network diagnostics': '网络诊断', 'Implement interface discovery': '实现接口发现',
  'Language': '语言', 'Close': '关闭', 'No projects yet': '暂无项目',
  'Managed in desktop settings': '由桌面应用配置管理',
  'Desktop app authorizes folders under your home directory by default.': '已有仓库需要位于授权目录；新仓库可创建在当前用户有写入权限的位置。',
  'Request failed': '请求失败',
  'Describe the scope and acceptance criteria.': '描述任务范围和验收标准。',
  'Create local project': '新建本地项目', 'Existing repository': '已有仓库', 'New local repository': '新建本地仓库',
  'Create repository': '创建仓库', 'Register existing repository': '登记已有仓库',
  'Select how this project should be added.': '选择项目的添加方式。',
  'Choose an existing Git repository inside an authorized directory.': '选择授权目录下已有的 Git 仓库。',
  'Run history': '运行记录', 'View run details': '查看运行详情', 'No runs yet': '暂无运行记录',
  Output: '输出', 'Final response': '最终答复', Error: '错误', 'Exit code': '退出代码', Session: '会话', 'Waiting for output': '等待 DSH 完成…', 'No output yet': '暂无输出',
  'DSH returned no final text.': 'DSH 未返回最终文本。', 'DSH execution': 'DSH 执行', 'Headless local adapter': '本机无界面适配器',
  'Completed task records': '已完成任务记录', 'Failed task records': '失败任务记录',
  'DSH enabled for registered projects': '已登记项目可调用 DSH',
  Started: '开始时间', Finished: '结束时间', Run: '运行',
}

function tr(text: string, language: Language) {
  if (text === 'Choose a new folder inside an authorized directory. The folder must not exist yet.') {
    return language === 'zh'
      ? '可以选择任意位置；ACC 会自动创建中间文件夹，当前用户需有写入权限。'
      : 'Choose any new path. Missing parent folders are created automatically; you need write permission there.'
  }
  return language === 'zh' ? translations[text] ?? text : text
}

const statusLabel: Record<string, string> = { pending: 'Pending', waiting: 'Waiting', queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' }
const emptyStats: Stats = { projects: 0, waiting_tasks: 0, completed_tasks: 0, failed_tasks: 0 }

function finalResponse(output: string | null) {
  if (!output?.trim()) return ''
  const lines = output.split(/\r?\n/)
  let finalText = ''
  let hasStructuredEvents = false
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      if (typeof event.type === 'string' || typeof event.event === 'string') hasStructuredEvents = true
      if (event.type !== 'final' && event.event !== 'final') continue
      const value = event.text ?? event.content ?? event.answer ?? event.message
      if (typeof value === 'string') finalText = value
      else if (Array.isArray(value)) finalText = value.map(part => typeof part === 'string' ? part : (part as { text?: string }).text ?? '').join('')
    } catch { /* DSH may return ordinary text instead of JSON events. */ }
  }
  return finalText || (hasStructuredEvents ? '' : output)
}

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('acc-language') as Language) || 'zh')
  const [page, setPage] = useState<Page>('Overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [online, setOnline] = useState(false)
  const [token, setToken] = useState(() => sessionStorage.getItem('acc-token') ?? window.accDesktop?.apiToken ?? '')
  const [showToken, setShowToken] = useState(false)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'project' | 'task' | null>(null)
  const [runHistory, setRunHistory] = useState<{ task: Task; runs: TaskRun[] } | null>(null)
  const [projectDraft, setProjectDraft] = useState({ name: '', path: '', mode: 'existing' as 'existing' | 'new' })
  const [taskDraft, setTaskDraft] = useState({ project_id: '', title: '', description: '', priority: 2 })
  const [error, setError] = useState('')

  const api = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${window.accDesktop?.apiBaseUrl ?? ''}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(window.accDesktop?.apiToken || token ? { Authorization: `Bearer ${window.accDesktop?.apiToken || token}` } : {}), ...init.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed (${response.status})`)
    }
    return response.status === 204 ? undefined as T : response.json()
  }

  const refresh = async () => {
    try {
      const [projectData, taskData, statData] = await Promise.all([
        api<Project[]>('/projects'), api<Task[]>('/tasks'), api<Stats>('/dashboard'),
      ])
      setProjects(projectData); setTasks(taskData); setStats(statData); setOnline(true); setError('')
    } catch (cause) {
      setOnline(false)
      if (cause instanceof Error) setError(cause.message)
    }
  }

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 8000); return () => window.clearInterval(timer) }, [token])
  useEffect(() => { sessionStorage.setItem('acc-token', token) }, [token])
  useEffect(() => { localStorage.setItem('acc-language', language); document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en' }, [language])
  useEffect(() => {
    if (!runHistory) return
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const runs = await api<TaskRun[]>(`/tasks/${runHistory.task.id}/runs`)
        if (active) setRunHistory(current => current?.task.id === runHistory.task.id ? { ...current, runs } : current)
      } catch { /* Keep the last known run state while the local service reconnects. */ }
    }, 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [runHistory?.task.id, token])

  const visibleTasks = useMemo(() => tasks.filter(task => `${task.title} ${task.project_name} ${task.status}`.toLowerCase().includes(query.toLowerCase())), [tasks, query])
  const activeTaskCount = tasks.filter(task => ['pending', 'waiting', 'queued', 'running'].includes(task.status)).length
  const navItems: { label: Page; icon: typeof LayoutDashboard; count?: number }[] = [
    { label: 'Overview', icon: LayoutDashboard }, { label: 'Projects', icon: FolderGit2, count: projects.length }, { label: 'Tasks', icon: ListTodo, count: tasks.length }, { label: 'Settings', icon: Settings2 },
  ]

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault()
    try { await api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name: projectDraft.name, path: projectDraft.path, create_repository: projectDraft.mode === 'new' }) }); setModal(null); setProjectDraft({ name: '', path: '', mode: 'existing' }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Project registration failed') }
  }
  const submitTask = async (event: React.FormEvent) => {
    event.preventDefault()
    try { await api<Task>('/tasks', { method: 'POST', body: JSON.stringify(taskDraft) }); setModal(null); setTaskDraft({ project_id: '', title: '', description: '', priority: 2 }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Task creation failed') }
  }
  const runTask = async (id: string) => {
    try {
      const run = await api<TaskRun>(`/tasks/${id}/runs`, { method: 'POST' })
      const task = tasks.find(item => item.id === id)
      if (task) setRunHistory({ task, runs: [run] })
      await refresh()
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Task dispatch failed') }
  }
  const inspectTaskRuns = async (task: Task) => {
    try {
      const runs = await api<TaskRun[]>(`/tasks/${task.id}/runs`)
      setRunHistory({ task, runs })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed') }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={18} /></div><div><b>ACC</b><span>{tr('Local AI workbench', language)}</span></div></div>
      <div className="workspace"><div className="workspace-icon">A</div><div className="workspace-name"><b>{tr('Local workspace', language)}</b><span>{tr('Personal instance', language)}</span></div><ChevronDown size={15} /></div>
      <div className="nav-caption">{tr('WORKSPACE', language)}</div>
      <nav>{navItems.map(item => <button className={`nav-item ${page === item.label ? 'selected' : ''}`} key={item.label} title={tr(item.label, language)} onClick={() => setPage(item.label)}><item.icon size={17} /><span>{tr(item.label, language)}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
      <div className="side-divider" />
      <div className="nav-caption">{tr('PROJECTS', language)} <button title={tr('Add project', language)} onClick={() => setModal('project')}><Plus size={14} /></button></div>
      <div className="project-nav">{projects.slice(0, 5).map((project, index) => <button key={project.id} onClick={() => setPage('Projects')}><span className={`project-dot dot-${index % 4}`} />{project.name}</button>)}{projects.length === 0 && <span className="muted side-empty">{tr('No projects yet', language)}</span>}</div>
      <div className="sidebar-footer"><div className="connection-dot" /><span>{tr(online ? 'API connected' : 'API disconnected', language)}</span><span className="version">v0.1.0</span></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>{tr('Workspace', language)}</span><span className="crumb-slash">/</span><b>{tr(page, language)}</b></div><div className="top-actions"><select className="language-select" aria-label={tr('Language', language)} value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="en">English</option><option value="zh">中文</option></select><button className="icon-button" title={tr('Help', language)}><CircleHelp size={17} /></button><button className="avatar-button" title={tr('Local account', language)}>L</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{tr('LOCAL AI WORKBENCH', language)}</div><h1>{tr(page, language)}</h1><p>{tr(page === 'Overview' ? 'Manage local code projects, send coding tasks to DSH, and review the results here.' : page === 'Projects' ? 'Repositories registered to this local workspace.' : page === 'Tasks' ? 'Track and organize work across your projects.' : 'Local service configuration and access.', language)}</p></div><div className="heading-actions">{page !== 'Settings' && <><button className="button secondary" onClick={() => setModal('project')}><Plus size={15} /> {tr('Add project', language)}</button><button className="button primary" onClick={() => setModal('task')} disabled={projects.length === 0}><Sparkles size={15} /> {tr('New task', language)}</button></>}</div></div>
        {error && <div className="error-banner"><AlertCircle size={16} /><span>{language === 'zh' ? translations[error] ?? error : error}</span><button title={tr('Dismiss', language)} onClick={() => setError('')}><X size={15} /></button></div>}
        {page === 'Overview' && <>
          <section className="metrics-grid">
            <Metric icon={FolderGit2} label={tr('Projects', language)} value={projects.length} foot={tr('registered repositories', language)} accent="mint" />
            <Metric icon={Activity} label={tr('Active tasks', language)} value={activeTaskCount} foot={tr('Pending, queued, or running', language)} accent="blue" />
            <Metric icon={ShieldCheck} label={tr('Completed', language)} value={stats.completed_tasks} foot={tr('Completed task records', language)} accent="amber" />
            <Metric icon={AlertCircle} label={tr('Failed tasks', language)} value={stats.failed_tasks} foot={tr('Failed task records', language)} accent="coral" />
          </section>
          <div className="overview-grid">
            <section className="panel task-panel"><div className="panel-header"><div><h2>{tr('Recent tasks', language)}</h2><p>{tr('Latest activity across your projects', language)}</p></div><button className="text-button" onClick={() => setPage('Tasks')}>{tr('View all', language)} <ArrowUpRight size={14} /></button></div><TaskTable tasks={visibleTasks.slice(0, 6)} onRun={runTask} onInspect={inspectTaskRuns} onCreate={!query ? () => setModal(projects.length ? 'task' : 'project') : undefined} emptyAction={tr(projects.length ? 'Create task' : 'Add project', language)} emptyMessage={tr(query ? 'No tasks match your search.' : projects.length ? 'No tasks yet' : 'Add a project before creating tasks.', language)} language={language} /></section>
            <section className="panel right-panel"><div className="panel-header"><div><h2>{tr('System status', language)}</h2><p>{tr('Local service health', language)}</p></div><span className={`health-tag ${online ? 'healthy' : 'offline'}`}><i />{tr(online ? 'Operational' : 'Offline', language)}</span></div><div className="system-line"><span><Activity size={16} /> ACC API</span><b>{tr(online ? 'Connected' : 'Disconnected', language)}</b></div><div className="system-line"><span><Bot size={16} /> {tr('DSH execution', language)}</span><b>{tr('Headless local adapter', language)}</b></div><div className="system-note"><ShieldCheck size={16} /><span>{tr('Project access is restricted to configured directories.', language)}</span></div><div className="system-line metric-line"><span>{tr('Workspace status', language)}</span><b>{tr('DSH enabled for registered projects', language)}</b></div></section>
          </div>
          <section className="panel projects-panel"><div className="panel-header"><div><h2>{tr('Projects', language)}</h2><p>{tr('Git repositories available to ACC', language)}</p></div><button className="text-button" onClick={() => setPage('Projects')}>{tr('Manage projects', language)} <ArrowUpRight size={14} /></button></div>{projects.length ? <ProjectTable projects={projects.slice(0, 4)} onDelete={async id => { try { await api(`/projects/${id}`, { method: 'DELETE' }); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delete failed') } }} language={language} /> : <EmptyState title={tr('No projects registered', language)} text={tr('Add a local Git repository to start organizing work.', language)} action={tr('Add project', language)} onClick={() => setModal('project')} />}</section>
        </>}
        {page === 'Projects' && <section className="panel full-panel"><div className="panel-header"><div><h2>{tr('All projects', language)}</h2><p>{projects.length} {tr('repositories', language)}</p></div><button className="button secondary compact" onClick={() => setModal('project')}><Plus size={15} /> {tr('Add project', language)}</button></div>{projects.length ? <ProjectTable projects={projects} onDelete={async id => { try { await api(`/projects/${id}`, { method: 'DELETE' }); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delete failed') } }} language={language} /> : <EmptyState title={tr('No projects registered', language)} text={tr('Register an existing Git repository under an authorized root.', language)} action={tr('Add project', language)} onClick={() => setModal('project')} />}</section>}
        {page === 'Tasks' && <section className="panel full-panel"><div className="panel-header task-list-header"><div><h2>{tr('All tasks', language)}</h2><p>{tasks.length} {tr('total · run status and results are persisted by the API', language)}</p></div><div className="table-actions"><label className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr('Filter tasks', language)} /></label><button className="icon-button filter-button" title={tr('Filter options', language)}><SlidersHorizontal size={16} /></button><button className="button primary compact" onClick={() => setModal('task')} disabled={!projects.length}><Plus size={15} /> {tr('New task', language)}</button></div></div><TaskTable tasks={visibleTasks} onRun={runTask} onInspect={inspectTaskRuns} onCreate={!query ? () => setModal(projects.length ? 'task' : 'project') : undefined} emptyAction={tr(projects.length ? 'Create task' : 'Add project', language)} emptyMessage={tr(query ? 'No tasks match your search.' : projects.length ? 'No tasks yet' : 'Add a project before creating tasks.', language)} onDelete={async id => { if (!window.confirm(tr('Delete this task record?', language))) return; try { await api(`/tasks/${id}`, { method: 'DELETE' }); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delete failed') } }} language={language} /></section>}
        {page === 'Settings' && <section className="panel settings-panel"><div className="panel-header"><div><h2>{tr('Local service', language)}</h2><p>{tr('Connection and workspace security', language)}</p></div><span className={`health-tag ${online ? 'healthy' : 'offline'}`}><i />{tr(online ? 'Connected' : 'Disconnected', language)}</span></div><div className="setting-row"><div><b>{tr('ACC API token', language)}</b><p>{tr('Used by the browser when the local API requires authentication.', language)}</p></div><div className="token-control"><input type={showToken ? 'text' : 'password'} value={window.accDesktop?.apiToken ?? token} disabled={!!window.accDesktop} onChange={e => setToken(e.target.value)} placeholder={tr('Enter token from .env', language)} /><button className="button secondary compact" onClick={() => setShowToken(!showToken)}>{tr(showToken ? 'Hide' : 'Show', language)}</button></div></div><div className="setting-row"><div><b>{tr('Project roots', language)}</b><p>{tr(window.accDesktop ? 'Desktop app authorizes folders under your home directory by default.' : 'ACC_ALLOWED_ROOTS defines which local directories can be registered.', language)}</p></div><span className="setting-value">{tr(window.accDesktop ? 'Managed in desktop settings' : 'Configured in backend .env', language)}</span></div><div className="settings-foot"><ShieldCheck size={16} /> {tr('Service binds to localhost. Never expose this API to a public network.', language)}</div></section>}
      </div>
    </main>

    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null) }}><section className="modal"><div className="modal-head"><div><span className="modal-kicker">{tr('WORKSPACE', language)}</span><h2>{tr(modal === 'project' ? (projectDraft.mode === 'new' ? 'Create local project' : 'Register a project') : 'Create a task', language)}</h2></div><button className="icon-button" title={tr('Close', language)} onClick={() => setModal(null)}><X size={17} /></button></div>
      {modal === 'project' ? <form onSubmit={submitProject}><div><span className="field-label">{tr('Select how this project should be added.', language)}</span><div className="project-mode" role="group" aria-label={tr('Select how this project should be added.', language)}><button type="button" className={projectDraft.mode === 'existing' ? 'selected' : ''} aria-pressed={projectDraft.mode === 'existing'} onClick={() => setProjectDraft({ ...projectDraft, mode: 'existing' })}><FolderGit2 size={14} />{tr('Existing repository', language)}</button><button type="button" className={projectDraft.mode === 'new' ? 'selected' : ''} aria-pressed={projectDraft.mode === 'new'} onClick={() => setProjectDraft({ ...projectDraft, mode: 'new' })}><Plus size={14} />{tr('New local repository', language)}</button></div></div><label>{tr('Project name', language)}<input autoFocus required maxLength={120} value={projectDraft.name} onChange={e => setProjectDraft({ ...projectDraft, name: e.target.value })} placeholder={tr('Network diagnostics', language)} /></label><label>{tr('Repository path', language)}<input required value={projectDraft.path} onChange={e => setProjectDraft({ ...projectDraft, path: e.target.value })} placeholder={projectDraft.mode === 'new' ? 'D:\\Projects\\new-project' : 'D:\\Projects\\network-tool'} /><small>{tr(projectDraft.mode === 'new' ? 'Choose a new folder inside an authorized directory. The folder must not exist yet.' : 'Choose an existing Git repository inside an authorized directory.', language)}</small></label><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setModal(null)}>{tr('Cancel', language)}</button><button className="button primary"><FolderGit2 size={15} /> {tr(projectDraft.mode === 'new' ? 'Create repository' : 'Register existing repository', language)}</button></div></form> : <form onSubmit={submitTask}><label>{tr('Project', language)}<select autoFocus required value={taskDraft.project_id} onChange={e => setTaskDraft({ ...taskDraft, project_id: e.target.value })}><option value="">{tr('Select a project', language)}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>{tr('Task title', language)}<input required maxLength={160} value={taskDraft.title} onChange={e => setTaskDraft({ ...taskDraft, title: e.target.value })} placeholder={tr('Implement interface discovery', language)} /></label><label>{tr('Task description', language)}<textarea required maxLength={20000} value={taskDraft.description} onChange={e => setTaskDraft({ ...taskDraft, description: e.target.value })} placeholder={tr('Describe the scope and acceptance criteria.', language)} /></label><div className="form-split"><label>{tr('Priority', language)}<select value={taskDraft.priority} onChange={e => setTaskDraft({ ...taskDraft, priority: Number(e.target.value) })}><option value="1">{tr('Urgent', language)}</option><option value="2">{tr('Normal', language)}</option><option value="3">{tr('Low', language)}</option><option value="4">{tr('Backlog', language)}</option></select></label><div className="pending-hint"><Clock3 size={14} /> {tr('Starts as Pending', language)}</div></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setModal(null)}>{tr('Cancel', language)}</button><button className="button primary"><Plus size={15} /> {tr('Create task', language)}</button></div></form>}
    </section></div>}
    {runHistory && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setRunHistory(null) }}><section className="modal run-modal" role="dialog" aria-modal="true" aria-label={tr('Run history', language)}><div className="modal-head"><div><span className="modal-kicker">{tr('Task', language)} · ACC-{runHistory.task.id.slice(0, 6).toUpperCase()}</span><h2>{tr('Run history', language)}</h2><p className="run-task-title">{runHistory.task.title}</p></div><button className="icon-button" title={tr('Close', language)} onClick={() => setRunHistory(null)}><X size={17} /></button></div>{runHistory.runs.length ? <div className="run-list">{runHistory.runs.map(run => { const response = finalResponse(run.result) || (run.status === 'running' || run.status === 'queued' ? tr('Waiting for output', language) : tr('DSH returned no final text.', language)); return <article className="run-item" key={run.id}><div className="run-item-head"><span className={`status-badge ${run.status}`}><i />{tr(statusLabel[run.status] ?? run.status, language)}</span><span className="run-meta">{tr('Started', language)}: {run.started_at ? new Date(run.started_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : '—'}</span></div><div className="run-facts">{run.exit_code !== null && <span>{tr('Exit code', language)}: <b>{run.exit_code}</b></span>}{run.session_id && <span>{tr('Session', language)}: <b>{run.session_id}</b></span>}{run.finished_at && <span>{tr('Finished', language)}: <b>{new Date(run.finished_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</b></span>}</div>{run.error && <div className="run-error"><b>{tr('Error', language)}</b><p>{run.error}</p></div>}<div className="run-output-label">{tr('Final response', language)}</div><div className="run-output"><ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown></div></article>})}</div> : <div className="table-empty run-empty"><ScrollText size={20} /><span>{tr('No runs yet', language)}</span></div>}</section></div>}
  </div>
}

function Metric({ icon: Icon, label, value, foot, accent }: { icon: typeof FolderGit2; label: string; value: number; foot: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={17} /></div><span className="metric-label">{label}</span><div className="metric-value">{value.toLocaleString()}</div><div className="metric-foot"><span>{foot}</span></div></article>
}

function TaskTable({ tasks, onDelete, onRun, onInspect, onCreate, emptyAction, emptyMessage, language }: { tasks: Task[]; onDelete?: (id: string) => void; onRun?: (id: string) => void; onInspect?: (task: Task) => void; onCreate?: () => void; emptyAction: string; emptyMessage: string; language: Language }) {
  if (!tasks.length) return <div className="table-empty"><ListTodo size={20} /><span>{emptyMessage}</span>{onCreate && <Button variant="secondary" size="compact" onClick={onCreate}><Plus size={14} />{emptyAction}</Button>}</div>
  return <div className="table-scroll"><table><thead><tr>{['Task','Project','Status','Priority','Created'].map(label => <th key={label}>{tr(label, language)}</th>)}{(onDelete || onRun || onInspect) && <th />}</tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><div className="task-name"><span className="task-mark"><Command size={13} /></span><div><b>{task.title}</b><small>ACC-{task.id.slice(0, 6).toUpperCase()}</small></div></div></td><td><span className="project-cell"><FolderGit2 size={14} />{task.project_name}</span></td><td><span className={`status-badge ${task.status}`}><i />{tr(statusLabel[task.status] ?? task.status, language)}</span></td><td><span className={`priority priority-${task.priority}`}><span />{tr(['', 'Urgent', 'Normal', 'Low', 'Backlog'][task.priority], language)}</span></td><td className="date-cell">{new Date(task.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</td>{(onDelete || onRun || onInspect) && <td className="row-actions">{onRun && <button className="row-action" title={tr('Run with DSH', language)} onClick={() => onRun(task.id)} disabled={task.status === 'running' || task.status === 'waiting'}><Play size={14} /></button>}{onInspect && <button className="row-action" title={tr('View run details', language)} onClick={() => onInspect(task)}><ScrollText size={14} /></button>}{onDelete && <button className="row-action" title={tr('Delete task', language)} onClick={() => onDelete(task.id)}><X size={15} /></button>}</td>}</tr>)}</tbody></table></div>
}

function ProjectTable({ projects, onDelete, language }: { projects: Project[]; onDelete: (id: string) => void; language: Language }) {
  return <div className="table-scroll"><table><thead><tr>{['Project','Repository','Branch','Tasks','Working tree'].map(label => <th key={label}>{tr(label, language)}</th>)}<th /></tr></thead><tbody>{projects.map(project => <tr key={project.id}><td><div className="project-name-cell"><span className="project-icon"><FolderGit2 size={16} /></span><b>{project.name}</b></div></td><td className="path-cell" title={project.path}>{project.path}</td><td><span className="branch-cell"><GitBranch size={13} />{project.branch ?? tr('Unavailable', language)}</span></td><td>{project.task_count}</td><td><span className={`git-state ${project.git_dirty ? 'dirty' : 'clean'}`}><i />{tr(project.git_dirty ? 'Changes' : 'Clean', language)}</span></td><td><button className="row-action" title={tr('Remove project record', language)} onClick={() => onDelete(project.id)}><X size={15} /></button></td></tr>)}</tbody></table></div>
}

function EmptyState({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><FolderGit2 size={20} /></div><b>{title}</b><p>{text}</p><Button variant="secondary" size="compact" onClick={onClick}><Plus size={14} />{action}</Button></div>
}

export default App
