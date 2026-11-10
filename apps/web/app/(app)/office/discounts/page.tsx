"use client";

import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Stamp } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function DiscountsPage() {
  const { data, error, loading, reload } = useData("/office/adjustments");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Discounts and returns">{tr("Every discount is reviewed until limits are set in Setup. Goods returns are decided by the godown.")}</PageTitle>
      {data.items.length === 0 && <Empty>{tr("Nothing is waiting.")}</Empty>}
      <div className="stack">{data.items.map((item: any) => <Item key={item._id} item={item} reload={reload} />)}</div>
    </main>
  );
}

function Item({ item, reload }: { item: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [note, setNote] = useState("");
  const decide = (approve: boolean) => act(() => api(`/office/adjustments/${item._id}/decide`, { body: { approve, note } }), approve ? "Approved" : "Rejected");
  const isReturn = item.kind === "goods_return";
  const percent = ((item.amountPaise / item.billId.amountPaise) * 100).toFixed(1);
  return (
    <div className="card">
      <div className="row between"><span><Stamp tone={isReturn ? "plain" : "warn"}>{isReturn ? tr("Goods return") : tr("Cash discount")}</Stamp> <span className="mono">{item.billId.billNo}</span></span><Rs paise={item.amountPaise} /></div>
      <p className="small muted">{item.shopId.name}, {item.staffId.name}. {percent}{tr("% of the bill. ")}{item.note}</p>
      {isReturn ? <p className="small">{tr("Waiting for the godown to receive the goods.")}</p> : (
        <>
          <Field label="Note (needed to reject)"><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="row">
            <Btn disabled={busy} onClick={() => decide(true)}>{tr("Approve")}</Btn>
            <Btn tone="danger" disabled={busy || !note.trim()} onClick={() => decide(false)}>{tr("Reject")}</Btn>
          </div>
        </>
      )}
    </div>
  );
}
