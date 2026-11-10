"use client";

import { tr } from "@/lib/i18n";
import { EXCEPTION_LABEL, OUTCOME_LABEL, PAYMENT_MODE_LABEL, type BillOutcome, type ExceptionType, rupeesToPaise } from "@repo/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Field, Loading, PageTitle, Rs, Severity, Stamp, Stat, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function RunCheck() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useData(`/office/evening/runs/${id}`);
  const { act, busy } = useAct(reload);
  const [cash, setCash] = useState("");
  const [paper, setPaper] = useState<string[]>([]);
  const [cheques, setCheques] = useState<string[]>([]);
  const [nextReceipt, setNextReceipt] = useState("");

  useEffect(() => {
    if (data?.detail.blind) {
      setPaper([]);
      setCheques([]);
    }
  }, [data?.detail.blind]);

  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  const { detail, staff, beat, run, exceptions } = data;
  const toggle = (set: typeof setPaper, value: string, on: boolean) => set((list) => (on ? [...list, value] : list.filter((x) => x !== value)));
  const physical = detail.bills.filter((b: any) => !b.notReceived);

  return (
    <main className="page wrap phone">
      <Link href="/office/evening" className="small">{tr("Back to evening check")}</Link>
      <PageTitle title={staff.name}>{beat.name}, {run.date}. <Status value={run.status} /></PageTitle>

      {detail.blind ? (
        <>
          <div className="card">
            <h2>{tr("1. Count the cash")}</h2>
            <Field label="Cash counted (₹)"><input type="number" inputMode="decimal" min="0" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
          </div>
          <div className="card">
            <h2>{tr("2. Tick each original bill that is physically back")}</h2>
            {physical.map((b: any) => (
              <label key={b._id} className="check">
                <input type="checkbox" checked={paper.includes(b._id)} onChange={(e) => toggle(setPaper, b._id, e.target.checked)} />
                <span style={{ flex: 1 }}><span className="mono">{b.billNo}</span> {b.shopName}</span>
                <Rs paise={b.amountPaise} />
              </label>
            ))}
          </div>
          {detail.cheques.length > 0 && (
            <div className="card">
              <h2>{tr("3. Tick each cheque in your hand")}</h2>
              {detail.cheques.map((c: any) => (
                <label key={c._id} className="check">
                  <input type="checkbox" checked={cheques.includes(c._id)} onChange={(e) => toggle(setCheques, c._id, e.target.checked)} />
                  <span style={{ flex: 1 }}><span className="mono">{c.chequeNo}</span> {c.chequeBank}{tr(", dated ")}{c.chequeDate}</span>
                  <Rs paise={c.amountPaise} />
                </label>
              ))}
            </div>
          )}
          {detail.receiptBook && (
            <div className="card">
              <h2>{tr("4. Check the receipt book")}</h2>
              <Field label={`Next unused page in book ${detail.receiptBook.fromSerial} to ${detail.receiptBook.toSerial}`}>
                <input type="number" inputMode="numeric" value={nextReceipt} onChange={(e) => setNextReceipt(e.target.value)} />
              </Field>
            </div>
          )}
          <Btn full disabled={busy || cash === ""} onClick={() => act(() => api(`/office/evening/runs/${id}/count`, { body: { cashCountedPaise: rupeesToPaise(Number(cash)), paperBackBillIds: paper, chequesInHandIds: cheques, ...(nextReceipt ? { nextUnusedReceipt: Number(nextReceipt) } : {}) } }), "Evening check saved")}>{tr("Save count and show result")}</Btn>
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
              <h2>{tr("Flags on this beat")}</h2>
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
              <thead><tr><th>{tr("Bill")}</th><th>{tr("Shop")}</th><th className="num">{tr("Amount")}</th><th>{tr("Recorded in market")}</th><th>{tr("Paper back")}</th></tr></thead>
              <tbody>
                {detail.bills.map((b: any) => (
                  <tr key={b._id}>
                    <td className="mono"><Link href={`/office/bills/${b._id}`}>{b.billNo}</Link></td>
                    <td>{b.shopName}</td>
                    <td className="num"><Rs paise={b.amountPaise} /></td>
                    <td className="small">
                      {b.outcome ? tr(OUTCOME_LABEL[b.outcome as BillOutcome]) : tr("No result")}
                      {b.promiseDate && tr(`, ${b.promiseDate}`)}
                      {b.payments?.map((p: any, i: number) => <div key={i} className="muted">{tr(PAYMENT_MODE_LABEL[p.mode] ?? p.mode)} <Rs paise={p.amountPaise} />{p.chequeNo && tr(` #${p.chequeNo}`)}</div>)}
                    </td>
                    <td>{b.notReceived ? <Stamp>{tr("Never issued")}</Stamp> : b.paperBack ? <Stamp tone="ok">{tr("Received")}</Stamp> : <Stamp tone="bad">{tr("Missing")}</Stamp>}</td>
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
