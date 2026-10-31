// localStorage holds the browser caches of OpenFront game lists and reports ("of:v4:..."), which can fill the whole quota. A small setting
// (like the queue alert) must not be the one that fails silently then: on a full quota the rebuildable caches are cleared and the write retried.

const CACHE_PREFIXES = ['of:v4:games:lastgood:', 'of:v4:detail:', 'of:v4:mapsize:', 'of:v4:games:']

/** Writes a value; when the storage is full the caches are dropped (they are rebuilt on demand) and it is tried once more. */
export function setItemRoomy(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    try {
      for (const prefix of CACHE_PREFIXES) {
        for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k)
        try {
          localStorage.setItem(key, value)
          return true
        } catch {
          /* still no room: drop the next group of caches */
        }
      }
    } catch {
      /* storage unavailable (private window) */
    }
    return false
  }
}
