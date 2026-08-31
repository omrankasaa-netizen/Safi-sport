import React, { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { ErrorNote, Loading, PageHeader, btnRed, hhmm, inputCls, labelCls, timeAgo } from './ui';

function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-safi-line/50 px-4 py-3.5 last:border-0">
      <div className="min-w-48">
        <p className="text-sm font-semibold text-safi-ice">{label}</p>
        {hint && <p className="text-[11px] text-safi-steel">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Settings (SPEC §6) — owner only. */
export default function AdminSettings() {
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const grid = trpc.inventory.grid.useQuery({ page: 1, pageSize: 1 });
  const syncStatus = trpc.sync.status.useQuery();
  const syncConfig = trpc.sync.config.useQuery();

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const triggerSync = trpc.sync.triggerFullSync.useMutation({
    onSuccess: () => utils.sync.status.invalidate(),
  });

  const [fee, setFee] = useState('');
  const [wa, setWa] = useState('');
  const [ig, setIg] = useState('');
  const [testCode, setTestCode] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const s = settings.data;
    if (s) {
      setFee(String((s['delivery.feeCents'] ?? 0) / 100));
      setWa(s['store.whatsapp'] ?? '');
      setIg(s['store.instagram'] ?? '');
    }
  }, [settings.data]);

  const save = async (key, value) => {
    setSaved('');
    await setSetting.mutateAsync({ key, value });
    setSaved(key);
    setTimeout(() => setSaved(''), 2000);
  };

  const branches = grid.data?.branches ?? [];
  const s = settings.data;

  if (settings.isPending) return <Loading label="Loading settings…" />;

  return (
    <div>
      <PageHeader title="Settings" sub="Owner only — changes apply right away" />

      {/* branches */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Branches</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {branches.map((b) => (
          <div key={b.id} className="rounded-sm border border-safi-line bg-safi-graphite/40 p-4">
            <p className="font-display text-lg font-extrabold uppercase italic text-safi-ice">{b.nameEn}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-safi-steel">
              {b.address}
              {b.phone ? ` · ${b.phone}` : ''}
              {b.whatsapp ? ` · WhatsApp ${b.whatsapp}` : ''}
            </p>
            {b.mapsUrl && (
              <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-safi-red">
                Map →
              </a>
            )}
          </div>
        ))}
      </div>

      {/* store */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Store</p>
      <div className="mb-6 rounded-sm border border-safi-line bg-safi-graphite/40">
        <SettingRow label="Delivery fee ($)" hint="Flat fee on delivery orders; pickup is free">
          <div className="flex items-center gap-2">
            <input className={`${inputCls} w-24 text-right`} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            <button className={btnRed} disabled={setSetting.isPending} onClick={() => save('delivery.feeCents', Math.round(Number(fee || 0) * 100))}>
              {saved === 'delivery.feeCents' ? <Check className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="WhatsApp number" hint="Shown on the store and used for customer chat">
          <div className="flex items-center gap-2">
            <input className={`${inputCls} w-44`} value={wa} onChange={(e) => setWa(e.target.value)} />
            <button className={btnRed} disabled={setSetting.isPending} onClick={() => save('store.whatsapp', wa.trim())}>
              {saved === 'store.whatsapp' ? <Check className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Instagram link" hint="Full URL, shown in the footer">
          <div className="flex items-center gap-2">
            <input className={`${inputCls} w-44`} value={ig} onChange={(e) => setIg(e.target.value)} />
            <button className={btnRed} disabled={setSetting.isPending} onClick={() => save('store.instagram', ig.trim())}>
              {saved === 'store.instagram' ? <Check className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </SettingRow>
      </div>
      <ErrorNote error={setSetting.error} />

      {/* pixel */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Meta pixel & ads tracking</p>
      <div className="mb-6 rounded-sm border border-safi-line bg-safi-graphite/40">
        <SettingRow
          label="Tracking enabled"
          hint="Tracking is ON unless the customer declines on the cookie banner"
        >
          <button
            onClick={() => save('pixel.enabled', !s['pixel.enabled'])}
            className={`rounded-sm px-4 py-2 font-display text-sm font-bold uppercase italic tracking-wider ${
              s['pixel.enabled'] ? 'bg-emerald-500/20 text-emerald-300' : 'bg-safi-panel text-safi-steel'
            }`}
          >
            {s['pixel.enabled'] ? 'On' : 'Off'}
          </button>
        </SettingRow>
        <SettingRow label="Pixel ID" hint="Set in the server environment (SAFI_META_PIXEL_ID) — never shown here for safety">
          <span className="font-mono text-xs text-safi-steel">••••••••</span>
        </SettingRow>
        <SettingRow
          label="Test event code"
          hint="Paste from Meta Events Manager to see events live while testing (server env SAFI_META_TEST_EVENT_CODE)"
        >
          <input
            className={`${inputCls} w-44`}
            placeholder="TEST12345"
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            title="Stored server-side via env var; this field is a reminder"
          />
        </SettingRow>
      </div>

      {/* sync */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">RBMsoft stock sync</p>
      <div className="rounded-sm border border-safi-line bg-safi-graphite/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-safi-line/50 px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-safi-ice">
              Driver: <span className="font-mono">{syncStatus.data?.driver ?? '…'}</span>{' '}
              {syncStatus.data?.syncEnabled ? '(auto sync on)' : '(auto sync off)'}
            </p>
            {syncConfig.data && (
              <p className="mt-1 text-[11px] text-safi-steel">
                {syncConfig.data.baseUrl || 'no base URL'} · key {syncConfig.data.apiKey || 'not set'} · webhook secret{' '}
                {syncConfig.data.webhookSecret || 'not set'}
              </p>
            )}
          </div>
          <button className={btnRed} disabled={triggerSync.isPending} onClick={() => triggerSync.mutate()}>
            <RefreshCw className={`mr-1 inline h-4 w-4 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
            {triggerSync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {triggerSync.data && (
          <p className={`px-4 py-2 text-xs ${triggerSync.data.ok ? 'text-emerald-300' : 'text-safi-red'}`}>
            Last manual sync: {triggerSync.data.status}
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-safi-line text-left text-[10px] uppercase tracking-[0.2em] text-safi-steel">
              <th className="px-4 py-2">When</th>
              <th className="px-2 py-2">Mode</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-right">Items</th>
              <th className="px-4 py-2 text-right">Stock rows</th>
            </tr>
          </thead>
          <tbody>
            {(syncStatus.data?.runs ?? []).map((r) => (
              <tr key={r.id} className="border-b border-safi-line/50 last:border-0">
                <td className="px-4 py-2 text-safi-ice">
                  {timeAgo(r.startedAt)} {r.finishedAt ? <span className="text-safi-steel">· done {hhmm(r.finishedAt)}</span> : null}
                </td>
                <td className="px-2 py-2 text-safi-steel">{r.mode}</td>
                <td className={`px-2 py-2 font-bold ${r.status === 'ok' ? 'text-emerald-300' : r.status === 'error' ? 'text-safi-red' : 'text-amber-300'}`}>
                  {r.status}
                </td>
                <td className="px-2 py-2 text-right text-safi-ice">{r.itemsUpserted}</td>
                <td className="px-4 py-2 text-right text-safi-ice">{r.stocksUpdated}</td>
              </tr>
            ))}
            {(syncStatus.data?.runs ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-safi-steel">No sync runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ErrorNote error={triggerSync.error} />
    </div>
  );
}
