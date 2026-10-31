// The control panel of the MQC overlay: writes the state (state.js), the overlay follows.
;(function () {
  var D = window.MQC_DATA
  var S = window.MQC_STATE
  var $ = function (id) {
    return document.getElementById(id)
  }
  var byId = {}
  D.matches.forEach(function (m) {
    byId[m.id] = m
  })

  $('ovUrl').textContent = location.href.replace(/control\.html.*$/, 'overlay.html')

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function teamBox(box, tag, score, onChange) {
    box.innerHTML = ''
    box.appendChild(el('div', 'tag', tag))
    box.appendChild(el('div', 'num', String(score)))
    var b = el('div', 'btns')
    var minus = el('button', null, '−')
    var plus = el('button', null, '+')
    minus.onclick = function () {
      onChange(-1)
    }
    plus.onclick = function () {
      onChange(1)
    }
    b.appendChild(minus)
    b.appendChild(plus)
    box.appendChild(b)
  }

  function render(st) {
    var cur = byId[st.match]
    var r = st.matches[st.match]

    var list = $('matches')
    list.innerHTML = ''
    D.matches.forEach(function (m) {
      var x = st.matches[m.id]
      var b = el('button', m.id === st.match ? 'on' : '')
      b.appendChild(el('span', null, m.id + '  ' + m.a + ' – ' + m.b))
      b.appendChild(el('span', 'res', x.status === 'upcoming' ? '' : x.a + ':' + x.b + (x.status === 'live' ? ' ●' : '')))
      b.onclick = function () {
        S.set(function (s) {
          s.match = m.id
        })
      }
      list.appendChild(b)
    })

    $('curTitle').textContent = 'Stand · Match ' + cur.id
    teamBox($('teamA'), cur.a, r.a, function (d) {
      S.set(function (s) {
        var x = s.matches[s.match]
        x.a = Math.max(0, x.a + d)
        if (x.status === 'upcoming') x.status = 'live'
      })
    })
    teamBox($('teamB'), cur.b, r.b, function (d) {
      S.set(function (s) {
        var x = s.matches[s.match]
        x.b = Math.max(0, x.b + d)
        if (x.status === 'upcoming') x.status = 'live'
      })
    })
    document.querySelectorAll('[data-status]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.status === r.status)
    })
    var view = st.view
    if ((view === 'intro' || view === 'result') && st.until && Date.now() > st.until) view = 'game'
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === view)
    })
    $('sync').textContent = 'Stand #' + st.rev + ' · ' + new Date().toLocaleTimeString()
  }

  document.querySelectorAll('[data-status]').forEach(function (b) {
    b.onclick = function () {
      S.set(function (s) {
        s.matches[s.match].status = b.dataset.status
      })
    }
  })
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.onclick = function () {
      S.set(function (s) {
        s.view = b.dataset.view
        s.until = b.dataset.secs ? Date.now() + Number(b.dataset.secs) * 1000 : 0
      })
    }
  })
  $('resetScore').onclick = function () {
    S.set(function (s) {
      var x = s.matches[s.match]
      x.a = 0
      x.b = 0
    })
  }
  $('next').onclick = function () {
    S.set(function (s) {
      var ids = D.matches.map(function (m) {
        return m.id
      })
      var i = ids.indexOf(s.match)
      // when the current one is over (or still open) the next one starts; the first press just starts the current one
      var cur = s.matches[s.match]
      if (cur.status === 'final' && i + 1 < ids.length) s.match = ids[i + 1]
      s.matches[s.match].status = 'live'
      s.view = 'intro'
      s.until = Date.now() + 9000
    })
  }
  $('resetAll').onclick = function () {
    if (confirm('Alle Stände und das aktuelle Match zurücksetzen?')) S.reset()
  }

  S.subscribe(render)
  // the "time is up" of intro and result changes what is shown without a new state: look again every few seconds
  setInterval(function () {
    render(S.get())
  }, 3000)
})()
