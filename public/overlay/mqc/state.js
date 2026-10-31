// The state of the overlay, shared by the control panel and the overlay itself (same browser: OBS dock + browser source, or two tabs).
// It lives in localStorage and is announced on a BroadcastChannel; the overlay also looks again twice a second, so it works whichever of the two the
// browser lets through. ?match=3&a=1&b=0&view=game in the address overrides the state (handy for a quick test).
;(function () {
  var KEY = 'mqc-overlay-state-v1'
  var data = window.MQC_DATA
  var channel = null
  try {
    channel = new BroadcastChannel('mqc-overlay')
  } catch (e) {
    channel = null
  }

  function fresh() {
    var matches = {}
    data.matches.forEach(function (m) {
      matches[m.id] = { a: 0, b: 0, status: 'upcoming' }
    })
    return { rev: 1, match: 1, view: 'game', until: 0, matches: matches }
  }
  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (s && s.matches) return s
    } catch (e) {
      /* unreadable: start fresh */
    }
    return fresh()
  }
  function write(state) {
    state.rev = (state.rev || 0) + 1
    var text = JSON.stringify(state)
    try {
      localStorage.setItem(KEY, text)
    } catch (e) {
      // the storage of this address can be full of the website's cached games (cynclan.com shares it): they can be fetched again, make room
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('of:v4') === 0) localStorage.removeItem(k)
        })
        localStorage.setItem(KEY, text)
      } catch (e2) {
        /* storage blocked: the channel still carries it */
      }
    }
    if (channel) channel.postMessage(state)
    return state
  }
  function fromAddress(state) {
    var q = new URLSearchParams(location.search)
    if (!q.has('match') && !q.has('view')) return state
    var s = JSON.parse(JSON.stringify(state))
    var id = parseInt(q.get('match') || s.match, 10)
    if (s.matches[id]) {
      s.match = id
      if (q.has('a')) s.matches[id].a = parseInt(q.get('a'), 10) || 0
      if (q.has('b')) s.matches[id].b = parseInt(q.get('b'), 10) || 0
      if (q.has('status')) s.matches[id].status = q.get('status')
    }
    if (q.has('view')) s.view = q.get('view')
    return s
  }

  window.MQC_STATE = {
    get: function () {
      return read()
    },
    set: function (fn) {
      var s = read()
      fn(s)
      return write(s)
    },
    reset: function () {
      return write(fresh())
    },
    /** calls back with every change (own tab, other tab, other part of OBS) */
    subscribe: function (cb) {
      var last = -1
      function push(s) {
        if (!s || s.rev === last) return
        last = s.rev
        cb(fromAddress(s))
      }
      push(read())
      if (channel) channel.onmessage = function (e) { push(e.data) }
      window.addEventListener('storage', function (e) {
        if (e.key === KEY) push(read())
      })
      setInterval(function () { push(read()) }, 500)
    },
    fromAddress: fromAddress,
  }
})()
