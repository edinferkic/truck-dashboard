// server/src/lib/ocr/parseRate.js

const STATE_MAP = {
  AL:"AL", Alaska:"AK", AK:"AK", Arizona:"AZ", AZ:"AZ", Arkansas:"AR", AR:"AR",
  California:"CA", CA:"CA", Colorado:"CO", CO:"CO", Connecticut:"CT", CT:"CT",
  Delaware:"DE", DE:"DE", Florida:"FL", FL:"FL", Georgia:"GA", GA:"GA",
  Hawaii:"HI", HI:"HI", Idaho:"ID", ID:"ID", Illinois:"IL", IL:"IL",
  Indiana:"IN", IN:"IN", Iowa:"IA", IA:"IA", Kansas:"KS", KS:"KS",
  Kentucky:"KY", KY:"KY", Louisiana:"LA", LA:"LA", Maine:"ME", ME:"ME",
  Maryland:"MD", MD:"MD", Massachusetts:"MA", MA:"MA", Michigan:"MI", MI:"MI",
  Minnesota:"MN", MN:"MN", Mississippi:"MS", MS:"MS", Missouri:"MO", MO:"MO",
  Montana:"MT", MT:"MT", Nebraska:"NE", NE:"NE", Nevada:"NV", NV:"NV",
  "New Hampshire":"NH", NH:"NH", "New Jersey":"NJ", NJ:"NJ",
  "New Mexico":"NM", NM:"NM", "New York":"NY", NY:"NY",
  "North Carolina":"NC", NC:"NC", "North Dakota":"ND", ND:"ND",
  Ohio:"OH", OH:"OH", Oklahoma:"OK", OK:"OK", Oregon:"OR", OR:"OR",
  Pennsylvania:"PA", PA:"PA", "Rhode Island":"RI", RI:"RI",
  "South Carolina":"SC", SC:"SC", "South Dakota":"SD", SD:"SD",
  Tennessee:"TN", TN:"TN", Texas:"TX", TX:"TX", Utah:"UT", UT:"UT",
  Vermont:"VT", VT:"VT", Virginia:"VA", VA:"VA",
  Washington:"WA", WA:"WA", "West Virginia":"WV", WV:"WV",
  Wisconsin:"WI", WI:"WI", Wyoming:"WY", WY:"WY",
};

function clean(s){ return (s||"").replace(/\s+/g," ").trim(); }

function parseStateFromLine(line){
  const m = line.match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/);
  if (m) return m[1];
  for (const key of Object.keys(STATE_MAP)) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    if (re.test(line)) return STATE_MAP[key];
  }
  return null;
}

function findLine(text, re){
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex(l => re.test(l));
  return i >= 0 ? clean(lines[i] + " " + (lines[i+1]||"")) : null;
}

/** grab currency-like numbers from a string, allowing spaces/commas */
function grabCurrencyNumbers(s){
  const rx = /(?:USD|US)?\s*\$?\s*([0-9]{1,3}(?:[,\s]?[0-9]{3})*(?:\.[0-9]{2})?)/gi;
  return [...s.matchAll(rx)]
    .map(m => Number(String(m[1]).replace(/[,\s]/g,"")))
    .filter(n => Number.isFinite(n) && n >= 100 && n <= 100000);
}

/** robust money finder: scan lines with “Total/LineHaul/Rate” then fallback */
function parseMoneyFrom(text){
  const lines = text.split(/\r?\n/);
  let best = null;

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    if (/\b(Totals?|Total Rate|Line\s*Haul|LineHaul|Rate)\b/i.test(line)){
      // include next couple of lines; OCR often pushes the $amount to the next line/column
      const win = [line, lines[i+1]||"", lines[i+2]||""].join(" ");
      const nums = grabCurrencyNumbers(win);
      if (nums.length){
        const cand = Math.max(...nums);
        if (best === null || cand > best) best = cand;
      }
    }
  }
  if (best !== null) return best;

  // global fallback: largest plausible currency anywhere
  const any = grabCurrencyNumbers(text);
  return any.length ? Math.max(...any) : null;
}

function parseDateAfter(label, text){
  // e.g., "Appointment Date & Time: 2025-09-24 08:00-12:00"
  const re = new RegExp(`${label}[^\\n]*?(\\d{4}-\\d{2}-\\d{2})`, "i");
  const m = text.match(re);
  return m ? m[1] : null;
}

export function parseRateText(text){
  const pickupLine   = findLine(text, /Pickup#\s*1:/i);
  const deliveryLine = findLine(text, /Delivery#\s*2:/i);

  const pickup_state = pickupLine ? parseStateFromLine(pickupLine) : null;
  const drop_state   = deliveryLine ? parseStateFromLine(deliveryLine) : null;

  const pickup_date   = parseDateAfter("Appointment Date & Time", pickupLine||"") ||
                        parseDateAfter("Appointment Date & Time", text);
  const delivery_date = parseDateAfter("Appointment Date & Time", deliveryLine||"") ||
                        parseDateAfter("Appointment Date & Time", text);

  const gross_pay = parseMoneyFrom(text);

  // Optional: origin/destination strings (loose)
  const origin = pickupLine ? clean((pickupLine.split(":",2)[1]||"").replace(/\s+\d{5}.*$/,"")) : null;
  const destination = deliveryLine ? clean((deliveryLine.split(":",2)[1]||"").replace(/\s+\d{5}.*$/,"")) : null;

  return {
    gross_pay,
    miles: null,
    pickup_date,
    delivery_date,
    origin,
    destination,
    pickup_state,
    drop_state,
    status: "planned",
  };
}

export function buildSuggestedLabel(extracted, userLabel="you"){
  const { pickup_state, drop_state, delivery_date } = extracted || {};
  return `${userLabel} ${pickup_state||"XX"} ${drop_state||"XX"} ${delivery_date||""}`.trim();
}
