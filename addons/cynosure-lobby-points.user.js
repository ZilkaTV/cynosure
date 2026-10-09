// ==UserScript==
// @name         CYN Lobby Points
// @namespace    https://cynclan.com/
// @version      1.4.1
// @description  Shows on every team lobby of openfront.io how many clan points a win or a loss is worth for your clan (OpenFront's own clan-score formula, same as the points planner on cynclan.com).
// @author       Cynosure [CYN]
// @match        https://openfront.io/*
// @match        https://cynclan.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://cynclan.com/cynosure-lobby-points.user.js
// @downloadURL  https://cynclan.com/cynosure-lobby-points.user.js
// ==/UserScript==

// Read-only: it only reads the lobby cards the page already shows and adds one badge per team lobby plus a small
// control panel. Nothing is sent anywhere. Change TAG if you use it for another clan.
(function () {
  'use strict'

  var VERSION = '1.4.1'
  // On cynclan.com the script only reports its version, so the points planner can show whether an update is available.
  if (location.hostname === 'cynclan.com') {
    document.documentElement.setAttribute('data-cyn-lobby-addon', VERSION)
    window.dispatchEvent(new CustomEvent('cyn-lobby-addon', { detail: VERSION }))
    return
  }

  var TAG = 'CYN'
  var KEY = 'cynLobbyPoints.members'
  var KEY_COLLAPSED = 'cynLobbyPoints.collapsed'
  var KEY_POS = 'cynLobbyPoints.pos'
  // The lobby cards on the home page and in the full list (#modal=detailed-view) share the same markup.
  var CARD_SELECTOR = 'game-mode-selector button.group, detailed-view-modal button.group'
  var SITE = 'https://cynclan.com/planner'
  var LOGO = 'data:image/png;base64,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'

  var MAX_MEMBERS = 50
  var members = clamp(parseInt(read(KEY), 10) || 2, 1, MAX_MEMBERS)
  var collapsed = read(KEY_COLLAPSED) === '1'
  var pos = null
  try {
    pos = JSON.parse(read(KEY_POS) || 'null')
  } catch (e) {
    pos = null
  }
  var justDragged = false

  function read(k) {
    try {
      return localStorage.getItem(k)
    } catch (e) {
      return null
    }
  }
  function write(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch (e) {
      /* storage blocked: the value just is not remembered */
    }
  }
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n))
  }

  // OpenFront's clan score (docs/API.md, decay 1): score = (clan players / average team size) x difficulty for a win,
  // divided by difficulty for a loss; difficulty = max(1, sqrt(teams - 1)).
  function points(teams, total, clan) {
    var ratio = clan / (total / teams)
    var difficulty = Math.max(1, Math.sqrt(teams - 1))
    return { win: ratio * difficulty, loss: ratio / difficulty }
  }
  var fmt = function (n) {
    return n.toFixed(2)
  }

  // "4 Teams von 11" / "4 teams of 11" / "4 equipes de 11": two integers = teams and players per team, in any language.
  // The fixed presets (Duos, Trios, Quads) carry no numbers: derive the team count from the lobby size instead.
  function layout(modeLine, capacity) {
    var nums = (modeLine.match(/\d+/g) || []).map(Number)
    if (nums.length >= 2) {
      var teams = nums[0]
      var per = nums[1]
      if (teams >= 2 && per >= 1 && Math.abs(teams * per - capacity) <= Math.max(2, teams)) return { teams: teams, total: capacity }
    }
    var size = /duo/i.test(modeLine) ? 2 : /trio/i.test(modeLine) ? 3 : /quad/i.test(modeLine) ? 4 : 0
    if (size && capacity >= size * 2) return { teams: Math.round(capacity / size), total: capacity }
    return null
  }

  function injectStyle() {
    if (document.getElementById('cyn-lp-style')) return
    var css =
      '.cyn-lp-badge{display:inline-flex;align-items:center;gap:6px;margin-top:3px;padding:2px 8px 2px 4px;border-radius:999px;' +
      'background:linear-gradient(90deg,rgba(91,52,168,.85),rgba(20,14,40,.85));border:1px solid rgba(216,185,106,.75);' +
      'font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.03em;text-transform:none;color:#f1e8c8;box-shadow:0 1px 6px rgba(0,0,0,.45)}' +
      '.cyn-lp-badge img{width:15px;height:15px;object-fit:contain;display:block}' +
      '.cyn-lp-badge .w{color:#4be08c}.cyn-lp-badge .l{color:#ff6f84}.cyn-lp-badge .x{color:#d8b96a}' +
      '#cyn-lp-panel{position:fixed;top:104px;right:14px;z-index:2147483000;width:236px;border-radius:14px;overflow:hidden;' +
      'font:500 12px/1.4 system-ui,sans-serif;color:#e9e6f7;background:linear-gradient(160deg,#241a47 0%,#120f22 60%,#0c0a17 100%);' +
      'border:1px solid #d8b96a;box-shadow:0 8px 28px rgba(0,0,0,.6),0 0 0 1px rgba(139,92,246,.35)}' +
      '#cyn-lp-panel .h{display:flex;align-items:center;gap:9px;padding:9px 10px;background:linear-gradient(90deg,rgba(139,92,246,.45),rgba(216,185,106,.18));' +
      'border-bottom:1px solid rgba(216,185,106,.4);cursor:grab;touch-action:none;user-select:none}' +
      '#cyn-lp-panel.drag .h{cursor:grabbing}' +
      '#cyn-lp-panel .h img{width:34px;height:34px;object-fit:contain;display:block;filter:drop-shadow(0 0 6px rgba(139,92,246,.7))}' +
      '#cyn-lp-panel .t{flex:1;min-width:0;line-height:1.15}' +
      '#cyn-lp-panel .t b{display:block;font:700 13px Georgia,serif;letter-spacing:.14em;color:#eed699}' +
      '#cyn-lp-panel .t small{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#b79cff}' +
      '#cyn-lp-panel button{all:unset;cursor:pointer;text-align:center;box-sizing:border-box}' +
      '#cyn-lp-panel .min{width:22px;height:22px;line-height:20px;border:1px solid rgba(216,185,106,.6);border-radius:6px;color:#eed699;font-weight:700}' +
      '#cyn-lp-panel .min:hover,#cyn-lp-panel .st button:hover{background:rgba(216,185,106,.2)}' +
      '#cyn-lp-panel .b{padding:10px 12px 11px;display:grid;gap:9px}' +
      '#cyn-lp-panel .r{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '#cyn-lp-panel .st{display:flex;align-items:center;gap:6px}' +
      '#cyn-lp-panel .st button{width:24px;height:24px;line-height:22px;border:1px solid #d8b96a;border-radius:7px;color:#eed699;font-size:15px;font-weight:700}' +
      '#cyn-lp-panel .st input{all:unset;box-sizing:border-box;width:34px;height:24px;text-align:center;font-size:15px;font-weight:700;color:#fff;' +
      'border:1px solid rgba(216,185,106,.45);border-radius:7px;background:rgba(0,0,0,.25);cursor:text}' +
      '#cyn-lp-panel .st input:focus{border-color:#eed699}' +
      '#cyn-lp-panel a{display:block;padding:4px 8px;border-radius:7px;text-align:center;text-decoration:none;font-weight:700;font-size:10px;' +
      'letter-spacing:.04em;color:#1a1405;background:linear-gradient(180deg,#eed699,#b0913f)}' +
      '#cyn-lp-panel a:hover{filter:brightness(1.08)}' +
      '#cyn-lp-panel.c{width:auto;border-radius:999px;cursor:pointer}' +
      '#cyn-lp-panel.c .h{padding:6px;border:0;background:linear-gradient(135deg,rgba(139,92,246,.5),rgba(20,14,40,.9))}' +
      '#cyn-lp-panel.c .t,#cyn-lp-panel.c .min,#cyn-lp-panel.c .b{display:none}'
    var style = document.createElement('style')
    style.id = 'cyn-lp-style'
    style.textContent = css
    document.head.appendChild(style)
  }

  function badge(clan, p) {
    var el = document.createElement('div')
    el.setAttribute('data-cyn-points', '1')
    var img = document.createElement('img')
    img.src = LOGO
    img.alt = ''
    var text = document.createElement('span')
    text.innerHTML =
      '<span class="x">' + TAG + ' ×' + clan + '</span> <span class="w">+' + fmt(p.win) + '</span> / <span class="l">−' + fmt(p.loss) + '</span>'
    el.className = 'cyn-lp-badge'
    el.title = 'Clan points for a win / a loss with ' + clan + ' ' + TAG + ' players in your team (full lobby). cynclan.com'
    el.appendChild(img)
    el.appendChild(text)
    return el
  }

  function decorate(card) {
    var badgeEl = Array.prototype.find.call(card.querySelectorAll('span'), function (s) {
      return /^\s*\d+\s*\/\s*\d+\s*$/.test(s.textContent || '')
    })
    var mode = card.querySelector('h3')
    if (!badgeEl || !mode) return
    var capacity = parseInt(badgeEl.textContent.split('/')[1], 10)
    var l = layout(mode.textContent || '', capacity)
    var old = card.querySelector('[data-cyn-points]')
    if (!l) {
      if (old) old.remove()
      return
    }
    var clan = Math.min(members, Math.floor(capacity / l.teams) || 1)
    var p = points(l.teams, l.total, clan)
    var key = clan + '|' + fmt(p.win) + '|' + fmt(p.loss)
    if (old && old.getAttribute('data-key') === key) return
    if (old) old.remove()
    var el = badge(clan, p)
    el.setAttribute('data-key', key)
    mode.parentElement.appendChild(el)
  }

  function panel() {
    var box = document.getElementById('cyn-lp-panel')
    if (box) return box
    box = document.createElement('div')
    box.id = 'cyn-lp-panel'
    box.innerHTML =
      '<div class="h"><img alt="" src="' + LOGO + '"><div class="t"><b>CYNOSURE</b><small>Lobby points</small></div>' +
      '<button type="button" class="min" data-act="toggle" title="Minimise">–</button></div>' +
      '<div class="b"><div class="r"><span>' + TAG + ' players in your team</span><div class="st">' +
      '<button type="button" data-d="-1">−</button><input id="cyn-lp-n" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Number of players"><button type="button" data-d="1">+</button></div></div>' +
      '<a href="' + SITE + '" target="_blank" rel="noopener">cynclan.com</a></div>'
    box.addEventListener('click', function (e) {
      if (justDragged) {
        e.stopPropagation()
        return
      }
      var t = e.target
      var d = t && t.getAttribute && t.getAttribute('data-d')
      if (d) {
        e.stopPropagation()
        // Shift-click changes the number by 5.
        members = clamp(members + Number(d) * (e.shiftKey ? 5 : 1), 1, MAX_MEMBERS)
        write(KEY, String(members))
        run()
        return
      }
      if ((t && t.getAttribute && t.getAttribute('data-act') === 'toggle') || (box.classList.contains('c') && !(t && t.closest && t.closest('a')))) {
        e.stopPropagation()
        collapsed = !collapsed
        write(KEY_COLLAPSED, collapsed ? '1' : '0')
        box.classList.toggle('c', collapsed)
      }
    })
    var input = box.querySelector('#cyn-lp-n')
    // Typed entry: the game listens for keys on the page, so keep them to ourselves.
    ;['keydown', 'keyup', 'keypress'].forEach(function (ev) {
      input.addEventListener(ev, function (e) {
        e.stopPropagation()
        if (ev === 'keydown' && e.key === 'Enter') input.blur()
      })
    })
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^0-9]/g, '')
      var v = parseInt(input.value, 10)
      if (v >= 1) {
        members = clamp(v, 1, MAX_MEMBERS)
        write(KEY, String(members))
        run()
      }
    })
    input.addEventListener('blur', function () {
      input.value = String(members)
    })
    box.classList.toggle('c', collapsed)
    document.body.appendChild(box)
    applyPos(box)
    enableDrag(box)
    return box
  }

  // Keep the panel fully on screen (also after the window was resized).
  function applyPos(box) {
    if (!pos) return
    var w = box.offsetWidth || 236
    var h = box.offsetHeight || 60
    var x = clamp(pos.x, 4, Math.max(4, window.innerWidth - w - 4))
    var y = clamp(pos.y, 4, Math.max(4, window.innerHeight - h - 4))
    box.style.left = x + 'px'
    box.style.top = y + 'px'
    box.style.right = 'auto'
  }

  // Hold the left mouse button on the title bar (or the small crest) and move the panel anywhere.
  function enableDrag(box) {
    var head = box.querySelector('.h')
    var start = null
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || (e.target.closest && e.target.closest('.min'))) return
      var r = box.getBoundingClientRect()
      start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, moved: false }
      head.setPointerCapture(e.pointerId)
    })
    head.addEventListener('pointermove', function (e) {
      if (!start) return
      var dx = e.clientX - start.px
      var dy = e.clientY - start.py
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 5) return
      start.moved = true
      box.classList.add('drag')
      pos = { x: start.x + dx, y: start.y + dy }
      applyPos(box)
    })
    function end() {
      if (!start) return
      if (start.moved) {
        justDragged = true
        setTimeout(function () {
          justDragged = false
        }, 0)
        var r = box.getBoundingClientRect()
        pos = { x: r.left, y: r.top }
        write(KEY_POS, JSON.stringify(pos))
      }
      box.classList.remove('drag')
      start = null
    }
    head.addEventListener('pointerup', end)
    head.addEventListener('pointercancel', end)
    window.addEventListener('resize', function () {
      applyPos(box)
    })
  }

  function run() {
    // Only cards that are on screen count: a closed modal keeps its cards in the DOM, and the panel must not show during a game.
    var cards = Array.prototype.filter.call(document.querySelectorAll(CARD_SELECTOR), function (c) {
      return c.getClientRects().length > 0
    })
    var box = document.getElementById('cyn-lp-panel')
    if (cards.length === 0) {
      if (box) box.remove()
      return
    }
    injectStyle()
    box = panel()
    var n = box.querySelector('#cyn-lp-n')
    if (n && document.activeElement !== n) n.value = String(members)
    cards.forEach(decorate)
    applyPos(box)
  }

  setInterval(run, 1000)
  run()
})()
