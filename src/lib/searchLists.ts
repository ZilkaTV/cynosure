import { useEffect, useState } from 'react'
import { clearOpenFrontCache } from './openfront'

// The lists behind the profile search in the header (like op.gg): the profiles searched for last, and the favourites. Kept in this browser.

const RECENT_KEY = 'cyn:search-recent'
const FAV_KEY = 'cyn:search-favs'
const CHANGED = 'cyn:search-lists'
const MAX_RECENT = 8
const MAX_FAVS = 30
const ID = /^[A-Za-z0-9_-]{4,40}$/

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ID.test(x)) : []
  } catch {
    return []
  }
}
function write(key: string, list: string[]) {
  const text = JSON.stringify(list)
  try {
    localStorage.setItem(key, text)
  } catch {
    // The browser's storage can be full of cached games (they can be fetched again): make room, as saveLocalProfile does, and try once more.
    try {
      clearOpenFrontCache(false)
      localStorage.setItem(key, text)
    } catch {
      try {
        clearOpenFrontCache(true)
        localStorage.setItem(key, text)
      } catch {
        /* private window: the lists just do not stay */
      }
    }
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** A profile that was just opened from the search goes to the top of the recent list. */
export function addRecentSearch(id: string) {
  if (!ID.test(id)) return
  write(RECENT_KEY, [id, ...read(RECENT_KEY).filter((x) => x !== id)].slice(0, MAX_RECENT))
}
export function removeRecentSearch(id: string) {
  write(RECENT_KEY, read(RECENT_KEY).filter((x) => x !== id))
}
export function toggleFavoriteProfile(id: string) {
  if (!ID.test(id)) return
  const favs = read(FAV_KEY)
  write(FAV_KEY, favs.includes(id) ? favs.filter((x) => x !== id) : [id, ...favs].slice(0, MAX_FAVS))
}

/** The two lists; they follow changes made anywhere on the page (the star on a profile, the search box) and in other tabs. */
export function useSearchLists(): { recent: string[]; favs: string[] } {
  const [state, setState] = useState(() => ({ recent: read(RECENT_KEY), favs: read(FAV_KEY) }))
  useEffect(() => {
    const on = () => setState({ recent: read(RECENT_KEY), favs: read(FAV_KEY) })
    window.addEventListener(CHANGED, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(CHANGED, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return state
}
