import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/lib/AuthContext';
import { Loading, PageHeader, money } from './ui';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** Reports (SPEC §6): manager+. Financials card is owner-only. */
export default function AdminReports() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [days, setDays] = useState(30);

  const byDay = trpc.reports.salesByDay.useQuery({ days });
  const best = trpc.reports.bestSellers.useQuery({ days, limit: 10 });
  const returns = trpc.reports.returnsRate.useQuery({ days });
  const cod = trpc.reports.codOutstanding.useQuery();
  const financials = trpc.reports.financials.useQuery({ days }, { enabled: isOwner, retry: false });

  const chart = (byDay.data ?? []).map((r) => ({ day: String(r.day).slice(5), sales: Number(r.totalCents) / 100 }));

  return (
    <div>
      <PageHeader
        title="Reports"
        sub="Money talk, kept simple"
        right={
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
                  days === r.days ? 'border-safi-red bg-safi-red/15 text-safi-red' : 'border-safi-line text-safi-steel'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-sm border border-safi-line bg-safi-graphite/50 p-4">
          <p className="font-display text-3xl font-extrabold italic text-safi-ice">
            {money((byDay.data ?? []).reduce((a, r) => a + Number(r.totalCents), 0))}
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">Sales in {days} days</p>
        </div>
        <div className="rounded-sm border border-amber-400/40 bg-amber-400/5 p-4">
          <p className="font-display text-3xl font-extrabold italic text-safi-ice">{money(cod.data?.totalCents ?? 0)}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">
            Cash to collect (COD) · {cod.data?.ordersCount ?? 0} orders
          </p>
        </div>
        <div className="rounded-sm border border-safi-line bg-safi-graphite/50 p-4">
          <p className="font-display text-3xl font-extrabold italic text-safi-ice">
            {((returns.data?.rate ?? 0) * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">
            Returns rate ({returns.data?.returned ?? 0} of {returns.data?.completed ?? 0})
          </p>
        </div>
        {isOwner && financials.data && (
          <div className="rounded-sm border border-safi-red/50 bg-safi-red/10 p-4">
            <p className="font-display text-3xl font-extrabold italic text-safi-ice">
              {money(financials.data.averageOrderValueCents)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-safi-steel">
              Average order · fees {money(financials.data.deliveryFeesCents)} · returned {money(financials.data.returnedValueCents)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-sm border border-safi-line bg-safi-graphite/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">Sales by day ($)</p>
        {byDay.isPending ? (
          <Loading label="Loading chart…" />
        ) : chart.length === 0 ? (
          <p className="py-10 text-center text-sm text-safi-steel">No sales in this range yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="#26272D" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#9BA0AA', fontSize: 10 }} stroke="#26272D" />
                <YAxis tick={{ fill: '#9BA0AA', fontSize: 10 }} stroke="#26272D" width={40} />
                <Tooltip
                  contentStyle={{ background: '#141519', border: '1px solid #26272D', borderRadius: 2 }}
                  labelStyle={{ color: '#9BA0AA', fontSize: 11 }}
                  itemStyle={{ color: '#F4F5F7' }}
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Sales']}
                />
                <Bar dataKey="sales" fill="#E1261C" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-sm border border-safi-line">
        <p className="border-b border-safi-line bg-safi-graphite/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-safi-steel">
          Best sellers — last {days} days
        </p>
        {best.isPending ? (
          <Loading />
        ) : (best.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-safi-steel">No sales in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {best.data.map((b, i) => (
                <tr key={`${b.variantId}-${i}`} className="border-b border-safi-line/50 last:border-0">
                  <td className="px-4 py-2.5 font-display text-lg font-extrabold italic text-safi-steel">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <p className="font-display text-sm font-bold uppercase italic text-safi-ice">{b.productName}</p>
                    <p className="text-[10px] text-safi-steel">{b.color} · Size {b.size}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-safi-ice">{b.qty} sold</td>
                  <td className="px-4 py-2.5 text-right font-display text-base font-extrabold italic text-safi-ice">
                    {money(b.revenueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
