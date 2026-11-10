"use client";

import { tr } from "@/lib/i18n";
import { EXCEPTION_LABEL, ROLE_LABEL, type ExceptionType, type Role } from "@repo/shared";
import { useEffect, useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Field, Loading, PageTitle, Rs, Stamp, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function IssuePage() {
  const { data, error, loading, reload } = useData("/office/issue");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Issue bills">{tr("This replaces the date-wise diary. The collector accepts these on the phone before starting.")}</PageTitle>
      <div className="stack">{data.rows.map((row: any) => <IssueRow key={row.runId} row={row} reload={reload} />)}</div>
    </main>
  );
}

function IssueRow({ row, reload }: { row: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [selected, setSelected] = useState<string[]>([]);
  const [override, setOverride] = useState("");
  useEffect(() => setSelected(row.bills.map((b: any) => b._id)), [row.bills]);
  const blocked = row.blockers.length > 0;
  return (
    <div className={`card ${blocked && row.status === "planned" ? "alert" : ""}`}>
      <div className="row between">
        <span><strong>{row.staff.name}</strong> <span className="small muted">{tr(ROLE_LABEL[row.staff.role as Role])}, {row.beat.name}</span></span>
        <Status value={row.status} />
      </div>
      {blocked && row.blockers.map((b: any) => <p key={b._id} className="small bad-text"><strong>{tr(EXCEPTION_LABEL[b.type as ExceptionType])}.</strong> {tr(b.message)}</p>)}
      {row.status !== "planned" && <p className="small muted">{row.issuedCount}{tr(" bills issued today.")}</p>}
      {row.status === "planned" && (
        <>
          {row.bills.length === 0 && <p className="small muted">{tr("No bills in this beat's file.")}</p>}
          {row.bills.map((b: any) => (
            <label key={b._id} className="check">
              <input type="checkbox" checked={selected.includes(b._id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, b._id] : s.filter((x) => x !== b._id)))} />
              <span style={{ flex: 1 }}><span className="mono">{b.billNo}</span> {b.shopName} <span className="small muted">{b.billDate}</span></span>
              <Rs paise={b.openPaise} />
            </label>
          ))}
          {blocked && (
            <Field label="Override reason (recorded and shown to the owner)">
              <input type="text" value={override} onChange={(e) => setOverride(e.target.value)} />
            </Field>
          )}
          {row.bills.length > 0 && (
            <div className="row">
              <Btn disabled={busy || selected.length === 0} onClick={() => act(() => api(`/office/runs/${row.runId}/issue`, { body: { billIds: selected, ...(override.trim() ? { overrideReason: override } : {}) } }), "Bills issued")}>
                {blocked ? tr("Override and issue") : tr("Issue")} {selected.length}{tr(" bills")}</Btn>
              {blocked && <Stamp tone="bad">{tr("Blocked until resolved")}</Stamp>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
