import { describe, expect, it } from 'vitest'
import { safeExportFilename } from './filename'

describe('safeExportFilename', () => {
  it('keeps readable Chinese titles and appends the requested extension', () => {
    const title = '\u4e2d\u5174 F50 Pro \u63a5\u5165 ImmortalWrt \u8def\u7531\u5668\u4e0a\u7f51\u5b8c\u6574\u914d\u7f6e\u6307\u5357'

    expect(safeExportFilename(title, 'md')).toBe(`${title}.md`)
  })

  it('replaces characters that are unsafe in common filesystems', () => {
    expect(safeExportFilename('a/b\\c:d*e?f"g<h>i|j', '.html')).toBe('a-b-c-d-e-f-g-h-i-j.html')
  })

  it('falls back to an untitled note name for empty titles', () => {
    expect(safeExportFilename('   ', 'pdf')).toBe('Untitled note.pdf')
  })

  it('limits long basenames without removing the extension', () => {
    const filename = safeExportFilename('\u5b57'.repeat(160), 'markdown')

    expect(filename).toHaveLength(129)
    expect(filename.endsWith('.markdown')).toBe(true)
  })
})
