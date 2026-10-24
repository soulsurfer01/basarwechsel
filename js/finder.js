/* Basare finden: Termine aus data/termine.json, Suche nach PLZ oder Ort, Orte als Favoriten */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  var WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var QUELLE = { basarlino: 'Basarlino', unserbasar: 'UnserBasar' };
  var D = { events: null, plz: null, stand: null }, S = { center: null, favAll: false, shown: 40 };

  function store(key, val) {
    try { if (val === undefined) { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
  }
  function favs() { var f = store('bw-orte'); return Array.isArray(f) ? f : []; }

  function km(a, b, c, d) {
    var R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function heute() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parts(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2], wd: new Date(+p[0], +p[1] - 1, +p[2]).getDay() }; }

  function loadJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); });
  }
  function ensureEvents() {
    if (D.events) return Promise.resolve();
    return loadJson('data/termine.json').then(function (j) { D.events = j.events; D.stand = j.stand; });
  }
  function ensurePlz() { return D.plz ? Promise.resolve() : loadJson('data/plz.json').then(function (j) { D.plz = j; }); }

  function norm(s) { return s.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]/g, ''); }

  /* Eingabe -> Mittelpunkt { label, lat, lng } oder { label, prefix } */
  function resolve(q) {
    q = q.trim();
    if (!q) return Promise.resolve(null);
    return ensureEvents().then(ensurePlz).then(function () {
      var e, i, ort;
      if (/^\d{5}$/.test(q) || /^\d{4}$/.test(q)) {
        var c = D.plz[q];
        for (i = 0; i < D.events.length; i++) if (D.events[i].plz === q) { e = D.events[i]; break; }
        if (c) return { label: q + (e ? ' ' + e.ort : ''), lat: c[0], lng: c[1] };
        if (e && e.lat != null) return { label: q + ' ' + e.ort, lat: e.lat, lng: e.lng };
        return { label: q, prefix: q };
      }
      if (/^\d{1,3}$/.test(q)) return { label: 'PLZ ' + q + '…', prefix: q };
      var n = norm(q), exact = null, part = null;
      for (i = 0; i < D.events.length; i++) {
        ort = norm(D.events[i].ort);
        if (ort === n && !exact) exact = D.events[i];
        else if (ort.indexOf(n) === 0 && !part) part = D.events[i];
      }
      if (!exact && !part) for (i = 0; i < D.events.length; i++) if (norm(D.events[i].ort).indexOf(n) > -1) { part = D.events[i]; break; }
      var hit = exact || part;
      if (hit && hit.lat != null) return { label: hit.ort, lat: hit.lat, lng: hit.lng };
      return null;
    });
  }

  function filter(centers, radius, art) {
    var t = heute(), out = [];
    D.events.forEach(function (e) {
      if (e.bis < t) return;
      if (art === 'kids' && e.art !== 'kids') return;
      var best = null;
      centers.forEach(function (c) {
        if (c.prefix) { if (e.plz.indexOf(c.prefix) === 0) best = best == null ? 0 : best; return; }
        if (e.lat == null) return;
        var d = km(c.lat, c.lng, e.lat, e.lng);
        if ((radius === 0 || d <= radius) && (best == null || d < best)) best = d;
      });
      if (best != null) out.push({ e: e, d: best, hasKm: !centers[0].prefix });
    });
    out.sort(function (a, b) { return a.e.von < b.e.von ? -1 : a.e.von > b.e.von ? 1 : a.d - b.d; });
    return out;
  }

  function dateBlock(e) {
    var a = parts(e.von), b = parts(e.bis), box = el('div', 'fdate');
    var day = el('span', 'fday', a.d + (e.bis !== e.von && a.m === b.m ? '–' + b.d : ''));
    box.appendChild(day);
    box.appendChild(el('span', 'fmon', MON[a.m - 1] + (e.bis !== e.von && a.m !== b.m ? ' – ' + b.d + '. ' + MON[b.m - 1] : '')));
    if (e.bis === e.von) box.appendChild(el('span', 'fwd', WT[a.wd]));
    return box;
  }

  function card(r) {
    var e = r.e, a = el('a', 'fcard'); a.href = e.url; a.target = '_blank'; a.rel = 'noopener';
    a.appendChild(dateBlock(e));
    var body = el('div', 'fbody');
    body.appendChild(el('div', 'fname', e.name));
    var loc = e.plz + ' ' + e.ort + (r.hasKm && r.d >= 1 ? ', ' + Math.round(r.d) + ' km' : r.hasKm ? ', unter 1 km' : '');
    body.appendChild(el('div', 'fmeta', loc));
    var tags = el('div', 'ftags');
    tags.appendChild(el('span', 'ftag', QUELLE[e.q] || e.q));
    if (e.planung) tags.appendChild(el('span', 'ftag soft', 'in Planung'));
    if (e.online) tags.appendChild(el('span', 'ftag soft', 'online'));
    if (e.art === 'adult') tags.appendChild(el('span', 'ftag soft', 'Erwachsene'));
    body.appendChild(tags);
    a.appendChild(body);
    return a;
  }

  function renderFavs() {
    var box = $('fFavs'), f = favs(); box.textContent = '';
    box.hidden = !f.length;
    if (f.length > 1) {
      var all = el('button', 'chip' + (S.favAll ? ' on' : ''), 'Alle meine Orte'); all.type = 'button';
      all.addEventListener('click', function () { S.favAll = true; S.center = null; $('fOrt').value = ''; run(); });
      box.appendChild(all);
    }
    f.forEach(function (o, i) {
      var w = el('span', 'chip' + (!S.favAll && S.center && S.center.label === o.label ? ' on' : ''));
      var b = el('button', 'chipgo', '★ ' + o.label); b.type = 'button';
      b.addEventListener('click', function () { S.favAll = false; S.center = o; $('fOrt').value = o.label; run(); });
      var x = el('button', 'chipx', '×'); x.type = 'button'; x.setAttribute('aria-label', o.label + ' entfernen');
      x.addEventListener('click', function () { var l = favs(); l.splice(i, 1); store('bw-orte', l); if (!l.length) S.favAll = false; renderFavs(); renderSave(); });
      w.appendChild(b); w.appendChild(x); box.appendChild(w);
    });
  }
  function renderSave() {
    var b = $('fSave'), c = S.center, on = false;
    b.hidden = !c || !!c.prefix || S.favAll;
    if (c) favs().forEach(function (o) { if (o.label === c.label) on = true; });
    b.textContent = on ? '★ Ort gemerkt' : '☆ Ort merken'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function run() {
    var info = $('fInfo'), list = $('fList'), more = $('fMore'), radius = +$('fRadius').value, art = $('fArt').value;
    list.textContent = ''; more.hidden = true;
    var centers = S.favAll ? favs() : S.center ? [S.center] : [];
    if (!centers.length) { info.textContent = ''; renderFavs(); renderSave(); return; }
    ensureEvents().then(function () {
      var res = filter(centers, radius, art), where = S.favAll ? 'deine Orte' : S.center.label;
      var prefix = !S.favAll && S.center.prefix;
      info.textContent = res.length
        ? res.length + (res.length === 1 ? ' Basar' : ' Basare') + (prefix ? ' mit der PLZ ' + S.center.label.replace('PLZ ', '') : (radius ? ' im Umkreis von ' + radius + ' km um ' + where : ' in ganz Deutschland'))
        : 'Nichts gefunden' + (radius && !prefix ? ' im Umkreis von ' + radius + ' km um ' + where : '') + '. Probier einen größeren Umkreis oder „Alle Arten“.';
      res.slice(0, S.shown).forEach(function (r) { list.appendChild(card(r)); });
      if (res.length > S.shown) { more.hidden = false; more.textContent = 'Mehr anzeigen (' + (res.length - S.shown) + ')'; more.onclick = function () { S.shown += 40; run(); }; }
      store('bw-zuletzt', { q: $('fOrt').value, r: radius, a: art });
      renderFavs(); renderSave();
    }).catch(function () { info.textContent = 'Die Termine konnten nicht geladen werden. Prüfe die Verbindung und versuche es noch einmal.'; });
  }

  function search() {
    var q = $('fOrt').value;
    S.favAll = false; S.shown = 40;
    resolve(q).then(function (c) {
      if (!c) { S.center = null; $('fList').textContent = ''; $('fInfo').textContent = q.trim() ? 'Den Ort „' + q.trim() + '“ finde ich nicht in den Terminen. Probier die Postleitzahl.' : 'Gib eine Postleitzahl oder einen Ort ein.'; renderSave(); return; }
      S.center = c; run();
    }).catch(function () { $('fInfo').textContent = 'Die Termine konnten nicht geladen werden. Prüfe die Verbindung und versuche es noch einmal.'; });
  }

  function showTab(name) {
    var f = name === 'find';
    document.body.classList.toggle('tab-finder', f);
    $('finder').hidden = !f;
    $('tabKonv').setAttribute('aria-pressed', f ? 'false' : 'true'); $('tabFind').setAttribute('aria-pressed', f ? 'true' : 'false');
    store('bw-tab', name);
    if (f) init();
    window.scrollTo(0, 0);
  }

  var started = false;
  function init() {
    if (started) return; started = true;
    var z = store('bw-zuletzt');
    if (z) { $('fRadius').value = String(z.r); $('fArt').value = z.a || 'kids'; }
    renderFavs(); renderSave();
    ensureEvents().then(function () {
      var d = new Date(D.stand);
      $('fStand').textContent = 'Termine aus den öffentlichen Listen von basarlino.de und unserbasar.de, Stand ' + d.getDate() + '.' + (d.getMonth() + 1) + '. um ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' Uhr. Ohne Gewähr, Einzelheiten stehen beim Veranstalter.';
      var f = favs();
      if (z && z.q) { $('fOrt').value = z.q; search(); }
      else if (f.length) { S.favAll = f.length > 1; S.center = f.length === 1 ? f[0] : null; if (f.length === 1) $('fOrt').value = f[0].label; run(); }
    }).catch(function () { $('fInfo').textContent = 'Die Termine konnten nicht geladen werden. Prüfe die Verbindung und versuche es noch einmal.'; });
  }

  $('tabKonv').addEventListener('click', function () { showTab('conv'); });
  $('tabFind').addEventListener('click', function () { showTab('find'); });
  $('fForm').addEventListener('submit', function (ev) { ev.preventDefault(); $('fOrt').blur(); search(); });
  $('fRadius').addEventListener('change', function () { S.shown = 40; if (S.center || S.favAll) run(); });
  $('fArt').addEventListener('change', function () { S.shown = 40; if (S.center || S.favAll) run(); });
  $('fSave').addEventListener('click', function () {
    var c = S.center; if (!c || c.prefix) return;
    var l = favs(), i, idx = -1;
    for (i = 0; i < l.length; i++) if (l[i].label === c.label) idx = i;
    if (idx > -1) l.splice(idx, 1); else l.push({ label: c.label, lat: c.lat, lng: c.lng });
    store('bw-orte', l); renderFavs(); renderSave();
  });
  $('fGeo').addEventListener('click', function () {
    if (!navigator.geolocation) { $('fInfo').textContent = 'Dein Gerät gibt den Standort nicht frei. Gib eine Postleitzahl ein.'; return; }
    $('fInfo').textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(function (p) {
      ensureEvents().then(ensurePlz).then(function () {
        var best = null, bd = 1e9;
        Object.keys(D.plz).forEach(function (k) { var d = km(p.coords.latitude, p.coords.longitude, D.plz[k][0], D.plz[k][1]); if (d < bd) { bd = d; best = k; } });
        S.favAll = false; S.shown = 40;
        S.center = { label: best ? best + ' (dein Standort)' : 'Dein Standort', lat: p.coords.latitude, lng: p.coords.longitude };
        $('fOrt').value = best || ''; run();
      });
    }, function () { $('fInfo').textContent = 'Der Standort wurde nicht freigegeben. Gib eine Postleitzahl oder einen Ort ein.'; }, { timeout: 10000, maximumAge: 600000 });
  });

  if (store('bw-tab') === 'find') showTab('find');
})();
