"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchReceipts,
  fetchOrgCountryMap,
  computeKpis,
  computeTimeSeries,
  computeTopDonors,
  computePerOrg,
  computeRecentTransactions,
  type FundingReceipt,
} from "../_lib/dashboard";
import { DonationsChart } from "./DonationsChart";
import { BUMICERTS_URL, accountHref, bumicertHref } from "../_lib/urls";
import {
  formatUsd,
  formatNumber,
  formatDate,
  shortDid,
  shortWallet,
} from "../_lib/format";

type Period = "all" | "month" | "week";

// Donations dashboard — a faithful port of the bumicerts marketplace
// dashboard (certs.gainforest.app/en/dashboard). All funding receipts are
// fetched once from the facilitator repo in the browser, then aggregated with
// the same logic the live app uses. Re-skinned in the gainforest.earth
// editorial system (cream surface, serif numerals, sage accents).

export function Dashboard() {
  const [receipts, setReceipts] = useState<FundingReceipt[] | null>(null);
  const [orgCountry, setOrgCountry] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    Promise.all([
      fetchReceipts(controller.signal),
      fetchOrgCountryMap(controller.signal),
    ])
      .then(([r, m]) => {
        if (cancelled) return;
        setReceipts(r);
        setOrgCountry(m);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const periodFiltered = useMemo(() => {
    if (!receipts) return [];
    if (period === "all") return receipts;
    const ms = period === "week" ? 7 * 86_400_000 : 30 * 86_400_000;
    const cutoff = Date.now() - ms;
    return receipts.filter((r) => {
      if (!r.occurredAt) return false;
      const t = new Date(r.occurredAt).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [receipts, period]);

  const kpis = useMemo(
    () => computeKpis(periodFiltered, orgCountry),
    [periodFiltered, orgCountry],
  );
  const timeSeries = useMemo(() => computeTimeSeries(periodFiltered), [periodFiltered]);
  const topDonors = useMemo(() => computeTopDonors(periodFiltered, 15), [periodFiltered]);
  const perOrg = useMemo(() => computePerOrg(periodFiltered), [periodFiltered]);
  const recentTx = useMemo(
    () => computeRecentTransactions(receipts ?? [], 30),
    [receipts],
  );

  const loading = receipts === null && !error;

  return (
    <section id="dashboard" className="scroll-mt-20 bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        {/* Header */}
        <div className="flex flex-col gap-6 border-b border-ink-border pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-ink-muted">
              Platform analytics
            </span>
            <h2 className="mt-3 font-garamond text-[34px] font-normal leading-[1.05] tracking-[-0.015em] text-ink-foreground sm:text-[42px] lg:text-[50px]">
              Donations <span className="font-instrument italic">dashboard</span>
            </h2>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-ink-foreground/70 lg:text-[16px]">
              Every on-chain donation recorded as an{" "}
              <span className="font-mono text-[13px] text-ink-foreground/85">
                org.hypercerts.funding.receipt
              </span>{" "}
              and indexed live; the same figures shown on the Bumicerts
              marketplace, recomputed here from the facilitator repo.
            </p>
          </div>
          <PeriodTabs period={period} onChange={setPeriod} />
        </div>

        {error ? (
          <DashError />
        ) : loading ? (
          <DashSkeleton />
        ) : (
          <div className="mt-10 flex flex-col gap-12">
            {/* KPIs */}
            <ul role="list" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-border bg-ink-border md:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Total raised" value={formatUsd(kpis.totalRaised)} sub="USD donations" />
              <Kpi label="Donations" value={formatNumber(kpis.totalDonations)} sub="Receipts" />
              <Kpi label="Unique donors" value={formatNumber(kpis.uniqueDonors)} sub="By DID or wallet" />
              <Kpi label="Avg donation" value={formatUsd(kpis.avgDonation)} sub="Per transaction" />
              <Kpi label="Active Bumicerts" value={formatNumber(kpis.activeBumicerts)} sub="Funded projects" />
              <Kpi label="Countries" value={formatNumber(kpis.countries)} sub="Geographic reach" />
            </ul>

            {/* Chart (rendered on a light surface for legibility) */}
            <div>
              <h3 className="mb-3 font-garamond text-[20px] text-ink-foreground">
                Donation volume over time
              </h3>
              <DonationsChart data={timeSeries} />
            </div>

            {/* Top donors + orgs */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel title="Top donors" caption={`${topDonors.length} shown`}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="py-2 pr-2 font-medium">#</th>
                      <th className="py-2 pr-2 font-medium">Donor</th>
                      <th className="py-2 pr-2 text-right font-medium">Total</th>
                      <th className="py-2 text-right font-medium">Gifts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDonors.map((d) => (
                      <tr key={d.id} className="border-t border-ink-border/70">
                        <td className="py-2 pr-2 tabular-nums text-ink-muted">{d.rank}</td>
                        <td className="py-2 pr-2">
                          <DonorCell id={d.id} type={d.type} />
                        </td>
                        <td className="py-2 pr-2 text-right font-mono tabular-nums text-ink-foreground">
                          {formatUsd(d.total)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-foreground/70">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              <Panel title="By organization" caption={`${perOrg.length} funded`}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="py-2 pr-2 font-medium">Organization</th>
                      <th className="py-2 pr-2 text-right font-medium">Raised</th>
                      <th className="py-2 pr-2 text-right font-medium">Certs</th>
                      <th className="py-2 text-right font-medium">Donors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perOrg.map((o) => (
                      <tr key={o.orgDid} className="border-t border-ink-border/70">
                        <td className="py-2 pr-2">
                          <Link
                            href={accountHref(o.orgDid)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-ink-foreground/85 underline-offset-2 hover:text-brand hover:underline"
                          >
                            {shortDid(o.orgDid)}
                          </Link>
                        </td>
                        <td className="py-2 pr-2 text-right font-mono tabular-nums text-ink-foreground">
                          {formatUsd(o.total)}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-ink-foreground/70">{o.bumicerts}</td>
                        <td className="py-2 text-right tabular-nums text-ink-foreground/70">{o.donors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            {/* Recent transactions */}
            <Panel title="Recent transactions" caption="Latest 30 donations · all time">
              <div className="thin-scroll overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Donor</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Bumicert</th>
                      <th className="py-2 font-medium">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTx.map((t) => (
                      <tr key={t.uri} className="border-t border-ink-border/70">
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-foreground/70">
                          {t.date ? formatDate(t.date) : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {t.donor ? <DonorCell id={t.donor.id} type={t.donor.type} /> : <span className="text-ink-muted">Unknown</span>}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums text-ink-foreground">
                          {formatUsd(t.amount)}
                        </td>
                        <td className="py-2 pr-3">
                          {t.bumicertDid && t.bumicertRkey ? (
                            <Link
                              href={bumicertHref(t.bumicertDid, t.bumicertRkey)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-brand/90 underline-offset-2 hover:text-brand hover:underline"
                            >
                              {t.bumicertRkey.slice(-7)}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                        <td className="py-2">
                          {t.txUrl ? (
                            <Link
                              href={t.txUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-ink-foreground/60 underline-offset-2 hover:text-brand hover:underline"
                            >
                              {t.txHash ? `${t.txHash.slice(0, 6)}…${t.txHash.slice(-4)}` : "view"}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="flex justify-center">
              <Link
                href={`${BUMICERTS_URL}/en/dashboard`}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-foreground/70 transition-colors hover:text-brand"
              >
                Open the full dashboard on Bumicerts
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">↗</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────

function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const opts: Array<{ id: Period; label: string }> = [
    { id: "all", label: "All time" },
    { id: "month", label: "30 days" },
    { id: "week", label: "7 days" },
  ];
  return (
    <div className="inline-flex rounded-full border border-ink-border bg-ink p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={period === o.id}
          className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
            period === o.id
              ? "bg-ink-foreground text-ink"
              : "text-ink-foreground/65 hover:text-ink-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <li className="bg-ink p-4 lg:p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{label}</div>
      <div className="mt-1.5 font-garamond text-[26px] leading-none text-ink-foreground lg:text-[32px]">
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-ink-foreground/45">{sub}</div>
    </li>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-foreground/[0.03] p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-garamond text-[20px] text-ink-foreground">{title}</h3>
        {caption && <span className="text-[12px] text-ink-muted">{caption}</span>}
      </div>
      {children}
    </div>
  );
}

function DonorCell({ id, type }: { id: string; type: "did" | "wallet" }) {
  const label = type === "wallet" ? shortWallet(id) : shortDid(id);
  if (type === "did") {
    return (
      <Link
        href={accountHref(id)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-ink-foreground/85 underline-offset-2 hover:text-brand hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="font-mono text-ink-foreground/70">{label}</span>;
}

function DashSkeleton() {
  return (
    <div className="mt-10 flex flex-col gap-10" aria-hidden>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-border bg-ink-border md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-ink p-5">
            <div className="h-3 w-16 rounded bg-ink-foreground/10" />
            <div className="mt-3 h-7 w-20 rounded bg-ink-foreground/[0.08]" />
          </div>
        ))}
      </div>
      <div className="h-[240px] rounded-2xl border border-ink-border bg-ink-foreground/[0.03]" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="h-[320px] rounded-2xl border border-ink-border bg-ink-foreground/[0.03]" />
        <div className="h-[320px] rounded-2xl border border-ink-border bg-ink-foreground/[0.03]" />
      </div>
    </div>
  );
}

function DashError() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-border px-6 py-16 text-center">
      <div className="font-garamond text-[22px] text-ink-foreground">
        Donation data is unavailable
      </div>
      <p className="mt-2 max-w-[420px] text-[14px] leading-[1.5] text-ink-foreground/60">
        The indexer did not return funding receipts. View the live figures on
        the Bumicerts dashboard instead.
      </p>
      <Link
        href={`${BUMICERTS_URL}/en/dashboard`}
        target="_blank"
        rel="noreferrer"
        className="mt-5 rounded-full bg-ink-foreground px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
      >
        Open Bumicerts dashboard ↗
      </Link>
    </div>
  );
}
