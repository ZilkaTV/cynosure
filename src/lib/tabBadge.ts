// The browser tab shows the number of new notifications: "(2) title" and a red dot with the number on the favicon (like Facebook).

const ICON_ID = 'cyn-badge-icon'
const PREFIX = /^\(\d+\+?\)\s*/
let count = 0
let observer: MutationObserver | null = null
let baseIcon: HTMLImageElement | null = null

function applyTitle() {
  const clean = document.title.replace(PREFIX, '')
  const next = count > 0 ? `(${count > 9 ? '9+' : count}) ${clean}` : clean
  if (document.title !== next) document.title = next
}

function drawIcon(n: number, img: HTMLImageElement | null): string {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, size, size)
  ctx.beginPath()
  ctx.arc(44, 20, 19, 0, Math.PI * 2)
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(n > 9 ? '9+' : String(n), 44, 21)
  return canvas.toDataURL('image/png')
}

/** Sets (or, with 0, removes) the number on the tab: the title gets "(n) " in front and the icon a red dot with n. */
export function setTabBadge(n: number) {
  count = n
  if (!observer) {
    // a page that sets its own title later keeps the number
    const titleEl = document.querySelector('title')
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (count > 0 && !PREFIX.test(document.title)) applyTitle()
      })
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true })
    }
  }
  applyTitle()
  document.getElementById(ICON_ID)?.remove()
  if (n <= 0) return
  const put = () => {
    const link = document.createElement('link')
    link.id = ICON_ID
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = drawIcon(count, baseIcon)
    document.head.appendChild(link)
  }
  if (baseIcon) return put()
  const img = new Image()
  img.onload = () => {
    baseIcon = img
    if (count > 0) {
      document.getElementById(ICON_ID)?.remove()
      put()
    }
  }
  img.onerror = () => put() // no base picture: just the red dot
  img.src = '/favicon-64.png'
}
