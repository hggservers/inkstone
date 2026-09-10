import type { Note } from '@shared/types'
import { safeExportFilename } from './filename'
import { downloadText } from './download'

export type ExportTheme = 'light' | 'dark' | 'system'

interface StandaloneHtmlInput {
  note: Pick<Note, 'title' | 'createdAt' | 'updatedAt'>
  bodyHtml: string
  theme?: ExportTheme
}

export function downloadNoteMarkdown(
  note: Pick<Note, 'title'>,
  content: string,
): void {
  downloadText(
    safeExportFilename(note.title, 'md'),
    content,
    'text/markdown;charset=utf-8',
  )
}

export function downloadNoteHtml(
  note: Pick<Note, 'title' | 'createdAt' | 'updatedAt'>,
  bodyHtml: string,
  theme: ExportTheme = 'light',
): void {
  downloadText(
    safeExportFilename(note.title, 'html'),
    buildStandaloneNoteHtml({ note, bodyHtml, theme }),
    'text/html;charset=utf-8',
  )
}

export function printNoteAsPdf(
  note: Pick<Note, 'title' | 'createdAt' | 'updatedAt'>,
  bodyHtml: string,
  theme: ExportTheme = 'light',
): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('print_window_blocked')

  printWindow.document.write(buildStandaloneNoteHtml({ note, bodyHtml, theme }))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

export function buildStandaloneNoteHtml({
  note,
  bodyHtml,
  theme = 'light',
}: StandaloneHtmlInput): string {
  const cleaned = cleanExportHtml(bodyHtml)
  const title = note.title?.trim() || 'Untitled note'
  const themeName = theme === 'dark' ? 'dark' : 'light'

  return `<!doctype html>
<html lang="zh-CN" data-theme="${themeName}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --text: #1f2328;
      --muted: #6b7280;
      --border: #d8dee4;
      --code-bg: #f6f8fa;
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --bg: #111827;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --border: #374151;
      --code-bg: #1f2937;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(820px, calc(100% - 40px));
      margin: 48px auto;
    }
    .ink-prose img, .ink-prose svg { max-width: 100%; height: auto; }
    .ink-prose pre, .ink-prose code { background: var(--code-bg); border-radius: 6px; }
    .ink-prose pre { overflow-x: auto; padding: 12px; }
    .ink-prose table { width: 100%; border-collapse: collapse; }
    .ink-prose th, .ink-prose td { border: 1px solid var(--border); padding: 6px 8px; }
    .ink-prose blockquote { margin-left: 0; border-left: 3px solid var(--border); padding-left: 14px; color: var(--muted); }
    @media print {
      body { background: white; color: #111827; }
      main { width: auto; margin: 0; }
      a { color: inherit; text-decoration: underline; }
      pre, blockquote, table, img, svg { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <article class="ink-prose">
${cleaned}
    </article>
  </main>
</body>
</html>`
}

function cleanExportHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('[data-copy]').forEach((node) => node.remove())
  template.content.querySelectorAll('[data-task-line]').forEach((node) => node.removeAttribute('data-task-line'))
  template.content.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'))
  template.content.querySelectorAll('script').forEach((node) => node.remove())

  return template.innerHTML
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
