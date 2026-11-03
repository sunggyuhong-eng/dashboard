/** A sheet link must be an absolute web address before it becomes clickable. */
export function approvalLink(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^https?:\/\//i.test(text) || /[\s\\<>"']/.test(text)) return ''
  try {
    const url = new URL(text)
    return url.hostname && ['https:', 'http:'].includes(url.protocol) ? text : ''
  } catch { return '' }
}
