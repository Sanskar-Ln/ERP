'use client';

/**
 * Tags & labels: create per-piece tags for an item, preview a tag's
 * barcode PNG, and generate a printable label sheet (fetched with auth,
 * opened as a blob URL — the render endpoint is JWT-protected).
 */
import { useEffect, useState } from 'react';
import { api, apiBlob } from '@/lib/api';

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
}
interface Template {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export default function TaggingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemId, setItemId] = useState('');
  const [symbology, setSymbology] = useState('CODE128');
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    void api<Tag[]>('GET', '/tags').then(setTags);
    void api<Template[]>('GET', '/label-templates').then((t) => {
      setTemplates(t);
      if (t.length && !templateId) setTemplateId(t[0]!.id);
    });
  };
  useEffect(() => {
    void api<Item[]>('GET', '/items').then(setItems);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function ensureTemplate() {
    // Bootstrap a default 40×12 template on first use.
    const t = await api<Template>('POST', '/label-templates', {
      name: `Standard 40x12 (${Date.now() % 1000})`,
      widthMm: 40,
      heightMm: 12,
      symbology: 'CODE128',
      fields: ['ITEM_CODE', 'NET_WEIGHT', 'PURITY', 'PRICE_TEXT'],
      isDefault: true,
    });
    setTemplateId(t.id);
    load();
    return t.id;
  }

  async function printLabels() {
    try {
      const tpl = templateId || (await ensureTemplate());
      const batch = await api<{ id: string }>('POST', '/label-batches', { templateId: tpl, tagIds: [...selected] });
      const blob = await apiBlob(`/label-batches/${batch.id}/render`);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    }
  }

  async function showBarcode(tagId: string) {
    const blob = await apiBlob(`/tags/${tagId}/barcode.png`);
    setPreview(URL.createObjectURL(blob));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Tags & labels</h1>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      <section className="card">
        <h2 className="mb-3 font-medium">Tag a piece</h2>
        <form onSubmit={createTag} className="flex gap-2">
          <select className="input w-72" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.itemCode} — {i.name}</option>
            ))}
          </select>
          <select className="input w-40" value={symbology} onChange={(e) => setSymbology(e.target.value)}>
            <option value="CODE128">Code128</option>
            <option value="DATAMATRIX">DataMatrix</option>
          </select>
          <button className="btn" disabled={!itemId}>Create tag</button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Barcodes encode only the item code — repricing never needs a reprint.
        </p>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Tags</h2>
          <div className="flex items-center gap-2">
            <select className="input w-56" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">template (auto-create)…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.widthMm}×{t.heightMm}mm)</option>
              ))}
            </select>
            <button className="btn" disabled={selected.size === 0} onClick={() => void printLabels()}>
              Label sheet ({selected.size})
            </button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr><th className="th"></th><th className="th">Tag code</th><th className="th">Symbology</th><th className="th"></th></tr>
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
                <td className="td">
                  <button className="btn-secondary" onClick={() => void showBarcode(t.id)}>barcode</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview && <img src={preview} alt="barcode preview" className="mt-4 h-16" />}
      </section>
    </div>
  );
}
