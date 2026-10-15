/* AIVOXFLOW site JS — progressive enhancement only.
   Total budget: < 5 KB. No frameworks, no analytics, no third parties.
   Without this file the site still works: nav stays visible, search page
   shows a noscript fallback. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  /* ----- mobile navigation toggle ----- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('nav-open', !open);
    });
    // Close the menu when a link inside it is chosen (mobile).
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && window.matchMedia('(max-width: 759px)').matches) {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('nav-open');
      }
    });
  }

  /* ----- client-side search (privacy: never leaves the browser) ----- */
  var form = document.getElementById('search-form');
  if (!form) return;
  var input = document.getElementById('search-q');
  var resultsEl = document.getElementById('search-results');
  var statusEl = document.getElementById('search-status');
  var indexUrl = form.getAttribute('data-index-url');
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(indexUrl).then(function (r) {
        if (!r.ok) throw new Error('index fetch failed: ' + r.status);
        return r.json();
      });
    }
    return indexPromise;
  }

  function score(entry, q) {
    var hay = (entry.t + ' ' + entry.d + ' ' + entry.c).toLowerCase();
    var body = (entry.x || '').toLowerCase();
    var s = 0;
    if (entry.t.toLowerCase().indexOf(q) !== -1) s += 3;
    if (hay.indexOf(q) !== -1) s += 2;
    if (body.indexOf(q) !== -1) s += 1;
    return s;
  }

  function render(q) {
    resultsEl.textContent = '';
    if (!q) { statusEl.textContent = ''; return; }
    loadIndex().then(function (data) {
      var hits = data
        .map(function (e) { return { e: e, s: score(e, q) }; })
        .filter(function (h) { return h.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 20);
      statusEl.textContent = hits.length
        ? hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + q + '”'
        : 'No results for “' + q + '”. Try a simpler term, or browse all articles.';
      hits.forEach(function (h) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'r-title';
        a.href = h.e.u;
        a.textContent = h.e.t;
        var d = document.createElement('p');
        d.className = 'r-desc';
        d.textContent = h.e.d;
        var m = document.createElement('p');
        m.className = 'r-meta';
        m.textContent = h.e.c + ' · ' + h.e.dt;
        li.appendChild(a); li.appendChild(d); li.appendChild(m);
        resultsEl.appendChild(li);
      });
    }).catch(function () {
      statusEl.textContent = 'Search index could not be loaded. You can browse all articles instead.';
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    var url = q ? form.action + '?q=' + encodeURIComponent(q) : form.action;
    history.replaceState(null, '', url);
    render(q.toLowerCase());
  });

  var params = new URLSearchParams(window.location.search);
  var initial = params.get('q');
  if (initial) { input.value = initial; render(initial.toLowerCase()); }
})();
