"use client";

import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Stamp } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function GodownPage() {
  const { data, error, loading, reload } = useData("/godown/pending");
  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap phone">
      <PageTitle title="Returned goods">{tr("Count what physically came back. The expected quantities stay hidden until you save.")}</PageTitle>
      <div className="stack">
        <h2>{tr("Vehicles to count")}</h2>
        {data.trips.length === 0 && <Empty>{tr("No vehicles are waiting.")}</Empty>}
        {data.trips.map((trip: any) => <TripCount key={trip._id} trip={trip} reload={reload} />)}
      </div>
      <div className="stack">
        <h2>{tr("Goods returned by shops")}</h2>
        {data.goodsReturns.length === 0 && <Empty>{tr("No goods returns are waiting.")}</Empty>}
        {data.goodsReturns.map((item: any) => <GoodsReturn key={item._id} item={item} reload={reload} />)}
      </div>
      {data.counted.length > 0 && (
        <div className="stack">
          <h2>{tr("Already counted")}</h2>
          {data.counted.map((trip: any) => (
            <div key={trip._id} className="card">
              <div className="row between"><span className="mono">{trip.vehicleId.number}</span><span className="small muted">{trip.driverId.name}</span></div>
              {trip.godownCount.map((row: any) => (
                <div key={row.productId} className="row between small">
                  <span>{row.name}</span>
                  <span>{tr("Counted ")}{row.counted}{tr(", expected ")}{row.expected} {row.counted === row.expected ? <Stamp tone="ok">{tr("Match")}</Stamp> : <Stamp tone="bad">{tr("Mismatch")}</Stamp>}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function TripCount({ trip, reload }: { trip: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const complete = trip.products.every((p: any) => counts[p.productId] !== undefined && counts[p.productId] !== "");
  return (
    <div className="card">
      <div className="row between"><h3>{trip.beat.name}</h3><span className="mono">{trip.vehicle.number}</span></div>
      <p className="small muted">{tr("Driver ")}{trip.driver.name}</p>
      {trip.products.map((p: any) => (
        <Field key={p.productId} label={`${p.name} (${p.unit})`}>
          <input type="number" inputMode="numeric" min="0" value={counts[p.productId] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [p.productId]: e.target.value }))} />
        </Field>
      ))}
      <Btn full disabled={busy || !complete} onClick={() => act(() => api(`/godown/trips/${trip._id}/count`, { body: { lines: trip.products.map((p: any) => ({ productId: p.productId, counted: Number(counts[p.productId]) })) } }), "Count saved")}>{tr("Save count")}</Btn>
    </div>
  );
}

function GoodsReturn({ item, reload }: { item: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [note, setNote] = useState("");
  const decide = (received: boolean) => act(() => api(`/godown/adjustments/${item._id}/receive`, { body: { received, note } }), received ? "Goods received" : "Goods return rejected");
  return (
    <div className="card">
      <div className="row between"><span><span className="mono">{item.billId.billNo}</span> {item.shopId.name}</span><Rs paise={item.amountPaise} /></div>
      <p className="small muted">{item.staffId.name}: {item.note || tr("No note")}</p>
      <Field label="Note (needed to reject)"><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row">
        <Btn disabled={busy} onClick={() => decide(true)}>{tr("Goods received")}</Btn>
        <Btn tone="danger" disabled={busy || !note.trim()} onClick={() => decide(false)}>{tr("Reject")}</Btn>
      </div>
    </div>
  );
}
