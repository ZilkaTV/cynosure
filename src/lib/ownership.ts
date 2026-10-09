// Ownership proof for the OpenFront id typed at registration (see worker/soloLatest.js handleVerifyOwnership).

/** One-time player name the registrant sets for a solo game: letters and digits only so OpenFront accepts it. */
export function newVerifyCode(): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  return 'cyn' + Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** Ownership result: `proof` is the short-lived token the data API requires to claim the id (only set when signed in). Null if the check could not run. */
export async function checkOwnership(openfrontId: string, code: string, since: number): Promise<{ ok: boolean; proof?: string } | null> {
  try {
    const res = await fetch(`/api/verify-ownership?id=${encodeURIComponent(openfrontId)}&code=${encodeURIComponent(code)}&since=${since}`)
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean; proof?: string }
    return { ok: Boolean(body.ok), proof: body.proof }
  } catch {
    return null
  }
}
