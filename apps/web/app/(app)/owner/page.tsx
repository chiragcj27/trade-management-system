"use client";

import { tr } from "@/lib/i18n";
import { EXCEPTION_LABEL, type ExceptionType } from "@repo/shared";
import Link from "next/link";
import { LiveBoard } from "@/components/board";
import { Loading, PageTitle, Rs, Severity, Stat } from "@/components/ui";
import { dateTimeOf, useData } from "@/lib/api";

export default function OwnerPage() {
  const { data, error, loading } = useData("/owner/summary");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  const { collected, exceptions, overrides, board, fuel } = data;
  const rows: [string, { unconfirmed: number; confirmed: number }][] = [["Cash", collected.cash], ["Cheque", collected.cheque], ["UPI", collected.upi]];

  return (
    <main className="page wrap">
      <PageTitle title="Today's summary">{tr("Money stays unconfirmed until the office has counted it or found it in the bank.")}</PageTitle>

      <div className="grid4">
        <div className="card"><Stat label="Money at risk"><span className={data.moneyAtRiskPaise > 0 ? "bad-text" : ""}><Rs paise={data.moneyAtRiskPaise} /></span></Stat></div>
        <div className="card"><Stat label="Open problems">{exceptions.length}</Stat></div>
        <div className="card"><Stat label="Total outstanding"><Rs paise={data.outstandingPaise} /></Stat></div>
        <div className="card"><Stat label="Fuel today"><Rs paise={fuel.paise} /></Stat>{fuel.lowMileage > 0 && <span className="small bad-text">{fuel.lowMileage}{tr(" low mileage")}</span>}</div>
      </div>

      <div className="scroll">
        <table>
          <thead><tr><th>{tr("Collected today")}</th><th className="num">{tr("Unconfirmed")}</th><th className="num">{tr("Confirmed")}</th></tr></thead>
          <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num"><Rs paise={v.unconfirmed} /></td><td className="num"><Rs paise={v.confirmed} /></td></tr>)}</tbody>
        </table>
      </div>

      <LiveBoard board={board} />

      <div className="stack">
        <h2>{tr("Open problems")}</h2>
        {exceptions.map((e: any) => (
          <div key={e._id} className="card">
            <div className="row between"><strong>{tr(EXCEPTION_LABEL[e.type as ExceptionType])}</strong><Severity value={e.severity} /></div>
            <p className="small">{tr(e.message)}</p>
            <div className="row small muted">
              {e.amountPaise != null && <Rs paise={e.amountPaise} />}
              <span>{e.date}</span>
              {e.billId && <Link href={`/office/bills/${e.billId._id}`}>{tr("Bill history")}</Link>}
            </div>
          </div>
        ))}
      </div>

      <div className="stack">
        <h2>{tr("Admin overrides")}</h2>
        {overrides.map((o: any) => (
          <div key={o._id} className="card">
            <p>{tr(o.message)}</p>
            <p className="small muted">{tr("Reason: ")}{o.resolution}. {o.resolvedBy?.name}, {dateTimeOf(o.resolvedAt ?? o.createdAt)}</p>
          </div>
        ))}
      </div>

      <div className="row">
        <Link className="btn ghost" href="/office/bills">{tr("Search bills")}</Link>
        <Link className="btn ghost" href="/office/cheques">{tr("Cheque diary")}</Link>
        <Link className="btn ghost" href="/office/fuel">{tr("Fuel")}</Link>
      </div>
    </main>
  );
}
