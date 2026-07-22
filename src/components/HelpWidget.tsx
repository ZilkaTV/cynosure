import { useEffect, useRef, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useLanguage } from '../i18n/LanguageContext'
import {
  fetchOwnHelpHistory,
  getStoredConversationId,
  sendHelpMessage,
  type HelpMessage,
} from '../lib/help'
import { hasBackend } from '../lib/supabase'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB - keeps a repeatedly-attached large file from running up storage cost

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

const PaperclipIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l8.49-8.48a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
  </svg>
)

const SendIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
)

interface DisplayMessage extends HelpMessage {
  pendingImagePreview?: string
}

export default function HelpWidget() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (!open || loadedOnce.current) return
    loadedOnce.current = true
    const conversationId = getStoredConversationId()
    if (!conversationId) return
    setLoadingHistory(true)
    fetchOwnHelpHistory(conversationId)
      .then((history) => setMessages(history))
      .finally(() => setLoadingHistory(false))
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  if (!hasBackend) return null

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t.help.errorImageTooLarge)
      return
    }
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text && !imageFile) return
    setSending(true)
    setError(null)

    setMessages((m) => [
      ...m,
      {
        role: 'user',
        content: text || '(image attached, no text)',
        image_url: null,
        created_at: new Date().toISOString(),
        pendingImagePreview: imagePreviewUrl ?? undefined,
      },
    ])
    const fileToSend = imageFile
    setInput('')
    setImageFile(null)
    setImagePreviewUrl(null)

    const result = await sendHelpMessage({
      message: text,
      imageFile: fileToSend,
      displayName: profile?.in_game_name ?? null,
      language,
    })

    if (!result.ok) {
      setError(result.rateLimited ? t.help.errorRateLimited : result.message || t.help.errorGeneric)
      setSending(false)
      return
    }

    setMessages((m) => [
      ...m,
      { role: 'assistant', content: result.reply ?? '', image_url: null, created_at: new Date().toISOString() },
    ])
    setSending(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="panel flex h-[min(560px,70vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
            <h2 className="font-display text-sm font-bold text-white">{t.help.title}</h2>
            <button onClick={() => setOpen(false)} aria-label={t.help.closeAria} className="text-slate-400 hover:text-white">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {loadingHistory && <p className="text-center text-xs text-slate-500">{t.help.loadingHistory}</p>}
            {!loadingHistory && messages.length === 0 && (
              <p className="text-center text-xs text-slate-500">{t.help.intro}</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-accent text-white' : 'bg-base-800 text-slate-200'
                  }`}
                >
                  {(m.image_url || m.pendingImagePreview) && (
                    <img
                      src={m.image_url ?? m.pendingImagePreview}
                      alt=""
                      className="mb-1.5 max-h-40 rounded-lg object-contain"
                    />
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl bg-base-800 px-3 py-2 text-sm text-slate-400">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && <p className="text-center text-xs text-signal-red">{error}</p>}
          </div>

          <p className="border-t border-base-700 px-4 pt-2 text-center text-[11px] text-slate-600">{t.help.loggedNote}</p>

          {imagePreviewUrl && (
            <div className="flex items-center gap-2 px-4 pt-2">
              <img src={imagePreviewUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
              <button onClick={clearImage} aria-label={t.help.removeImageAria} className="text-xs text-slate-400 hover:text-signal-red">
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 p-3">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.help.attachImageAria}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-base-600 text-slate-400 transition-colors hover:border-accent hover:text-white"
            >
              <PaperclipIcon />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={t.help.placeholder}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && !imageFile)}
              aria-label={t.help.send}
              className="btn-accent flex h-10 w-10 shrink-0 !p-0 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t.help.buttonAria}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 hover:bg-accent-dark"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  )
}
