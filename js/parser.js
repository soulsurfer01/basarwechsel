/* Basarlino-Inventar -> UnserBasar-Liste. Reine Funktionen, keine DOM-Abhängigkeit. */
var COLOR_WORDS = {
  schwarz: 'Schwarz', sz: 'Schwarz', 'weiß': 'Weiß', weiss: 'Weiß', 'grün': 'Grün', gruen: 'Grün',
  blau: 'Blau', rot: 'Rot', grau: 'Grau', braun: 'Braun', beige: 'Beige', rosa: 'Rosa', rose: 'Rose',
  'rosé': 'Rose', altrosa: 'Altrosa', gelb: 'Gelb', orange: 'Orange', marine: 'Marine', oliv: 'Oliv',
  olive: 'Oliv', lila: 'Lila', 'türkis': 'Türkis', petrol: 'Petrol', bunt: 'Bunt', creme: 'Creme',
  silber: 'Silber', gold: 'Gold', khaki: 'Khaki', dunkelblau: 'Dunkelblau', hellblau: 'Hellblau',
  dunkelrot: 'Dunkelrot', pink: 'Pink', navy: 'Navy'
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function isSizeToken(t) {
  return /^\d{2,3}(\/\d{2,3})?$/.test(t) || /^[WL]\d{2}$/i.test(t) || /^W\d{2}L\d{2}$/i.test(t) ||
    /^(XXS|XS|S|M|L|XL|XXL)$/.test(t);
}

/* "(170 W25 L26, w.)" -> {groesse, farbe, geschlecht} */
function parseDetails(d) {
  var sizes = [], rest = [], gender = '';
  d.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (part) {
    if (/^[mw]\.?$/i.test(part)) { gender = part.charAt(0).toLowerCase(); return; }
    var words = [];
    part.split(/\s+/).forEach(function (tok) {
      var t = tok.replace(/\.$/, '');
      if (isSizeToken(t)) sizes.push(/^[wl]/i.test(t) ? t.toUpperCase() : t);
      else words.push(tok);
    });
    if (words.length) rest.push(words.join(' '));
  });
  return { groesse: sizes.join(' '), farbe: cap(rest.join(' ')), geschlecht: gender };
}

/* Farbwörter ("grün", "sz") aus dem Namen in die Farbspalte ziehen */
function pullColorFromName(name) {
  var kept = [], found = [];
  name.split(/\s+/).forEach(function (w) {
    var c = COLOR_WORDS[w.toLowerCase()];
    if (c && name.split(/\s+/).length > 1) found.push(c); else kept.push(w);
  });
  return { name: kept.join(' '), farbe: found.join(' ') };
}

var LINE_RE = /^(\d{1,4})\s+(?:([A-Za-z0-9]{5})\s+)?(verkauft\s*-\s*)?(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*$/;
var TOTAL_RE = /(\d+)\s+verkauft\s*-\s*(\d+)\s+Artikel\s+gesamt:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

function toNumber(s) { return parseFloat(s.replace(/\./g, '').replace(',', '.')); }

/* text: Zeilen des PDFs. Rückgabe: {items, total, seller, basar} */
function parseBasarlino(text, opts) {
  opts = opts || {};
  var colorFromName = opts.colorFromName !== false;
  var lines = text.split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  var items = [], total = null, seller = '', basar = '';
  lines.forEach(function (line) {
    var tm = line.match(TOTAL_RE);
    if (tm) { total = { sold: +tm[1], count: +tm[2], sum: toNumber(tm[3]) }; return; }
    if (!basar && /^Artikel-Liste/i.test(line)) basar = line.replace(/^Artikel-Liste\s*/i, '').replace(/"/g, '');
    var m = line.match(LINE_RE);
    if (!m) {
      var sm = line.match(/^(\d{1,4})\s+(\D[^€]*)$/);
      if (sm && !seller && !/Nr\.|Code|Artikel/.test(line)) seller = line;
      return;
    }
    var sold = !!m[3];
    var body = m[4].trim();
    var details = '';
    var pm = body.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (pm) { body = pm[1].trim(); details = pm[2]; }
    var d = parseDetails(details);
    var name = body, farbe = d.farbe;
    if (colorFromName && !farbe) {
      var p = pullColorFromName(body);
      if (p.name) { name = p.name; farbe = p.farbe; }
    }
    items.push({
      nr: m[1], name: name, farbe: farbe, groesse: d.groesse, geschlecht: d.geschlecht,
      preis: toNumber(m[5]), sold: sold
    });
  });
  return { items: items, total: total, seller: seller, basar: basar };
}

function fmtPrice(n) { return n.toFixed(2).replace('.', ','); }

function toCsv(items, opts) {
  opts = opts || {};
  var sep = opts.sep || ';';
  var cols = ['Artikel', 'Farbe', 'Größe'];
  if (opts.gender) cols.push('Geschlecht');
  cols.push('Preis');
  function q(v) {
    v = String(v == null ? '' : v);
    return (v.indexOf(sep) > -1 || /["\n]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var rows = [cols.map(q).join(sep)];
  items.forEach(function (it) {
    var r = [it.name, it.farbe, it.groesse];
    if (opts.gender) r.push(it.geschlecht === 'm' ? 'm' : it.geschlecht === 'w' ? 'w' : '');
    r.push(it.preisText != null ? it.preisText : fmtPrice(it.preis));
    rows.push(r.map(q).join(sep));
  });
  return rows.join('\r\n') + '\r\n';
}

/* PDF (pdf.js-Dokument) -> Text, eine Zeile pro Textzeile */
async function pdfToText(pdf) {
  var out = [];
  for (var p = 1; p <= pdf.numPages; p++) {
    var page = await pdf.getPage(p);
    var tc = await page.getTextContent();
    var rows = [];
    tc.items.forEach(function (it) {
      if (typeof it.str !== 'string') return;
      var x = it.transform[4], y = it.transform[5];
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; } }
      if (!row) { row = { y: y, items: [] }; rows.push(row); }
      row.items.push({ x: x, w: it.width || 0, str: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    rows.forEach(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var s = '', end = null;
      r.items.forEach(function (i) {
        if (!i.str) return;
        if (end !== null && i.x - end > 0.8 && !/\s$/.test(s) && !/^\s/.test(i.str)) s += ' ';
        s += i.str;
        end = i.x + i.w;
      });
      out.push(s);
    });
  }
  return out.join('\n');
}

/* UnserBasar-Artikelliste (pdf.js-Dokument) -> {items, meta} oder null. Spalten nach x-Position. */
async function pdfToUnserBasar(pdf) {
  var items = [], meta = { name: '', nummer: '', anzahl: null, basar: '' };
  var PRICE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
  var B = { farbe: 324, groesse: 374, code: 419, preis: 467 };
  for (var p = 1; p <= pdf.numPages; p++) {
    var page = await pdf.getPage(p);
    var tc = await page.getTextContent();
    var rows = [];
    tc.items.forEach(function (it) {
      if (typeof it.str !== 'string' || !it.str.trim()) return;
      var x = it.transform[4], y = it.transform[5], row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; } }
      if (!row) { row = { y: y, cells: [] }; rows.push(row); }
      row.cells.push({ x: x, s: it.str.trim() });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    rows.forEach(function (r) { r.cells.sort(function (a, b) { return a.x - b.x; }); });

    rows.forEach(function (r) {
      var h = {};
      r.cells.forEach(function (c) { h[c.s] = c.x; });
      if (h['Farbe'] != null && h['Größe'] != null && h['Code'] != null && h['Preis'] != null) {
        B.farbe = (h['Farbe'] + h['Größe']) / 2;
        B.groesse = (h['Größe'] + h['Code']) / 2;
        B.code = (h['Code'] + h['Preis']) / 2;
        if (h['Verkauft'] != null) B.preis = (h['Preis'] + h['Verkauft']) / 2;
      }
      var c0 = r.cells[0] && r.cells[0].s;
      if (c0 === 'Name:' && r.cells[1]) meta.name = r.cells[1].s;
      if (c0 === 'Nummer:' && r.cells[1]) meta.nummer = r.cells[1].s;
      r.cells.forEach(function (c, i) {
        if (c.s === 'Anzahl Artikel:' && r.cells[i + 1] && /^\d+$/.test(r.cells[i + 1].s)) meta.anzahl = +r.cells[i + 1].s;
      });
      if (r.cells.some(function (c) { return /^Seite\s+\d/.test(c.s); })) {
        r.cells.forEach(function (c) { var m = c.s.match(/^(.+?)\s*\((\d+)\)$/); if (m && !meta.basar) meta.basar = m[1] + ' (' + m[2] + ')'; });
      }
    });

    var main = [], orphans = [];
    rows.forEach(function (r) {
      var first = r.cells[0], m = first && first.x < 100 && first.s.match(/^(\d{1,4})\s+(.+)$/);
      if (m) { main.push({ y: r.y, nr: m[1], name: m[2].trim(), cells: r.cells.slice(1), farbe: [], gr: [], price: null, sold: false }); return; }
      var ok = r.cells.length && r.cells.every(function (c) { return c.x > 250 && c.x < B.code && !/:$/.test(c.s) && c.s !== 'Farbe' && c.s !== 'Größe'; });
      if (ok) orphans.push(r);
    });
    main.forEach(function (m) {
      m.cells.forEach(function (c) {
        if (c.x < B.farbe) m.farbe.push({ y: m.y, s: c.s });
        else if (c.x < B.groesse) m.gr.push({ y: m.y, s: c.s });
        else if (c.x < B.code) { /* Code, wird nicht übernommen */ }
        else if (c.x < B.preis) { if (PRICE.test(c.s)) m.price = c.s; }
        else m.sold = true;
      });
    });
    orphans.forEach(function (r) {
      if (!main.length) return;
      var best = main[0];
      main.forEach(function (m) { if (Math.abs(m.y - r.y) < Math.abs(best.y - r.y)) best = m; });
      r.cells.forEach(function (c) {
        if (c.x < B.farbe) best.farbe.push({ y: r.y, s: c.s }); else best.gr.push({ y: r.y, s: c.s });
      });
    });
    main.forEach(function (m) {
      if (!m.price) return;
      function join(a) { return a.sort(function (x, y) { return y.y - x.y; }).map(function (t) { return t.s; }).join(' '); }
      var farbe = join(m.farbe), gr = join(m.gr).replace(/(\d)\.(\s|$)/g, '$1$2').trim();
      var glued = !gr && farbe.match(/^(.*[A-Za-zäöüÄÖÜß])\s*(\d{2,3}(?:\/\d{2,3})?)$/);
      if (glued) { farbe = glued[1]; gr = glued[2]; }
      items.push({ nr: m.nr, name: m.name, farbe: farbe, groesse: gr, geschlecht: '', preis: toNumber(m.price), sold: m.sold });
    });
  }
  return items.length ? { items: items, meta: meta } : null;
}

/* Liste im Basarlino-Stil: Größe und Farbe wahlweise in Klammern hinter dem Namen */
function toCsvBasarlino(items, opts) {
  opts = opts || {};
  var sep = opts.sep || ';';
  function q(v) {
    v = String(v == null ? '' : v);
    return (v.indexOf(sep) > -1 || /["\n]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var rows = [(opts.bracket ? ['Artikel', 'Preis'] : ['Artikel', 'Größe', 'Farbe', 'Preis']).map(q).join(sep)];
  items.forEach(function (it) {
    var price = it.preisText != null ? it.preisText : fmtPrice(it.preis);
    if (opts.bracket) {
      var det = [it.groesse, it.farbe].filter(Boolean).join(' ');
      rows.push([it.name + (det ? ' (' + det + ')' : ''), price].map(q).join(sep));
    } else rows.push([it.name, it.groesse, it.farbe, price].map(q).join(sep));
  });
  return rows.join('\r\n') + '\r\n';
}

if (typeof module !== 'undefined') module.exports = { parseBasarlino: parseBasarlino, toCsv: toCsv, fmtPrice: fmtPrice, pdfToText: pdfToText, pdfToUnserBasar: pdfToUnserBasar, toCsvBasarlino: toCsvBasarlino };
