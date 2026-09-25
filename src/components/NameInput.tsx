import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

interface ListPosition {
  left: number
  width: number
  top?: number
  bottom?: number
}

/**
 * Text input with a suggestion list: typing filters it (names starting with
 * the typed text first, then names merely containing it), and the arrow
 * button on the right opens the whole list to pick from instead of typing.
 */
export default function NameInput({
  value,
  onChange,
  suggestions,
  invalid,
  placeholder,
  maxLength,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  invalid?: boolean
  placeholder?: string
  maxLength?: number
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<ListPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // The list is rendered in a portal on <body>, positioned from the input's
  // own rectangle, instead of inside the card: an absolutely-positioned list
  // inside a card is painted UNDER the next card below it, which made the
  // suggestions look cut off by the following section. Opens upward when
  // there's little room below.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const r = rootRef.current?.getBoundingClientRect()
      if (!r) return
      const spaceBelow = window.innerHeight - r.bottom
      const openUp = spaceBelow < 240 && r.top > spaceBelow
      setPos({ left: r.left, width: r.width, ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const typed = value.trim().toLowerCase()
  const matches = suggestions.filter((s) => s.toLowerCase() !== typed)
  const filtered =
    showAll || !typed
      ? matches
      : [
          ...matches.filter((s) => s.toLowerCase().startsWith(typed)),
          ...matches.filter((s) => !s.toLowerCase().startsWith(typed) && s.toLowerCase().includes(typed)),
        ]
  // Every match is listed (the list itself scrolls) - capping it hid everything past the first few letters.
  const shown = filtered

  function pick(name: string) {
    onChange(name)
    setOpen(false)
    setShowAll(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || shown.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % shown.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? shown.length - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(shown[active])
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowAll(false)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          setShowAll(false)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={`w-full rounded-lg border bg-base-800 py-2 pl-3 pr-9 text-sm text-white placeholder:text-slate-600 focus:outline-none ${
          invalid ? 'border-signal-red focus:border-signal-red' : 'border-base-600 focus:border-accent'
        }`}
      />
      {suggestions.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show suggested names"
          onClick={() => {
            const next = !(open && showAll)
            setOpen(next)
            setShowAll(next)
            setActive(-1)
          }}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-slate-400 hover:text-white"
        >
          <ChevronIcon open={open && showAll} />
        </button>
      )}
      {open &&
        pos &&
        shown.length > 0 &&
        createPortal(
          <ul
            ref={listRef}
            style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            className="z-[200] max-h-56 overflow-y-auto rounded-lg border border-base-600 bg-base-850 py-1 shadow-xl"
          >
            {shown.map((name, i) => (
              <li key={name}>
                <button
                  type="button"
                  // mousedown instead of click so the pick lands before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(name)
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-sm ${i === active ? 'bg-accent/20 text-white' : 'text-slate-300 hover:bg-base-700'}`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
