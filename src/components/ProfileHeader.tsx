import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { useSharedRoster } from '../lib/access'
import { titleForLevel, xpProgress } from '../lib/levels'
import { cleanDisplayName } from '../lib/displayName'
import { splitAccountUsername } from '../lib/openfront'
import type { MemberStats } from '../lib/stats'
import {
  MAX_BIO,
  fetchProfileLikes,
  profileImageSrc,
  removeProfileMedia,
  saveBio,
  setProfileLike,
  uploadProfileImage,
  type ProfileExtras,
} from '../lib/profileExtras'
import { Flag } from './Emoji'
import { RoleName } from './RoleName'

const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

function Heart({ filled, className = 'h-5 w-5' }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d={HEART} />
    </svg>
  )
}

/** The like button of a profile: one like per member, not for your own profile; the number shows how many, the tooltip who. */
function LikeButton({ profileId, isOwn, names }: { profileId: string; isOwn: boolean; names: Map<string, string> }) {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const [likes, setLikes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setLikes(null)
    void fetchProfileLikes(profileId).then((l) => alive && setLikes(l))
    return () => {
      alive = false
    }
  }, [profileId])
  const me = profile?.openfront_id
  const liked = !!me && !!likes?.includes(me)
  async function toggle() {
    if (!me || isOwn || busy || !likes) return
    setBusy(true)
    setError(null)
    const next = liked ? likes.filter((x) => x !== me) : [...likes, me]
    setLikes(next) // shown at once, put back if it fails
    const problem = await setProfileLike(profileId, me, !liked)
    if (problem) {
      setLikes(likes)
      setError(problem)
    }
    setBusy(false)
  }
  const who = (likes ?? []).slice(0, 12).map((id) => cleanDisplayName(names.get(id) ?? id))
  const title = isOwn ? (de ? 'Das ist dein Profil' : 'This is your profile') : liked ? (de ? 'Gefällt mir zurücknehmen' : 'Remove your like') : de ? 'Profil gefällt mir' : 'Like this profile'
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isOwn || busy || likes === null}
        title={who.length ? `${title}\n${who.join(', ')}${(likes?.length ?? 0) > 12 ? ' …' : ''}` : title}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
          liked ? 'border-rose-400/60 bg-rose-500/15 text-rose-300' : 'border-base-600 bg-base-800/70 text-slate-200 hover:border-rose-400/60 hover:text-rose-300'
        } ${isOwn ? 'cursor-default opacity-80 hover:border-base-600 hover:text-slate-200' : ''}`}
      >
        <Heart filled={liked} />
        <span className="tabular-nums">{likes === null ? '…' : likes.length}</span>
      </button>
      {error && <span className="max-w-[16rem] text-right text-[11px] text-signal-red">{error}</span>}
    </div>
  )
}

/** The panel where the owner sets icon, banner and the about-me text. */
function ProfileEditor({ m, extras, onChanged, onClose }: { m: MemberStats; extras: ProfileExtras | null; onChanged: () => void; onClose: () => void }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const [bio, setBio] = useState(extras?.bio ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const avatar = profileImageSrc(extras?.avatar_url)
  const banner = profileImageSrc(extras?.banner_url)

  async function pick(kind: 'avatar' | 'banner', file: File | undefined) {
    if (!file) return
    setBusy(kind)
    setMessage(null)
    const r = await uploadProfileImage(kind, file)
    setBusy(null)
    setMessage(r.ok ? (de ? 'Bild gespeichert.' : 'Picture saved.') : r.message)
    if (r.ok) onChanged()
    if (kind === 'avatar' && avatarInput.current) avatarInput.current.value = ''
    if (kind === 'banner' && bannerInput.current) bannerInput.current.value = ''
  }
  async function remove(kind: 'avatar' | 'banner') {
    setBusy(kind)
    const ok = await removeProfileMedia(kind)
    setBusy(null)
    setMessage(ok ? (de ? 'Entfernt.' : 'Removed.') : de ? 'Entfernen fehlgeschlagen.' : 'Removing failed.')
    if (ok) onChanged()
  }
  async function saveText() {
    setBusy('bio')
    setMessage(null)
    const problem = await saveBio(m.publicId, bio)
    setBusy(null)
    setMessage(problem ?? (de ? 'Text gespeichert.' : 'Text saved.'))
    if (!problem) onChanged()
  }
  const btn = 'rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-accent hover:text-white disabled:opacity-50'
  return (
    <div className="panel space-y-4 p-4 text-sm text-slate-300">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-gold">{de ? 'Profil bearbeiten' : 'Edit profile'}</p>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={de ? 'Schließen' : 'Close'}>
          ✕
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{de ? 'Icon (max. 2 MB, auch GIF)' : 'Icon (max 2 MB, GIFs too)'}</p>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-base-600 bg-base-800">{avatar && <img src={avatar} alt="" className="h-full w-full object-cover" />}</div>
            <div className="flex flex-wrap gap-2">
              <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void pick('avatar', e.target.files?.[0])} />
              <button type="button" className={btn} disabled={busy !== null} onClick={() => avatarInput.current?.click()}>
                {busy === 'avatar' ? '…' : de ? 'Bild wählen' : 'Choose picture'}
              </button>
              {avatar && (
                <button type="button" className={btn} disabled={busy !== null} onClick={() => void remove('avatar')}>
                  {de ? 'Entfernen' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{de ? 'Banner (max. 5 MB, auch GIF)' : 'Banner (max 5 MB, GIFs too)'}</p>
          <div className="flex items-center gap-3">
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-base-600 bg-base-800">{banner && <img src={banner} alt="" className="h-full w-full object-cover" />}</div>
            <div className="flex flex-wrap gap-2">
              <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void pick('banner', e.target.files?.[0])} />
              <button type="button" className={btn} disabled={busy !== null} onClick={() => bannerInput.current?.click()}>
                {busy === 'banner' ? '…' : de ? 'Bild wählen' : 'Choose picture'}
              </button>
              {banner && (
                <button type="button" className={btn} disabled={busy !== null} onClick={() => void remove('banner')}>
                  {de ? 'Entfernen' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{de ? 'Über mich' : 'About me'}</p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
          rows={3}
          placeholder={de ? 'Ein paar Worte über dich …' : 'A few words about you …'}
          className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {bio.length}/{MAX_BIO}
          </span>
          <button type="button" className="btn-accent !px-5 !py-1.5 text-sm disabled:opacity-50" disabled={busy !== null} onClick={() => void saveText()}>
            {busy === 'bio' ? '…' : de ? 'Text speichern' : 'Save text'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {de ? 'Bilder sind für alle Mitglieder sichtbar. Keine anstößigen oder fremden urheberrechtlich geschützten Bilder; Admins können Bilder entfernen.' : 'Pictures are visible to all members. No offensive pictures or pictures you have no right to use; admins can remove pictures.'}
      </p>
      {message && <p className="text-xs text-gold-light">{message}</p>}
    </div>
  )
}

/**
 * The top of a profile, built like a Steam profile: a banner, the icon on its edge, name with level, the like button, the "about me" text.
 * Owners edit icon, banner and text here; admins can take a picture or a text away from somebody else's profile (children = other admin tools).
 */
export default function ProfileHeader({ m, isOwn, viewerIsAdmin, extras, reloadExtras, children }: { m: MemberStats; isOwn: boolean; viewerIsAdmin: boolean; extras: ProfileExtras | null; reloadExtras: () => void; children?: ReactNode }) {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const roster = useSharedRoster()
  const [editing, setEditing] = useState(false)
  const [modMessage, setModMessage] = useState<string | null>(null)
  const names = useMemo(() => new Map((roster?.members ?? []).map((x) => [x.publicId, x.name] as const)), [roster])
  const banner = profileImageSrc(extras?.banner_url)
  const avatar = profileImageSrc(extras?.avatar_url)
  const level = xpProgress(m.xp ?? 0).level
  const name = cleanDisplayName(m.name)

  async function moderate(kind: 'avatar' | 'banner' | 'bio') {
    const ok = await removeProfileMedia(kind, m.publicId)
    setModMessage(ok ? (de ? 'Entfernt.' : 'Removed.') : de ? 'Entfernen fehlgeschlagen.' : 'Removing failed.')
    if (ok) reloadExtras()
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-base-700 bg-base-900/70">
        <div className="relative h-36 sm:h-56">
          {banner ? <img src={banner} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-br from-accent/35 via-base-850 to-gold/20" />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-base-900/90 to-transparent" />
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 pb-4 sm:px-6">
          <div className="-mt-14 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-base-900 bg-base-800 shadow-xl sm:-mt-16 sm:h-32 sm:w-32">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/50 to-base-800 font-display text-4xl font-bold text-white sm:text-5xl">{name.slice(0, 1).toUpperCase()}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t.memberProfile.memberBadge(CLAN_TAG)}</p>
            <h1 className="mt-1 inline-flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {m.nationality && <Flag code={m.nationality} className="h-5 w-7" />}
              <RoleName wins={m.allWins}>{name}</RoleName>
              {isOwn && viewerIsAdmin && <span className="rounded-full bg-gold/20 px-2 py-0.5 align-middle text-xs font-bold uppercase tracking-wide text-gold-light">{t.accountMenu.adminBadge}</span>}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold-light" title={titleForLevel(level)}>
                {t.questCard.lvlPrefix} {level} · {titleForLevel(level)}
              </span>
              {m.timezone && <span>{m.timezone}</span>}
              {m.discord && (
                <span>
                  {t.memberProfile.discordPrefix} {m.discord}
                </span>
              )}
              {m.accountUsername && (
                <span>
                  {t.memberProfile.accountUsernamePrefix}{' '}
                  {(() => {
                    const { base, discriminator } = splitAccountUsername(m.accountUsername)
                    return (
                      <>
                        {base}
                        {discriminator && <span className="text-slate-600">#{discriminator}</span>}
                      </>
                    )
                  })()}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 pt-3">
            <LikeButton profileId={m.publicId} isOwn={isOwn} names={names} />
            {isOwn && (
              <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-xl border border-base-600 bg-base-800/70 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-accent hover:text-white">
                {editing ? (de ? 'Fertig' : 'Done') : de ? 'Profil bearbeiten' : 'Edit profile'}
              </button>
            )}
          </div>
        </div>
        {extras?.bio && (
          <div className="border-t border-base-700 px-4 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{de ? 'Über mich' : 'About me'}</p>
            <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-200">{extras.bio}</p>
          </div>
        )}
      </div>

      {isOwn && editing && <ProfileEditor m={m} extras={extras} onChanged={reloadExtras} onClose={() => setEditing(false)} />}

      {!isOwn && viewerIsAdmin && (avatar || banner || extras?.bio) && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-slate-500">{de ? 'Admin:' : 'Admin:'}</span>
          {avatar && (
            <button type="button" onClick={() => void moderate('avatar')} className="rounded-lg bg-signal-red/15 px-3 py-1.5 font-semibold text-signal-red hover:bg-signal-red/25">
              {de ? 'Icon entfernen' : 'Remove icon'}
            </button>
          )}
          {banner && (
            <button type="button" onClick={() => void moderate('banner')} className="rounded-lg bg-signal-red/15 px-3 py-1.5 font-semibold text-signal-red hover:bg-signal-red/25">
              {de ? 'Banner entfernen' : 'Remove banner'}
            </button>
          )}
          {extras?.bio && (
            <button type="button" onClick={() => void moderate('bio')} className="rounded-lg bg-signal-red/15 px-3 py-1.5 font-semibold text-signal-red hover:bg-signal-red/25">
              {de ? 'Text entfernen' : 'Remove text'}
            </button>
          )}
          {modMessage && <span className="text-slate-500">{modMessage}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
