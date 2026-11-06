export function finalResponse(output: string | null) {
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
      else if (Array.isArray(value))
        finalText = value
          .map((part) => (typeof part === 'string' ? part : ((part as { text?: string }).text ?? '')))
          .join('')
    } catch {
      /* DSH may return ordinary text instead of JSON events. */
    }
  }
  return finalText || (hasStructuredEvents ? '' : output)
}
