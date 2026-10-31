// ==UserScript==
// @name         Cynosure clan donors
// @namespace    https://cynclan.com
// @version      1.0.0
// @description  Sends the donors of your clan (caps and plutonium, all time / 30 days / 7 days) from OpenFront to cynclan.com. For admins of the site who are in the clan.
// @match        https://openfront.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://cynclan.com/cynosure-donors.user.js
// @downloadURL  https://cynclan.com/cynosure-donors.user.js
// ==/UserScript==

// What it does, in short: OpenFront lists the donors of a clan only to members of that clan who are logged in. This script runs in YOUR
// browser, reads the list with YOUR login (the same requests the clan page makes itself) and hands the result to the import panel on
// cynclan.com/clan, which you confirm there. Your login is never sent to cynclan.com or anywhere else: it is only used for requests to
// api.openfront.io, exactly like the page does.
(function () {
  'use strict'

  var TAG = 'CYN'
  var SITE = 'https://cynclan.com'
  var API = 'https://api.openfront.io'

  // The Authorization header the page itself sent to the OpenFront API last. Kept in memory only.
  var auth = null
  var realFetch = window.fetch

  function remember(input, init) {
    var url = typeof input === 'string' ? input : input && input.url
    if (!url || url.indexOf('api.openfront.io') < 0) return
    var h = (init && init.headers) || (input && input.headers)
    var v = null
    if (h) v = typeof h.get === 'function' ? h.get('Authorization') : h.Authorization || h.authorization
    if (v && /^Bearer /.test(v)) auth = v
  }

  window.fetch = function (input, init) {
    try {
      remember(input, init)
    } catch (e) {
      /* never get in the way of the page */
    }
    return realFetch.apply(this, arguments)
  }

  function board(currency, period) {
    var rows = []
    function page(n, limit) {
      var url = API + '/clans/' + TAG + '/donations/leaderboard?currencyType=' + currency + '&period=' + period + '&page=' + n + '&limit=' + limit
      return realFetch(url, { headers: { Accept: 'application/json', Authorization: auth } }).then(function (res) {
        if (res.status === 403) throw new Error('Only members of the clan can see the donations.')
        if (res.status === 401) throw new Error('OpenFront does not know you are logged in: open the clan page first.')
        if (res.status === 400 && limit > 10) return page(n, 10) // an older limit of the API
        if (!res.ok) throw new Error('OpenFront answered ' + res.status + '.')
        return res.json().then(function (j) {
          var list = j.results || []
          rows = rows.concat(list)
          if (list.length < limit || rows.length >= (j.total || 0) || n >= 5) return rows
          return page(n + 1, limit)
        })
      })
    }
    return page(1, 50).then(function (all) {
      return all.map(function (r) {
        return { playerId: r.playerId, username: r.username == null ? null : r.username, total: String(r.total), donations: r.donations }
      })
    })
  }

  function collect() {
    var data = { soft: {}, hard: {} }
    var jobs = []
    ;['soft', 'hard'].forEach(function (c) {
      ;['all', 'month', 'week'].forEach(function (p) {
        jobs.push(function () {
          return board(c, p).then(function (rows) {
            data[c][p] = rows
          })
        })
      })
    })
    return jobs.reduce(function (chain, job) {
      return chain.then(job)
    }, Promise.resolve()).then(function () {
      return data
    })
  }

  function send(boards, button, say) {
    var payload = { type: 'cyn-donors', boards: boards }
    var w = window.open(SITE + '/clan?import=donors', 'cyn-donors')
    // The import page says when it is ready; answer only the real site, and only to the window this script opened.
    function onMessage(e) {
      if (e.origin !== SITE || !w || e.source !== w || !e.data || e.data.type !== 'cyn-donors-ready') return
      w.postMessage(payload, SITE)
      say('Sent. Confirm and save it on cynclan.com.')
      window.removeEventListener('message', onMessage)
    }
    window.addEventListener('message', onMessage)
    // Fallback: the same data as text, to paste into the import panel.
    try {
      navigator.clipboard.writeText(JSON.stringify({ boards: boards })).catch(function () {})
    } catch (e) {
      /* no clipboard access */
    }
    if (!w) say('The pop-up was blocked. Allow pop-ups for openfront.io, or paste the copied text on cynclan.com/clan.')
    button.disabled = false
  }

  function mount() {
    if (document.getElementById('cyn-donors-btn')) return
    var wrap = document.createElement('div')
    wrap.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;flex-direction:column;gap:6px;align-items:flex-start;font:600 12px system-ui,sans-serif'
    var note = document.createElement('div')
    note.style.cssText = 'display:none;max-width:260px;padding:6px 10px;border-radius:8px;background:#141225;color:#e8e4ff;border:1px solid #463a7d'
    var button = document.createElement('button')
    button.id = 'cyn-donors-btn'
    button.type = 'button'
    button.textContent = 'Send to CynClan'
    button.style.cssText = 'padding:8px 12px;border-radius:999px;border:1px solid #d8b96a;background:linear-gradient(180deg,#eed699,#b0913f);color:#1a1405;cursor:pointer;font:inherit'
    function say(text) {
      note.textContent = text
      note.style.display = text ? 'block' : 'none'
    }
    button.addEventListener('click', function () {
      if (!auth) {
        say('Open your clan page on openfront.io (Donations tab) first, then click again.')
        return
      }
      button.disabled = true
      say('Reading the donors from OpenFront …')
      collect().then(
        function (boards) {
          send(boards, button, say)
        },
        function (err) {
          say(String((err && err.message) || err))
          button.disabled = false
        },
      )
    })
    wrap.appendChild(note)
    wrap.appendChild(button)
    document.body.appendChild(wrap)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
