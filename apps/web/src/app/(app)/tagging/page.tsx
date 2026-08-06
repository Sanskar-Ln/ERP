'use client';

/**
 * Tags, label designs and printers.
 *
 * Three jobs on one page:
 * 1. SCAN / SEARCH — point a scanner (or type) at the box and get the whole
 *    story of that piece, including its price at TODAY's board rate. USB
 *    scanners act as keyboards, so this needs no driver at all.
 * 2. DESIGN — label templates in millimetres: a plain rectangle sticker or
 *    the jewellery dumbbell tag (two flags joined by a neck that wraps the
 *    ring/chain). Designs are device-independent.
 * 3. PRINT — register printers; a network printer can be identified so the
 *    right command language (ZPL/TSPL) is chosen from the hardware itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBlob, inr, isAdmin } from '@/lib/api';
import { Badge, EmptyState, PageHeader, SkeletonRows } from '@/components/ui';

interface Item {
  id: string;
  itemCode: string;
  name: string;
  pieces: number;
}
interface Tag {
  id: string;
  tagCode: string;
  symbology: string;
  itemId: string;
  printedAt: string | null;
}
interface FieldSpec {
  field: string;
  region: string;
  fontPt: number;
}
interface Template {
  id: string;
  name: string;
  shape: string;
  widthMm: string | number;
  heightMm: string | number;
  leftFlagMm: string | number | null;
  neckMm: string | number | null;
  rightFlagMm: string | number | null;
  symbology: string;
  fields: FieldSpec[];
  isDefault: boolean;
}
interface Printer {
  id: string;
  name: string;
  connection: string;
  language: string;
  host: string | null;
  port: number;
  dpi: number;
  detectedModel: string | null;
  lastSeenAt: string | null;
}
/** What a scan resolves to. */
interface ScanResult {
  tagCode: string;
  item: {
    id: string;
    itemCode: string;
    name: string;
    category: string | null;
    status: string;
    pieces: number;
    hallmarkNo: string | null;
    metalComponents: { grossWeightG: string; netWeightG: string; wastageBps: number }[];
    stoneComponents: { weightCt: string; valuePaise: number }[];
  };
}
interface LivePrice {
  itemCode: string;
  name: string;
  metalValuePaise: number;
  makingPaise: number;
  extraChargesPaise: number;
  grossPaise: number;
}

const ALL_FIELDS = ['BARCODE', 'ITEM_CODE', 'NAME', 'CATEGORY', 'GROSS_WEIGHT', 'NET_WEIGHT', 'PURITY', 'PIECES', 'HALLMARK', 'PRICE_TEXT'];

/** Real jewellery stock sizes, so nobody has to guess millimetres. */
const PRESETS: { label: string; v: Partial<Template> & { shape: string } }[] = [
  { label: 'Chain / bangle tag 75×13', v: { shape: 'DUMBBELL', widthMm: 75, heightMm: 13, leftFlagMm: 30, neckMm: 15, rightFlagMm: 30 } },
  { label: 'Ring tag 60×11', v: { shape: 'DUMBBELL', widthMm: 60, heightMm: 11, leftFlagMm: 24, neckMm: 12, rightFlagMm: 24 } },
  { label: 'Sticker 40×12', v: { shape: 'RECTANGLE', widthMm: 40, heightMm: 12 } },
  { label: 'Sticker 50×25', v: { shape: 'RECTANGLE', widthMm: 50, heightMm: 25 } },
];

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

export default function TaggingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemId, setItemId] = useState('');
  const [symbology, setSymbology] = useState('CODE128');
  const [templateId, setTemplateId] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    void api<Tag[]>('GET', '/tags').then(setTags);
    void api<Template[]>('GET', '/label-templates').then((t) => {
      setTemplates(t);
      setTemplateId((cur) => cur || (t[0]?.id ?? ''));
    });
    void api<Printer[]>('GET', '/printers').then((p) => {
      setPrinters(p);
      setPrinterId((cur) => cur || (p[0]?.id ?? ''));
    });
  }, []);
  useEffect(() => {
    void api<Item[]>('GET', '/items').then(setItems);
    load();
  }, [load]);

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/tags', { itemId, count: 1, symbology });
      setMsg('tag created');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  // ---------------------------------------------------------------- scan
  const [scanInput, setScanInput] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [price, setPrice] = useState<LivePrice | null>(null);
  const [scanErr, setScanErr] = useState('');
  const [matches, setMatches] = useState<Item[]>([]);
  const scanRef = useRef<HTMLInputElement>(null);

  /** Resolve an item id to its live price at today's board rate. */
  const loadPrice = useCallback(async (id: string) => {
    setPrice(null);
    try {
      setPrice(await api<LivePrice>('GET', `/items/${id}/price`));
    } catch {
      // no board rate fixed for this purity yet — the detail still shows
    }
  }, []);

  /**
   * A scanned tag code resolves exactly; anything else falls back to a
   * name/code search so the counter can find a piece without its tag.
   */
  async function doScan(raw?: string) {
    const q = (raw ?? scanInput).trim();
    if (!q) return;
    setScanErr('');
    setScan(null);
    setPrice(null);
    setMatches([]);
    try {
      const found = await api<ScanResult>('GET', `/tags/scan/${encodeURIComponent(q.toUpperCase())}`);
      setScan(found);
      void loadPrice(found.item.id);
    } catch {
      // not a tag code — search items instead
      try {
        const hits = await api<Item[]>('GET', `/items?q=${encodeURIComponent(q)}`);
        if (hits.length === 0) setScanErr(`nothing matches “${q}”`);
        setMatches(hits);
      } catch (e) {
        setScanErr(e instanceof Error ? e.message : 'lookup failed');
      }
    }
  }

  /** Open an item found by search as if it had been scanned. */
  async function openItem(it: Item) {
    setMatches([]);
    const full = await api<ScanResult['item']>('GET', `/items/${it.id}`);
    setScan({ tagCode: '', item: full });
    void loadPrice(it.id);
  }

  // ------------------------------------------------------------- designer
  const blank = {
    name: '',
    shape: 'DUMBBELL',
    widthMm: 75,
    heightMm: 13,
    leftFlagMm: 30,
    neckMm: 15,
    rightFlagMm: 30,
    symbology: 'CODE128',
    isDefault: false,
  };
  const [design, setDesign] = useState<typeof blank & { id?: string }>(blank);
  const [designFields, setDesignFields] = useState<FieldSpec[]>([
    { field: 'BARCODE', region: 'LEFT', fontPt: 6 },
    { field: 'ITEM_CODE', region: 'LEFT', fontPt: 5 },
    { field: 'NET_WEIGHT', region: 'RIGHT', fontPt: 6 },
    { field: 'PURITY', region: 'RIGHT', fontPt: 6 },
  ]);
  const [designPreview, setDesignPreview] = useState('');

  function editTemplate(t: Template) {
    setDesign({
      id: t.id,
      name: t.name,
      shape: t.shape,
      widthMm: num(t.widthMm),
      heightMm: num(t.heightMm),
      leftFlagMm: num(t.leftFlagMm),
      neckMm: num(t.neckMm),
      rightFlagMm: num(t.rightFlagMm),
      symbology: t.symbology,
      isDefault: t.isDefault,
    });
    setDesignFields(t.fields);
    setDesignPreview('');
  }

  async function saveDesign() {
    setMsg('');
    const body: Record<string, unknown> = {
      name: design.name,
      shape: design.shape,
      widthMm: Number(design.widthMm),
      heightMm: Number(design.heightMm),
      symbology: design.symbology,
      fields: designFields,
      isDefault: design.isDefault,
    };
    if (design.shape === 'DUMBBELL') {
      body.leftFlagMm = Number(design.leftFlagMm);
      body.neckMm = Number(design.neckMm);
      body.rightFlagMm = Number(design.rightFlagMm);
    }
    try {
      const saved = await api<Template>('POST', design.id ? `/label-templates/${design.id}` : '/label-templates', body);
      setMsg(`design “${saved.name}” saved`);
      setDesign({ ...design, id: saved.id });
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  /** Render this design against a real tag so the preview is truthful. */
  async function previewDesign() {
    setMsg('');
    if (!design.id) return setMsg('save the design first, then preview it');
    const anyTag = tags?.[0];
    if (!anyTag) return setMsg('create a tag first — the preview renders a real one');
    try {
      const batch = await api<{ id: string }>('POST', '/label-batches', { templateId: design.id, tagIds: [anyTag.id] });
      const blob = await apiBlob(`/label-batches/${batch.id}/render`);
      setDesignPreview(URL.createObjectURL(blob));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'preview failed');
    }
  }

  // sum check mirrors the server rule so the UI can warn before saving
  const flagSum = num(design.leftFlagMm) + num(design.neckMm) + num(design.rightFlagMm);
  const flagsOk = design.shape !== 'DUMBBELL' || Math.abs(flagSum - Number(design.widthMm)) < 0.01;

  // -------------------------------------------------------------- printing
  async function printSelected(mode: 'sheet' | 'printer') {
    setMsg('');
    if (selected.size === 0) return;
    try {
      const tpl = templateId || templates[0]?.id;
      if (!tpl) return setMsg('design a label template first');
      const batch = await api<{ id: string }>('POST', '/label-batches', { templateId: tpl, tagIds: [...selected] });
      if (mode === 'sheet') {
        const blob = await apiBlob(`/label-batches/${batch.id}/render`);
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        if (!printerId) return setMsg('add a printer first');
        const out = await api<{ sent: boolean; filename: string | null; body: string; contentType: string }>(
          'POST',
          `/label-batches/${batch.id}/print?printerId=${printerId}`,
        );
        if (out.sent) {
          setMsg('sent to the printer');
        } else if (out.filename) {
          // DOWNLOAD path: hand the raw command file to the operator
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([out.body], { type: 'text/plain' }));
          a.download = out.filename;
          a.click();
          URL.revokeObjectURL(a.href);
          setMsg(`downloaded ${out.filename} — send it to the printer`);
        } else {
          // BROWSER printer: hand the sheet to a new tab and say so, so the
          // operator gets feedback even when a pop-up blocker eats the tab
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(out.body);
            w.document.close();
            setMsg('opened the label sheet — print it from that tab');
          } else {
            setMsg('allow pop-ups to open the label sheet, or use Sheet');
          }
        }
      }
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  // -------------------------------------------------------------- printers
  const [np, setNp] = useState({ name: '', connection: 'BROWSER', host: '', port: 9100, dpi: 203 });

  async function addPrinter() {
    setMsg('');
    try {
      const body: Record<string, unknown> = { name: np.name, connection: np.connection, dpi: Number(np.dpi) };
      if (np.connection === 'NETWORK') {
        body.host = np.host;
        body.port = Number(np.port);
      }
      await api('POST', '/printers', body);
      setNp({ ...np, name: '', host: '' });
      setMsg('printer added — hit Identify to detect its language');
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function identify(p: Printer) {
    setMsg(`asking ${p.name} what it is…`);
    try {
      const out = await api<{ printer: Printer; detected: { model: string | null; language: string } }>(
        'POST',
        `/printers/${p.id}/identify`,
      );
      setMsg(
        out.detected.language === 'AUTO'
          ? `${p.name} replied but in an unrecognised dialect — set the language by hand`
          : `${p.name} is a ${out.detected.model ?? out.detected.language} — using ${out.printer.language}`,
      );
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'could not reach the printer');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Tags & labels" description="Price-free barcodes, jewellery tag designs and printers" />
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      {/* ------------------------------------------------ scan & search */}
      <section className="card">
        <h2 className="section-title mb-3">Scan or search</h2>
        <div className="flex flex-wrap gap-2">
          <input
            ref={scanRef}
            className="input w-full sm:w-96"
            placeholder="scan a tag, or type an item code / name"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => {
              // barcode scanners send Enter at the end of the code
              if (e.key === 'Enter') {
                e.preventDefault();
                void doScan();
              }
            }}
            autoFocus
          />
          <button className="btn" onClick={() => void doScan()}>Look up</button>
          {(scan || matches.length > 0 || scanErr) && (
            <button
              className="btn-secondary"
              onClick={() => {
                setScan(null);
                setMatches([]);
                setScanErr('');
                setScanInput('');
                scanRef.current?.focus();
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="hint mt-1">A USB scanner types the code and presses Enter — no driver needed.</p>
        {scanErr && <p className="mt-2 text-sm text-red-600">{scanErr}</p>}

        {matches.length > 0 && (
          <ul className="mt-3 space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                <button className="min-h-11 w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-stone-100 sm:min-h-0" onClick={() => void openItem(m)}>
                  <span className="font-mono text-xs">{m.itemCode}</span> — {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {scan && (
          <div className="mt-4 rounded-xl border border-gold-200 bg-gold-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-semibold">{scan.item.name}</span>
              <span className="font-mono text-xs text-stone-500">{scan.item.itemCode}</span>
              <Badge status={scan.item.status} />
              {scan.tagCode && <span className="font-mono text-xs text-gold-700">{scan.tagCode}</span>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
              <div><dt className="text-xs text-stone-500">Category</dt><dd>{scan.item.category ?? '—'}</dd></div>
              <div><dt className="text-xs text-stone-500">Gross</dt><dd>{scan.item.metalComponents.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3)} g</dd></div>
              <div><dt className="text-xs text-stone-500">Net</dt><dd>{scan.item.metalComponents.reduce((s, c) => s + Number(c.netWeightG), 0).toFixed(3)} g</dd></div>
              <div><dt className="text-xs text-stone-500">Pieces</dt><dd>{scan.item.pieces}</dd></div>
              {scan.item.stoneComponents.length > 0 && (
                <div><dt className="text-xs text-stone-500">Stones</dt><dd>{scan.item.stoneComponents.length} ({inr(scan.item.stoneComponents.reduce((s, c) => s + c.valuePaise, 0))})</dd></div>
              )}
              {scan.item.hallmarkNo && (
                <div><dt className="text-xs text-stone-500">Hallmark</dt><dd>{scan.item.hallmarkNo}</dd></div>
              )}
            </dl>
            {price ? (
              <div className="mt-3 flex items-baseline justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-gold-200/60">
                <span className="text-sm text-stone-600">
                  Price at today’s rate — metal {inr(price.metalValuePaise)} + making {inr(price.makingPaise)}
                  {price.extraChargesPaise > 0 ? ` + charges ${inr(price.extraChargesPaise)}` : ''}
                </span>
                <span className="text-xl font-semibold">{inr(price.grossPaise)}</span>
              </div>
            ) : (
              <p className="hint mt-3">no board rate fixed for this purity yet — price unavailable</p>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ tag a piece */}
      <section className="card">
        <h2 className="section-title mb-3">Tag a piece</h2>
        <form onSubmit={createTag} className="flex flex-wrap gap-2">
          <select className="input w-full sm:w-72" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.itemCode} — {i.name}</option>
            ))}
          </select>
          <select className="input w-full sm:w-40" value={symbology} onChange={(e) => setSymbology(e.target.value)}>
            <option value="CODE128">Code128</option>
            <option value="DATAMATRIX">DataMatrix</option>
          </select>
          <button className="btn" disabled={!itemId}>Create tag</button>
        </form>
        <p className="hint mt-2">Barcodes encode only the item code — repricing never needs a reprint.</p>
      </section>

      {/* ------------------------------------------------ designer (admin) */}
      {isAdmin() && (
        <section className="card">
          <h2 className="section-title mb-3">Label design</h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} className="btn-secondary btn-xs" onClick={() => setDesign({ ...design, ...p.v } as typeof design)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input w-full sm:w-56" placeholder="design name" value={design.name} onChange={(e) => setDesign({ ...design, name: e.target.value })} />
            <select className="input w-40" value={design.shape} onChange={(e) => setDesign({ ...design, shape: e.target.value })}>
              <option value="DUMBBELL">Dumbbell tag</option>
              <option value="RECTANGLE">Rectangle</option>
            </select>
            <input className="input w-24" placeholder="width mm" value={design.widthMm} onChange={(e) => setDesign({ ...design, widthMm: Number(e.target.value) })} />
            <input className="input w-24" placeholder="height mm" value={design.heightMm} onChange={(e) => setDesign({ ...design, heightMm: Number(e.target.value) })} />
            <select className="input w-36" value={design.symbology} onChange={(e) => setDesign({ ...design, symbology: e.target.value })}>
              <option value="CODE128">Code128</option>
              <option value="DATAMATRIX">DataMatrix</option>
            </select>
          </div>

          {design.shape === 'DUMBBELL' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-stone-600">Flags</span>
              <input className="input w-24" placeholder="left mm" value={design.leftFlagMm} onChange={(e) => setDesign({ ...design, leftFlagMm: Number(e.target.value) })} />
              <input className="input w-24" placeholder="neck mm" value={design.neckMm} onChange={(e) => setDesign({ ...design, neckMm: Number(e.target.value) })} />
              <input className="input w-24" placeholder="right mm" value={design.rightFlagMm} onChange={(e) => setDesign({ ...design, rightFlagMm: Number(e.target.value) })} />
              <span className={`text-xs ${flagsOk ? 'text-stone-400' : 'text-red-600'}`}>
                {flagsOk ? 'left + neck + right = width ✓' : `left + neck + right = ${flagSum}mm, must equal ${design.widthMm}mm`}
              </span>
            </div>
          )}

          <h3 className="mt-4 mb-2 text-sm font-medium">Fields on the tag</h3>
          <div className="space-y-2">
            {designFields.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  className="input w-40"
                  value={f.field}
                  onChange={(e) => setDesignFields(designFields.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                >
                  {ALL_FIELDS.map((n) => <option key={n} value={n}>{n.replaceAll('_', ' ').toLowerCase()}</option>)}
                </select>
                {design.shape === 'DUMBBELL' && (
                  <select
                    className="input w-32"
                    value={f.region}
                    onChange={(e) => setDesignFields(designFields.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)))}
                  >
                    <option value="LEFT">left flag</option>
                    <option value="RIGHT">right flag</option>
                  </select>
                )}
                <input
                  className="input w-20"
                  value={f.fontPt}
                  onChange={(e) => setDesignFields(designFields.map((x, j) => (j === i ? { ...x, fontPt: Number(e.target.value) } : x)))}
                />
                <span className="hint">pt</span>
                <button className="btn-secondary btn-xs" onClick={() => setDesignFields(designFields.filter((_, j) => j !== i))}>remove</button>
              </div>
            ))}
            <button className="btn-secondary btn-xs" onClick={() => setDesignFields([...designFields, { field: 'NAME', region: 'RIGHT', fontPt: 5 }])}>
              Add field
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn" disabled={!design.name || !flagsOk || designFields.length === 0} onClick={() => void saveDesign()}>
              {design.id ? 'Save design' : 'Create design'}
            </button>
            <button className="btn-secondary" onClick={() => void previewDesign()}>Preview</button>
            <button className="btn-secondary" onClick={() => { setDesign(blank); setDesignFields([]); setDesignPreview(''); }}>New</button>
          </div>
          {designPreview && (
            <iframe title="label preview" src={designPreview} className="mt-3 h-40 w-full rounded-lg border border-stone-200 bg-white" />
          )}

          {templates.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-stone-100 pt-3">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <Badge status={t.shape} />
                  <span className="text-stone-500">{num(t.widthMm)}×{num(t.heightMm)}mm</span>
                  <button className="btn-secondary btn-xs" onClick={() => editTemplate(t)}>edit</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------ printers (admin) */}
      {isAdmin() && (
        <section className="card">
          <h2 className="section-title mb-3">Printers</h2>
          <div className="flex flex-wrap gap-2">
            <input className="input w-full sm:w-48" placeholder="printer name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            <select className="input w-44" value={np.connection} onChange={(e) => setNp({ ...np, connection: e.target.value })}>
              <option value="BROWSER">Browser print</option>
              <option value="NETWORK">Network (IP)</option>
              <option value="DOWNLOAD">Download file</option>
            </select>
            {np.connection === 'NETWORK' && (
              <>
                <input className="input w-40" placeholder="printer IP" value={np.host} onChange={(e) => setNp({ ...np, host: e.target.value })} />
                <input className="input w-24" placeholder="port" value={np.port} onChange={(e) => setNp({ ...np, port: Number(e.target.value) })} />
              </>
            )}
            <select className="input w-28" value={np.dpi} onChange={(e) => setNp({ ...np, dpi: Number(e.target.value) })}>
              <option value={203}>203 dpi</option>
              <option value={300}>300 dpi</option>
              <option value={600}>600 dpi</option>
            </select>
            <button className="btn" disabled={!np.name} onClick={() => void addPrinter()}>Add printer</button>
          </div>
          <p className="hint mt-1">
            Add a network printer without knowing its brand — Identify asks the hardware and picks ZPL or TSPL itself.
          </p>

          {printers.length === 0 ? (
            <div className="mt-3"><EmptyState>No printers yet — browser printing works without one.</EmptyState></div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {printers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <Badge status={p.connection} />
                  <Badge status={p.language} />
                  {p.host && <span className="font-mono text-xs text-stone-500">{p.host}:{p.port}</span>}
                  {p.detectedModel && <span className="text-xs text-emerald-700">{p.detectedModel}</span>}
                  {p.connection === 'NETWORK' && (
                    <button className="btn-secondary btn-xs" onClick={() => void identify(p)}>Identify</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------ tags + printing */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Tags</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-full sm:w-56" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">design…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({num(t.widthMm)}×{num(t.heightMm)}mm)</option>
              ))}
            </select>
            {printers.length > 0 && (
              <select className="input w-full sm:w-44" value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button className="btn-secondary" disabled={selected.size === 0} onClick={() => void printSelected('sheet')}>
              Sheet ({selected.size})
            </button>
            <button className="btn" disabled={selected.size === 0 || printers.length === 0} onClick={() => void printSelected('printer')}>
              Print ({selected.size})
            </button>
          </div>
        </div>

        {tags === null ? (
          <SkeletonRows rows={4} />
        ) : tags.length === 0 ? (
          <EmptyState>No tags yet — tag a piece above.</EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
            <thead>
              <tr><th className="th"></th><th className="th">Tag code</th><th className="th">Symbology</th><th className="th">Printed</th><th className="th"></th></tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td className="td">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="td font-mono text-xs">{t.tagCode}</td>
                  <td className="td">{t.symbology}</td>
                  <td className="td text-xs text-stone-500">{t.printedAt ? new Date(t.printedAt).toLocaleDateString() : '—'}</td>
                  <td className="td">
                    <button className="btn-secondary btn-xs" onClick={() => void doScan(t.tagCode)}>look up</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
