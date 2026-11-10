"use client";

import { tr } from "@/lib/i18n";
import { EXCEPTION_LABEL, type ExceptionType } from "@repo/shared";
import Link from "next/link";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { useMe } from "@/components/shell";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Segments, Severity, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

const RESOLVE_HINT: Partial<Record<ExceptionType, string>> = {
  missing_bill: "Resolving means the bill is back in the office.",
  paper_missing: "Resolving means the signed copy is back in the office.",
  cash_short: "Resolving confirms this person's cash for the day.",
  cash_over: "Resolving confirms this person's cash for the day.",
  cheque_missing: "Resolving means the cheque is now in your hand.",
};

export default function ProblemsPage() {
  const [view, setView] = useState<"open" | "all">("open");
  const { data, error, loading, reload } = useData(`/office/exceptions?status=${view}`);
  return (
    <main className="page wrap">
      <PageTitle title="Problems">{tr("Serious problems stop new bills being issued to that person until they are resolved.")}</PageTitle>
      <div style={{ maxWidth: 320 }}><Segments value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} /></div>
      <Loading error={error} loading={loading && !data} />
      {data?.items.length === 0 && <Empty>{tr("No open problems.")}</Empty>}
      <div className="stack">{data?.items.map((e: any) => <Problem key={e._id} item={e} reload={reload} />)}</div>
    </main>
  );
}

function Problem({ item: e, reload }: { item: any; reload: () => Promise<void> }) {
  const { staff } = useMe();
  const { act, busy } = useAct(reload);
  const [reason, setReason] = useState("");
  const [resolving, setResolving] = useState(false);
  return (
    <div className="card">
      <div className="row between"><strong>{tr(EXCEPTION_LABEL[e.type as ExceptionType])}</strong><span className="row"><Severity value={e.severity} /><Status value={e.status} /></span></div>
      <p>{tr(e.message)}</p>
      <div className="row small muted">
        {e.amountPaise != null && <Rs paise={e.amountPaise} />}
        <span>{e.date}</span>
        {e.billId && <Link href={`/office/bills/${e.billId._id}`}>{tr("Bill history")}</Link>}
      </div>
      {e.resolution && <p className="small">{tr("Resolved by ")}{e.resolvedBy?.name}: {e.resolution}</p>}
      {e.status === "open" && staff.role === "admin" && (
        <>
          {RESOLVE_HINT[e.type as ExceptionType] && <p className="small muted">{tr(RESOLVE_HINT[e.type as ExceptionType] ?? "")}</p>}
          {resolving ? (
            <>
              <Field label="What happened?"><input type="text" autoFocus value={reason} onChange={(ev) => setReason(ev.target.value)} /></Field>
              <div className="row">
                <Btn size="small" disabled={busy || reason.trim().length < 3} onClick={() => act(() => api(`/office/exceptions/${e._id}/resolve`, { body: { reason } }), "Resolved")}>{tr("Save")}</Btn>
                <Btn size="small" tone="ghost" onClick={() => setResolving(false)}>{tr("Cancel")}</Btn>
              </div>
            </>
          ) : (
            <div><Btn size="small" tone="ghost" onClick={() => setResolving(true)}>{tr("Resolve")}</Btn></div>
          )}
        </>
      )}
    </div>
  );
}
