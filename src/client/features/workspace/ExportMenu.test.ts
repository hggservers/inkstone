import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteSummary } from '@shared/types'

const mocks = vi.hoisted(() => ({
  downloadNoteMarkdown: vi.fn(),
  downloadNoteHtml: vi.fn(),
  printNoteAsPdf: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../lib/export/note-export', () => ({
  downloadNoteMarkdown: mocks.downloadNoteMarkdown,
  downloadNoteHtml: mocks.downloadNoteHtml,
  printNoteAsPdf: mocks.printNoteAsPdf,
}))

vi.mock('../../store/ui', () => ({
  useUi: (selector: (state: { toast: typeof mocks.toast }) => unknown) =>
    selector({ toast: mocks.toast }),
}))

vi.mock('../../lib/i18n', () => ({
  t: (key: string) => key,
}))

import { ExportMenu } from './ExportMenu'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const note: NoteSummary = {
  id: 'note_1',
  title: 'Export me',
  excerpt: '',
  folderId: null,
  tags: [],
  isStarred: false,
  isPinned: false,
  isArchived: false,
  deletedAt: null,
  rev: 1,
  position: 0,
  wordCount: 2,
  charCount: 4,
  createdAt: 1,
  updatedAt: 2,
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe('ExportMenu', () => {
  it('offers Markdown, HTML, and PDF actions for the current note', async () => {
    const { container, root } = await renderExportMenu()

    await act(async () => button(container, 'workspace.export_note').click())
    await act(async () => menuItem('workspace.export_markdown').click())
    expect(mocks.downloadNoteMarkdown).toHaveBeenCalledWith(note, '# Export me')

    await act(async () => button(container, 'workspace.export_note').click())
    await act(async () => menuItem('workspace.export_html').click())
    expect(mocks.downloadNoteHtml).toHaveBeenCalledWith(note, '<h1>Export me</h1>', 'light')

    await act(async () => button(container, 'workspace.export_note').click())
    await act(async () => menuItem('workspace.print_save_pdf').click())
    expect(mocks.printNoteAsPdf).toHaveBeenCalledWith(note, '<h1>Export me</h1>', 'light')

    await act(async () => root.unmount())
  })

  it('shows an export failure toast when an export action throws', async () => {
    mocks.printNoteAsPdf.mockImplementationOnce(() => {
      throw new Error('print_window_blocked')
    })
    const { container, root } = await renderExportMenu()

    await act(async () => button(container, 'workspace.export_note').click())
    await act(async () => menuItem('workspace.print_save_pdf').click())

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'workspace.export_failed',
      description: 'workspace.print_window_blocked',
      tone: 'danger',
    }))

    await act(async () => root.unmount())
  })
})

async function renderExportMenu() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(ExportMenu, {
      note,
      content: '# Export me',
      html: '<h1>Export me</h1>',
      theme: 'light',
    }))
  })
  return { container, root }
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')]
    .find((item) => item.getAttribute('aria-label') === name || item.textContent === name)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`)
  return match
}

function menuItem(name: string): HTMLButtonElement {
  const match = [...document.body.querySelectorAll('button[role="menuitem"]')]
    .find((item) => item.textContent?.includes(name))
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing menu item: ${name}`)
  return match
}
