/*
 * Progressive-enhancement script for the study site. Loaded site-wide (deferred)
 * and keyed off the URL path, it adds optional client-only practice features:
 *   - /interview-prep/flashcards/  -> review mode: per-card self-grading with a
 *                                     Leitner spaced-repetition box, a "due only"
 *                                     filter, collapse/expand, and progress stats.
 *   - /interview-prep/question-bank/ -> a "random question" jump button.
 *   - /resources/progress/         -> per-module completion checkboxes + a bar.
 *
 * All state is in localStorage. Nothing here is required to read the site: with
 * JavaScript disabled, the flashcards are plain <details>, the question bank is
 * unchanged, and the progress page is a plain list of links.
 */
(function () {
  'use strict';

  // ---- storage helpers (fail-safe: private mode / disabled storage) ----
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  function slug(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  }
  function mkBtn(text) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sdg-btn';
    b.textContent = text;
    return b;
  }

  // ---- Leitner spaced-repetition model (boxes 0..4) ----
  var DAY = 86400000;
  var INTERVALS = [0, DAY, 3 * DAY, 7 * DAY, 16 * DAY];
  function interval(box) { return INTERVALS[Math.max(0, Math.min(box | 0, INTERVALS.length - 1))]; }
  function promote(st, now) { var b = Math.min(((st && st.box) | 0) + 1, INTERVALS.length - 1); return { box: b, due: now + interval(b) }; }
  function demote(now) { return { box: 0, due: now }; }

  var STYLE = '' +
    '.sdg-toolbar{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:1rem 0;padding:.55rem .75rem;border:1px solid var(--sl-color-gray-5);border-radius:.5rem;background:var(--sl-color-gray-6);}' +
    '.sdg-btn{cursor:pointer;font:inherit;font-size:.85em;padding:.25rem .6rem;border:1px solid var(--sl-color-gray-5);border-radius:.4rem;background:var(--sl-color-bg,#fff);color:var(--sl-color-text);}' +
    '.sdg-btn:hover{background:var(--sl-color-gray-5);}' +
    '.sdg-btn[aria-pressed="true"]{background:var(--sl-color-accent);color:var(--sl-color-white);border-color:var(--sl-color-accent);}' +
    '.sdg-status{font-size:.85em;color:var(--sl-color-gray-3);}' +
    '.sdg-card-grade{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-top:.6rem;}' +
    '.sdg-box{font-size:.8em;color:var(--sl-color-gray-3);}' +
    '.sl-markdown-content details[data-box="4"]{border-inline-start:3px solid var(--sl-color-accent);}' +
    '.sdg-flash{animation:sdgflash 1.6s ease;}' +
    '@keyframes sdgflash{0%{background:var(--sl-color-accent-low);}100%{background:transparent;}}' +
    '.sdg-progress-bar{height:.6rem;border-radius:.3rem;background:var(--sl-color-gray-5);overflow:hidden;margin:.5rem 0;}' +
    '.sdg-progress-fill{height:100%;width:0;background:var(--sl-color-accent);transition:width .3s ease;}' +
    '.sdg-progress-label{font-size:.9em;}' +
    'ul.sdg-progress{list-style:none;padding-inline-start:0;}' +
    'ul.sdg-progress li{margin:.25rem 0;}' +
    'ul.sdg-progress li.sdg-done{opacity:.55;}' +
    '.sdg-check{margin-inline-end:.5rem;vertical-align:middle;}';

  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ---- flashcards review mode ----
  function enhanceFlashcards(content) {
    var cards = Array.prototype.slice.call(content.querySelectorAll('details'));
    if (!cards.length) return;
    injectStyles();
    var KEY = 'sdg:flashcards';
    var state = load(KEY, {});

    function refreshCard(d, tag) {
      var id = d.getAttribute('data-card');
      var st = state[id];
      var box = st ? st.box : -1;
      tag.textContent = box < 0 ? 'new' : (box >= 4 ? 'mastered' : 'box ' + (box + 1) + '/5');
      d.setAttribute('data-box', box);
    }

    cards.forEach(function (d) {
      var sum = d.querySelector('summary');
      var id = slug(sum ? sum.textContent : '');
      if (!id) return;
      d.setAttribute('data-card', id);
      var bar = document.createElement('div');
      bar.className = 'sdg-card-grade';
      var got = mkBtn('✓ Got it');
      var again = mkBtn('↻ Review again');
      var tag = document.createElement('span');
      tag.className = 'sdg-box';
      bar.appendChild(got); bar.appendChild(again); bar.appendChild(tag);
      d.appendChild(bar);
      got.addEventListener('click', function (e) { e.preventDefault(); state[id] = promote(state[id], Date.now()); save(KEY, state); refreshCard(d, tag); updateStatus(); });
      again.addEventListener('click', function (e) { e.preventDefault(); state[id] = demote(Date.now()); save(KEY, state); refreshCard(d, tag); updateStatus(); });
      refreshCard(d, tag);
    });

    var tb = document.createElement('div');
    tb.className = 'sdg-toolbar';
    var strong = document.createElement('strong'); strong.textContent = 'Review mode:';
    var dueBtn = mkBtn('🎯 Due only');
    var collapse = mkBtn('▾ Collapse all');
    var expand = mkBtn('▸ Expand all');
    var reset = mkBtn('↺ Reset');
    var status = document.createElement('span'); status.className = 'sdg-status';
    tb.appendChild(strong); tb.appendChild(dueBtn); tb.appendChild(collapse); tb.appendChild(expand); tb.appendChild(reset); tb.appendChild(status);
    content.insertBefore(tb, content.firstChild);

    var dueOnly = false;
    function applyFilter() {
      var now = Date.now();
      cards.forEach(function (d) {
        var st = state[d.getAttribute('data-card')];
        var isDue = !st || st.due <= now;
        d.style.display = (dueOnly && !isDue) ? 'none' : '';
      });
    }
    function updateStatus() {
      var mastered = 0, learning = 0, due = 0, now = Date.now();
      cards.forEach(function (d) {
        var st = state[d.getAttribute('data-card')];
        if (!st) { due++; return; }
        if (st.box >= 4) mastered++; else learning++;
        if (st.due <= now) due++;
      });
      status.textContent = ' ' + mastered + ' mastered · ' + learning + ' learning · ' + due + ' due';
      if (dueOnly) applyFilter();
    }
    dueBtn.addEventListener('click', function () { dueOnly = !dueOnly; dueBtn.setAttribute('aria-pressed', dueOnly ? 'true' : 'false'); applyFilter(); });
    collapse.addEventListener('click', function () { cards.forEach(function (d) { d.open = false; }); });
    expand.addEventListener('click', function () { cards.forEach(function (d) { d.open = true; }); });
    reset.addEventListener('click', function () {
      if (window.confirm('Reset your flashcard review progress?')) {
        state = {}; save(KEY, state);
        cards.forEach(function (d) { d.style.display = ''; d.setAttribute('data-box', -1); var t = d.querySelector('.sdg-box'); if (t) t.textContent = 'new'; });
        dueOnly = false; dueBtn.setAttribute('aria-pressed', 'false');
        updateStatus();
      }
    });
    updateStatus();
  }

  // ---- question bank: random question ----
  function enhanceQuestionBank(content) {
    var heads = Array.prototype.slice.call(content.querySelectorAll('h3'));
    if (!heads.length) return;
    injectStyles();
    var tb = document.createElement('div');
    tb.className = 'sdg-toolbar';
    var btn = mkBtn('🎲 Random question');
    var hint = document.createElement('span'); hint.className = 'sdg-status'; hint.textContent = ' jump to a random prompt and try it timed';
    tb.appendChild(btn); tb.appendChild(hint);
    content.insertBefore(tb, content.firstChild);
    btn.addEventListener('click', function () {
      var h = heads[Math.floor(Math.random() * heads.length)];
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h.classList.add('sdg-flash');
      setTimeout(function () { h.classList.remove('sdg-flash'); }, 1600);
      if (h.id) { try { history.replaceState(null, '', '#' + h.id); } catch (e) { /* ignore */ } }
    });
  }

  // ---- progress dashboard ----
  function enhanceProgress(content) {
    var items = Array.prototype.slice.call(content.querySelectorAll('li[data-id]'));
    if (!items.length) return;
    injectStyles();
    var KEY = 'sdg:progress';
    var state = load(KEY, {});

    var barWrap = document.createElement('div'); barWrap.className = 'sdg-progress-bar';
    var fill = document.createElement('div'); fill.className = 'sdg-progress-fill'; barWrap.appendChild(fill);
    var tb = document.createElement('div'); tb.className = 'sdg-toolbar';
    var label = document.createElement('span'); label.className = 'sdg-progress-label';
    var reset = mkBtn('↺ Reset');
    tb.appendChild(label); tb.appendChild(reset);
    content.insertBefore(barWrap, content.firstChild);
    content.insertBefore(tb, content.firstChild);

    function update() {
      var done = 0;
      items.forEach(function (li) { if (state[li.getAttribute('data-id')]) done++; });
      var pct = Math.round((done / items.length) * 100);
      fill.style.width = pct + '%';
      label.textContent = done + ' / ' + items.length + ' complete (' + pct + '%)';
    }
    items.forEach(function (li) {
      var id = li.getAttribute('data-id');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'sdg-check'; cb.checked = !!state[id];
      cb.setAttribute('aria-label', 'Mark complete');
      cb.addEventListener('change', function () {
        if (cb.checked) state[id] = true; else delete state[id];
        save(KEY, state); li.classList.toggle('sdg-done', cb.checked); update();
      });
      li.insertBefore(cb, li.firstChild);
      if (state[id]) li.classList.add('sdg-done');
    });
    reset.addEventListener('click', function () {
      if (window.confirm('Reset your study progress?')) {
        state = {}; save(KEY, state);
        items.forEach(function (li) { var cb = li.querySelector('.sdg-check'); if (cb) cb.checked = false; li.classList.remove('sdg-done'); });
        update();
      }
    });
    update();
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var content = document.querySelector('.sl-markdown-content') || document.querySelector('main');
    if (!content) return;
    var path = location.pathname;
    if (path.indexOf('/interview-prep/flashcards') !== -1) enhanceFlashcards(content);
    if (path.indexOf('/interview-prep/question-bank') !== -1) enhanceQuestionBank(content);
    if (path.indexOf('/resources/progress') !== -1) enhanceProgress(content);
  });
})();
