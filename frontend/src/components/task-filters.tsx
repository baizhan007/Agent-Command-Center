import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Language } from '../lib/domain'
import { statusLabel } from '../lib/domain'
import { tr } from '../lib/i18n'

type Props = {
  query: string
  onQuery: (value: string) => void
  status: string
  onStatus: (value: string) => void
  language: Language
  count: number
}

export function TaskFilters({ query, onQuery, status, onStatus, language, count }: Props) {
  const filtered = Boolean(query || status !== 'all')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return (
    <div className="task-toolbar">
      <label className="search-box">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">{tr('Filter tasks', language)}</span>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault()
              event.stopPropagation()
              onQuery('')
            }
          }}
          placeholder={tr('Search tasks or projects…', language)}
        />
        {query ? <button type="button" className="search-clear" aria-label={tr('Clear search', language)}
          onClick={(event) => { event.preventDefault(); onQuery(''); input.current?.focus() }}>
          <X size={14} aria-hidden="true" />
        </button> : <kbd aria-hidden="true">/</kbd>}
      </label>
      <label className="filter-field">
        <span className="sr-only">{tr('Status', language)}</span>
        <select value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="all">{tr('All statuses', language)}</option>
          <option value="queue">{tr('Waiting to run', language)}</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {tr(label, language)}
            </option>
          ))}
        </select>
      </label>
      {filtered && (
        <button
          className="text-button"
          onClick={() => {
            onQuery('')
            onStatus('all')
          }}
        >
          <X size={14} aria-hidden="true" />
          {tr('Clear filters', language)}
        </button>
      )}
      <span className="filter-count" role="status">
        {count} {tr('matching tasks', language)}
      </span>
    </div>
  )
}
