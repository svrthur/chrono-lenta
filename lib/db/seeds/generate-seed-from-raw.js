const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'raw-tk-list.txt');
const OUT = path.join(__dirname, 'generated-shopping-centers.sql');

const raw = fs.readFileSync(RAW, 'utf8').split(/\r?\n/).filter(Boolean);

const cityCandidates = [
  ['Санкт-Петербург', [/\bСПб\b/i, /Санкт-?Петер/iu, /\bСПб\./i]],
  ['Москва', [/\bМосква\b/i, /Мос\.?\s?об/i, /\bМО\b/i]],
  ['Новосибирск', [/Новосибирск/i]],
  ['Казань', [/Казань/i]],
  ['Самара', [/Самара/i]],
  ['Саратов', [/Саратов/i]],
  ['Краснодар', [/Краснодар/i]],
  ['Красноярск', [/Красноярск/i]],
  ['Ростов-на-Дону', [/Ростов/i]],
  ['Уфа', [/Уфа/i]],
  ['Екатеринбург', [/Екатеринбург/i]],
];

function detectCity(text) {
  for (const [name, patterns] of cityCandidates) {
    for (const p of patterns) {
      if (p.test(text)) return name;
    }
  }
  return 'Неизвестный';
}

function mapFormat(token) {
  const t = token.toUpperCase();
  if (t.includes('SM')) return 'СМ';
  if (t.includes('HM') || t.includes('НМ')) return 'ГМ';
  return 'СМ';
}

const tuples = [];
for (const line of raw) {
  // try to parse: number + format + rest
  // possible forms: "10 HM ..." or "264 (Санкт-Петербург...)" or "1417_1 SM ..."
  const m = line.match(/^\s*([0-9A-Za-z_\\-]+)\s+([A-Za-zА-Яа-я_\\.]{1,6})\s+(.*)$/);
  let number, fmtToken, rest;
  if (m) {
    number = m[1].trim();
    fmtToken = m[2].trim();
    rest = m[3].trim();
  } else {
    // fallback: try to split by first space
    const parts = line.split(/\s+/, 3);
    number = parts[0];
    fmtToken = parts[1] || '';
    rest = line.replace(/^\s*[^\s]+\s+[^\s]+\s*/, '').trim();
  }

  const city = detectCity(line + ' ' + rest);
  const format = mapFormat(fmtToken);
  const addr = rest.replace(/'/g, "''");

  tuples.push({ number, addr, city, format });
}

let sql = `-- Generated shopping_centers seed
-- Run with: psql "$DATABASE_URL" -f lib/db/seeds/generated-shopping-centers.sql
\nINSERT INTO shopping_centers (number, address, city, format) VALUES\n`;

sql += tuples
  .map(t => `('${t.number.replace(/'/g, "''")}', '${t.addr}', '${t.city}', '${t.format}')`)
  .join(',\n') + "\nON CONFLICT (number) DO UPDATE SET address = COALESCE(EXCLUDED.address, shopping_centers.address), city = EXCLUDED.city, format = EXCLUDED.format;\n";

fs.writeFileSync(OUT, sql, 'utf8');
console.log('Wrote', OUT, 'with', tuples.length, 'entries');
