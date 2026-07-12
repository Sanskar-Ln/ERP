/**
 * Paper-bill text parsing — PURE domain logic (no I/O, no OCR engine).
 *
 * Takes the raw text an OCR engine read off a photographed bill and
 * extracts the fields a jewellery bill usually carries: bill number,
 * bill date, phone numbers, rupee amounts (with a best guess at the
 * total), gram weights, and a per-10g metal rate.
 *
 * DESIGN STANCE: OCR of old (often handwritten) shop bills is inherently
 * lossy, so this parser is deliberately conservative — every field is
 * optional, amounts are returned as candidates PLUS a guessed total, and
 * the UI presents results as a *draft to review*, never auto-committed.
 * All money returned in integer paise per system convention.
 */

export interface ParsedBillFields {
  /** bill/invoice number printed on the paper */
  billNo?: string;
  /** date on the bill, ISO yyyy-mm-dd (dd/mm/yyyy assumed — Indian bills) */
  billDate?: string;
  /** all 10-digit Indian mobile numbers seen */
  phones: string[];
  /** every rupee amount recognized, in paise, order of appearance */
  amountsPaise: number[];
  /** best guess at the bill total (amount on a "total" line, else max), paise */
  totalPaise?: number;
  /** gram weights seen (e.g. "12.500 g", "Net Wt 8.25 gm"), as 3-dp strings */
  weightsG: string[];
  /** metal rate if quoted per 10 g, in paise */
  ratePaisePer10g?: number;
}

/** Normalize OCR text: unify whitespace, strip empty lines. */
const toLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** "44,500" / "44500.50" → integer paise (half-up on sub-paise noise). */
function rupeesStrToPaise(s: string): number | null {
  const cleaned = s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0') || 0);
  return Number.isSafeInteger(paise) ? paise : null;
}

/** dd/mm/yyyy (or dd-mm-yy etc.) → ISO date, Indian day-first convention. */
function toIsoDate(d: string, m: string, y: string): string | null {
  const day = Number(d);
  const month = Number(m);
  let year = Number(y);
  if (year < 100) year += year >= 50 ? 1900 : 2000; // '19 → 2019, '85 → 1985
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1950 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parse OCR text into best-effort structured bill fields. */
export function parseBillText(text: string): ParsedBillFields {
  const lines = toLines(text);
  const joined = lines.join('\n');
  const out: ParsedBillFields = { phones: [], amountsPaise: [], weightsG: [] };

  // ---- bill number: "Bill No: 1247", "BillNa 1247" (OCR noise), "Inv #123"
  const billNo = /(?:bill|inv(?:oice)?)\s*n?[oa]?\.?\s*[:#\-]?\s*(\d{1,8})/i.exec(joined);
  if (billNo) out.billNo = billNo[1];

  // ---- date: first dd/mm/yyyy-looking token (day-first, Indian bills)
  const date = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(joined);
  if (date) {
    const iso = toIsoDate(date[1]!, date[2]!, date[3]!);
    if (iso) out.billDate = iso;
  }

  // ---- phones: Indian mobiles, optional +91, tolerate spaces
  for (const m of joined.matchAll(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/g)) {
    if (!out.phones.includes(m[1]!)) out.phones.push(m[1]!);
  }

  // ---- amounts: "Rs 44,500", "₹4500.50", "INR 12000"
  for (const m of joined.matchAll(/(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi)) {
    const paise = rupeesStrToPaise(m[1]!);
    if (paise !== null && paise > 0) out.amountsPaise.push(paise);
  }

  // ---- total: prefer the amount on a line containing "total"/"grand"/"net amt"
  for (const line of lines) {
    if (/total|grand|net\s*am(?:oun)?t/i.test(line)) {
      const m = /(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*\/?-?\s*$/i.exec(line);
      const paise = m ? rupeesStrToPaise(m[1]!) : null;
      if (paise !== null && paise > 0) {
        out.totalPaise = paise;
        break;
      }
    }
  }
  if (out.totalPaise === undefined && out.amountsPaise.length > 0) {
    // Fallback: the largest amount on a bill is almost always the total.
    out.totalPaise = Math.max(...out.amountsPaise);
  }

  // ---- weights: "12.500 g", "Net Wt: 8.25 gm", "Wt 10 gms"
  for (const m of joined.matchAll(/(\d{1,4}(?:\.\d{1,3})?)\s*(?:g|gm|gms|grams?)\b/gi)) {
    const val = Number(m[1]!);
    if (val > 0 && val < 5000) {
      const canonical = val.toFixed(3);
      if (!out.weightsG.includes(canonical)) out.weightsG.push(canonical);
    }
  }

  // ---- rate per 10 g: "Rate: Rs 32000 per 10g" / "Rate Rs 32,000/10gm"
  const rate = /rate\s*[:\-]?\s*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/|per)\s*10\s*(?:g|gm|gms|grams?)/i.exec(joined);
  if (rate) {
    const paise = rupeesStrToPaise(rate[1]!);
    if (paise !== null && paise > 0) out.ratePaisePer10g = paise;
  }

  return out;
}
