import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, GripVertical, ImagePlus, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { ErrorNote, Loading, PageHeader, btnGhost, btnPrimary, btnRed, inputCls, labelCls, money } from './ui';

const AUDIENCES = ['men', 'women', 'kids', 'unisex'];
const CATEGORIES = ['shoes', 'training', 'jackets', 'hoodies', 'pants', 'shorts', 'tees', 'sets', 'accessories'];
const SIZE_TYPES = ['shoe', 'apparel', 'kids'];

const dollars = (cents) => (cents == null ? '' : String(Number(cents) / 100));
const centsOf = (v) => Math.round(Number(v || 0) * 100);

/* ─────────────── Photos panel: upload + bind + reorder ─────────────── */
function PhotosPanel({ productId, colors }) {
  const utils = trpc.useUtils();
  const media = trpc.media.listForProduct.useQuery({ productId });
  const upload = trpc.media.upload.useMutation({
    onSuccess: () => utils.media.listForProduct.invalidate({ productId }),
  });
  const bind = trpc.products.bindPhotos.useMutation({
    onSuccess: () => utils.media.listForProduct.invalidate({ productId }),
  });
  const reorder = trpc.products.reorderPhotos.useMutation({
    onSuccess: () => utils.media.listForProduct.invalidate({ productId }),
  });
  const unbind = trpc.products.unbindPhoto.useMutation({
    onSuccess: () => utils.media.listForProduct.invalidate({ productId }),
  });

  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('');
  const inputRef = useRef(null);

  const assets = media.data ?? [];
  const byColor = useMemo(() => {
    const m = new Map();
    for (const a of assets) {
      const key = a.color || '(unassigned)';
      m.set(key, [...(m.get(key) ?? []), a]);
    }
    for (const list of m.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    return m;
  }, [assets]);

  const readFiles = (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (!imgs.length) return;
    let done = 0;
    const urls = [];
    for (const f of imgs) {
      const r = new FileReader();
      r.onload = () => {
        urls.push(r.result);
        done += 1;
        setProgress(`Reading photo ${done} of ${imgs.length}…`);
        if (done === imgs.length) {
          setProgress(`Uploading ${imgs.length} photo(s)…`);
          upload.mutate(
            { files: urls, productId },
            { onSettled: () => setProgress('') },
          );
        }
      };
      r.readAsDataURL(f);
    }
  };

  const onDropFiles = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) readFiles(e.dataTransfer.files);
  };

  const onDropOnColor = (e, color) => {
    e.preventDefault();
    e.stopPropagation();
    const assetId = Number(e.dataTransfer.getData('text/asset-id'));
    if (!assetId) return;
    const existing = (byColor.get(color) ?? []).map((a) => a.id).filter((id) => id !== assetId);
    bind.mutate({ productId, color, assetIds: [assetId, ...existing] });
  };

  const onDropOnThumb = (e, color, beforeId) => {
    e.preventDefault();
    e.stopPropagation();
    const assetId = Number(e.dataTransfer.getData('text/asset-id'));
    if (!assetId || assetId === beforeId) return;
    const list = (byColor.get(color) ?? []).map((a) => a.id).filter((id) => id !== assetId);
    const idx = beforeId == null ? list.length : list.indexOf(beforeId);
    list.splice(idx === -1 ? list.length : idx, 0, assetId);
    reorder.mutate({ productId, color, assetIds: list });
  };

  const chipCls = (c) =>
    `rounded-sm border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
      colors.includes(c) ? 'border-safi-red/50 text-safi-ice' : 'border-safi-line text-safi-steel'
    }`;

  return (
    <div>
      {/* drop zone */}
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDropFiles}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-safi-red bg-safi-red/10' : 'border-safi-line hover:border-safi-steel'
        }`}
      >
        <ImagePlus className="h-6 w-6 text-safi-steel" />
        <p className="mt-2 text-sm font-semibold text-safi-ice">Drop photos here, or tap to choose</p>
        <p className="mt-0.5 text-[11px] text-safi-steel">JPG/PNG/WebP, up to 8MB each, up to 10 at a time</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            readFiles(e.target.files ?? []);
            e.target.value = '';
          }}
        />
      </div>
      {(progress || upload.isPending) && (
        <p className="mt-2 flex items-center gap-2 text-xs text-safi-steel">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress || 'Uploading…'}
        </p>
      )}
      <ErrorNote error={upload.error || bind.error || reorder.error || unbind.error} />

      {/* color chips = drop targets */}
      <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
        Drag a photo onto a color to attach it. First photo in a color is the cover.
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropOnColor(e, c)}
            onClick={() => {
              const sel = window.__safiSelectedAsset;
              if (sel) {
                const existing = (byColor.get(c) ?? []).map((a) => a.id).filter((id) => id !== sel);
                bind.mutate({ productId, color: c, assetIds: [sel, ...existing] });
                window.__safiSelectedAsset = null;
              }
            }}
            className={chipCls(c)}
          >
            {c} ({(byColor.get(c) ?? []).length})
          </button>
        ))}
        {colors.length === 0 && (
          <p className="text-xs text-safi-steel">Add variants first — colors come from them.</p>
        )}
      </div>

      {/* galleries per color */}
      {media.isPending ? (
        <Loading label="Loading photos…" />
      ) : assets.length === 0 ? (
        <p className="mt-6 text-center text-sm text-safi-steel">No photos yet — drop some above.</p>
      ) : (
        [...byColor.entries()].map(([color, list]) => (
          <div key={color} className="mt-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-safi-steel">{color}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((a, i) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/asset-id', String(a.id));
                    window.__safiSelectedAsset = a.id;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => (color === '(unassigned)' ? undefined : onDropOnThumb(e, color, a.id))}
                  className={`relative h-24 w-24 cursor-grab overflow-hidden rounded-sm border ${
                    i === 0 && color !== '(unassigned)' ? 'border-safi-red' : 'border-safi-line'
                  }`}
                >
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && color !== '(unassigned)' && (
                    <span className="absolute bottom-0 left-0 bg-safi-red px-1.5 text-[8px] font-bold uppercase tracking-widest text-white">
                      Cover
                    </span>
                  )}
                  <button
                    onClick={() => unbind.mutate({ assetId: a.id })}
                    title="Detach from product"
                    className="absolute right-0.5 top-0.5 rounded-sm bg-safi-black/70 p-1 text-safi-steel hover:text-safi-red"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <GripVertical className="absolute bottom-0.5 right-0.5 h-3 w-3 text-white/60" />
                </div>
              ))}
              {color !== '(unassigned)' && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropOnThumb(e, color, null)}
                  className="flex h-24 w-10 items-center justify-center rounded-sm border border-dashed border-safi-line text-safi-steel"
                  title="Drop here to move to the end"
                >
                  <Plus className="h-3 w-3" />
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────── Product editor drawer ─────────────── */
function ProductEditor({ productId, onClose }) {
  const utils = trpc.useUtils();
  const detail = trpc.products.detail.useQuery({ id: productId });
  const [tab, setTab] = useState('details');
  const [form, setForm] = useState(null);
  const [variant, setVariant] = useState({ color: '', size: '', sizeType: 'apparel', barcode: '' });

  const p = detail.data?.product;
  useEffect(() => {
    if (p && !form) {
      setForm({
        nameEn: p.nameEn,
        nameAr: p.nameAr ?? '',
        descriptionEn: p.descriptionEn ?? '',
        descriptionAr: p.descriptionAr ?? '',
        audience: p.audience,
        category: p.category,
        brand: p.brand ?? '',
        basePrice: dollars(p.basePriceCents),
        compareAtPrice: dollars(p.compareAtPriceCents),
        isNew: p.isNew,
        isTrending: p.isTrending,
      });
    }
  }, [p, form]);

  const refresh = () => {
    utils.products.detail.invalidate({ id: productId });
    utils.products.list.invalidate();
  };
  const update = trpc.products.update.useMutation({ onSuccess: refresh });
  const setStatus = trpc.products.setStatus.useMutation({ onSuccess: refresh });
  const addVariant = trpc.products.addVariant.useMutation({
    onSuccess: () => {
      setVariant({ color: '', size: '', sizeType: 'apparel', barcode: '' });
      refresh();
    },
  });
  const setVariantActive = trpc.products.setVariantActive.useMutation({ onSuccess: refresh });
  const remove = trpc.products.remove.useMutation({ onSuccess: () => { utils.products.list.invalidate(); onClose(); } });

  if (detail.isPending || !p || !form) return <Loading label="Loading product…" />;

  const variants = detail.data.variants ?? [];
  const colors = [...new Set(variants.map((v) => v.color))];
  const set = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">{p.nameEn}</h3>
          <p className="text-[11px] uppercase tracking-[0.2em] text-safi-steel">
            {p.slug} · {p.status}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close editor"><X className="h-5 w-5 text-safi-steel hover:text-safi-ice" /></button>
      </div>

      <div className="mt-4 flex gap-1 border-b border-safi-line">
        {['details', 'photos'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 font-display text-sm font-bold uppercase italic tracking-wider ${
              tab === t ? 'border-safi-red text-safi-ice' : 'border-transparent text-safi-steel'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'photos' ? (
        <div className="mt-4">
          <PhotosPanel productId={productId} colors={colors} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name (English)</label>
              <input className={inputCls} value={form.nameEn} onChange={set('nameEn')} />
            </div>
            <div>
              <label className={labelCls}>Name (Arabic, optional)</label>
              <input className={inputCls} dir="rtl" value={form.nameAr} onChange={set('nameAr')} />
            </div>
            <div>
              <label className={labelCls}>Audience</label>
              <select className={inputCls} value={form.audience} onChange={set('audience')}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input className={inputCls} value={form.brand} onChange={set('brand')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Price ($)</label>
                <input className={inputCls} inputMode="decimal" value={form.basePrice} onChange={set('basePrice')} />
              </div>
              <div>
                <label className={labelCls}>Was ($, optional)</label>
                <input className={inputCls} inputMode="decimal" value={form.compareAtPrice} onChange={set('compareAtPrice')} />
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} min-h-20`} value={form.descriptionEn} onChange={set('descriptionEn')} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-safi-ice">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.isNew} onChange={(e) => setForm({ ...form, isNew: e.target.checked })} /> New arrival
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.isTrending} onChange={(e) => setForm({ ...form, isTrending: e.target.checked })} /> Trending
            </label>
          </div>
          <ErrorNote error={update.error} />
          <div className="flex flex-wrap gap-2">
            <button
              className={btnPrimary}
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: productId,
                  nameEn: form.nameEn,
                  nameAr: form.nameAr || undefined,
                  descriptionEn: form.descriptionEn || undefined,
                  descriptionAr: form.descriptionAr || undefined,
                  audience: form.audience,
                  category: form.category,
                  brand: form.brand || undefined,
                  basePriceCents: centsOf(form.basePrice),
                  compareAtPriceCents: form.compareAtPrice ? centsOf(form.compareAtPrice) : undefined,
                  isNew: !!form.isNew,
                  isTrending: !!form.isTrending,
                })
              }
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className={p.status === 'active' ? btnGhost : btnRed}
              onClick={() => setStatus.mutate({ id: productId, status: p.status === 'active' ? 'draft' : 'active' })}
            >
              {p.status === 'active' ? 'Unpublish' : 'Publish to store'}
            </button>
            {p.status !== 'archived' && (
              <button className={btnGhost} onClick={() => setStatus.mutate({ id: productId, status: 'archived' })}>
                Archive
              </button>
            )}
            <button
              className={`${btnGhost} hover:border-safi-red`}
              onClick={() => {
                if (window.confirm('Delete this product? Products with orders are archived instead.')) remove.mutate({ id: productId });
              }}
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
            </button>
          </div>

          {/* variants */}
          <p className="pt-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
            Variants — sellable units, one barcode each
          </p>
          <div className="overflow-x-auto rounded-sm border border-safi-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-safi-line bg-safi-graphite/60 text-left text-[10px] uppercase tracking-[0.2em] text-safi-steel">
                  <th className="px-3 py-2">Color</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Barcode</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">On</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className={`border-b border-safi-line/50 ${v.isActive ? '' : 'opacity-40'}`}>
                    <td className="px-3 py-2 text-safi-ice">{v.color}</td>
                    <td className="px-3 py-2 text-safi-ice">{v.size}</td>
                    <td className="px-3 py-2 text-[11px] text-safi-steel">{v.sku}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-safi-steel">{v.barcode}</td>
                    <td className="px-3 py-2 text-right">{v.priceOverrideCents != null ? money(v.priceOverrideCents) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="checkbox"
                        checked={!!v.isActive}
                        onChange={(e) => setVariantActive.mutate({ variantId: v.id, isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="bg-safi-panel/40">
                  <td className="px-2 py-2">
                    <input className={inputCls} placeholder="Color" value={variant.color} onChange={(e) => setVariant({ ...variant, color: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <input className={`${inputCls} w-20`} placeholder="Size" value={variant.size} onChange={(e) => setVariant({ ...variant, size: e.target.value })} />
                      <select className={`${inputCls} w-24`} value={variant.sizeType} onChange={(e) => setVariant({ ...variant, sizeType: e.target.value })}>
                        {SIZE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-[10px] uppercase tracking-widest text-safi-steel">auto</td>
                  <td className="px-2 py-2">
                    <input className={inputCls} placeholder="Scan barcode (optional)" value={variant.barcode} onChange={(e) => setVariant({ ...variant, barcode: e.target.value })} />
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-right">
                    <button
                      className={btnRed}
                      disabled={addVariant.isPending || !variant.color || !variant.size}
                      onClick={() =>
                        addVariant.mutate({
                          productId,
                          variant: {
                            color: variant.color.trim(),
                            size: variant.size.trim(),
                            sizeType: variant.sizeType,
                            barcode: variant.barcode.trim() || undefined,
                          },
                        })
                      }
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" /> Add variant
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ErrorNote error={addVariant.error || setStatus.error || remove.error} />
        </div>
      )}
    </div>
  );
}

/* ─────────────── Create form (from an unknown barcode) ─────────────── */
function CreateForm({ prefill, onCreated, onClose }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    nameEn: prefill.nameEn ?? '',
    audience: 'unisex',
    category: 'training',
    brand: '',
    basePrice: dollars(prefill.basePriceCents),
    color: prefill.color ?? '',
    size: prefill.size ?? '',
    sizeType: 'apparel',
  });
  const create = trpc.products.create.useMutation({
    onSuccess: (r) => {
      utils.products.list.invalidate();
      onCreated(r.id);
    },
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl font-extrabold uppercase italic text-safi-ice">New product</h3>
        <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-safi-steel hover:text-safi-ice" /></button>
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-safi-steel">
        Barcode <span className="font-mono text-safi-ice">{prefill.barcode}</span> is not in the shop yet
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Name (English)</label>
          <input className={inputCls} autoFocus value={form.nameEn} onChange={set('nameEn')} placeholder="e.g. Nike Air Zoom" />
        </div>
        <div>
          <label className={labelCls}>Audience</label>
          <select className={inputCls} value={form.audience} onChange={set('audience')}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={inputCls} value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Brand</label>
          <input className={inputCls} value={form.brand} onChange={set('brand')} />
        </div>
        <div>
          <label className={labelCls}>Price ($)</label>
          <input className={inputCls} inputMode="decimal" value={form.basePrice} onChange={set('basePrice')} />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input className={inputCls} value={form.color} onChange={set('color')} />
        </div>
        <div>
          <label className={labelCls}>Size</label>
          <div className="flex gap-1">
            <input className={inputCls} value={form.size} onChange={set('size')} />
            <select className={`${inputCls} w-24`} value={form.sizeType} onChange={set('sizeType')}>
              {SIZE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>
      <ErrorNote error={create.error} />
      <button
        className={`${btnRed} mt-4 w-full py-3`}
        disabled={create.isPending || form.nameEn.trim().length < 2 || !form.color || !form.size}
        onClick={() =>
          create.mutate({
            nameEn: form.nameEn.trim(),
            audience: form.audience,
            category: form.category,
            brand: form.brand || undefined,
            basePriceCents: centsOf(form.basePrice),
            variants: [
              {
                color: form.color.trim(),
                size: form.size.trim(),
                sizeType: form.sizeType,
                barcode: prefill.barcode,
              },
            ],
          })
        }
      >
        {create.isPending ? 'Creating…' : 'Create product (starts as draft)'}
      </button>
    </div>
  );
}

/* ─────────────── Page ─────────────── */
export default function AdminProducts() {
  const [scan, setScan] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const scanRef = useRef(null);

  const list = trpc.products.list.useQuery({ search: search || undefined, page: 1, pageSize: 50 });
  const scanOrCreate = trpc.products.scanOrCreate.useMutation({
    onSuccess: (r) => {
      if (r.found) {
        setEditId(r.product.id);
        setPrefill(null);
      } else {
        setPrefill(r.prefill);
        setEditId(null);
      }
      setScan('');
    },
  });

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const items = list.data?.items ?? [];
  const drawerOpen = editId != null || prefill != null;

  return (
    <div>
      <PageHeader title="Products" sub="Scan a barcode to edit or create" />

      {/* giant scan input — keyboard-wedge scanners type digits + Enter */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = scan.trim();
          if (code.length >= 3) scanOrCreate.mutate({ barcode: code });
        }}
        className="relative mb-5"
      >
        <Barcode className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-safi-red" />
        <input
          ref={scanRef}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          placeholder="Scan or type a barcode, then press Enter"
          inputMode="numeric"
          className="w-full rounded-sm border-2 border-safi-red/60 bg-safi-panel py-4 pl-14 pr-4 font-display text-xl font-bold tracking-wider text-safi-ice placeholder:text-safi-steel/50 focus:border-safi-red focus:outline-none"
        />
        {scanOrCreate.isPending && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-safi-steel" />}
      </form>
      <ErrorNote error={scanOrCreate.error} />

      <div className="relative mb-4 mt-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-safi-steel" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="…or search products by name or brand"
          className={`${inputCls} pl-9`}
        />
      </div>

      {list.isPending ? (
        <Loading label="Loading products…" />
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => { setEditId(p.id); setPrefill(null); }}
              className="flex w-full items-center justify-between rounded-sm border border-safi-line bg-safi-graphite/40 px-4 py-3 text-left hover:border-safi-steel"
            >
              <div>
                <p className="font-display text-base font-bold italic text-safi-ice">
                  {p.nameEn} {p.brand ? <span className="not-italic text-sm text-safi-steel">· {p.brand}</span> : null}
                </p>
                <p className="text-[11px] uppercase tracking-widest text-safi-steel">
                  {p.category} · {p.audience}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-lg font-extrabold italic">{money(p.basePriceCents)}</span>
                <span
                  className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    p.status === 'active'
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      : p.status === 'draft'
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                        : 'border-safi-line bg-safi-panel text-safi-steel'
                  }`}
                >
                  {p.status}
                </span>
              </div>
            </button>
          ))}
          {items.length === 0 && <p className="py-10 text-center text-sm text-safi-steel">No products match.</p>}
        </div>
      )}

      {/* editor drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-safi-black/70 backdrop-blur-sm" onClick={() => { setEditId(null); setPrefill(null); }}>
          <div
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-safi-line bg-safi-black p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {prefill ? (
              <CreateForm
                prefill={prefill}
                onClose={() => setPrefill(null)}
                onCreated={(id) => {
                  setPrefill(null);
                  setEditId(id);
                }}
              />
            ) : (
              <ProductEditor productId={editId} onClose={() => setEditId(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
