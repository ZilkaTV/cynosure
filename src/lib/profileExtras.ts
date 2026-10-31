import { useCallback, useEffect, useState } from 'react'
import { supabase as db } from './supabase'

// The extras of a profile page, like on a Steam profile: icon (avatar) and banner (pictures or GIFs), an "about me" text, likes and a comment wall.
// Rows live in cyn_members (avatar_url, banner_url, bio), cyn_profile_likes and cyn_profile_comments (worker/d1/006-profiles.sql). The
// pictures are uploaded through the Worker (worker/profileMedia.js), the access rules are in worker/dbApi.js.

export interface ProfileExtras {
  avatar_url: string | null
  banner_url: string | null
  bio: string | null
}

export interface ProfileComment {
  id: number
  profile_id: string
  author_openfront_id: string
  author_name: string | null
  body: string
  created_at: string
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const MAX_BANNER_BYTES = 5 * 1024 * 1024
export const MAX_BIO = 300
export const MAX_COMMENT = 500
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** Only pictures this site stored for a profile are ever shown (the Worker writes the address, but the page does not trust it blindly). */
export function profileImageSrc(url: string | null | undefined): string | null {
  return url && /^\/api\/screenshots\/profiles\/[A-Za-z0-9_.-]+\.(png|jpg|webp|gif)$/.test(url) ? url : null
}

export async function fetchProfileExtras(id: string): Promise<ProfileExtras | null> {
  const { data, error } = await db.from('cyn_members').select('avatar_url, banner_url, bio').eq('openfront_id', id).maybeSingle()
  if (error) return null
  return (data as ProfileExtras | null) ?? { avatar_url: null, banner_url: null, bio: null }
}

/** The icons of several members at once (comment authors). */
export async function fetchAvatars(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await db.from('cyn_members').select('openfront_id, avatar_url').in('openfront_id', ids.slice(i, i + 80))
    if (error || !data) continue
    for (const r of data as { openfront_id: string; avatar_url: string | null }[]) {
      const src = profileImageSrc(r.avatar_url)
      if (src) out[r.openfront_id] = src
    }
  }
  return out
}

export async function fetchProfileLikes(id: string): Promise<string[]> {
  const { data, error } = await db.from('cyn_profile_likes').select('from_id').eq('profile_id', id).order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as { from_id: string }[]).map((r) => r.from_id)
}

export async function setProfileLike(profileId: string, myId: string, like: boolean): Promise<string | null> {
  const { error } = like
    ? await db.from('cyn_profile_likes').insert({ profile_id: profileId, from_id: myId })
    : await db.from('cyn_profile_likes').delete().eq('profile_id', profileId).eq('from_id', myId)
  if (error && error.code !== '23505') return error.code === '42501' ? 'Your session expired. Sign out and back in with Discord, then try again.' : error.message.replace(/^[a-z_]+: /, '')
  return null
}

export async function fetchProfileComments(id: string): Promise<ProfileComment[]> {
  const { data, error } = await db
    .from('cyn_profile_comments')
    .select('id, profile_id, author_openfront_id, author_name, body, created_at')
    .eq('profile_id', id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data) return []
  return data as ProfileComment[]
}

export async function postProfileComment(profileId: string, myId: string, body: string): Promise<string | null> {
  const { error } = await db.from('cyn_profile_comments').insert({ profile_id: profileId, author_openfront_id: myId, body })
  if (!error) return null
  if (error.code === '42501') return 'Your session expired. Sign out and back in with Discord, then try again.'
  return error.message.replace(/^[a-z_]+: /, '')
}

export async function deleteProfileComment(id: number): Promise<boolean> {
  const { error } = await db.from('cyn_profile_comments').delete().eq('id', id)
  return !error
}

export async function saveBio(myId: string, text: string): Promise<string | null> {
  const { error } = await db.from('cyn_members').update({ bio: text.trim() === '' ? null : text.trim() }).eq('openfront_id', myId)
  return error ? error.message.replace(/^[a-z_]+: /, '') : null
}

/** Checks a picture before it is sent (the Worker checks everything again, by the file's own bytes). */
export function checkProfileImage(file: File, kind: 'avatar' | 'banner'): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Use a PNG, JPG, WebP or GIF picture.'
  const max = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES
  if (file.size > max) return `The picture is too big (max ${max / 1024 / 1024} MB).`
  return null
}

export async function uploadProfileImage(kind: 'avatar' | 'banner', file: File): Promise<{ ok: boolean; message: string }> {
  const problem = checkProfileImage(file, kind)
  if (problem) return { ok: false, message: problem }
  try {
    const res = await fetch(`/api/profile-media?kind=${kind}`, { method: 'POST', credentials: 'same-origin', body: file })
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (res.ok) return { ok: true, message: 'Saved.' }
    if (res.status === 401) return { ok: false, message: 'Sign in with Discord first.' }
    if (res.status === 429) return { ok: false, message: body.message ?? 'Wait a few seconds before the next upload.' }
    if (res.status === 413) return { ok: false, message: 'The picture is too big.' }
    if (res.status === 415) return { ok: false, message: 'This file is not a picture the site can use.' }
    return { ok: false, message: body.message ?? 'The upload failed, try again.' }
  } catch {
    return { ok: false, message: 'The upload failed (no connection).' }
  }
}

/** Takes the icon, the banner or the about-me text away (an admin may do it for anybody with `member`). */
export async function removeProfileMedia(kind: 'avatar' | 'banner' | 'bio', member?: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/profile-media?kind=${kind}${member ? `&member=${encodeURIComponent(member)}` : ''}`, { method: 'DELETE', credentials: 'same-origin' })
    return res.ok
  } catch {
    return false
  }
}

/** The extras of one profile, with a reload for after a change. */
export function useProfileExtras(id: string | undefined) {
  const [extras, setExtras] = useState<ProfileExtras | null>(null)
  const reload = useCallback(async () => {
    if (!id) return
    setExtras(await fetchProfileExtras(id))
  }, [id])
  useEffect(() => {
    setExtras(null)
    void reload()
  }, [reload])
  return { extras, reload }
}
