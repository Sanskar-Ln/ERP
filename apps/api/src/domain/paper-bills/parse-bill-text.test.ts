import { describe, expect, it } from 'vitest';
import { parseBillText } from './parse-bill-text';

// Realistic OCR output including typical recognition noise
// ("BillNa" for "Bill No", merged tokens).
const CLEAN_BILL = `SHREE GANESH JEWELLERS
Bill No: 1247    Date: 12/03/2019
Customer: Rohan Iyer  Ph: 9845098450
Gold Chain 22K  Net Wt: 12.500 g
Rate: Rs 32000 per 10g
Making: Rs 4500
Total Amount: Rs 44,500`;

describe('parseBillText', () => {
  it('extracts every field from a clean bill', () => {
    const p = parseBillText(CLEAN_BILL);
    expect(p.billNo).toBe('1247');
    expect(p.billDate).toBe('2019-03-12'); // dd/mm/yyyy day-first
    expect(p.phones).toEqual(['9845098450']);
    expect(p.weightsG).toContain('12.500');
    expect(p.ratePaisePer10g).toBe(3_200_000);
    expect(p.totalPaise).toBe(4_450_000); // from the "Total" line
    expect(p.amountsPaise).toContain(450_000); // making
  });

  it('tolerates OCR noise in the bill-number label ("BillNa 1247")', () => {
    expect(parseBillText('BillNa 1247 Date 1/1/21').billNo).toBe('1247');
  });

  it('falls back to the largest amount when no total line reads', () => {
    const p = parseBillText('Rs 4500 making\nRs 44500 chain\nRs 320 polish');
    expect(p.totalPaise).toBe(4_450_000);
  });

  it('expands two-digit years by century pivot', () => {
    expect(parseBillText('Date: 5/6/19').billDate).toBe('2019-06-05');
    expect(parseBillText('Date: 5/6/85').billDate).toBe('1985-06-05');
  });

  it('rejects impossible dates and absurd weights', () => {
    const p = parseBillText('Date: 45/13/2019  Wt: 99999 g');
    expect(p.billDate).toBeUndefined();
    expect(p.weightsG).toEqual([]);
  });

  it('handles +91 phones and dedupes', () => {
    const p = parseBillText('Ph +91 9845098450 alt 9845098450');
    expect(p.phones).toEqual(['9845098450']);
  });

  it('returns empty-but-valid structure for garbage text', () => {
    const p = parseBillText('~~~ !!! ###');
    expect(p.phones).toEqual([]);
    expect(p.amountsPaise).toEqual([]);
    expect(p.totalPaise).toBeUndefined();
  });
});
