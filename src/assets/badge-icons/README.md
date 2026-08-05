# Badge icons

Source SVGs for `src/components/BadgeIcons.tsx`, kept here so a future icon
swap doesn't require re-deriving where each one came from.

- Source: https://game-icons.net (repo: https://github.com/game-icons/icons)
- License: CC BY 3.0 - attribution lives in the site footer (Layout.tsx)
- Artists used: Lorc, Delapouite, Carl Olsen, and the "badges" set

Each file here is the upstream SVG with its baked-in background shape
(a black full-canvas rect, or a filled circle + stroked ring) stripped out
and its icon path recolored to `fill="currentColor"`, so this site's own
container/tier-color classes control the color instead.

`BadgeIcons.tsx` is a plain hand-editable file, not a build artifact - to
swap one icon, replace the matching file here (strip its background the
same way) and update that one component's `viewBox`/`d` in `BadgeIcons.tsx`
directly.
