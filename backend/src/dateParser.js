const MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };
const pad = value => String(value).padStart(2, '0');
const iso = (year, month, day = 1) => `${year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year}-${pad(month)}-${pad(day)}`;

function parseDate(value) {
  let match = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return iso(+match[1], +match[2], +match[3]);
  match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) return iso(+match[3], +match[2], +match[1]);
  match = value.match(/(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})/);
  if (match && MONTHS[match[2].slice(0,3)]) return iso(+match[3], MONTHS[match[2].slice(0,3)], +match[1]);
  match = value.match(/([A-Z]{3,9})\s+(\d{1,2})[ ,.-]+(\d{2,4})/);
  if (match && MONTHS[match[1].slice(0,3)]) return iso(+match[3], MONTHS[match[1].slice(0,3)], +match[2]);
  match = value.match(/(\d{1,2})[./-](\d{4})/);
  if (match) return iso(+match[2], +match[1], 1);
  return null;
}

export function extractDates(rawText) {
  const text = rawText.toUpperCase().replace(/[|]/g, '1').replace(/[^A-Z0-9./,: -]/g, ' ');
  const keyword = /(EXP(?:IRY)?|USE BY|BEST BEFORE|M(?:F|F)D|PKD|MANUFACT(?:URED)?)/;
  const found = [];
  const datePatterns = /\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Z]{3,9}\s+\d{2,4}|[A-Z]{3,9}\s+\d{1,2}[ ,.-]+\d{2,4}|\d{1,2}[./-]\d{4})\b/g;
  for (const value of text.match(datePatterns) ?? []) {
    const date = parseDate(value);
    if (!date) continue;
    const matchIndex = text.indexOf(value);
    const start = Math.max(0, matchIndex - 24);
    const nearby = text.slice(start, matchIndex + value.length + 8);
    const expiry = /(EXP|USE BY|BEST BEFORE)/.test(nearby);
    const manufacturing = /(MFD|MFG|PKD|MANUFACT)/.test(nearby);
    found.push({ date, type: expiry ? 'expiry' : manufacturing ? 'manufacturing' : 'unknown', confidence: expiry || manufacturing ? 0.92 : 0.68, pattern: value });
  }
  found.sort((a, b) => a.date.localeCompare(b.date));
  const expiry = found.find(item => item.type === 'expiry');
  const manufacturing = found.find(item => item.type === 'manufacturing');
  if (!expiry && found.length > 1) return { manufacturing: found[0].date, expiry: found.at(-1).date, confidence: 0.58, candidates: found };
  return { manufacturing: manufacturing?.date ?? null, expiry: expiry?.date ?? null, confidence: Math.max(0, ...(found.map(item => item.confidence)), 0), candidates: found };
}
