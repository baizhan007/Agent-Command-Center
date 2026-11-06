import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, LoaderCircle, RefreshCw, ScrollText, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Language, Task, TaskRun } from '../lib/domain'
import { statusLabel } from '../lib/domain'
import { tr } from '../lib/i18n'
import { finalResponse } from '../lib/run-output'
import { Dialog } from './dialog'

function CopyResult({ text, language }: { text: string; language: Language }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const timer = window.setTimeout(() => setState('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [state])
  return <div className="copy-result">
    <button className="button ghost compact" disabled={state === 'copying'} onClick={async () => {
      setState('copying')
      try {
        await navigator.clipboard.writeText(text)
        setState('copied')
      } catch { setState('failed') }
    }}>
      {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {tr(state === 'copied' ? 'Copied' : state === 'copying' ? 'Copying…' : 'Copy result', language)}
    </button>
    <span className={state === 'failed' ? 'text-error' : 'sr-only'} role="status">
      {state === 'failed' ? tr('Copy failed. Select and copy the text manually.', language) : state === 'copied' ? tr('Copied', language) : ''}
    </span>
  </div>
}

export function TaskDetails({ task, initialRuns, loadRuns, onClose, language }: {
  task: Task
  initialRuns?: TaskRun[]
  loadRuns: (id: string, signal: AbortSignal) => Promise<TaskRun[]>
  onClose: () => void
  language: Language
}) {
  const [runs, setRuns] = useState<TaskRun[] | null>(initialRuns ?? null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const loader = useRef(loadRuns)
  loader.current = loadRuns
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const load = async (foreground: boolean) => {
      if (foreground) setLoading(true)
      try {
        const next = await loader.current(task.id, controller.signal)
        if (controller.signal.aborted) return
        setRuns(next)
        setError('')
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Request failed')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = window.setTimeout(() => void load(false), 4000)
        }
      }
    }
    void load(true)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [task.id, revision])
  const date = (value: string) => new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  return <Dialog className="run-modal" label={tr('Task details', language)} onClose={onClose}>
    <div className="modal-head detail-head">
      <div>
        <span className="modal-kicker">{tr('Task', language)} · ACC-{task.id.slice(0, 6).toUpperCase()}</span>
        <h2>{task.title}</h2>
        <p className="run-task-title">{task.project_name} · {task.agent === 'codex' ? 'Codex' : 'DSH'}</p>
      </div>
      <button className="icon-button" aria-label={tr('Close', language)} title={tr('Close', language)} onClick={onClose}>
        <X size={17} aria-hidden="true" />
      </button>
    </div>
    <div className="task-detail-summary">
      <span className={'status-badge ' + task.status}><i />{tr(statusLabel[task.status] ?? task.status, language)}</span>
      <span>{tr('Created', language)} · {date(task.created_at)}</span>
    </div>
    {task.description && <section className="task-description-section">
      <h3 className="run-section-title">{tr('Task description', language)}</h3>
      <div className="task-detail-description"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown></div>
    </section>}
    <div className="run-history-heading">
      <h3 className="run-section-title">{tr('Run history', language)} {runs && <span className="queue-count">{runs.length}</span>}</h3>
      <button className="button ghost compact" disabled={loading} onClick={() => setRevision(value => value + 1)}>
        <RefreshCw size={14} className={loading ? 'spin' : ''} aria-hidden="true" />{tr(loading ? 'Loading…' : 'Refresh', language)}
      </button>
    </div>
    {error && <div className="detail-error" role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      <div><b>{tr('Could not load run history', language)}</b><p>{tr(error, language)}</p>
        {runs && <small>{tr('Showing the last loaded results.', language)}</small>}
      </div>
      <button className="button secondary compact" disabled={loading} onClick={() => setRevision(value => value + 1)}>{tr('Retry', language)}</button>
    </div>}
    {runs === null ? (!error && <div className="detail-loading" role="status">
      <LoaderCircle size={20} className="spin" aria-hidden="true" /><span>{tr('Loading run history…', language)}</span>
    </div>) : runs.length ? <div className="run-list">
      {runs.map(run => {
        const output = finalResponse(run.result)
        const response = output || tr(['running', 'queued'].includes(run.status) ? 'Waiting for output' : 'DSH returned no final text.', language)
        return <article className="run-item" key={run.id}>
          <div className="run-item-head">
            <span className={`status-badge ${run.status}`}><i />{tr(statusLabel[run.status] ?? run.status, language)}</span>
            <span className="run-meta">{tr('Started', language)}: {run.started_at ? date(run.started_at) : '—'}</span>
          </div>
          <div className="run-facts">
            {run.exit_code !== null && <span>{tr('Exit code', language)}: <b>{run.exit_code}</b></span>}
            {run.session_id && <span>{tr('Session', language)}: <b>{run.session_id}</b></span>}
            {run.finished_at && <span>{tr('Finished', language)}: <b>{date(run.finished_at)}</b></span>}
          </div>
          {run.error && <div className="run-error"><b>{tr('Error', language)}</b><p>{run.error}</p></div>}
          <div className="run-output-toolbar"><div className="run-output-label">{tr('Final response', language)}</div>{output && <CopyResult text={output} language={language} />}</div>
          <div className="run-output"><ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown></div>
        </article>
      })}
    </div> : <div className="table-empty run-empty"><ScrollText size={20} aria-hidden="true" /><span>{tr('No runs yet', language)}</span></div>}
  </Dialog>
}
