// Liest die öffentlichen Terminlisten von basarlino.de und unserbasar.de und schreibt data/termine.json.
// Aufruf: node tools/update-termine.mjs            (holt live)
//         node tools/update-termine.mjs --lokal ORDNER   (liest bl.html und ub.html aus ORDNER, zum Testen)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONATE = { jan: 1, feb: 2, mär: 3, mar: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
const dekodiere = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (_, n) => ({ auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' })[n]);
const text = s => dekodiere(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const iso = (j, m, t) => `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;

async function hole(url, datei) {
  const lokal = process.argv.indexOf('--lokal');
  if (lokal > 0) return readFile(path.join(process.argv[lokal + 1], datei), 'utf8');
  const r = await fetch(url, { headers: { 'user-agent': 'BasarWechsel-Terminabruf (privates Projekt)', 'accept-language': 'de' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

// Basarlino: Karten mit Datum ohne Jahr, nach Datum sortiert. Jahr wird beim Wechsel Dez -> Jan hochgezählt.
export function leseBasarlino(html, heute = new Date()) {
  const karten = [...html.matchAll(/<a href="(https:\/\/basarlino\.de\/\w+)"([^>]*?)class="event-card([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)];
  let jahr = heute.getFullYear(), letzterMonat = 0;
  const out = [];
  for (const [, url, a1, klassen, a2, body] of karten) {
    const attr = n => (a1 + a2).match(new RegExp(`data-${n}="([^"]*)"`))?.[1] ?? '';
    const tag = +body.match(/event-card-day">(\d+)</)?.[1], mon = MONATE[(body.match(/event-card-month">([^<]+)</)?.[1] || '').toLowerCase().slice(0, 3)];
    if (!tag || !mon) continue;
    if (mon < letzterMonat - 6) jahr++;
    letzterMonat = mon;
    const bisM = body.match(/event-card-range">→\s*(\d+)\s*([^<\s]+)/);
    let bis = iso(jahr, mon, tag);
    if (bisM) { const bm = MONATE[bisM[2].toLowerCase().slice(0, 3)]; bis = iso(bm < mon ? jahr + 1 : jahr, bm, +bisM[1]); }
    const plz = body.match(/class="zip">([^<]*)</)?.[1]?.trim() || '';
    const ort = text(body.match(/class="zip">[^<]*<\/span>([^<]*)</)?.[1] || '');
    const name = text(body.match(/event-card-title">([\s\S]*?)<\/div>/)?.[1] || '');
    const badges = text(body.match(/event-card-badges">([\s\S]*?)<\/span><span class="btn/)?.[1] || '');
    if (!/\bpublic\b/.test(klassen)) continue; // private Termine sind nicht öffentlich
    const art = attr('art') === 'other' && /Spielzeug/i.test(badges) ? 'kids' : attr('art');
    out.push({
      id: 'bl-' + (attr('id') || url.split('/').pop()), q: 'basarlino', name, ort, plz: plz.length === 4 ? plz : plz.padStart(5, '0'),
      von: iso(jahr, mon, tag), bis, lat: +attr('lat') || null, lng: +attr('lng') || null, url,
      art: art === 'kids' ? 'kids' : art === 'adult' ? 'adult' : 'other', planung: /in Planung/i.test(badges), online: /online/.test(klassen),
    });
  }
  return out;
}

const KIND = /kinder|baby|babys|familie|spielzeug|umstand|schwanger|mutter|eltern|krabbel|zwerg|kita|kigo/i;
const ERWACHSEN = /frauen|damen|herren|erwachsene|ski|brett|mädels|männer/i;
export function leseUnserBasar(html, plzTabelle = {}) {
  const out = [];
  for (const m of html.matchAll(/<li class="wide"[^>]*>([\s\S]*?)<\/li>/g)) {
    const b = m[1];
    const d = b.match(/<p>(\d{2})\.(\d{2})\.(\d{4})\s*<a href="([^"]+)">([^<]*)<\/a>/);
    const o = b.match(/<\/p><p>(\d{5})\s+([^<]*?)(?:<br>([^<]*))?<\/p>/);
    if (!d || !o) continue;
    const name = text(d[5]), plz = o[1], ort = text(o[2]);
    const p = plzTabelle[plz];
    out.push({
      id: 'ub-' + d[4].replace(/^.*\?/, ''), q: 'unserbasar', name, ort, plz, von: `${d[3]}-${d[2]}-${d[1]}`, bis: `${d[3]}-${d[2]}-${d[1]}`,
      lat: p?.[0] ?? null, lng: p?.[1] ?? null, url: d[4].replace('unserbasar.de/?', 'unserbasar.de/?'),
      art: ERWACHSEN.test(name) && !KIND.test(name) ? 'adult' : KIND.test(name) ? 'kids' : 'other', planung: false, online: false,
    });
  }
  return out;
}

async function main() {
  const plz = JSON.parse(await readFile(path.join(root, 'data/plz.json'), 'utf8'));
  const [bl, ub] = await Promise.allSettled([hole('https://basarlino.de/eventslist', 'bl.html'), hole('https://www.unserbasar.de/basarsuche.php', 'ub.html')]);
  let events = [], quellen = {};
  if (bl.status === 'fulfilled') { const e = leseBasarlino(bl.value); events.push(...e); quellen.basarlino = e.length; } else console.error('Basarlino:', bl.reason.message);
  if (ub.status === 'fulfilled') { const e = leseUnserBasar(ub.value, plz); events.push(...e); quellen.unserbasar = e.length; } else console.error('UnserBasar:', ub.reason.message);
  if (!events.length) throw new Error('Keine Termine gelesen, bestehende Datei bleibt.');
  // fehlende Koordinaten aus der PLZ-Tabelle, Doppelte (gleiche PLZ, Datum, Namensanfang) entfernen
  const gesehen = new Set();
  events = events.filter(e => {
    if (e.lat == null && plz[e.plz]) [e.lat, e.lng] = plz[e.plz];
    const k = [e.plz, e.von, e.name.toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 14)].join('|');
    if (gesehen.has(k)) return false; gesehen.add(k); return true;
  }).sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, 'de'));
  const alt = await readFile(path.join(root, 'data/termine.json'), 'utf8').then(JSON.parse, () => null);
  const gleich = alt && JSON.stringify(alt.events) === JSON.stringify(events);
  const stand = gleich ? alt.stand : new Date().toISOString();
  await writeFile(path.join(root, 'data/termine.json'), JSON.stringify({ stand, quellen, events }) + '\n');
  console.log(`${events.length} Termine`, quellen, gleich ? '(unverändert)' : '(neu)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
