import { useEffect, useState } from 'react'
import { useIsAdmin } from '../lib/useSession'
import { SectionHeading, Card, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import {
  fetchAllHelpConversations,
  fetchHelpHistory,
  setHelpConversationStatus,
  type HelpConversation,
  type HelpMessage,
} from '../lib/help'

function ConversationCard({ conversation, onStatusChange }: { conversation: HelpConversation; onStatusChange: () => void }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HelpMessage[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || messages !== null) return
    fetchHelpHistory(conversation.id).then(setMessages)
  }, [open, messages, conversation.id])

  async function toggleStatus() {
    setBusy(true)
    await setHelpConversationStatus(conversation.id, conversation.status === 'open' ? 'resolved' : 'open')
    setBusy(false)
    onStatusChange()
  }

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="font-medium text-white">{conversation.display_name || t.adminHelp.anonymous}</p>
          <p className="text-xs text-slate-500">{new Date(conversation.updated_at).toLocaleString('en-GB')}</p>
        </div>
        <span
          className={`badge ${conversation.status === 'open' ? 'bg-gold/15 text-gold-light' : 'bg-signal-green/15 text-signal-green'}`}
        >
          {conversation.status === 'open' ? t.adminHelp.statusOpen : t.adminHelp.statusResolved}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-base-700 pt-4">
          {messages === null && <p className="text-xs text-slate-500">{t.adminHelp.loadingMessages}</p>}
          {messages?.map((m, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-base-800' : 'bg-accent/10'}`}>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                {m.role === 'user' ? conversation.display_name || t.adminHelp.anonymous : 'Claude'} ·{' '}
                {new Date(m.created_at).toLocaleString('en-GB')}
              </p>
              {m.image_url && <img src={m.image_url} alt="" className="mb-2 max-h-56 rounded-lg object-contain" />}
              <p className="whitespace-pre-wrap break-words text-slate-200">{m.content}</p>
            </div>
          ))}
          <button onClick={toggleStatus} disabled={busy} className="btn-ghost text-xs disabled:opacity-50">
            {conversation.status === 'open' ? t.adminHelp.markResolved : t.adminHelp.reopen}
          </button>
        </div>
      )}
    </Card>
  )
}

export default function AdminHelp() {
  const isAdmin = useIsAdmin()
  const { t } = useLanguage()
  const [conversations, setConversations] = useState<HelpConversation[] | null>(null)

  function reload() {
    fetchAllHelpConversations().then(setConversations)
  }

  useEffect(() => {
    if (isAdmin) reload()
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.adminHelp.adminsOnly}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading center eyebrow={t.adminHelp.eyebrow} title={t.adminHelp.title} />
      {conversations === null && <Spinner />}
      {conversations !== null && conversations.length === 0 && (
        <p className="text-center text-sm text-slate-500">{t.adminHelp.empty}</p>
      )}
      <div className="space-y-3">
        {conversations?.map((c) => (
          <ConversationCard key={c.id} conversation={c} onStatusChange={reload} />
        ))}
      </div>
    </div>
  )
}
