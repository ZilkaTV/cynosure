// Ownership proof for the OpenFront id typed at registration (see worker/soloLatest.js handleVerifyOwnership).

/** One-time player name the registrant sets for a solo game: letters and digits only so OpenFront accepts it. */
export function newVerifyCode(): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  return 'cyn' + Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** True once a solo game under this code was found on the player's public profile. Null if the check could not run. */
export async function checkOwnership(openfrontId: string, code: string, since: number): Promise<boolean | null> {
  try {
    const res = await fetch(`/api/verify-ownership?id=${encodeURIComponent(openfrontId)}&code=${encodeURIComponent(code)}&since=${since}`)
    if (!res.ok) return null
    return Boolean(((await res.json()) as { ok?: boolean }).ok)
  } catch {
    return null
  }
}
