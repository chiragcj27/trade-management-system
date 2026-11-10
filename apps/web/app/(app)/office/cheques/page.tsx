"use client";

import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { useMe } from "@/components/shell";
import { Btn, Loading, PageTitle, Rs, Stamp, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function ChequesPage() {
  const { data, error, loading, reload } = useData("/office/cheques");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Cheque diary">{tr("Filled automatically from collection. Post-dated cheques cannot be deposited before their date.")}</PageTitle>
      <div className="scroll">
        <table style={{ minWidth: 860 }}>
          <thead><tr><th>{tr("Date on cheque")}</th><th>{tr("Party")}</th><th>{tr("Bills")}</th><th>{tr("Cheque")}</th><th className="num">{tr("Amount")}</th><th>{tr("Status")}</th><th></th></tr></thead>
          <tbody>{data.items.map((c: any) => <Row key={c._id} cheque={c} today={data.today} reload={reload} />)}</tbody>
        </table>
      </div>
    </main>
  );
}

function Row({ cheque: c, today, reload }: { cheque: any; today: string; reload: () => Promise<void> }) {
  const { staff } = useMe();
  const { act, busy } = useAct(reload);
  const [bouncing, setBouncing] = useState(false);
  const [reason, setReason] = useState("");
  const setStatus = (status: string, extra: object = {}) => act(() => api(`/office/cheques/${c._id}/status`, { body: { status, ...extra } }), `Cheque ${status}`);
  const future = c.chequeDate > today;
  const held = c.status === "confirmed";
  return (
    <tr>
      <td className="mono">{c.chequeDate}{future && <div><Stamp tone="info">{tr("Post-dated")}</Stamp></div>}</td>
      <td>{c.shopId.name}<div className="small muted">{c.staffId.name}</div></td>
      <td className="mono small">{c.allocations.map((a: any) => a.billId?.billNo).join(", ")}</td>
      <td><span className="mono">{c.chequeNo}</span><div className="small muted">{c.chequeBank}</div></td>
      <td className="num"><Rs paise={c.amountPaise} /></td>
      <td>{c.status === "claimed" ? <Stamp tone="warn">{tr("With collector")}</Stamp> : <Status value={c.chequeStatus} />}{c.statusReason && <div className="small muted">{tr(c.statusReason)}</div>}</td>
      <td>
        {staff.role === "admin" && held && (
          <div className="row" style={{ gap: 6 }}>
            {c.chequeStatus === "received" && !future && <Btn size="small" disabled={busy} onClick={() => setStatus("deposited")}>{tr("Deposited")}</Btn>}
            {c.chequeStatus === "deposited" && <Btn size="small" disabled={busy} onClick={() => setStatus("cleared")}>{tr("Cleared")}</Btn>}
            {c.chequeStatus === "deposited" && !bouncing && <Btn size="small" tone="danger" onClick={() => setBouncing(true)}>{tr("Bounced")}</Btn>}
            {bouncing && (
              <>
                <input aria-label={tr("Why it bounced")} type="text" placeholder={tr("Why it bounced")} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Btn size="small" tone="danger" disabled={busy || !reason.trim()} onClick={() => setStatus("bounced", { reason })}>{tr("Confirm")}</Btn>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
