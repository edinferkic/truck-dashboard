// server/src/lib/ocr/parseBOL.js
// Robust parser for BOL/POD OCR text: dates, origin/destination, states, BOL number.

const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
]);

// City, ST (zip optional). NOTE: uppercase only (no /i) to avoid matching words like "in".
const CITY_STATE_RE = /([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})(?:\s*\d{5})?/g;

// For single matches
const MDY  = /([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{2,4})/;
const ISO  = /(20\d{2})-(\d{2})-(\d{2})/;
// For matchAll (must be /g)
const MDY_G = /([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{2,4})/g;
const ISO_G = /(20\d{2})-(\d{2})-(\d{2})/g;

const CLEAN = (s) => String(s || "").replace(/\u0000/g, " ").replace(/\r/g, "\n");

function normDate(str) {
  str = String(str || "").trim();
  let m;
  if ((m = str.match(MDY))) {
    const mm = +m[1], dd = +m[2], yy = +m[3];
    const yyyy = yy < 100 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy;
    const pad = (n) => String(n).padStart(2, "0");
    if (yyyy && mm && dd) return `${yyyy}-${pad(mm)}-${pad(dd)}`;
  }
  if ((m = str.match(ISO))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function findFirst(text, regexes) {
  for (const r of regexes) {
    const m = text.match(r);
    if (m) {
      const d = normDate(m[1] || m[0]);
      if (d) return d;
    }
  }
  return null;
}

function findAllDates(text) {
  const out = new Set();
  for (const m of text.matchAll(MDY_G)) out.add(normDate(m[0]));
  for (const m of text.matchAll(ISO_G)) out.add(normDate(m[0]));
  return [...out].filter(Boolean).sort();
}

function linesAfter(text, startRe, maxLines = 12) {
  const m = text.match(startRe);
  if (!m) return "";
  const start = text.indexOf(m[0]) + m[0].length;
  const chunk = text.slice(start, start + 4000);
  return chunk.split(/\n+/).slice(0, maxLines).join("\n");
}

// Choose a city/state from a section.
// - preferLast: if true, take the last occurrence (good for SHIP TO).
// - excludeState: avoid returning this state if a different one exists.
function pickCityState(section, { preferLast = false, excludeState = null } = {}) {
  const matches = [...section.matchAll(CITY_STATE_RE)].map(m => ({
    place: `${m[1].replace(/\s+/g, " ").trim()}, ${m[2]}`,
    state: m[2],
  }));
  if (!matches.length) return { place: null, state: null };

  let pool = matches;
  if (excludeState) {
    const diff = matches.filter(x => x.state !== excludeState);
    if (diff.length) pool = diff;
  }
  const choice = preferLast ? pool[pool.length - 1] : pool[0];
  return { place: choice.place, state: choice.state };
}

function pickFromTo(text) {
  const fromSec = linesAfter(text, /SHIP\s*FROM/i, 15);
  const toSec   = linesAfter(text, /SHIP\s*TO(?:\s*\/\s*STOP\s*\d+)?/i, 15);

  let from = pickCityState(fromSec, { preferLast: false });
  let to   = pickCityState(toSec,   { preferLast: true, excludeState: from.state });

  // Global fallback: take first and last city/state across whole doc,
  // ensuring destination isn't the same state as origin if possible.
  if (!from.place || !to.place) {
    const all = [...text.matchAll(CITY_STATE_RE)].map(m => ({
      place: `${m[1].replace(/\s+/g," ").trim()}, ${m[2]}`,
      state: m[2],
    }));
    if (!from.place && all.length) from = all[0];
    if (!to.place && all.length) {
      const diff = from.state ? all.filter(x => x.state !== from.state) : all;
      to = (diff.length ? diff[diff.length - 1] : all[all.length - 1]);
    }
  }

  if (from.state && !STATE_CODES.has(from.state)) from.state = null;
  if (to.state   && !STATE_CODES.has(to.state))   to.state   = null;

  return {
    origin: from.place || null,
    destination: to.place || null,
    pickup_state: from.state || null,
    drop_state: to.state || null,
    ship_from_raw: fromSec ? fromSec.replace(/\s+/g," ").slice(0, 600) : null,
    ship_to_raw:   toSec   ? toSec.replace(/\s+/g," ").slice(0, 600)   : null,
  };
}

function findBOLNumber(text) {
  // Require plausible token (>=5 chars, has a digit). Avoid picking “must” etc.
  const cands = [];
  const re1 = /Bill\s*of\s*Lading\s*Number\s*[:#]?\s*([A-Z0-9-]{5,})/ig;
  const re2 = /\b(?:BOL|B\/L)\s*#\s*([A-Z0-9-]{5,})/ig;
  for (const m of text.matchAll(re1)) cands.push(m[1]);
  for (const m of text.matchAll(re2)) cands.push(m[1]);
  const valid = cands.filter(x => /[0-9]/.test(x)).sort((a,b) => b.length - a.length);
  return valid[0] || null;
}

export function parseBOLText(text) {
  const cleaned = CLEAN(text);

  // Dates
  const pickup_date = findFirst(cleaned, [
    /Ship\s*Date\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    /(Pick\s*up|Pickup|PU)\s*(?:Date|Appt|Appointment)?\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  ]);

  let delivery_date = findFirst(cleaned, [
    /(Delivery|Del|Consignee)\s*(?:Date|Appt|Appointment|Appt\.?)?\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    /Appointment\s*Date\s*&\s*Time\s*[:\-]?\s*(20\d{2}-\d{2}-\d{2})/i,
  ]);

  // Fallback: last date in doc if different from pickup
  if (!delivery_date) {
    const all = findAllDates(cleaned);
    if (all.length >= 2) {
      const last = all[all.length - 1];
      if (!pickup_date) delivery_date = last;
      else if (pickup_date !== last) delivery_date = last;
    }
  }

  const locs = pickFromTo(cleaned);
  const bolNumber = findBOLNumber(cleaned);

  return {
    gross_pay: null,
    miles: null,
    pickup_date: pickup_date || null,
    delivery_date: delivery_date || null,
    origin: locs.origin,
    destination: locs.destination,
    pickup_state: locs.pickup_state,
    drop_state: locs.drop_state,
    status: "planned",
    bol_number: bolNumber,
    ship_from_raw: locs.ship_from_raw,
    ship_to_raw: locs.ship_to_raw,
  };
}
