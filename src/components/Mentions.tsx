import { useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { nameVariants, splitMentions } from '../../worker/mentions.js'

// "@Name" in a comment: the member is notified (worker/mentions.js), the name is a link in the comment, and while typing the members are suggested.

/** The registered members, in the shape the shared matching code reads. */
function useMentionMembers() {
  const roster = useSharedRoster()
  return useMemo(() => (roster?.members ?? []).filter((m) => m.claimed).map((m) => ({ openfront_id: m.publicId, in_game_name: m.name })), [roster])
}

/** The text of a comment with every "@Name" of a member as a link to the profile. */
export function CommentText({ text, className }: { text: string; className?: string }) {
  const members = useMentionMembers()
  const parts = useMemo(() => splitMentions(text, members) as { text: string; id?: string }[], [text, members])
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.id ? (
          <Link key={i} to={`/member/${p.id}`} className="font-semibold text-accent-light hover:underline">
            {p.text}
          </Link>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  )
}

/** The "@query" the caret is in (no space between the @ and the caret), or null. */
function openMention(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[^\p{L}\p{N}_])@([^\s@]{0,24})$/u.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }

/** A textarea that suggests the members after an "@" (arrow keys and Enter / Tab or a click pick one, Esc closes the list). */
export function MentionTextarea({ value, onChange, onKeyDown, className, ...rest }: Props) {
  const members = useMentionMembers()
  const box = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)

  const open = openMention(value, caret)
  const options = useMemo(() => {
    if (!open || dismissed === open.start) return []
    const q = open.query.toLowerCase()
    const seen = new Set<string>()
    const list: { id: string; name: string }[] = []
    for (const m of members) {
      const variants = nameVariants(m.in_game_name)
      const name = variants[variants.length - 1] ?? m.in_game_name
      const shown = cleanDisplayName(name)
      if (!shown.toLowerCase().startsWith(q) || seen.has(m.openfront_id)) continue
      seen.add(m.openfront_id)
      list.push({ id: m.openfront_id, name })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6)
  }, [members, open, dismissed])

  function pick(name: string) {
    if (!open) return
    const next = `${value.slice(0, open.start)}@${name} ${value.slice(caret)}`
    const at = open.start + name.length + 2
    onChange(next)
    setActive(0)
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (options.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(options[Math.min(active, options.length - 1)].name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (open) setDismissed(open.start)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        {...rest}
        ref={box}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
          setActive(0)
        }}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={keys}
        className={className}
      />
      {options.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-0 z-30 mb-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-base-600 bg-base-850 py-1 shadow-xl">
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, so the textarea keeps its caret
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o.name)
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${i === active ? 'bg-base-700 text-white' : 'text-slate-300 hover:bg-base-800'}`}
              >
                @{cleanDisplayName(o.name)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
