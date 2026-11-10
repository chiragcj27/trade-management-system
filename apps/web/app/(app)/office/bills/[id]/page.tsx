"use client";

import { tr } from "@/lib/i18n";
import { BILL_STAGE_LABEL, PAYMENT_MODE_LABEL, type BillStage } from "@repo/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/shell";
import { Btn, Loading, PageTitle, Rs, Stamp, Stat, Status } from "@/components/ui";
import { api, dateTimeOf, useData } from "@/lib/api";

export default function BillTrail() {
  const { id } = useParams<{ id: string }>();
  const { staff } = useMe();
  const { data, error, loading } = useData(`/office/bills/${id}`);
  const [statement, setStatement] = useState<any>(null);
  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  const { bill, events, payments, adjustments } = data;
  const phone = String(bill.shopId.phone ?? "").replace(/\D/g, "");

  return (
    <main className="page wrap phone">
      <Link href="/office/bills" className="small">{tr("All bills")}</Link>
      <PageTitle title={bill.billNo}>{bill.shopId.name}, {bill.beatId.name}{tr(". Dated ")}{bill.billDate}.</PageTitle>
      <div className="card">
        <div className="row between">
          <Stamp tone={bill.stage === "closed" ? "ok" : "info"}>{tr(BILL_STAGE_LABEL[bill.stage as BillStage])}</Stamp>
          <span className="small">{tr("Held by ")}<strong>{tr(bill.holderLabel)}</strong></span>
        </div>
        <div className="grid2">
          <Stat label="Bill amount"><Rs paise={bill.amountPaise} /></Stat>
          <Stat label="Confirmed paid"><Rs paise={bill.confirmedPaise} /></Stat>
          <Stat label="Unconfirmed"><Rs paise={bill.claimedPaise} /></Stat>
          <Stat label="Still pending"><Rs paise={bill.openPaise} /></Stat>
        </div>
        {bill.signedPhotoId && <a href={`/api/photos/${bill.signedPhotoId}`} target="_blank" rel="noreferrer"><img className="thumb" src={`/api/photos/${bill.signedPhotoId}`} alt={tr("Signed copy")} /></a>}
      </div>

      {staff.role === "admin" && (
        <div className="stack">
          <div><Btn tone="ghost" onClick={async () => setStatement(await api(`/office/shops/${bill.shopId._id}/statement`))}>{tr("Prepare shop statement")}</Btn></div>
          {statement && (
            <div className="card">
              <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--font-body)" }}>{statement.text}</pre>
              {phone && <a className="btn ghost small-btn" target="_blank" rel="noreferrer" href={`https://wa.me/91${phone}?text=${encodeURIComponent(statement.text)}`}>{tr("Send on WhatsApp")}</a>}
            </div>
          )}
        </div>
      )}

      {payments.length > 0 && (
        <div className="stack">
          <h2>{tr("Payments")}</h2>
          {payments.map((p: any) => (
            <div key={p._id} className="card row between">
              <span>{tr(PAYMENT_MODE_LABEL[p.mode] ?? p.mode)} <Rs paise={p.allocations.find((a: any) => a.billId === bill._id)?.amountPaise} /><br /><span className="small muted">{p.staffId.name}, {p.date}{p.receiptNo && tr(`, receipt ${p.receiptNo}`)}{p.chequeNo && tr(`, cheque ${p.chequeNo}`)}</span></span>
              <Status value={p.status} />
            </div>
          ))}
        </div>
      )}

      {adjustments.length > 0 && (
        <div className="stack">
          <h2>{tr("Discounts and returns")}</h2>
          {adjustments.map((a: any) => <div key={a._id} className="card row between"><span>{a.kind === "cash_discount" ? tr("Cash discount") : tr("Goods return")} <Rs paise={a.amountPaise} /></span><Status value={a.status} /></div>)}
        </div>
      )}

      <div className="stack">
        <h2>{tr("Full history")}</h2>
        <p className="small muted">{tr("Entries cannot be edited or deleted.")}</p>
        <div className="card">
          <ul className="trail">
            {events.map((e: any) => (
              <li key={e._id}>
                <span className="small muted">{dateTimeOf(e.at)}</span>
                <span>{tr(e.summary)}<br /><span className="small muted">{e.actorName}{e.reason && `. ${tr(e.reason)}`}{e.gps?.lat && tr(", GPS saved")}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
