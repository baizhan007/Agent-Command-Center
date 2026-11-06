import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import type { Language } from '../lib/domain'
import { tr } from '../lib/i18n'

export function ActionMenu({ label, onDelete, language }: {
  label: string
  onDelete: () => void
  language: Language
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const anchor = trigger.current!.getBoundingClientRect()
    const bounds = menu.current!.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
      top: anchor.bottom + bounds.height + 8 > window.innerHeight
        ? Math.max(8, anchor.top - bounds.height - 6)
        : anchor.bottom + 6,
    })
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    const focusOutside = (event: FocusEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    const reposition = () => close(true)
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault()
        close(true)
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', focusOutside)
    document.addEventListener('keydown', keyboard)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', focusOutside)
      document.removeEventListener('keydown', keyboard)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  return <>
    <button ref={trigger} className="row-action" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        }
      }}>
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
    {open && createPortal(
      <div ref={menu} id={id} role="menu" aria-label={label} className="action-menu" style={position}>
        <button role="menuitem" className="danger-menu-item" onClick={() => {
          close(true)
          onDelete()
        }}>
          <Trash2 size={15} aria-hidden="true" /> {tr('Delete task', language)}
        </button>
      </div>, document.body,
    )}
  </>
}
