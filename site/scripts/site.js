/* AIVOXFLOW site JS — progressive enhancement only.
   Budget: < 8 KB. No frameworks, no third parties.
   Without this file the site still works: nav stays visible, search page
   shows a noscript fallback, share buttons degrade to plain links. */
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
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && window.matchMedia('(max-width: 759px)').matches) {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('nav-open');
      }
    });
  }

  /* ----- copy-to-clipboard share button ----- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy-url]');
    if (!btn) return;
    var url = btn.getAttribute('data-copy-url');
    var status = btn.parentNode.querySelector('.share-status');
    var done = function (ok) {
      if (!status) return;
      status.textContent = ok ? 'Link copied' : 'Copy failed — select the address bar instead';
      window.setTimeout(function () { status.textContent = ''; }, 3000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  /* ----- client-side search (privacy: never leaves the browser) ----- */
  var form = document.getElementById('search-form');
  if (!form) return;
  var input = document.getElementById('search-q');
  var resultsEl = document.getElementById('search-results');
  var statusEl = document.getElementById('search-status');
  var filterEl = document.getElementById('search-filter');
  var indexUrl = form.getAttribute('data-index-url');
  var indexPromise = null;
  var active = -1;
  var current = [];

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(indexUrl).then(function (r) {
        if (!r.ok) throw new Error('index fetch failed: ' + r.status);
        return r.json();
      });
    }
    return indexPromise;
  }

  function tokens(q) {
    return q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (t) { return t.length > 1; });
  }

  function score(entry, words) {
    var title = entry.t.toLowerCase();
    var tags = (entry.tags || []).join(' ').toLowerCase();
    var desc = (entry.d || '').toLowerCase();
    var cat = (entry.c || '').toLowerCase();
    var body = (entry.x || '').toLowerCase();
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var hit = 0;
      if (title.indexOf(w) !== -1) hit += 6;
      if (tags.indexOf(w) !== -1) hit += 4;
      if (cat.indexOf(w) !== -1) hit += 3;
      if (desc.indexOf(w) !== -1) hit += 2;
      if (body.indexOf(w) !== -1) hit += 1;
      if (!hit) return 0;           // every token must match somewhere (AND)
      total += hit;
    }
    return total;
  }

  // Safe highlight: build text nodes + <mark> elements, never innerHTML.
  function highlight(text, words) {
    var frag = document.createDocumentFragment();
    if (!words.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    var re = new RegExp('(' + words.map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')', 'gi');
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var mark = document.createElement('mark');
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function setActive(next) {
    var items = resultsEl.querySelectorAll('[role="option"]');
    if (!items.length) return;
    if (active >= 0 && items[active]) {
      items[active].classList.remove('is-active');
      items[active].setAttribute('aria-selected', 'false');
    }
    active = (next + items.length) % items.length;
    var el = items[active];
    el.classList.add('is-active');
    el.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', el.id);
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function render(q) {
    resultsEl.textContent = '';
    active = -1;
    input.removeAttribute('aria-activedescendant');
    var words = tokens(q);
    if (!q || !words.length) {
      statusEl.textContent = '';
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    var filter = filterEl ? filterEl.value : '';
    loadIndex().then(function (data) {
      var hits = data
        .map(function (e) { return { e: e, s: score(e, words) }; })
        .filter(function (h) { return h.s > 0 && (!filter || h.e.g === filter); })
        .sort(function (a, b) { return b.s - a.s || (b.e.dt > a.e.dt ? 1 : -1); });
      current = hits;
      statusEl.textContent = hits.length
        ? hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + q + '”'
        : 'No results for “' + q + '”. Try a simpler term, or browse all articles.';
      hits.slice(0, 20).forEach(function (h, i) {
        var li = document.createElement('li');
        li.id = 'sr-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        var a = document.createElement('a');
        a.className = 'r-title';
        a.href = h.e.u;
        a.appendChild(highlight(h.e.t, words));
        var d = document.createElement('p');
        d.className = 'r-desc';
        d.appendChild(highlight(h.e.d, words));
        var m = document.createElement('p');
        m.className = 'r-meta';
        m.textContent = h.e.c + ' · ' + h.e.dt;
        li.appendChild(a);
        li.appendChild(d);
        li.appendChild(m);
        resultsEl.appendChild(li);
      });
      input.setAttribute('aria-expanded', String(hits.length > 0));
    }).catch(function () {
      statusEl.textContent = 'Search index could not be loaded. You can browse all articles instead.';
    });
  }

  var timer = null;
  function schedule(q) {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { render(q); }, 120);
  }

  function syncUrl(q) {
    var url = q ? form.action + '?q=' + encodeURIComponent(q) : form.action;
    history.replaceState(null, '', url);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    syncUrl(q);
    render(q);
  });

  input.addEventListener('input', function () {
    var q = input.value.trim();
    syncUrl(q);
    schedule(q);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0) {
      var el = resultsEl.querySelectorAll('[role="option"]')[active];
      var link = el && el.querySelector('a');
      if (link) { e.preventDefault(); window.location.href = link.href; }
    } else if (e.key === 'Escape') {
      input.value = '';
      syncUrl('');
      render('');
    }
  });

  if (filterEl) {
    filterEl.addEventListener('change', function () { render(input.value.trim()); });
  }

  var params = new URLSearchParams(window.location.search);
  var initial = params.get('q');
  if (initial) { input.value = initial; render(initial); }
})();
