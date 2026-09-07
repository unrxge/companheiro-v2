'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Mark } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { useTheme } from '@/components/theme/theme-provider'

// Marks a proposed AI edit that's been materialised into the document but not
// yet decided on — styled (see globals.css) as a plain inline highlight, no
// separate preview box. Approve removes just the mark; Reject replaces the
// marked range with the original text remembered before the edit landed.
export const PendingEditMark = Mark.create({
  name: 'pendingEdit',
  parseHTML() {
    return [{ tag: 'mark[data-pending-edit]' }]
  },
  renderHTML() {
    return ['mark', { 'data-pending-edit': 'true' }, 0]
  },
})

// Typing two hyphens together becomes an em dash — the standard shorthand
// every writing tool from Word to Substack supports. Everything else the
// Typography extension offers (smart quotes, ellipsis, arrows, trademark
// signs…) is switched off — only the one behaviour that was asked for.
const EmDashOnly = Typography.configure({
  emDash: '—',
  ellipsis: false,
  openDoubleQuote: false,
  closeDoubleQuote: false,
  openSingleQuote: false,
  closeSingleQuote: false,
  leftArrow: false,
  rightArrow: false,
  copyright: false,
  trademark: false,
  servicemark: false,
  registeredTrademark: false,
  oneHalf: false,
  oneQuarter: false,
  threeQuarters: false,
  multiplication: false,
  superscriptTwo: false,
  superscriptThree: false,
  plusMinus: false,
  notEqual: false,
  laquo: false,
  raquo: false,
})

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  label,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      // Toolbar clicks would otherwise steal focus from the editor before the
      // mousedown->click sequence completes, collapsing the text selection
      // the command is supposed to act on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        minWidth: 26,
        height: 26,
        padding: '0 6px',
        borderRadius: 6,
        border: 'none',
        background: active ? 'rgba(232,230,224,0.14)' : 'transparent',
        color: disabled ? t.textMuted : active ? t.textPrimary : t.textSecondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 700,
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  const { t } = useTheme()
  return <div style={{ width: 1, alignSelf: 'stretch', margin: '4px 3px', background: t.divider, flexShrink: 0 }} />
}

const icon = (path: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

/**
 * The formatting toolbar, standalone from any one section — the page mounts
 * a single instance that drives whichever section is currently focused, the
 * same way the app's Dock stays fixed and always in reach rather than
 * scrolling away with the page. Renders inert (not hidden) when no editor is
 * focused, so its position never jumps.
 */
export function SectionToolbar({ editor }: { editor: Editor | null }) {
  const disabled = !editor
  const is = (name: string, attrs?: Record<string, unknown>) => !!editor?.isActive(name, attrs)
  const run = (fn: (editor: Editor) => void) => {
    if (editor) fn(editor)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 1 }}>
      <ToolbarButton label="Undo" disabled={disabled || !editor?.can().undo()} onClick={() => run((e) => e.chain().focus().undo().run())}>
        {icon(<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />)}
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={disabled || !editor?.can().redo()} onClick={() => run((e) => e.chain().focus().redo().run())}>
        {icon(<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />)}
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="Bold" active={is('bold')} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleBold().run())}>B</ToolbarButton>
      <ToolbarButton label="Italic" active={is('italic')} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleItalic().run())}>
        <span style={{ fontStyle: 'italic' }}>i</span>
      </ToolbarButton>
      <ToolbarButton label="Underline" active={is('underline')} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleUnderline().run())}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={is('strike')} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleStrike().run())}>
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="Heading 1" active={is('heading', { level: 1 })} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleHeading({ level: 1 }).run())}>H1</ToolbarButton>
      <ToolbarButton label="Heading 2" active={is('heading', { level: 2 })} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleHeading({ level: 2 }).run())}>H2</ToolbarButton>
      <ToolbarButton label="Heading 3" active={is('heading', { level: 3 })} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleHeading({ level: 3 }).run())}>H3</ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="Bullet list" active={is('bulletList')} disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleBulletList().run())}>
        {icon(<><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></>)}
      </ToolbarButton>
      <ToolbarButton
        label="Outdent"
        disabled={disabled || !editor?.can().liftListItem('listItem')}
        onClick={() => run((e) => e.chain().focus().liftListItem('listItem').run())}
      >
        {icon(<path d="M11 5v14M5 12l6-6M5 12l6 6" />)}
      </ToolbarButton>
      <ToolbarButton
        label="Indent"
        disabled={disabled || !editor?.can().sinkListItem('listItem')}
        onClick={() => run((e) => e.chain().focus().sinkListItem('listItem').run())}
      >
        {icon(<path d="M4 5v14M10 6l6 6-6 6" />)}
      </ToolbarButton>
    </div>
  )
}

export interface SectionSelection {
  text: string
  from: number
  to: number
}

interface SectionEditorProps {
  content: string
  onChange: (html: string) => void
  onFocus?: () => void
  onBlur?: () => void
  editable: boolean
  placeholder?: string
  onSelectionChange?: (selection: SectionSelection | null) => void
  /** Hands the live Editor instance up so the page can drive it imperatively
   *  (e.g. splicing an approved AI edit into an exact position range, or
   *  routing the one shared toolbar to whichever section is focused). */
  onReady?: (editor: Editor | null) => void
  /** Fires on every transaction (content OR selection-only, e.g. an arrow-key
   *  caret move with nothing selected) — the page uses this to know when to
   *  re-render the shared toolbar so its bold/italic/heading highlights stay
   *  current even without a text selection driving onSelectionChange. */
  onTransaction?: () => void
  textColor?: string
}

export function SectionEditor({
  content,
  onChange,
  onFocus,
  onBlur,
  editable,
  placeholder,
  onSelectionChange,
  onReady,
  onTransaction,
  textColor,
}: SectionEditorProps) {
  const editor = useEditor({
    // Next.js SSR would otherwise render the editor once on the server and
    // once on the client, which ProseMirror's own DOM ownership turns into a
    // hydration mismatch. Deferring the first render to the client sidesteps it.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || '' }),
      EmDashOnly,
      PendingEditMark,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
    onTransaction: () => onTransaction?.(),
    onSelectionUpdate: ({ editor }) => {
      if (!onSelectionChange) return
      const { from, to, empty } = editor.state.selection
      if (empty) {
        onSelectionChange(null)
        return
      }
      // A '\n\n' block separator, not a single space — a multi-paragraph
      // selection ("these three paragraphs") was otherwise flattened into
      // one run-on blob with no paragraph breaks, which is a very plausible
      // reason the model would doubt it's reading real content and ask the
      // person to paste it in again.
      const text = editor.state.doc.textBetween(from, to, '\n\n').trim()
      onSelectionChange(text ? { text, from, to } : null)
    },
  })

  useEffect(() => {
    onReady?.(editor ?? null)
    return () => onReady?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editable, editor])

  // Only resync from outside when the incoming value actually differs from
  // what the editor already holds — otherwise every keystroke's own onUpdate
  // would immediately feed back in and fight the live cursor position.
  useEffect(() => {
    if (!editor) return
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor])

  if (!editor) return null

  return (
    <div className="write-section-editor" style={{ color: textColor }}>
      <EditorContent editor={editor} />
    </div>
  )
}
