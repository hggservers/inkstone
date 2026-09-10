const FALLBACK_BASENAME = 'Untitled note'
const MAX_BASENAME_LENGTH = 120

export function safeExportFilename(title: string | null | undefined, extension: string): string {
  const ext = normalizeExtension(extension)
  const basename = sanitizeBasename(title)
  return `${basename}${ext}`
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().replace(/^\.+/, '')
  return trimmed ? `.${trimmed}` : ''
}

function sanitizeBasename(title: string | null | undefined): string {
  const cleaned = (title ?? '')
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '')

  const basename = cleaned || FALLBACK_BASENAME
  return basename.length > MAX_BASENAME_LENGTH
    ? basename.slice(0, MAX_BASENAME_LENGTH).trim() || FALLBACK_BASENAME
    : basename
}
