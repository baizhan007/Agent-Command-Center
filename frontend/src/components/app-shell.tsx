import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  Command,
  FolderGit2,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  Plus,
  Settings2,
} from 'lucide-react'
import type { Language, Page, Project } from '../lib/domain'
import { tr } from '../lib/i18n'

type ShellProps = {
  page: Page
  onNavigate: (page: Page) => void
  language: Language
  onLanguage: (language: Language) => void
  projects: Project[]
  taskCount: number
  online: boolean
  workspaceId?: string
  onWorkspace: (id: string) => void
  codexOpening: boolean
  codexOpenError: string
  onOpenCodex: () => void
  onAddProject: () => void
  onHelp: () => void
}

export function Sidebar({
  page,
  onNavigate,
  language,
  projects,
  taskCount,
  online,
  workspaceId,
  onWorkspace,
  onAddProject,
}: ShellProps) {
  const items = [
    { page: 'Overview' as const, icon: LayoutDashboard },
    {
      page: 'Projects' as const,
      icon: FolderGit2,
      count: projects.filter((project) => !workspaceId || project.id === workspaceId).length,
    },
    { page: 'Tasks' as const, icon: ListTodo, count: taskCount },
    { page: 'Settings' as const, icon: Settings2 },
  ]
  return (
    <aside className="sidebar">
      <a
        className="brand"
        href="#overview"
        onClick={(event) => {
          event.preventDefault()
          onNavigate('Overview')
        }}
      >
        <span className="brand-mark">
          <Command size={21} aria-hidden="true" />
        </span>
        <span>
          <b>
            ACC<span className="brand-period">.</span>
          </b>
          <small>AGENT COMMAND CENTER</small>
        </span>
      </a>
      <div className="nav-caption">{tr('WORKSPACE', language)}</div>
      <nav aria-label={tr('Workspace', language)}>
        {items.map((item) => (
          <a
            href={'#' + item.page.toLowerCase()}
            className={'nav-item ' + (page === item.page ? 'selected' : '')}
            key={item.page}
            aria-current={page === item.page ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(item.page)
            }}
          >
            <item.icon size={18} aria-hidden="true" />
            <span>{tr(item.page, language)}</span>
            {item.count !== undefined && <small>{item.count}</small>}
          </a>
        ))}
      </nav>
      <div className="side-divider" />
      <div className="nav-caption">
        {tr('PROJECTS', language)}
        <button aria-label={tr('Add project', language)} onClick={onAddProject}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="project-nav">
        {projects.slice(0, 6).map((project) => (
          <button
            key={project.id}
            title={project.path}
            className={workspaceId === project.id ? 'active' : ''}
            onClick={() => {
              onWorkspace(project.id)
              onNavigate('Overview')
            }}
          >
            <span className="project-dot" aria-hidden="true" />
            <span>{project.name}</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        ))}
        {!projects.length && (
          <button className="side-empty" onClick={onAddProject}>
            <Plus size={15} aria-hidden="true" />
            {tr('Add your first project', language)}
          </button>
        )}
      </div>
      <div className="sidebar-note">
        <Command size={19} aria-hidden="true" />
        <b>{tr('Local-first. Agent-ready.', language)}</b>
        <p>{tr('One workspace. Every agent in sync.', language)}</p>
      </div>
      <div className={'sidebar-footer ' + (online ? 'online' : 'offline')}>
        <span className="connection-dot" />
        <span>{tr(online ? 'API connected' : 'API disconnected', language)}</span>
        <span className="version">v0.1</span>
      </div>
    </aside>
  )
}

export function Topbar({
  page,
  language,
  onLanguage,
  online,
  onHelp,
  projects,
  workspaceId,
  onWorkspace,
  codexOpening,
  codexOpenError,
  onOpenCodex,
}: ShellProps) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <label className="global-workspace">
          <FolderGit2 size={16} aria-hidden="true" />
          <select
            aria-label={tr('Active workspace', language)}
            value={workspaceId ?? ''}
            onChange={(event) => onWorkspace(event.target.value)}
            title={projects.find((project) => project.id === workspaceId)?.path}
          >
            <option value="">{tr('All workspaces', language)}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <span className="crumb-slash">/</span>
        <b>{tr(page, language)}</b>
      </div>
      <div className="top-actions">
        <button
          className={'button secondary compact open-codex ' + (codexOpenError ? 'has-error' : '')}
          onClick={onOpenCodex}
          disabled={!workspaceId || codexOpening}
          title={tr(!workspaceId ? 'Select a workspace to open in Codex' : 'Switching workspaces automatically opens the project in Codex. Desktop model follows Codex settings.', language)}
          aria-label={tr(codexOpenError ? 'Retry opening Codex' : 'Open in Codex', language)}
          aria-busy={codexOpening}
        >
          {codexOpening ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
          <span>{tr(codexOpening ? 'Opening…' : codexOpenError ? 'Retry opening Codex' : 'Open in Codex', language)}</span>
        </button>
        <span className={'topbar-status ' + (online ? 'online' : 'offline')}>
          <Activity size={14} aria-hidden="true" />
          {tr(online ? 'Local service connected' : 'Local service offline', language)}
        </span>
        <select
          className="language-select"
          aria-label={tr('Language', language)}
          value={language}
          onChange={(event) => onLanguage(event.target.value as Language)}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
        <button className="icon-button" aria-label={tr('Help', language)} onClick={onHelp}>
          <CircleHelp size={19} aria-hidden="true" />
        </button>
      </div>
      {codexOpenError && <div className="workspace-open-error" role="alert">{tr('Codex could not open. Retry or check its installation.', language)} <span>{codexOpenError}</span></div>}
    </header>
  )
}
