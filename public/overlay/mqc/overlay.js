// The MQC overlay: reads the state (state.js) and draws the scorebug, the intro, the result and the schedule.
;(function () {
  var D = window.MQC_DATA
  var S = window.MQC_STATE
  var EXT = ['png', 'webp', 'svg', 'jpg']
  var found = {} // team tag -> the picture that loaded (a redraw then does not wait for the network)
  var missing = {} // team tag -> there is no picture, use the badge
  if (new URLSearchParams(location.search).has('bg')) document.body.classList.add('bg')

  var teamOf = function (tag) {
    return Object.assign({ name: tag, color: '#8892a6' }, D.teams[tag] || {}, { tag: tag })
  }
  var el = function (tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  /** The logo badge of a team (or of the cup): the picture if there is one, otherwise the tag on the team colour. */
  function logo(team, size, fontSize) {
    var box = el('div', 'logo' + (team.shape === 'round' ? ' round' : '') + (team.blend === 'screen' ? ' screen' : ''))
    box.style.width = size + 'px'
    box.style.height = size + 'px'
    function badge() {
      box.innerHTML = ''
      box.style.background = 'linear-gradient(135deg, ' + team.color + ', #0b0f1c)'
      var t = el('span', 'tag', team.tag || team.name)
      t.style.fontSize = (fontSize || size * 0.34) + 'px'
      box.appendChild(t)
    }
    var key = team.tag || team.name
    function place(src) {
      var img = new Image()
      img.src = src
      var w = found[key].w
      var h = found[key].h
      var c = team.crop || { x: 0, y: 0, w: w, h: h }
      var scale = size / Math.max(c.w, c.h)
      img.style.width = w * scale + 'px'
      img.style.height = h * scale + 'px'
      img.style.left = (size - c.w * scale) / 2 - c.x * scale + 'px'
      img.style.top = (size - c.h * scale) / 2 - c.y * scale + 'px'
      box.appendChild(img)
    }
    var candidates = team.file ? [team.file] : EXT.map(function (e) { return 'logos/' + String(team.tag).toLowerCase() + '.' + e })
    function tryNext(i) {
      if (i >= candidates.length) {
        missing[key] = true
        return badge()
      }
      var img = new Image()
      img.onload = function () {
        found[key] = { src: candidates[i], w: img.naturalWidth, h: img.naturalHeight }
        place(candidates[i])
      }
      img.onerror = function () {
        tryNext(i + 1)
      }
      img.src = candidates[i]
    }
    if (found[key]) place(found[key].src)
    else if (missing[key]) badge()
    else tryNext(0)
    return box
  }

  var cup = Object.assign({ tag: D.short, color: '#2b50c9' }, D.logo)
  var matchById = {}
  D.matches.forEach(function (m) {
    matchById[m.id] = m
  })

  var bug = document.getElementById('bug')
  var sideA = document.getElementById('sideA')
  var sideB = document.getElementById('sideB')
  var mid = document.getElementById('mid')
  var intro = document.getElementById('intro')
  var schedule = document.getElementById('schedule')
  var last = { key: '', a: -1, b: -1 }

  function statusPill(status) {
    var p = el('span', 'pill ' + status, status === 'live' ? 'LIVE' : status === 'final' ? 'FINAL' : 'UPCOMING')
    return p
  }
  function winner(r) {
    if (r.status !== 'final' || r.a === r.b) return null
    return r.a > r.b ? 'a' : 'b'
  }

  function fillSide(box, team, score, cls, bump) {
    box.innerHTML = ''
    box.className = 'side ' + box.dataset.pos + (cls ? ' ' + cls : '')
    box.style.setProperty('--c', team.color)
    box.appendChild(logo(team, 84, 30))
    var names = el('div', 'names')
    names.appendChild(el('span', 'tagline', team.name))
    if (team.sub) names.appendChild(el('span', 'sub', team.sub))
    box.appendChild(names)
    var s = el('div', 'score' + (bump ? ' bump' : ''), String(score))
    box.appendChild(s)
  }
  sideA.dataset.pos = 'left'
  sideB.dataset.pos = 'right'

  function renderBug(st) {
    var m = matchById[st.match]
    if (!m) return
    var r = st.matches[st.match]
    var a = teamOf(m.a)
    var b = teamOf(m.b)
    var w = winner(r)
    var key = st.match + '|' + r.status + '|' + w
    var changed = key !== last.key
    fillSide(sideA, a, r.a, w === 'a' ? 'win' : w === 'b' ? 'lose' : '', last.a >= 0 && !changed && r.a !== last.a)
    fillSide(sideB, b, r.b, w === 'b' ? 'win' : w === 'a' ? 'lose' : '', last.b >= 0 && !changed && r.b !== last.b)
    mid.innerHTML = ''
    mid.appendChild(logo(cup, 62))
    mid.appendChild(el('div', 'matchno', 'MATCH ' + m.id + ' / ' + D.matches.length))
    mid.appendChild(statusPill(r.status))
    last = { key: key, a: r.a, b: r.b }
  }

  function renderIntro(st, kind) {
    var m = matchById[st.match]
    var r = st.matches[st.match]
    var a = teamOf(m.a)
    var b = teamOf(m.b)
    var w = kind === 'result' ? winner(r) : null
    intro.innerHTML = ''
    intro.className = 'layer full on intro-in'
    var head = el('div', 'head')
    head.appendChild(logo(cup, 210))
    head.appendChild(el('div', 'title', D.title))
    head.appendChild(el('div', 'kicker', kind === 'result' ? 'MATCH ' + m.id + ' · FINAL' : 'MATCH ' + m.id + ' / ' + D.matches.length))
    intro.appendChild(head)
    var duel = el('div', 'duel')
    function team(t, side) {
      var d = el('div', 'team' + (w ? (w === side ? ' win' : ' lose') : ''))
      d.style.setProperty('--c', t.color)
      d.appendChild(logo(t, 300, 80))
      d.appendChild(el('div', 'big', t.name))
      if (t.sub) d.appendChild(el('div', 'sub', t.sub))
      return d
    }
    duel.appendChild(team(a, 'a'))
    if (kind === 'result') {
      duel.appendChild(el('div', 'bigscore', String(r.a)))
      duel.appendChild(el('div', 'vs', ':'))
      duel.appendChild(el('div', 'bigscore', String(r.b)))
    } else duel.appendChild(el('div', 'vs', 'VS'))
    duel.appendChild(team(b, 'b'))
    intro.appendChild(duel)
  }

  function renderSchedule(st) {
    schedule.innerHTML = ''
    schedule.className = 'layer full on intro-in'
    var head = el('div', 'head')
    head.appendChild(logo(cup, 150))
    head.appendChild(el('div', 'title', D.title))
    head.appendChild(el('div', 'kicker', 'SCHEDULE'))
    schedule.appendChild(head)
    var grid = el('div', 'grid')
    D.matches.forEach(function (m) {
      var r = st.matches[m.id]
      var a = teamOf(m.a)
      var b = teamOf(m.b)
      var w = winner(r)
      var card = el('div', 'card' + (m.id === st.match ? ' current' : ''))
      card.appendChild(el('div', 'no', String(m.id)))
      function t(team, cls, side) {
        var d = el('div', 't ' + cls + (w ? (w === side ? ' win' : ' lose') : ''))
        d.style.setProperty('--c', team.color)
        d.appendChild(logo(team, 84, 28))
        d.appendChild(el('b', null, team.name))
        return d
      }
      card.appendChild(t(a, 'l', 'a'))
      var res = el('div', 'res', r.status === 'upcoming' ? 'VS' : r.a + ' : ' + r.b)
      card.appendChild(res)
      card.appendChild(t(b, 'r', 'b'))
      var st2 = el('div', 'st')
      st2.appendChild(statusPill(r.status))
      card.appendChild(st2)
      grid.appendChild(card)
    })
    schedule.appendChild(grid)
  }

  var lastView = ''
  function render(st) {
    var now = Date.now()
    var view = st.view
    // intro and result hide themselves when their time is up
    if ((view === 'intro' || view === 'result') && st.until && now > st.until) view = 'game'
    bug.classList.toggle('on', view === 'game')
    renderBug(st)
    if (view === 'intro' || view === 'result') {
      if (lastView !== view + st.rev) renderIntro(st, view)
      intro.classList.add('on')
    } else intro.classList.remove('on')
    if (view === 'schedule') {
      if (lastView !== view + st.rev) renderSchedule(st)
      schedule.classList.add('on')
    } else schedule.classList.remove('on')
    lastView = view + st.rev
    if (st.until && (st.view === 'intro' || st.view === 'result')) {
      clearTimeout(render.timer)
      render.timer = setTimeout(function () {
        render(S.fromAddress(S.get()))
      }, Math.max(100, st.until - now + 60))
    }
  }

  S.subscribe(render)
})()
