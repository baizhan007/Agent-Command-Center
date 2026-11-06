import { Command } from 'lucide-react'

export function DesktopTitlebar() {
  return (
    <div className="desktop-titlebar">
      <div className="desktop-titlebar-content">
        <span className="desktop-titlebar-mark"><Command size={12} aria-hidden="true" /></span>
        <span>Agent Command Center</span>
      </div>
    </div>
  )
}
