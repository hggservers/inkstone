import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '@shared/types'
import {
  buildStandaloneNoteHtml,
  downloadNoteHtml,
  downloadNoteMarkdown,
  printNoteAsPdf,
} from './note-export'

const note: Note = {
  id: 'note_1',
  title: '\u6d4b\u8bd5/\u5bfc\u51fa',
  excerpt: 'excerpt',
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
  content: '# \u6807\u9898\n\n\u6b63\u6587',
}

describe('note export helpers', () => {
  let createdUrl = ''
  let clicked: HTMLAnchorElement[] = []

  beforeEach(() => {
    createdUrl = ''
    clicked = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const typed = blob as Blob
      createdUrl = `blob:${typed.type}:${typed.size}`
      return createdUrl
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('downloads the original Markdown source without rewriting content', async () => {
    downloadNoteMarkdown(note, '# \u6807\u9898\n\n\u6b63\u6587')

    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('\u6d4b\u8bd5-\u5bfc\u51fa.md')
    expect(clicked[0]!.href).toBe(createdUrl)
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text/markdown;charset=utf-8',
    }))
  })

  it('builds a standalone HTML document with only the note body visible', () => {
    const html = buildStandaloneNoteHtml({
      note: { ...note, title: '<Unsafe title>' },
      bodyHtml: '<h1>\u6807\u9898</h1><button data-copy>Copy</button><input type="checkbox" data-task-line="2" checked>',
      theme: 'light',
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<title>&lt;Unsafe title&gt;</title>')
    expect(html).toContain('<article class="ink-prose">')
    expect(html).toContain('<h1>\u6807\u9898</h1>')
    expect(html).not.toContain('<header>')
    expect(html).not.toContain('Updated')
    expect(html).not.toContain('data-copy')
    expect(html).not.toContain('data-task-line')
  })

  it('downloads standalone HTML with an html filename', () => {
    downloadNoteHtml(note, '<h1>\u6807\u9898</h1>', 'dark')

    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('\u6d4b\u8bd5-\u5bfc\u51fa.html')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text/html;charset=utf-8',
    }))
  })

  it('opens a print window for PDF export and reports popup blocking', () => {
    const print = vi.fn()
    const close = vi.fn()
    const write = vi.fn()
    const closeDoc = vi.fn()
    const opened = {
      document: { write, close: closeDoc },
      focus: vi.fn(),
      print,
      close,
    } as unknown as Window

    const open = vi.spyOn(window, 'open').mockReturnValueOnce(opened)
    printNoteAsPdf(note, '<p>PDF</p>', 'light')

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(write).toHaveBeenCalledWith(expect.stringContaining('<p>PDF</p>'))
    expect(closeDoc).toHaveBeenCalled()
    expect(print).toHaveBeenCalled()

    vi.spyOn(window, 'open').mockReturnValueOnce(null)
    expect(() => printNoteAsPdf(note, '<p>PDF</p>', 'light')).toThrow('print_window_blocked')
  })
})
