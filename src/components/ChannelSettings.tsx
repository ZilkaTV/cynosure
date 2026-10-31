import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { fetchProfileExtras, parseTwitch, parseYoutube, saveChannels, twitchUrl, youtubeUrl } from '../lib/profileExtras'

/** Settings: the member's YouTube and Twitch channel. They show as small icons next to the name on the profile. */
export default function ChannelSettings() {
  const { language } = useLanguage()
  const de = language === 'de'
  const { profile } = useProfile()
  const [yt, setYt] = useState('')
  const [twitch, setTwitch] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const me = profile?.openfront_id

  useEffect(() => {
    if (!me) return
    let alive = true
    void fetchProfileExtras(me).then((e) => {
      if (!alive || !e) return
      setYt(e.yt_channel ?? '')
      setTwitch(e.twitch_channel ?? '')
    })
    return () => {
      alive = false
    }
  }, [me])

  if (!me) return null

  async function save() {
    if (!me) return
    const ytParsed = parseYoutube(yt)
    const twitchParsed = parseTwitch(twitch)
    if (yt.trim() && !ytParsed) return setMessage({ ok: false, text: de ? 'Das ist kein YouTube-Kanal (Link oder @Name).' : 'That is no YouTube channel (link or @name).' })
    if (twitch.trim() && !twitchParsed) return setMessage({ ok: false, text: de ? 'Das ist kein Twitch-Kanal (Link oder Name).' : 'That is no Twitch channel (link or name).' })
    setBusy(true)
    const problem = await saveChannels(me, ytParsed, twitchParsed)
    setBusy(false)
    if (problem) return setMessage({ ok: false, text: problem })
    setYt(ytParsed ?? '')
    setTwitch(twitchParsed ?? '')
    setMessage({ ok: true, text: de ? 'Gespeichert. Die Symbole erscheinen auf deinem Profil neben deinem Namen.' : 'Saved. The icons show on your profile next to your name.' })
  }

  const input = 'w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none'
  return (
    <div className="panel mx-auto mt-6 max-w-xl space-y-4 p-5">
      <div>
        <h3 className="font-display text-lg font-bold text-white">{de ? 'Deine Kanäle' : 'Your channels'}</h3>
        <p className="mt-1 text-sm text-slate-400">{de ? 'Optional. YouTube und Twitch erscheinen als Symbole neben deinem Namen auf dem Profil.' : 'Optional. YouTube and Twitch show as icons next to your name on your profile.'}</p>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">YouTube</label>
        <input value={yt} onChange={(e) => setYt(e.target.value)} placeholder="@deinname  oder  youtube.com/@deinname" className={input} />
        {parseYoutube(yt) && (
          <a href={youtubeUrl(parseYoutube(yt)!)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-accent-light hover:underline">
            {youtubeUrl(parseYoutube(yt)!)}
          </a>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Twitch</label>
        <input value={twitch} onChange={(e) => setTwitch(e.target.value)} placeholder="deinname  oder  twitch.tv/deinname" className={input} />
        {parseTwitch(twitch) && (
          <a href={twitchUrl(parseTwitch(twitch)!)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-accent-light hover:underline">
            {twitchUrl(parseTwitch(twitch)!)}
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-accent !px-5 !py-2 text-sm disabled:opacity-50">
          {busy ? '…' : de ? 'Kanäle speichern' : 'Save channels'}
        </button>
        {message && <span className={`text-sm ${message.ok ? 'text-signal-green' : 'text-signal-red'}`}>{message.text}</span>}
      </div>
    </div>
  )
}
