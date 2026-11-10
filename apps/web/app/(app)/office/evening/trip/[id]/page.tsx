"use client";

import { tr } from "@/lib/i18n";
import { DELIVERY_RESULT_LABEL, EXCEPTION_LABEL, type DeliveryResult, type ExceptionType, rupeesToPaise } from "@repo/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Field, Loading, PageTitle, Rs, Severity, Stamp, Stat, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function TripCheck() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useData(`/office/evening/trips/${id}`);
  const { act, busy } = useAct(reload);
  const [cash, setCash] = useState("");
  const [paper, setPaper] = useState<string[]>([]);

  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  const { detail, driver, helper, vehicle, beat, trip, exceptions } = data;
  const km = trip.endOdometer - trip.startOdometer;

  return (
    <main className="page wrap phone">
      <Link href="/office/evening" className="small">{tr("Back to evening check")}</Link>
      <PageTitle title={`${driver.name} and ${helper.name}`}>
        <span className="mono">{vehicle.number}</span>, {beat.name}, {km}{tr(" km. ")}<Status value={trip.status} />
      </PageTitle>
      {!trip.godownCountedAt && <p className="small muted">{tr("The godown has not counted the returned goods yet.")}</p>}

      {detail.blind ? (
        <>
          <div className="card">
            <h2>{tr("1. Count the cash")}</h2>
            <Field label="Cash counted (₹)"><input type="number" inputMode="decimal" min="0" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
          </div>
          <div className="card">
            <h2>{tr("2. Tick each bill copy that is back")}</h2>
            {detail.bills.map((b: any) => (
              <label key={b._id} className="check">
                <input type="checkbox" checked={paper.includes(b._id)} onChange={(e) => setPaper((l) => (e.target.checked ? [...l, b._id] : l.filter((x) => x !== b._id)))} />
                <span style={{ flex: 1 }}><span className="mono">{b.billNo}</span> {b.shopName} <Stamp>{b.kind}</Stamp></span>
                <Rs paise={b.amountPaise} />
              </label>
            ))}
          </div>
          <Btn full disabled={busy || cash === ""} onClick={() => act(() => api(`/office/evening/trips/${id}/count`, { body: { cashCountedPaise: rupeesToPaise(Number(cash)), paperBackBillIds: paper } }), "Evening check saved")}>{tr("Save count and show result")}</Btn>
        </>
      ) : (
        <>
          <div className="card">
            <div className="grid3">
              <Stat label="Cash expected"><Rs paise={detail.expectedCashPaise} /></Stat>
              <Stat label="Cash counted"><Rs paise={detail.countedCashPaise} /></Stat>
              <Stat label="Difference"><span className={detail.countedCashPaise === detail.expectedCashPaise ? "ok-text" : "bad-text"}><Rs paise={Math.abs((detail.countedCashPaise ?? 0) - (detail.expectedCashPaise ?? 0))} /></span></Stat>
            </div>
          </div>
          {exceptions.length > 0 && (
            <div className="stack">
              <h2>{tr("Flags on this trip")}</h2>
              {exceptions.map((e: any) => (
                <div key={e._id} className="card">
                  <div className="row between"><strong>{tr(EXCEPTION_LABEL[e.type as ExceptionType])}</strong><span className="row"><Severity value={e.severity} /><Status value={e.status} /></span></div>
                  <p className="small">{tr(e.message)}</p>
                </div>
              ))}
              <Link className="btn ghost" href="/office/problems">{tr("Resolve in Problems")}</Link>
            </div>
          )}
          <div className="scroll">
            <table style={{ minWidth: 560 }}>
              <thead><tr><th>{tr("Bill")}</th><th>{tr("Shop")}</th><th>{tr("Result")}</th><th className="num">{tr("Cash")}</th><th>{tr("Copy back")}</th></tr></thead>
              <tbody>
                {detail.bills.map((b: any) => (
                  <tr key={b._id}>
                    <td className="mono"><Link href={`/office/bills/${b._id}`}>{b.billNo}</Link></td>
                    <td>{b.shopName}</td>
                    <td className="small">{tr(DELIVERY_RESULT_LABEL[b.result as DeliveryResult])}{b.reason && <div className="muted">{tr(b.reason)}</div>}</td>
                    <td className="num">{b.cashPaise > 0 && <Rs paise={b.cashPaise} />}</td>
                    <td>{b.paperBack ? <Stamp tone="ok">{tr("Received")}</Stamp> : <Stamp tone="bad">{tr("Missing")}</Stamp>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
