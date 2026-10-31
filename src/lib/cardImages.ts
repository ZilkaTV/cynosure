import { flagEmoji } from './countries'
import { parseFit, type Fit } from './profileExtras'
import type { CardAssets } from './drawPlayerCard'

// The pictures a card needs (profile picture, flag, crest), loaded once and kept: a collection draws many cards.

const images = new Map<string, Promise<HTMLImageElement | null>>()

/** An image from this site or one that allows it (CORS), null when it cannot be loaded. */
export function loadImage(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  const key = `${cors ? 'c' : 'n'}|${src}`
  let p = images.get(key)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      if (cors) img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
    images.set(key, p)
  }
  return p
}

/** The flag as the picture the rest of the site uses (Twemoji). */
export const flagUrl = (code: string) =>
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/${Array.from(flagEmoji(code))
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-')}.svg`

let fontsReady: Promise<void> | null = null
/** The fonts of the card (the system fonts are used when they cannot be loaded). */
export function loadCardFonts(): Promise<void> {
  fontsReady ??= Promise.all([document.fonts.load('800 40px Cinzel'), document.fonts.load('800 20px Inter')]).then(
    () => undefined,
    () => undefined,
  )
  return fontsReady
}

/** Everything a card of this member needs besides its numbers. */
export async function loadCardAssets(nationality: string | undefined, avatar: { src: string; fit: Fit | string | null } | null | undefined): Promise<CardAssets> {
  const [avatarImg, flag, crest] = await Promise.all([avatar?.src ? loadImage(avatar.src, true) : null, nationality ? loadImage(flagUrl(nationality), true) : null, loadImage('/logo.png', false)])
  const fit = typeof avatar?.fit === 'string' ? parseFit(avatar.fit) : (avatar?.fit ?? null)
  return { avatar: avatarImg, fit, flag, crest }
}
