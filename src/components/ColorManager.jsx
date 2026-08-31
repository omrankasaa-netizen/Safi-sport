import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/khClient';

/**
 * Master list of blank garment colors — drives the color pickers on
 * Products, Inventory, and Factory. Add/rename/retire colors here as the
 * factory relationship changes; a color still selected on a live product
 * can't be deleted until it's removed from that product first (server-
 * enforced, see api/queries/catalog.ts#deleteGarmentColor).
 */
export default function ColorManager({ lang }) {
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name_en: '', name_ar: '', hex: '#000000' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setColors((await base44.entities.Colors.list()) || []); }
    catch { setColors([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (c) => { setEditingId(c.id); setForm({ name_en: c.name_en, name_ar: c.name_ar || '', hex: c.hex }); setError(''); };
  const cancelEdit = () => { setEditingId(null); setForm({ name_en: '', name_ar: '', hex: '#000000' }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name_en.trim() || !form.hex.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const updated = await base44.entities.Colors.update(editingId, form);
        setColors((cs) => cs.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await base44.entities.Colors.create(form);
        setColors((cs) => [...cs, created]);
      }
      cancelEdit();
    } catch (err) {
      setError(err?.message || 'Could not save color.');
    } finally { setSaving(false); }
  };

  const remove = async (c) => {
    const confirmMsg = lang === 'ar' ? `حذف ${c.name_en}؟` : `Delete ${c.name_en}?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await base44.entities.Colors.remove(c.id);
      setColors((cs) => cs.filter((x) => x.id !== c.id));
    } catch (err) {
      window.alert(err?.message || 'Could not delete this color.');
    }
  };

  return (
    <section className="bg-card border border-border rounded-md p-6 mt-8">
      <h2 className="font-heading text-xl uppercase mb-1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
        {lang === 'ar' ? 'ألوان القماش' : 'Garment colors'}
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        {lang === 'ar'
          ? 'هاي لائحة الألوان المطبوعة اللي بيشتريها المصنع — بتظهر بالمنتجات والمخزون والمصنع.'
          : 'This is the master list of blank colors the factory stocks. It drives the color pickers on Products, Inventory, and Factory.'}
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto] items-end mb-6">
        <label className="block">
          <span className="kh-eyebrow block mb-1">{lang === 'ar' ? 'الاسم (EN)' : 'Name (EN)'}</span>
          <input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} className="kh-input" placeholder="Charcoal Blue" />
        </label>
        <label className="block">
          <span className="kh-eyebrow block mb-1">{lang === 'ar' ? 'الاسم (AR)' : 'Name (AR)'}</span>
          <input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} className="kh-input" dir="rtl" placeholder="رمادي كحلي" />
        </label>
        <label className="block">
          <span className="kh-eyebrow block mb-1">Hex</span>
          <input value={form.hex} onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value }))} className="kh-input" type="color" style={{ padding: 2, height: 40 }} />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="kh-btn-primary">
            {saving ? '…' : editingId ? (lang === 'ar' ? 'حفظ' : 'Save') : (lang === 'ar' ? 'إضافة' : 'Add')}
          </button>
          {editingId && <button type="button" onClick={cancelEdit} className="kh-btn-text">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>}
        </div>
      </form>
      {error && <p className="text-sm mb-4" style={{ color: 'var(--brand-destructive)' }}>{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">…</p>
      ) : (
        <div className="space-y-2">
          {colors.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className="w-6 h-6 rounded-full border border-border shrink-0" style={{ background: c.hex }} />
              <span className="flex-1">{c.name_en}{c.name_ar ? ` · ${c.name_ar}` : ''}</span>
              <span className="text-xs text-muted-foreground">{c.hex}</span>
              <button onClick={() => startEdit(c)} className="kh-btn-text text-xs">{lang === 'ar' ? 'تعديل' : 'Edit'}</button>
              <button onClick={() => remove(c)} className="kh-btn-text text-xs" style={{ color: 'var(--brand-destructive)' }}>{lang === 'ar' ? 'حذف' : 'Delete'}</button>
            </div>
          ))}
          {colors.length === 0 && <p className="text-muted-foreground py-4">{lang === 'ar' ? 'ما في ألوان بعد.' : 'No colors yet.'}</p>}
        </div>
      )}
    </section>
  );
}
