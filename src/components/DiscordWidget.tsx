import { useEffect, useState } from 'react'
import { DISCORD_GUILD_ID, DISCORD_INVITE } from '../config'

interface WidgetChannel {
  id: string
  name: string
  position: number
}
interface WidgetMember {
  id: string
  username: string
  status: string
  avatar_url?: string
  channel_id?: string
}
interface WidgetData {
  name: string
  instant_invite: string | null
  channels: WidgetChannel[]
  members: WidgetMember[]
  presence_count: number
}

const DiscordIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
  </svg>
)

export default function DiscordWidget() {
  const [data, setData] = useState<WidgetData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'disabled' | 'error'>('loading')

  useEffect(() => {
    fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`)
      .then(async (r) => {
        if (r.status === 403) {
          setState('disabled')
          return null
        }
        if (!r.ok) throw new Error(String(r.status))
        return (await r.json()) as WidgetData
      })
      .then((d) => {
        if (d) {
          setData(d)
          setState('ok')
        }
      })
      .catch(() => setState('error'))
  }, [])

  // Group online members by voice channel they're sitting in.
  const membersByChannel = new Map<string, WidgetMember[]>()
  if (data) {
    for (const m of data.members) {
      if (m.channel_id) {
        const arr = membersByChannel.get(m.channel_id) ?? []
        arr.push(m)
        membersByChannel.set(m.channel_id, arr)
      }
    }
  }
  const voiceChannels = (data?.channels ?? []).sort((a, b) => a.position - b.position)

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between bg-[#5865F2] px-4 py-3 text-white">
        <span className="inline-flex items-center gap-2 font-semibold">
          <DiscordIcon /> Discord
        </span>
        {state === 'ok' && (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            {data?.presence_count} online
          </span>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto p-3">
        {state === 'loading' && <p className="px-2 py-6 text-center text-sm text-slate-500">Loading…</p>}

        {state === 'disabled' && (
          <div className="px-2 py-4 text-sm text-slate-400">
            <p className="mb-1 font-medium text-slate-300">Widget not enabled yet</p>
            <p className="text-xs leading-relaxed text-slate-500">
              Enable it in Discord: <span className="text-slate-300">Server Settings → Widget →
              “Enable Server Widget”.</span> Live voice channels will appear here automatically.
            </p>
          </div>
        )}

        {state === 'error' && (
          <p className="px-2 py-4 text-sm text-slate-500">Couldn’t reach Discord right now.</p>
        )}

        {state === 'ok' && voiceChannels.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-500">No public voice channels are exposed.</p>
        )}

        {state === 'ok' &&
          voiceChannels.map((ch) => {
            const members = membersByChannel.get(ch.id) ?? []
            return (
              <div key={ch.id} className="mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
                  </svg>
                  {ch.name}
                  {members.length > 0 && <span className="text-slate-600">· {members.length}</span>}
                </div>
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-base-800/60">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-base-700" />
                    )}
                    <span className="truncate text-sm text-slate-200">{m.username}</span>
                    <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
                  </div>
                ))}
              </div>
            )
          })}
      </div>

      <div className="border-t border-base-700 p-3">
        <a
          href={data?.instant_invite || DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
        >
          <DiscordIcon className="h-4 w-4" /> Join Server
        </a>
      </div>
    </div>
  )
}
