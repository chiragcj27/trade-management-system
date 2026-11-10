"use client";

import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Status } from "@/components/ui";
import { api, dateTimeOf, useData } from "@/lib/api";

export default function UpiPage() {
  const { data, error, loading, reload } = useData("/office/upi");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  const waiting = data.items.filter((p: any) => p.status === "claimed");
  const others = data.items.filter((p: any) => p.status !== "claimed");
  return (
    <main className="page wrap">
      <PageTitle title="UPI collections">{tr("Every QR made by the team is recorded here. Confirm a payment only after finding it in the firm's bank account.")}</PageTitle>
      <div className="stack">
        <h2>{tr("To match with bank")}</h2>
        {waiting.length === 0 && <Empty>{tr("Nothing is waiting.")}</Empty>}
        {waiting.map((p: any) => <Waiting key={p._id} payment={p} reload={reload} />)}
      </div>
      <div className="stack">
        <h2>{tr("All QR records")}</h2>
        <div className="scroll">
          <table style={{ minWidth: 720 }}>
            <thead><tr><th>{tr("QR")}</th><th>{tr("Shop")}</th><th>{tr("Staff")}</th><th>{tr("Bills")}</th><th className="num">{tr("Amount")}</th><th>{tr("Status")}</th></tr></thead>
            <tbody>
              {others.map((p: any) => (
                <tr key={p._id}>
                  <td className="mono">{p.qrRef}</td>
                  <td>{p.shopId.name}</td>
                  <td>{p.staffId.name}</td>
                  <td className="mono small">{p.allocations.map((a: any) => a.billId?.billNo).join(", ")}</td>
                  <td className="num"><Rs paise={p.amountPaise} /></td>
                  <td><Status value={p.status} />{p.statusReason && <div className="small muted">{tr(p.statusReason)}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Waiting({ payment, reload }: { payment: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [reason, setReason] = useState("");
  return (
    <div className="card">
      <div className="row between"><strong>{payment.shopId.name}</strong><Rs paise={payment.amountPaise} /></div>
      <p className="small muted">
        {payment.staffId.name}, {dateTimeOf(payment.createdAt)}{tr(". QR ")}<span className="mono">{payment.qrRef}</span>{tr(". Bank reference ")}<span className="mono">{payment.upiTransactionRef}</span>{tr(". Bills ")}<span className="mono">{payment.allocations.map((a: any) => a.billId?.billNo).join(", ")}</span>
      </p>
      <Field label="Reason, if not found in bank"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="row">
        <Btn disabled={busy} onClick={() => act(() => api(`/office/payments/${payment._id}/match`, { body: {} }), "Confirmed")}>{tr("Found in bank")}</Btn>
        <Btn tone="danger" disabled={busy || reason.trim().length < 3} onClick={() => act(() => api(`/office/payments/${payment._id}/reject`, { body: { reason } }), "Rejected and the bill reopened")}>{tr("Not found")}</Btn>
      </div>
    </div>
  );
}
