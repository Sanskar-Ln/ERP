import { describe, expect, it } from 'vitest';
import { PrinterLanguage } from '@erp/shared';
import { classifyIdentity } from '../../modules/tagging/printers';

describe('classifyIdentity', () => {
  it('recognises a Zebra ~HI reply and extracts the model', () => {
    const r = classifyIdentity('\x02ZD230-203dpi,V45.11.7Z,8,4096KB\x03');
    expect(r.language).toBe(PrinterLanguage.ZPL);
    expect(r.model).toBe('ZD230-203dpi');
  });

  it('recognises other Zebra families', () => {
    expect(classifyIdentity('ZT411-300dpi,V93.20.13Z,16,8192KB').language).toBe(PrinterLanguage.ZPL);
    expect(classifyIdentity('Zebra Technologies ZTC GK420d').language).toBe(PrinterLanguage.ZPL);
  });

  it('recognises TSPL printers (TSC / Godex / Argox)', () => {
    expect(classifyIdentity('TSC TE244, Version 1.23').language).toBe(PrinterLanguage.TSPL);
    expect(classifyIdentity('Godex G500 V2.010').language).toBe(PrinterLanguage.TSPL);
    expect(classifyIdentity('Argox OS-214 plus').language).toBe(PrinterLanguage.TSPL);
  });

  it('stays AUTO for an unrecognised dialect rather than guessing', () => {
    const r = classifyIdentity('SOME OTHER DEVICE 1.0');
    expect(r.language).toBe(PrinterLanguage.AUTO);
    expect(r.model).toBeNull();
    // the raw reply is preserved so a human can identify it
    expect(r.raw).toContain('SOME OTHER DEVICE');
  });

  it('handles an empty reply', () => {
    expect(classifyIdentity('').language).toBe(PrinterLanguage.AUTO);
  });
});
