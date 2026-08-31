import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/khClient';

/**
 * Master list of garment styles/fits (Oversized Tee, Classic Tee, Regular
 * Fit, Pique, etc.) — drives the "Garment style" dropdown on the Products
 * form. Staff can also add a new style inline from that dropdown; this panel
 * is for renaming or retiring styles later. A style still selected on a live
 * product can't be deleted until it's removed from that product first
 * (server-enforced, see api/queries/catalog.ts#deleteGarmentStyle).
 */
export default function StyleManager({ lang }) {
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name_en: '', name_ar: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setStyles((await base44.entities.Styles.list()) || []); }
    catch { setStyles([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (s) => { setEditingId(s.id); setForm({ name_en: s.name_en, name_ar: s.name_ar || '' }); setError(''); };
  const cancelEdit = () => { setEditingId(null); setForm({ name_en: '', name_ar: '' }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name_en.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const updated = await base44.entities.Styles.update(editingId, form);
        setStyles((ss) => ss.map((s) => (s.id === editingId ? updated : s)));
      } else {
        const created = await base44.entities.Styles.create(form);
        setStyles((ss) => [...ss, created]);
      }
      cancelEdit();
    } catch (err) {
      setError(err?.message || 'Could not save style.');
    } finally { setSaving(false); }
  };

  const remove = async (s) => {
    const confirmMsg = lang === 'ar' ? `حذف ${s.name_en}؟` : `Delete ${s.name_en}?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await base44.entities.Styles.remove(s.id);
      setStyles((ss) => ss.filter((x) => x.id !== s.id));
    } catch (err) {
      window.alert(err?.message || 'Could not delete this style.');
    }
  };

  return (
    <section className="bg-card border border-border rounded-md p-6 mt-8">
      <h2 className="font-heading text-xl uppercase mb-1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
        {lang === 'ar' ? 'قصات القطع' : 'Garment styles'}
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        {lang === 'ar'
          ? 'هاي لائحة القصات (أوفرسايز، ريغولر، بيكيه...) اللي بتظهر بخانة "قصة القطعة" بمنتج جديد. بتقدر كمان تضيف قصة مباشرة من نفس الخانة وقت ما تضيف منتج.'
          : 'This is the master list of fits (Oversized, Regular Fit, Pique...) shown in the "Garment style" field when adding a product. You can also add a new one right from that field while editing a product.'}
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end mb-6">
        <label className="block">
          <span className="kh-eyebrow block mb-1">{lang === 'ar' ? 'الاسم (EN)' : 'Name (EN)'}</span>
          <input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} className="kh-input" placeholder="Regular Fit" />
        </label>
        <label className="block">
          <span className="kh-eyebrow block mb-1">{lang === 'ar' ? 'الاسم (AR)' : 'Name (AR)'}</span>
          <input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} className="kh-input" dir="rtl" placeholder="ريغولر" />
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
          {styles.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className="flex-1">{s.name_en}{s.name_ar ? ` · ${s.name_ar}` : ''}</span>
              <button onClick={() => startEdit(s)} className="kh-btn-text text-xs">{lang === 'ar' ? 'تعديل' : 'Edit'}</button>
              <button onClick={() => remove(s)} className="kh-btn-text text-xs" style={{ color: 'var(--brand-destructive)' }}>{lang === 'ar' ? 'حذف' : 'Delete'}</button>
            </div>
          ))}
          {styles.length === 0 && <p className="text-muted-foreground py-4">{lang === 'ar' ? 'ما في قصات بعد.' : 'No styles yet.'}</p>}
        </div>
      )}
    </section>
  );
}
