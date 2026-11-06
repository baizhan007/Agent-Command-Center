import type React from 'react'
import {
  Bot,
  Command,
  FolderGit2,
  GitBranch,
  ListTodo,
  LoaderCircle,
  Play,
  Plus,
  ScrollText,
  X,
} from 'lucide-react'
import { Button } from './ui/button'
import { ActionMenu } from './action-menu'
import type { Language, Project, Task } from '../lib/domain'
import { statusLabel } from '../lib/domain'
import { tr } from '../lib/i18n'

export function AgentTree({
  tasks,
  onInspect,
  language,
}: {
  tasks: Task[]
  onInspect: (task: Task) => void
  language: Language
}) {
  const children = new Map<string, Task[]>()
  for (const task of tasks) {
    if (task.parent_task_id)
      children.set(task.parent_task_id, [...(children.get(task.parent_task_id) ?? []), task])
  }
  const ids = new Set(tasks.map((task) => task.id))
  const roots = tasks.filter((task) => !task.parent_task_id || !ids.has(task.parent_task_id))
  if (!roots.length)
    return (
      <div className="agent-tree-empty">
        <Bot aria-hidden="true" size={20} />
        <b>{tr('No agent work yet', language)}</b>
        <span>{tr('Start a mission from Codex MCP to see it here.', language)}</span>
      </div>
    )
  const renderNode = (task: Task, depth: number): React.ReactNode => (
    <div className="agent-tree-node" key={task.id}>
      <div
        className={`agent-tree-row ${depth ? 'child' : 'root'}`}
        style={{ '--depth': depth } as React.CSSProperties}
      >
        <span className={`agent-tree-icon ${task.agent}`}>
          <Bot aria-hidden="true" size={15} />
        </span>
        <span className="agent-tree-copy">
          <button className="task-title-button" onClick={() => onInspect(task)}>
            {task.title}
          </button>
          <small>
            {task.agent === 'codex' ? 'Codex' : 'DSH'} · {task.project_name} · ACC-
            {task.id.slice(0, 6).toUpperCase()}
          </small>
        </span>
        <span className={`status-badge ${task.status}`}>
          <i />
          {tr(statusLabel[task.status] ?? task.status, language)}
        </span>
        <button
          className="row-action"
          aria-label={tr('Task details', language)}
          title={tr('Task details', language)}
          onClick={() => onInspect(task)}
        >
          <ScrollText aria-hidden="true" size={14} />
        </button>
      </div>
      {(children.get(task.id) ?? []).map((child) => renderNode(child, depth + 1))}
    </div>
  )
  return <div className="agent-tree">{roots.map((task) => renderNode(task, 0))}</div>
}

export function TaskTable({
  tasks,
  onDelete,
  onRun,
  onInspect,
  onCreate,
  dispatchingIds,
  emptyAction,
  emptyMessage,
  language,
}: {
  tasks: Task[]
  onDelete?: (id: string) => void
  onRun?: (id: string) => void
  onInspect?: (task: Task) => void
  onCreate?: () => void
  dispatchingIds?: ReadonlySet<string>
  emptyAction: string
  emptyMessage: string
  language: Language
}) {
  if (!tasks.length)
    return (
      <div className="table-empty">
        <ListTodo aria-hidden="true" size={20} />
        <span>{emptyMessage}</span>
        {onCreate && (
          <Button variant="secondary" size="compact" onClick={onCreate}>
            <Plus aria-hidden="true" size={14} />
            {emptyAction}
          </Button>
        )}
      </div>
    )
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={tr('Scrollable table', language)}
    >
      <table>
        <thead>
          <tr>
            {['Task', 'Project', 'Status', 'Priority', 'Created'].map((label) => (
              <th scope="col" key={label}>
                {tr(label, language)}
              </th>
            ))}
            {(onDelete || onRun || onInspect) && (
              <th scope="col">
                <span className="sr-only">{tr('Actions', language)}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <div className="task-name">
                  <span className="task-mark">
                    {task.agent === 'dsh' ? <Bot aria-hidden="true" size={15} /> : <Command aria-hidden="true" size={13} />}
                  </span>
                  <div>
                    {onInspect ? (
                      <button className="task-title-button" onClick={() => onInspect(task)}>
                        {task.title}
                      </button>
                    ) : (
                      <b>{task.title}</b>
                    )}
                    <small>{task.agent === 'dsh' ? 'DSH' : 'Codex'} · ACC-{task.id.slice(0, 6).toUpperCase()}</small>
                  </div>
                </div>
              </td>
              <td>
                <span className="project-cell">
                  <FolderGit2 aria-hidden="true" size={14} />
                  {task.project_name}
                </span>
              </td>
              <td>
                <span className={`status-badge ${task.status}`}>
                  <i />
                  {tr(statusLabel[task.status] ?? task.status, language)}
                </span>
              </td>
              <td>
                <span className={`priority priority-${task.priority}`}>
                  <span />
                  {tr(['', 'Urgent', 'Normal', 'Low', 'Backlog'][task.priority], language)}
                </span>
              </td>
              <td className="date-cell" title={new Date(task.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}>
                <time dateTime={task.created_at}>{new Date(task.created_at).toLocaleDateString(
                  language === 'zh' ? 'zh-CN' : 'en-US',
                )}</time>
              </td>
              {(onDelete || onRun || onInspect) && (
                <td className="row-actions">
                  {onRun && task.agent === 'dsh' && (
                    <button
                      className="row-action"
                      aria-label={tr('Run with DSH', language)}
                      title={tr('Run with DSH', language)}
                      onClick={() => onRun(task.id)}
                      disabled={
                        dispatchingIds?.has(task.id) ||
                        ['queued', 'running', 'waiting'].includes(task.status)
                      }
                    >
                      {dispatchingIds?.has(task.id)
                        ? <LoaderCircle className="spin" aria-hidden="true" size={14} />
                        : <Play aria-hidden="true" size={14} />}
                    </button>
                  )}
                  {onInspect && (
                    <button
                      className="row-action"
                      aria-label={tr('View run details', language)}
                      title={tr('View run details', language)}
                      onClick={() => onInspect(task)}
                    >
                      <ScrollText aria-hidden="true" size={14} />
                    </button>
                  )}
                  {onDelete && (
                    <ActionMenu label={tr('More task actions', language)}
                      language={language} onDelete={() => onDelete(task.id)} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectTable({
  projects,
  onDelete,
  language,
}: {
  projects: Project[]
  onDelete: (id: string) => void
  language: Language
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={tr('Scrollable table', language)}
    >
      <table>
        <thead>
          <tr>
            {['Project', 'Repository', 'Branch', 'Tasks', 'Working tree'].map((label) => (
              <th scope="col" key={label}>
                {tr(label, language)}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">{tr('Actions', language)}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>
                <div className="project-name-cell">
                  <span className="project-icon">
                    <FolderGit2 aria-hidden="true" size={16} />
                  </span>
                  <b>{project.name}</b>
                </div>
              </td>
              <td className="path-cell" title={project.path}>
                {project.path}
              </td>
              <td>
                <span className="branch-cell">
                  <GitBranch aria-hidden="true" size={13} />
                  {project.branch ?? tr('Unavailable', language)}
                </span>
              </td>
              <td>{project.task_count}</td>
              <td>
                <span
                  className={`git-state ${project.git_dirty === null ? 'unknown' : project.git_dirty ? 'dirty' : 'clean'}`}
                >
                  <i />
                  {tr(
                    project.git_dirty === null
                      ? 'Unavailable'
                      : project.git_dirty
                        ? 'Changes'
                        : 'Clean',
                    language,
                  )}
                </span>
              </td>
              <td>
                <button
                  className="row-action"
                  aria-label={tr('Remove project record', language)}
                  title={tr('Remove project record', language)}
                  onClick={() => onDelete(project.id)}
                >
                  <X aria-hidden="true" size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
  onClick,
}: {
  title: string
  text: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FolderGit2 aria-hidden="true" size={20} />
      </div>
      <b>{title}</b>
      <p>{text}</p>
      <Button variant="secondary" size="compact" onClick={onClick}>
        <Plus aria-hidden="true" size={14} />
        {action}
      </Button>
    </div>
  )
}
