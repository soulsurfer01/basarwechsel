(function () {
  var SAMPLE = [
    'Artikel-Liste "Beispiel-Basar"', '099 Max Mustermann', 'Nr. Code Artikel Preis',
    '012 Aa1Bb Jeans Zara sz (122, w.) 6,00 €', '013 Cc2Dd Mütze & Schal (Blau) 4,00 €',
    '014 Ee3Ff Gummistiefel Wheat (26) 5,00 €', '015 Gg4Hh Wintermantel Blumen (98/104, w.) 12,00 €',
    '016 Ii5Jj Pippi Langstrumpf (Buch) 2,00 €', '017 Kk6Ll verkauft - Playmobil Pferde 8,00 €',
    '1 verkauft - 6 Artikel gesamt: 37,00 €'
  ].join('\n');
  var NOTE_BAS = 'Spalten: Artikel, Farbe, Größe, Preis, wie in der UnserBasar-Liste. Welche Überschriften der Import dort genau erwartet, zeigt die Vorlage bei UnserBasar.';
  var NOTE_UB = 'Einen CSV-Import für Basarlino habe ich nicht gefunden. Die Liste ist zum Abtippen oder Einfügen in eine Tabelle gedacht. UnserBasar kennt kein m/w.';

  var S = { items: [], total: null, basar: '', seller: '', demo: false, uid: 0, raw: '', checkSum: 0, mode: 'bas', expect: null };
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function fmtEuro(n) { return fmtPrice(n) + ' €'; }
  function parsePrice(t) {
    var s = String(t == null ? '' : t).replace(/€/g, '').replace(/\s/g, '');
    if (!/^\d{1,6}([.,]\d{1,2})?$/.test(s)) return NaN;
    return parseFloat(s.replace(',', '.'));
  }
  function status(msg, kind) { var e = $('status'); e.textContent = msg || ''; e.className = 'status' + (kind ? ' ' + kind : ''); }
  function prep(items) { return items.map(function (it) { it.uid = ++S.uid; it.preisText = fmtPrice(it.preis); return it; }); }
  function target() { return S.mode === 'ub' ? 'Basarlino' : 'UnserBasar'; }
  function visible() { return S.items.filter(function (it) { return !it.sold; }); }

  function load(text, demo) {
    var r = parseBasarlino(text, { colorFromName: $('optColor').checked });
    S.raw = text; S.demo = !!demo; S.mode = 'bas'; S.expect = null;
    S.items = prep(r.items); S.total = r.total; S.basar = r.basar; S.seller = r.seller;
    S.checkSum = r.items.reduce(function (a, i) { return a + i.preis; }, 0);
    render(); return r.items.length;
  }
  function loadUb(res) {
    S.mode = 'ub'; S.raw = ''; S.demo = false; S.total = null; S.expect = res.meta.anzahl;
    S.items = prep(res.items); S.basar = res.meta.basar || ''; S.seller = res.meta.name || '';
    S.checkSum = res.items.reduce(function (a, i) { return a + i.preis; }, 0);
    render(); return res.items.length;
  }

  function field(item, key, cls, ph, extra) {
    var inp = el('input', cls, { type: 'text', 'aria-label': ph, placeholder: ph, autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done' });
    if (extra) for (var k in extra) inp.setAttribute(k, extra[k]);
    inp.value = item[key] || '';
    inp.addEventListener('input', function () { item[key] = inp.value; refresh(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    return inp;
  }
  function labeled(txt, inp) { var l = el('label'); l.appendChild(document.createTextNode(txt)); l.appendChild(inp); return l; }

  function renderItems() {
    var box = $('items'); box.textContent = '';
    var vis = visible();
    if (!S.items.length) return;
    if (!vis.length) { var em = el('div', 'empty'); em.textContent = 'Alle Artikel sind verkauft. Es gibt nichts zu übertragen.'; box.appendChild(em); return; }
    vis.forEach(function (item, idx) {
      var card = el('div', 'item');
      card.style.setProperty('--i', Math.min(idx, 8));
      var top = el('div', 'top');
      top.appendChild(field(item, 'name', 'name', 'Artikel'));
      var x = el('button', 'x', { type: 'button', 'aria-label': 'Artikel entfernen' }); x.textContent = '×';
      x.addEventListener('click', function () { S.items = S.items.filter(function (i) { return i !== item; }); render(); });
      top.appendChild(x); card.appendChild(top);
      var cols = el('div', 'cols');
      cols.appendChild(labeled('Farbe', field(item, 'farbe', '', 'Farbe')));
      cols.appendChild(labeled('Größe', field(item, 'groesse', '', 'Größe')));
      var p = field(item, 'preisText', 'price', 'Preis', { inputmode: 'decimal' });
      p.addEventListener('blur', function () { var n = parsePrice(item.preisText); if (!isNaN(n)) { item.preisText = fmtPrice(n); p.value = item.preisText; } refresh(); });
      cols.appendChild(labeled('Preis €', p));
      card.appendChild(cols); box.appendChild(card);
    });
  }

  function csvText() {
    var sep = $('sep').value;
    if (S.mode === 'ub') return toCsvBasarlino(visible(), { sep: sep, bracket: $('optBracket').checked });
    return toCsv(visible(), { sep: sep, gender: $('optGender').checked });
  }

  function refresh() {
    var vis = visible(), sum = 0, bad = 0;
    vis.forEach(function (it) { var n = parsePrice(it.preisText); if (isNaN(n)) bad++; else sum += n; });
    var line = '<span class="stat"><b>' + vis.length + '</b><i>Artikel</i></span><span class="stat"><b>' + fmtEuro(sum) + '</b><i>Summe</i></span>';
    if (bad) line += '<span class="bad">' + bad + (bad === 1 ? ' Preis ist' : ' Preise sind') + ' ungültig.</span>';
    $('count').innerHTML = line;
    $('total').textContent = 'Für ' + target() + ' · ' + vis.length + ' Artikel · ' + fmtEuro(sum);
    var inputs = $('items').querySelectorAll('input.price');
    for (var i = 0; i < inputs.length; i++) inputs[i].setAttribute('aria-invalid', isNaN(parsePrice(inputs[i].value)) ? 'true' : 'false');
    $('out').value = vis.length ? csvText() : '';
    $('save').disabled = $('copy').disabled = !vis.length;
  }

  function render() {
    var has = S.items.length > 0, ub = S.mode === 'ub';
    document.body.classList.toggle('loaded', !!has); $('summary').hidden = !has; $('optsBox').hidden = !has; $('outBox').hidden = !has; $('bar').hidden = !has;
    $('oColor').hidden = ub; $('oGender').hidden = ub; $('oBracket').hidden = !ub;
    $('optHint').textContent = ub ? '' : 'Beim Umschalten der Farbe wird die Liste neu gelesen. Eigene Änderungen gehen dabei verloren.';
    $('badge').textContent = S.demo ? 'Beispiel' : (ub ? 'UnserBasar → Basarlino' : 'Basarlino → UnserBasar');
    $('who').textContent = S.demo ? 'Beispiel-Basar' : ([S.basar, S.seller].filter(Boolean).join(' · ') || 'Artikelliste');
    $('note').textContent = ub ? NOTE_UB : NOTE_BAS;
    $('save').textContent = 'Für ' + target() + ' sichern';
    var ck = $('check'), sold = S.items.filter(function (i) { return i.sold; }).length;
    if (ub) {
      if (S.expect != null) {
        var same = S.expect === S.items.length;
        ck.className = 'check ' + (same ? 'ok' : 'warn');
        ck.textContent = same ? 'Alle ' + S.items.length + ' Zeilen gefunden, so viele wie in der PDF stehen.' : 'Gelesen: ' + S.items.length + ' Zeilen. Die PDF nennt ' + S.expect + '. Bitte prüfen.';
      } else { ck.className = 'check'; ck.textContent = ''; }
    } else if (S.total) {
      var ok = Math.abs(S.total.sum - S.checkSum) < 0.005 && S.total.count === S.items.length;
      ck.className = 'check ' + (ok ? 'ok' : 'warn');
      ck.textContent = ok
        ? 'Summe stimmt mit der PDF überein (' + fmtEuro(S.checkSum) + ').' + (sold ? (sold === 1 ? ' 1 verkaufter Artikel ist nicht dabei.' : ' ' + sold + ' verkaufte Artikel sind nicht dabei.') : '')
        : 'Gelesen: ' + S.items.length + ' Zeilen, ' + fmtEuro(S.checkSum) + '. Die PDF nennt ' + S.total.count + ' Artikel, ' + fmtEuro(S.total.sum) + '. Bitte prüfen.';
    } else { ck.className = 'check'; ck.textContent = has ? 'Die PDF nennt keine Gesamtsumme zum Abgleichen.' : ''; }
    renderItems(); refresh();
  }

  function readText(text, name) {
    var n = load(text, false);
    if (!n) { S.items = []; render(); status('Keine Artikelzeilen gefunden. Ist das die Inventar-PDF aus Basarlino oder die Artikelliste aus UnserBasar? Ein Scan oder Foto lässt sich nicht lesen.', 'warn'); return; }
    status((name ? name + ': ' : '') + n + ' Zeilen gelesen.', 'ok');
  }

  function handleFile(f) {
    if (!f) return;
    if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { status('Das ist keine PDF-Datei.', 'warn'); return; }
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    if (!window.pdfjsLib) { status('Der PDF-Leser fehlt. Kopiere den Text aus der PDF und füge ihn unten ein.', 'warn'); $('pasteBox').open = true; return; }
    status('Lese PDF …');
    var fr = new FileReader();
    fr.onerror = function () { status('Die Datei konnte nicht geöffnet werden.', 'warn'); };
    fr.onload = function () {
      pdfjsLib.getDocument({ data: new Uint8Array(fr.result), isEvalSupported: false }).promise
        .then(function (pdf) {
          return pdfToText(pdf).then(function (txt) {
            var probe = parseBasarlino(txt, { colorFromName: $('optColor').checked });
            if (probe.items.length) { readText(txt, f.name); return; }
            return pdfToUnserBasar(pdf).then(function (ub) {
              if (ub && ub.items.length) { loadUb(ub); status(f.name + ': ' + ub.items.length + ' Zeilen gelesen.', 'ok'); }
              else readText(txt, f.name);
            });
          });
        })
        .catch(function (err) {
          var d = err ? ((err.name || 'Fehler') + ': ' + String(err.message || err).slice(0, 110)) : 'unbekannt';
          status('Die PDF konnte nicht gelesen werden (' + d + '). Kopiere den Text daraus und füge ihn unten ein.', 'warn');
          $('pasteBox').open = true;
        });
    };
    fr.readAsArrayBuffer(f);
  }

  $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
  $('pasteGo').addEventListener('click', function () {
    var t = $('paste').value;
    if (!t.trim()) { status('Das Textfeld ist leer.', 'warn'); return; }
    readText(t, '');
  });
  $('demo').addEventListener('click', function () { load(SAMPLE, true); status(''); window.scrollTo(0, 0); });
  $('optColor').addEventListener('change', function () { if (S.raw) { load(S.raw, S.demo); status(''); } });
  ['optGender', 'optBracket', 'sep'].forEach(function (id) { $(id).addEventListener('change', refresh); });

  function copyText(txt) {
    function fallback() {
      var out = $('out'); $('outBox').open = true; out.focus(); out.select(); out.setSelectionRange(0, out.value.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      status(ok ? 'Für ' + target() + ' kopiert.' : 'Text ist markiert. Tippe auf Kopieren im Menü.', ok ? 'ok' : '');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { status('Für ' + target() + ' kopiert.', 'ok'); }, fallback);
    else fallback();
  }
  $('copy').addEventListener('click', function () { var t = $('out').value; if (t) copyText(t); });

  $('save').addEventListener('click', function () {
    var txt = $('out').value; if (!txt) return;
    var name = 'Fuer-' + target() + '.csv';
    var blob = new Blob(['﻿' + txt], { type: 'text/csv' });
    var file = null;
    try { file = new File([blob], name, { type: 'text/csv' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(function () { status('Für ' + target() + ' geteilt.', 'ok'); }, function (err) {
        if (err && err.name === 'AbortError') return;
        status('Teilen hat nicht geklappt. Nimm Kopieren.', 'warn');
      });
      return;
    }
    try {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      status('Datei Fuer-' + target() + '.csv geladen.', 'ok');
    } catch (e) { copyText(txt); }
  });

  render();
})();
