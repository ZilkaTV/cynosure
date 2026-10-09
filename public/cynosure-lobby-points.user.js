// ==UserScript==
// @name         CYN Lobby Points
// @namespace    https://cynclan.com/
// @version      1.0.0
// @description  Shows on every team lobby of openfront.io how many clan points a win or a loss is worth for your clan (OpenFront's own clan-score formula, same as the points planner on cynclan.com).
// @author       Cynosure [CYN]
// @match        https://openfront.io/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://cynclan.com/cynosure-lobby-points.user.js
// @downloadURL  https://cynclan.com/cynosure-lobby-points.user.js
// ==/UserScript==

// Read-only: it only reads the lobby cards the page already shows and adds one text line per team lobby.
// Nothing is sent anywhere. Change TAG if you use it for another clan.
(function () {
  'use strict'

  var TAG = 'CYN'
  var KEY = 'cynLobbyPoints.members'
  var members = clamp(parseInt(localStorage.getItem(KEY), 10) || 2, 1, 8)

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

  // "4 Teams von 11" / "4 teams of 11" / "4 équipes de 11": two integers = teams and players per team, in any language.
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

  function decorate(card) {
    var badge = Array.prototype.find.call(card.querySelectorAll('span'), function (s) {
      return /^\s*\d+\s*\/\s*\d+\s*$/.test(s.textContent || '')
    })
    var mode = card.querySelector('h3')
    if (!badge || !mode) return
    var capacity = parseInt(badge.textContent.split('/')[1], 10)
    var l = layout(mode.textContent || '', capacity)
    var line = card.querySelector('[data-cyn-points]')
    if (!l) {
      if (line) line.remove()
      return
    }
    var clan = Math.min(members, Math.floor(capacity / l.teams) || 1)
    var p = points(l.teams, l.total, clan)
    var text = '[' + TAG + ' x' + clan + ']  +' + fmt(p.win) + ' win  /  −' + fmt(p.loss) + ' loss'
    if (!line) {
      line = document.createElement('div')
      line.setAttribute('data-cyn-points', '1')
      line.style.cssText = 'margin-top:2px;font-size:11px;font-weight:700;letter-spacing:.04em;color:#eed699;text-transform:none'
      mode.parentElement.appendChild(line)
    }
    if (line.textContent !== text) line.textContent = text
  }

  function control() {
    var box = document.getElementById('cyn-lobby-points-control')
    if (box) return box
    box = document.createElement('div')
    box.id = 'cyn-lobby-points-control'
    box.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;' +
      'background:rgba(12,10,23,.92);border:1px solid #d8b96a;color:#eed699;font:600 12px system-ui,sans-serif'
    box.innerHTML =
      '<span>' + TAG + ' lobby points · ' + TAG + ' players in your team</span>' +
      '<button type="button" data-d="-1" style="all:unset;cursor:pointer;padding:0 6px;border:1px solid #d8b96a;border-radius:6px">−</button>' +
      '<b id="cyn-lobby-points-n" style="min-width:12px;text-align:center"></b>' +
      '<button type="button" data-d="1" style="all:unset;cursor:pointer;padding:0 6px;border:1px solid #d8b96a;border-radius:6px">+</button>'
    box.addEventListener('click', function (e) {
      var d = e.target && e.target.getAttribute && e.target.getAttribute('data-d')
      if (!d) return
      e.stopPropagation()
      members = clamp(members + Number(d), 1, 8)
      try {
        localStorage.setItem(KEY, String(members))
      } catch (err) {
        /* storage blocked: the value just is not remembered */
      }
      run()
    })
    document.body.appendChild(box)
    return box
  }

  function run() {
    var cards = document.querySelectorAll('game-mode-selector button.group')
    // The control only appears while the lobby list is on screen (not during a game).
    var box = document.getElementById('cyn-lobby-points-control')
    if (cards.length === 0) {
      if (box) box.remove()
      return
    }
    box = control()
    box.querySelector('#cyn-lobby-points-n').textContent = String(members)
    cards.forEach(decorate)
  }

  setInterval(run, 1000)
  run()
})()
