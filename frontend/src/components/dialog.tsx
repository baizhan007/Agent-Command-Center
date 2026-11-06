import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type DialogProps = {
  children: ReactNode
  onClose: () => void
  label: string
  className?: string
  onboarding?: boolean
  initialFocus?: string
}

export function Dialog({ children, onClose, label, className = '', onboarding = false, initialFocus }: DialogProps) {
  const ref = useRef<HTMLElement>(null)
  const returnFocus = useRef(document.activeElement as HTMLElement | null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previousFocus = returnFocus.current
    const root = document.getElementById('root')
    const previousInert = root?.inert ?? false
    const previousOverflow = document.body.style.overflow
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => {
      const target = (initialFocus ? ref.current?.querySelector<HTMLElement>(initialFocus) : null) ?? ref.current?.querySelector<HTMLElement>(
        'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      )
      ;(target ?? focusable()[0] ?? ref.current)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) {
        event.preventDefault()
        ref.current?.focus()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (root) root.inert = previousInert
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
      else document.getElementById('main-content')?.focus()
    }
  }, [])
  return createPortal(
    <div
      className={onboarding ? 'onboarding-backdrop' : 'modal-backdrop'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={ref}
        className={(onboarding ? 'onboarding-modal ' : 'modal ') + className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}
