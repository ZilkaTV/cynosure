import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { useSession, useIsAdmin, discordDisplayName } from '../lib/useSession'
import { useLanguage } from '../i18n/LanguageContext'
import {
  fetchChatMessages,
  postChatMessage,
  deleteChatMessage,
  isChatModerator,
  fetchChatModerators,
  containsBlockedWord,
  chatCooldownRemaining,
  markChatSent,
  type ChatMessage,
} from '../lib/chat'
import { hasBackend } from '../lib/supabase'

const POLL_MS = 8000

const ChatIcon = ({ className = 'h-6 w-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

const CloseIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

const SendIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
)

const TrashIcon = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
  </svg>
)

export default function ClanChatWidget() {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const { data } = useRoster(!!profile)
  const session = useSession()
  const viewerIsAdmin = useIsAdmin()
  const [viewerIsModerator, setViewerIsModerator] = useState(false)
  const [moderatorDiscordNames, setModeratorDiscordNames] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) {
      setViewerIsModerator(false)
      return
    }
    let alive = true
    isChatModerator(discordDisplayName(session)).then((r) => {
      if (alive) setViewerIsModerator(r)
    })
    return () => {
      alive = false
    }
  }, [session])

  useEffect(() => {
    if (!open) return
    fetchChatModerators().then(setModeratorDiscordNames)
  }, [open])

  const canModerate = viewerIsAdmin || viewerIsModerator

  const moderatorOpenfrontIds = useMemo(() => {
    const set = new Set<string>()
    for (const m of data?.members ?? []) {
      if (m.discord && moderatorDiscordNames.includes(m.discord)) set.add(m.publicId)
    }
    return set
  }, [data, moderatorDiscordNames])

  useEffect(() => {
    if (!open) return
    let alive = true
    function load() {
      fetchChatMessages().then((msgs) => {
        if (alive) setMessages(msgs)
      })
    }
    setLoading(true)
    fetchChatMessages().then((msgs) => {
      if (!alive) return
      setMessages(msgs)
      setLoading(false)
    })
    const id = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  useEffect(() => {
    if (!open) return
    setCooldown(chatCooldownRemaining())
    const id = setInterval(() => setCooldown(chatCooldownRemaining()), 1000)
    return () => clearInterval(id)
  }, [open])

  if (!hasBackend || !profile) return null

  async function handleSend() {
    const text = input.trim()
    if (!text || cooldown > 0 || !profile) return
    if (containsBlockedWord(text)) {
      setError(t.clanChat.errorBlockedContent)
      return
    }
    setSending(true)
    setError(null)
    const result = await postChatMessage(profile, text)
    setSending(false)
    if (!result.ok) {
      if (result.kind === 'rate_limited') setError(t.clanChat.errorRateLimited(60))
      else if (result.kind === 'blocked_content') setError(t.clanChat.errorBlockedContent)
      else if (result.kind === 'invalid_length') setError(t.clanChat.errorTooLong)
      else setError(t.clanChat.errorGeneric)
      return
    }
    markChatSent()
    setCooldown(60)
    setInput('')
    fetchChatMessages().then(setMessages)
  }

  async function handleDelete(id: number) {
    const prev = messages
    setMessages((m) => m.filter((x) => x.id !== id))
    const result = await deleteChatMessage(id)
    if (!result.ok) setMessages(prev)
  }

  return (
    <div className="fixed bottom-5 right-24 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="panel flex h-[min(560px,70vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
            <h2 className="font-display text-sm font-bold text-white">{t.clanChat.title}</h2>
            <button onClick={() => setOpen(false)} aria-label={t.clanChat.closeAria} className="text-slate-400 hover:text-white">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {loading && <p className="text-center text-xs text-slate-500">{t.clanChat.loading}</p>}
            {!loading && messages.length === 0 && <p className="text-center text-xs text-slate-500">{t.clanChat.intro}</p>}
            {messages.map((m) => (
              <div key={m.id} className="group flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                    <span className="truncate text-white">{m.author_name}</span>
                    {moderatorOpenfrontIds.has(m.author_openfront_id) && (
                      <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-light">
                        {t.clanChat.moderatorBadge}
                      </span>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{m.content}</p>
                </div>
                {canModerate && (
                  <button
                    onClick={() => handleDelete(m.id)}
                    aria-label={t.clanChat.deleteAria}
                    className="shrink-0 text-slate-600 opacity-0 transition-opacity hover:text-signal-red group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
            {error && <p className="text-center text-xs text-signal-red">{error}</p>}
          </div>

          <div className="flex items-end gap-2 p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={cooldown > 0 ? t.clanChat.cooldownNote(cooldown) : t.clanChat.placeholder}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || cooldown > 0 || !input.trim()}
              aria-label={t.clanChat.send}
              className="btn-accent flex h-10 w-10 shrink-0 !p-0 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t.clanChat.buttonAria}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-base-800 text-white shadow-lg shadow-black/30 ring-1 ring-base-600 transition-transform hover:scale-105 hover:bg-base-700"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  )
}
