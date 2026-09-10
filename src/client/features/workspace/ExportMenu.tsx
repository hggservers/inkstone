import { useMemo, useRef, useState } from 'react'
import { Download, FileCode2, FileText, Printer } from 'lucide-react'
import type { NoteSummary } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip, type MenuItem } from '../../components/overlay'
import {
  downloadNoteHtml,
  downloadNoteMarkdown,
  printNoteAsPdf,
  type ExportTheme,
} from '../../lib/export/note-export'
import { useUi } from '../../store/ui'
import { t } from '../../lib/i18n'

interface ExportMenuProps {
  note: Pick<NoteSummary, 'title' | 'createdAt' | 'updatedAt'>
  content: string
  html: string
  theme: ExportTheme
  disabled?: boolean
}

export function ExportMenu({ note, content, html, theme, disabled }: ExportMenuProps) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const toast = useUi((s) => s.toast)

  const run = (task: () => void) => {
    try {
      task()
    } catch (error) {
      toast({
        title: t('workspace.export_failed'),
        description:
          error instanceof Error && error.message === 'print_window_blocked'
            ? t('workspace.print_window_blocked')
            : error instanceof Error
              ? error.message
              : String(error),
        tone: 'danger',
      })
    }
  }

  const items = useMemo<MenuItem[]>(() => [
    {
      id: 'markdown',
      label: t('workspace.export_markdown'),
      icon: <FileText size={13} />,
      disabled,
      onSelect: () => run(() => downloadNoteMarkdown(note, content)),
    },
    {
      id: 'html',
      label: t('workspace.export_html'),
      icon: <FileCode2 size={13} />,
      disabled,
      onSelect: () => run(() => downloadNoteHtml(note, html, theme)),
    },
    {
      id: 'pdf',
      label: t('workspace.print_save_pdf'),
      icon: <Printer size={13} />,
      disabled,
      onSelect: () => run(() => printNoteAsPdf(note, html, theme)),
    },
  ], [content, disabled, html, note, theme])

  return (
    <>
      <Tooltip label={t('workspace.export_note')}>
        <IconButton
          ref={anchorRef}
          label={t('workspace.export_note')}
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Download size={14} />
        </IconButton>
      </Tooltip>
      <Menu
        anchor={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        align="end"
        width={220}
        label={t('workspace.export_note')}
      />
    </>
  )
}
