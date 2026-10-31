// ==UserScript==
// @name         Cynosure clan donors
// @namespace    https://cynclan.com
// @version      2.0.0
// @description  Sends the donors of your clan (caps and plutonium) from OpenFront to cynclan.com, by itself with a sync key or by a click. For admins and the inner circle of the site who are in the clan.
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
// With a sync key (made on cynclan.com/clan, entered once with the key button at the bottom left) it also sends the list by itself, at most
// every 10 minutes, whenever you are on openfront.io. The key only allows sending the donor list to cynclan.com.
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

  // ── automatic sending with the sync key ──
  var KEY_STORE = 'cyn-donors-key'
  var LAST_STORE = 'cyn-donors-last'
  var GAP_MS = 10 * 60 * 1000
  var KEY_FORMAT = /^cdk_[0-9a-f]{64}$/
  function getKey() {
    try {
      return localStorage.getItem(KEY_STORE) || ''
    } catch (e) {
      return ''
    }
  }
  function setKey(v) {
    try {
      if (v) localStorage.setItem(KEY_STORE, v)
      else localStorage.removeItem(KEY_STORE)
    } catch (e) {
      /* no storage */
    }
  }
  function lastSent() {
    try {
      return Number(localStorage.getItem(LAST_STORE)) || 0
    } catch (e) {
      return 0
    }
  }
  function markSent() {
    try {
      localStorage.setItem(LAST_STORE, String(Date.now()))
    } catch (e) {
      /* no storage */
    }
  }

  // Waits for the page's own authenticated request; if the page makes none, asks for a token the way the page itself does.
  function ensureAuth() {
    return new Promise(function (resolve) {
      var tries = 0
      var timer = setInterval(function () {
        tries++
        if (auth) {
          clearInterval(timer)
          return resolve()
        }
        if (tries >= 25) {
          clearInterval(timer)
          realFetch(API + '/auth/refresh', { method: 'POST', credentials: 'include' })
            .then(function (res) {
              return res.ok ? res.json() : null
            })
            .then(function (j) {
              if (j && j.jwt) auth = 'Bearer ' + j.jwt
              resolve()
            })
            .catch(function () {
              resolve()
            })
        }
      }, 1000)
    })
  }

  function autoSend(say) {
    var key = getKey()
    if (!KEY_FORMAT.test(key) || Date.now() - lastSent() < GAP_MS) return
    ensureAuth()
      .then(function () {
        return auth ? collect() : null
      })
      .then(function (result) {
        if (!result) return null
        return realFetch(SITE + '/api/clan-donors/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ boards: result.boards, recent: result.recent }),
        }).then(function (res) {
          if (res.status === 401) {
            setKey('')
            say('CynClan: the sync key is not valid any more. Make a new one on cynclan.com/clan.', 0)
          } else if (res.ok || res.status === 429) {
            markSent()
            if (res.ok) say('CynClan: donors updated ✓', 6000)
          } else say('CynClan: sending failed (' + res.status + '). Use the button.', 0)
        })
      })
      .catch(function (err) {
        say('CynClan: sending by itself did not work (' + ((err && err.message) || err) + '). Use the button.', 0)
      })
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

  // The newest single donations (both currencies), for the daily / weekly / monthly donation quests.
  function recent() {
    var rows = []
    function page(n) {
      var url = API + '/clans/' + TAG + '/donations?page=' + n + '&limit=50'
      return realFetch(url, { headers: { Accept: 'application/json', Authorization: auth } }).then(function (res) {
        if (!res.ok) return rows // the ranking above is the main thing; a missing list only switches the donation quests off
        return res.json().then(function (j) {
          var list = j.results || []
          list.forEach(function (r) {
            if (r.createdBy && r.createdAt) rows.push({ playerId: r.createdBy, currency: r.currencyType, amount: String(r.amount), at: r.createdAt })
          })
          if (list.length < 50 || rows.length >= 400 || n >= 8) return rows
          return page(n + 1)
        })
      })
    }
    return page(1)
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
    return jobs
      .reduce(function (chain, job) {
        return chain.then(job)
      }, Promise.resolve())
      .then(recent)
      .then(function (rows) {
        return { boards: data, recent: rows }
      })
  }

  function send(result, button, say) {
    var payload = { type: 'cyn-donors', boards: result.boards, recent: result.recent }
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
      navigator.clipboard.writeText(JSON.stringify({ boards: result.boards, recent: result.recent })).catch(function () {})
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
    var hideTimer = null
    function say(text, hideAfterMs) {
      note.textContent = text
      note.style.display = text ? 'block' : 'none'
      clearTimeout(hideTimer)
      if (text && hideAfterMs) hideTimer = setTimeout(function () { note.style.display = 'none' }, hideAfterMs)
    }
    var keyButton = document.createElement('button')
    keyButton.type = 'button'
    keyButton.textContent = '\uD83D\uDD11'
    keyButton.title = 'Sync key for sending the donors by itself'
    keyButton.style.cssText = 'padding:8px 10px;border-radius:999px;border:1px solid #463a7d;background:#141225;color:#e8e4ff;cursor:pointer;font:inherit'
    keyButton.addEventListener('click', function () {
      var k = prompt('Sync key from cynclan.com/clan (empty = remove the key):', getKey())
      if (k === null) return
      k = k.trim()
      if (!k) {
        setKey('')
        say('Sync key removed.', 5000)
      } else if (KEY_FORMAT.test(k)) {
        setKey(k)
        try {
          localStorage.removeItem(LAST_STORE)
        } catch (e) {
          /* no storage */
        }
        say('Key saved. The donors are sent by themselves now.', 5000)
        autoSend(say)
      } else say('That is not a sync key (it starts with cdk_).', 6000)
    })
    button.addEventListener('click', function () {
      if (!auth) {
        say('Open your clan page on openfront.io (Donations tab) first, then click again.')
        return
      }
      button.disabled = true
      say('Reading the donors from OpenFront …')
      collect().then(
        function (result) {
          send(result, button, say)
        },
        function (err) {
          say(String((err && err.message) || err))
          button.disabled = false
        },
      )
    })
    var row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px'
    row.appendChild(button)
    row.appendChild(keyButton)
    wrap.appendChild(note)
    wrap.appendChild(row)
    document.body.appendChild(wrap)
    // by itself: shortly after the page opened, then every 5 minutes while it stays open (sent at most every 10 minutes)
    setTimeout(function () {
      autoSend(say)
    }, 4000)
    setInterval(function () {
      autoSend(say)
    }, 5 * 60 * 1000)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
