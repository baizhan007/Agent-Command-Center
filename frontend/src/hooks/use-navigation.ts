import { useEffect, useRef, useState } from 'react'
import type { Page } from '../lib/domain'

const pages: Page[] = ['Overview', 'Projects', 'Tasks', 'Settings']
const pageFromHash = () =>
  pages.find((page) => '#' + page.toLowerCase() === window.location.hash) ?? 'Overview'

export function useNavigation() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const scrollPositions = useRef<Partial<Record<Page, number>>>({})
  const current = useRef(page)
  const navigate = (next: Page) => {
    if (next === current.current) return
    scrollPositions.current[current.current] = window.scrollY
    window.location.hash = next.toLowerCase()
  }
  useEffect(() => {
    const onHash = () => {
      scrollPositions.current[current.current] = window.scrollY
      setPage(pageFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const changed = current.current !== page
    current.current = page
    if (!changed) return
    const frame = requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
      window.scrollTo(0, scrollPositions.current[page] ?? 0)
    })
    return () => cancelAnimationFrame(frame)
  }, [page])
  return [page, navigate] as const
}
