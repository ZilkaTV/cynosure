"""Builds three clearly labelled leaderboard graphics for the clan (goal / comparison / real CYN standing).
Layout is our own design inspired by the in-game list; every goal graphic carries a visible CONCEPT label."""
import json, html, sys

DATA = json.load(open(sys.argv[1], encoding='utf-8'))
OUT = sys.argv[2]

CSS = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0a0d12 radial-gradient(circle at 20% 0%, #14324a55, transparent 55%); font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #e6edf5; padding: 28px; }
.panel { background: #0d1219; border: 1px solid #1c2733; border-radius: 14px; overflow: hidden; position: relative; }
.head { display: flex; align-items: baseline; gap: 14px; padding: 18px 24px; border-bottom: 1px solid #16202b; }
.head h1 { margin: 0; font-size: 26px; letter-spacing: .12em; text-transform: uppercase; }
.head small { color: #8a96a6; font-style: italic; font-size: 13px; }
.tabs { display: flex; justify-content: center; gap: 26px; padding: 14px 0 0; border-bottom: 1px solid #16202b; background: #0b1017; }
.tab { padding: 10px 6px; font-weight: 700; font-size: 13px; letter-spacing: .1em; color: #6e7a8b; text-transform: uppercase; border-bottom: 3px solid transparent; }
.tab.on { color: #2f9bff; border-color: #2f9bff; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #6e7a8b; text-align: right; padding: 14px 18px; background: #0b1017; }
th.l, td.l { text-align: left; }
td { padding: 11px 18px; text-align: right; font-size: 15px; border-bottom: 1px solid #121a24; font-variant-numeric: tabular-nums; }
tr:nth-child(odd) td { background: #0e141c; }
tr.first td { background: #122238; }
.tile { width: 44px; height: 44px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; color: #6e7a8b; background: #151d28; }
.tile.g { background: #2b2a1b; font-size: 22px; } .tile.s { background: #1a2433; font-size: 22px; } .tile.b { background: #2b1f17; font-size: 22px; }
.name { color: #7db8ff; font-weight: 700; font-size: 17px; }
.tag { color: #8b5cf6; font-weight: 800; margin-right: 7px; }
.chk { display: inline-block; width: 15px; height: 15px; border-radius: 50%; background: #2f9bff; color: #fff; font-size: 10px; line-height: 15px; text-align: center; margin-left: 7px; vertical-align: 2px; }
.ratio { color: #3ddc84; font-weight: 800; } .ratio small { display: block; color: #6e7a8b; font-size: 10px; letter-spacing: .1em; font-weight: 600; }
.elo { color: #fff; font-weight: 700; }
.ribbon { background: #d8b96a; color: #1a1405; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; font-size: 13px; padding: 7px 18px; text-align: center; }
.ribbon.real { background: #2f9bff; color: #031425; }
.mark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.mark span { transform: rotate(-18deg); font-size: 60px; font-weight: 900; letter-spacing: .12em; color: #d8b96a; opacity: .13; white-space: nowrap; text-transform: uppercase; }
.foot { padding: 12px 22px; color: #8a96a6; font-size: 12.5px; display: flex; justify-content: space-between; border-top: 1px solid #16202b; background: #0b1017; }
.foot b { color: #d8b96a; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.cols .panel .head h1 { font-size: 19px; }
.cols td { padding: 9px 12px; font-size: 14px; } .cols th { padding: 11px 12px; }
.cols .tile { width: 36px; height: 36px; font-size: 14px; } .cols .tile.g, .cols .tile.s, .cols .tile.b { font-size: 18px; }
.cols .name { font-size: 15px; }
.title { text-align: center; margin: 4px 0 18px; } .title h2 { margin: 0 0 4px; font-size: 28px; letter-spacing: .06em; } .title p { margin: 0; color: #8a96a6; font-size: 14px; }
"""

def tile(rank):
    if rank == 1: return '<span class="tile g">👑</span>'
    if rank == 2: return '<span class="tile s">🥈</span>'
    if rank == 3: return '<span class="tile b">🥉</span>'
    return f'<span class="tile">{rank}</span>'

def ratio(w, l):
    return f'{round(100 * w / (w + l), 1)}%'

def rows(entries, tag=False, check=True):
    out = []
    for i, e in enumerate(entries):
        rank = e['rank']
        t = '<span class="tag">CYN</span>' if tag else ''
        c = '<span class="chk">✓</span>' if check else ''
        out.append(
            f'<tr class="{"first" if i == 0 else ""}"><td class="l" style="width:76px;text-align:center">{tile(rank)}</td>'
            f'<td class="l">{t}<span class="name">{html.escape(e["name"])}</span>{c}</td>'
            f'<td class="elo">{e["elo"]}</td><td>{e["games"]}</td>'
            f'<td class="ratio">{ratio(e["wins"], e["losses"])}<small>RATIO</small></td></tr>'
        )
    return ''.join(out)

THEAD = '<thead><tr><th style="text-align:center">Rank</th><th class="l">Player</th><th>Elo</th><th>Games</th><th>Win/Loss</th></tr></thead>'
TABS = '<div class="tabs"><span class="tab">1v1 Ranked</span><span class="tab on">2v2 Ranked</span><span class="tab">FFA Ranked</span></div>'

# target values for the goal graphics (clearly labelled as such)
names = ['Zilka', 'Calos', 'Franquito', 'Kvxlyn', 'Chuma', 'Soothxng', 'Kon_quest', 'Bane', 'Kris', 'smsfun']
goal = []
for i, n in enumerate(names):
    elo = 2400 - [0, 60, 110, 150, 190, 230, 270, 305, 340, 370][i]
    games = 250 - i * 8
    losses = 30 + (i // 2)
    goal.append({'rank': i + 1, 'name': n, 'elo': elo, 'games': games, 'wins': games - losses, 'losses': losses})

def page(body, width):
    return f'<!doctype html><html lang="de"><head><meta charset="utf-8"><style>body{{width:{width}px}}{CSS}</style></head><body>{body}</body></html>'

# 1) same layout, labelled as a goal
v1 = f"""
<div class="panel">
  <div class="ribbon">CYN-Ziel · Concept – keine echte Rangliste</div>
  <div class="head"><h1>Leaderboard</h1><small>unser Ziel: alle zehn Plätze mit [CYN]-Tag</small></div>
  {TABS}
  <table>{THEAD}<tbody>{rows(goal, tag=True)}</tbody></table>
  <div class="mark"><span>CYN-Ziel · Concept</span></div>
  <div class="foot"><span>Alle Zahlen sind <b>Zielwerte</b>, kein echter Stand.</span><span>cynclan.com</span></div>
</div>"""
open(f'{OUT}/goal-1-ziel.html', 'w', encoding='utf-8').write(page(v1, 1000))

# 2) today vs goal
real_top = DATA['top']
v2 = f"""
<div class="title"><h2>So sieht es heute aus – und so, wenn wir es schaffen</h2><p>Links die echte 2v2-Rangliste (Top 10, aktueller Stand). Rechts unser Ziel (Concept, Zielwerte).</p></div>
<div class="cols">
  <div class="panel"><div class="ribbon real">Heute · echter Stand</div><div class="head"><h1>2v2 Ranked</h1><small>Top 10</small></div>
    <table>{THEAD}<tbody>{rows(real_top)}</tbody></table></div>
  <div class="panel"><div class="ribbon">Unser Ziel · Concept</div><div class="head"><h1>2v2 Ranked</h1><small>Zielwerte</small></div>
    <table>{THEAD}<tbody>{rows(goal, tag=True)}</tbody></table><div class="mark"><span style="font-size:56px">Ziel · Concept</span></div></div>
</div>"""
open(f'{OUT}/goal-2-vergleich.html', 'w', encoding='utf-8').write(page(v2, 1500))

# 3) our real CYN standing
v3 = f"""
<div class="panel">
  <div class="ribbon real">Echter Stand · CYN-Mitglieder in der 2v2-Top-100</div>
  <div class="head"><h1>[CYN] in der 2v2-Rangliste</h1><small>Rang = Platz in der Gesamtliste von OpenFront</small></div>
  {TABS}
  <table>{THEAD}<tbody>{rows(DATA['cyn'], tag=True)}</tbody></table>
  <div class="foot"><span>Quelle: OpenFront 2v2-Rangliste (stündlich aktualisiert), heute abgerufen. Die Zahlen sind echt.</span><span>cynclan.com</span></div>
</div>"""
open(f'{OUT}/goal-3-echt.html', 'w', encoding='utf-8').write(page(v3, 1000))
print('ok')
