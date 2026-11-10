"use client";

import { tr } from "@/lib/i18n";
import { businessDate, rupeesToPaise } from "@repo/shared";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Segments } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function OrdersPage() {
  const { data, error, loading, reload } = useData("/office/orders");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="New orders">{tr("Punch each order into Marg, then enter the bill details here.")}</PageTitle>
      {data.items.length === 0 && <Empty>{tr("All orders have been billed.")}</Empty>}
      <div className="grid2">{data.items.map((order: any) => <OrderCard key={order._id} order={order} reload={reload} />)}</div>
    </main>
  );
}

function OrderCard({ order, reload }: { order: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const estimate = order.lines.reduce((s: number, l: any) => s + l.quantity * l.ratePaise, 0);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(businessDate());
  const [kind, setKind] = useState<"credit" | "cash">("credit");
  const [amount, setAmount] = useState(String(estimate / 100));
  return (
    <div className="card">
      <div className="row between"><h3>{order.shopId.name}</h3><span className="mono small">{tr("Order ")}{order.orderNo}</span></div>
      <p className="small muted">{order.beatId.name}, {order.staffId.name}</p>
      {order.lines.map((l: any) => <div key={l.productId} className="row between small"><span>{l.name}</span><span className="mono">{l.quantity} {l.unit}</span></div>)}
      <div className="grid2">
        <Field label="Marg bill number"><input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)} /></Field>
        <Field label="Bill date"><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></Field>
      </div>
      <Field label="Bill amount (₹)"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Segments value={kind} onChange={setKind} options={[{ value: "credit", label: "Credit" }, { value: "cash", label: "Cash" }]} />
      <Btn disabled={busy || !billNo.trim() || !(Number(amount) > 0)} onClick={() => act(() => api(`/office/orders/${order._id}/bill`, { body: { billNo, billDate, kind, amountPaise: rupeesToPaise(Number(amount)) } }), "Bill saved")}>{tr("Save bill")}</Btn>
    </div>
  );
}
