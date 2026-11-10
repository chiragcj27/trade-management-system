"use client";

import { tr } from "@/lib/i18n";
import { rupeesToPaise } from "@repo/shared";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Stamp } from "@/components/ui";
import { api, dateTimeOf, useData } from "@/lib/api";

const KIND: Record<string, string> = { payment: "Payment", credit_note: "Credit note", cash_discount: "Cash discount", goods_return: "Goods return", cheque_reversal: "Cheque reversal" };

export default function MargPage() {
  const { data, error, loading, reload } = useData("/office/marg");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="To enter in Marg">{tr("Make each entry in Marg, then tick it here. A bill closes only after its entries are ticked.")}</PageTitle>
      <div className="stack">
        {data.pending.length === 0 && <Empty>{tr("Nothing is waiting.")}</Empty>}
        {data.pending.map((t: any) => <Task key={t._id} task={t} reload={reload} />)}
      </div>
      {data.done.length > 0 && (
        <div className="stack">
          <h2>{tr("Recently entered")}</h2>
          {data.done.map((t: any) => (
            <div key={t._id} className="card">
              <div className="row between"><span>{tr(t.description)}</span><Rs paise={t.amountPaise} /></div>
              <p className="small muted">{t.doneBy?.name}, {dateTimeOf(t.doneAt)}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Task({ task, reload }: { task: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [actual, setActual] = useState(String(task.amountPaise / 100));
  const isCreditNote = task.kind === "credit_note";
  return (
    <div className="card">
      <div className="row between"><Stamp tone="info">{tr(KIND[task.kind] ?? task.kind)}</Stamp><Rs paise={task.amountPaise} /></div>
      <p>{tr(task.description)}</p>
      {isCreditNote && <Field label="Actual credit note amount in Marg (₹)"><input type="number" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>}
      <div><Btn disabled={busy} onClick={() => act(() => api(`/office/marg/${task._id}/done`, { body: isCreditNote ? { actualAmountPaise: rupeesToPaise(Number(actual)) } : {} }), "Ticked")}>{tr("Entered in Marg")}</Btn></div>
    </div>
  );
}
