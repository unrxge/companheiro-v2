'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useTheme } from '@/components/theme/theme-provider'

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
  /** Hides the toolbar for the compact continuous read view. */
  hideToolbar?: boolean
  onSelectionChange?: (selection: SectionSelection | null) => void
  /** Hands the live Editor instance up so the page can drive it imperatively
   *  (e.g. splicing an approved AI edit into an exact position range). */
  onReady?: (editor: Editor | null) => void
  textColor?: string
}

export function SectionEditor({
  content,
  onChange,
  onFocus,
  onBlur,
  editable,
  placeholder,
  hideToolbar = false,
  onSelectionChange,
  onReady,
  textColor,
}: SectionEditorProps) {
  const { t } = useTheme()
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

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
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
    onSelectionUpdate: ({ editor }) => {
      if (!onSelectionChange) return
      const { from, to, empty } = editor.state.selection
      if (empty) {
        onSelectionChange(null)
        return
      }
      const text = editor.state.doc.textBetween(from, to, ' ').trim()
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
    <div>
      {!hideToolbar && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, padding: '6px 12px', borderBottom: `1px solid ${t.divider}` }}>
          <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            {icon(<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />)}
          </ToolbarButton>
          <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            {icon(<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />)}
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span style={{ fontStyle: 'italic' }}>i</span>
          </ToolbarButton>
          <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span style={{ textDecoration: 'underline' }}>U</span>
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <span style={{ textDecoration: 'line-through' }}>S</span>
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            {icon(<><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></>)}
          </ToolbarButton>
          <ToolbarButton
            label="Outdent"
            disabled={!editor.can().liftListItem('listItem')}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          >
            {icon(<path d="M11 5v14M5 12l6-6M5 12l6 6" />)}
          </ToolbarButton>
          <ToolbarButton
            label="Indent"
            disabled={!editor.can().sinkListItem('listItem')}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          >
            {icon(<path d="M4 5v14M10 6l6 6-6 6" />)}
          </ToolbarButton>
        </div>
      )}
      <div className="write-section-editor" style={{ color: textColor }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
