# MQC (Millennial's Quad Cup) OBS overlay

Files: `public/overlay/mqc/` (`overlay.html` = the overlay, `control.html` = the control panel, `data.js` = teams and matches, `logos/` = the logos).
After the release the pages are public at `https://cynclan.com/overlay/mqc/overlay.html` and `.../control.html`. Until then (or as a back-up) run `npm run dev`
in the project folder and use `http://localhost:5173/...` (the port is printed on start).

## OBS

1. **Source -> Browser**: address = the overlay address, width **1920**, height **1080**, nothing else (no custom CSS). Put it above the game capture.
2. **View -> Docks -> Custom Browser Docks**: name `MQC`, address = the address of `control.html`. The control panel now sits in OBS.
3. Add `?bg=1` to the overlay address to see the layout over a picture of the game (remove it again for the stream).

The panel and the overlay talk to each other through the browser storage, so both have to use the **same address start** (not one on localhost and one on cynclan.com).

## At the tournament

- **Match**: pick the match, **+ / -** counts the score (the first point sets the match to LIVE), **FINAL** closes it (the winner gets a glow).
- **Next match (LIVE + intro)**: goes to the next match when the current one is FINAL, sets it LIVE and shows the intro for 9 seconds.
- **View**: *Spiel* = the scorebug at the bottom, *Intro 9 s* / *Ergebnis 10 s* = full screen cards that go away by themselves, *Spielplan* = all 8 matches with results (for breaks), *Overlay aus* = nothing.

## Logos and names

- A team's logo is looked up as `logos/<tag in lower case>.png` (then `.webp`, `.svg`, `.jpg`), e.g. `logos/exl.png`. Without a file a badge with the tag on the team colour is shown.
- Logos that came in: CZSK, EU, CYN (also used for NYC), LBU, LUX, MARS, and the cup logo. Black picture backgrounds are made see-through (`blend: 'screen'`), pictures with a lot of empty space are cut to their content (`crop`), see `data.js`.
- Colours, names (`name`, `sub`) and the order of the matches are in `data.js`.
- `?match=3&a=1&b=0&status=live&view=game` in the overlay address sets a state for a quick test.
