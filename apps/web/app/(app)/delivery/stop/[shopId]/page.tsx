"use client";

import { tr } from "@/lib/i18n";
import { DELIVERY_RESULT_LABEL, NOT_DELIVERED_REASONS, PARTIAL_REASONS, type DeliveryResult, formatRupees, rupeesToPaise } from "@repo/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { useAct } from "@/components/providers";
import { Btn, Field, Loading, Rs, Stamp } from "@/components/ui";
import { api, getGps, newRef, timeOf, useData } from "@/lib/api";

export default function StopPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useData("/delivery/today");
  const { act, busy } = useAct(reload);

  if (!data?.trip) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  const stop = data.stops.find((s: any) => s.shopId === shopId);
  if (!stop) return <main className="page wrap phone">{tr("Stop not found.")}</main>;
  const running = data.trip.status === "started";
  const pending = stop.bills.filter((b: any) => b.result === "pending").length;

  return (
    <main className="page wrap phone">
      <div className="stack" style={{ gap: 4 }}>
        <Link href="/delivery" className="small">{tr("Back to trip")}</Link>
        <h1>{stop.shop.name}</h1>
        {stop.arrivedAt && <p className="small muted">{tr("Arrived ")}{timeOf(stop.arrivedAt)}</p>}
      </div>

      {running && !stop.arrivedAt && (
        <Btn full disabled={busy} onClick={() => act(async () => api(`/delivery/trips/${data.trip._id}/arrive`, { body: { shopId, gps: await getGps(stop.shop.location) } }), "Arrival saved")}>{tr("Mark arrival")}</Btn>
      )}

      {stop.bills.map((entry: any) => (
        <BillResult key={entry.billId} entry={entry} trip={data.trip} shop={stop.shop} canRecord={running && Boolean(stop.arrivedAt)} reload={reload} />
      ))}

      {running && stop.arrivedAt && !stop.departedAt && pending === 0 && (
        <Btn full tone="ghost" disabled={busy} onClick={() => act(async () => { await api(`/delivery/trips/${data.trip._id}/depart`, { body: { shopId } }); router.push("/delivery"); }, "Left the shop")}>{tr("Leave this shop")}</Btn>
      )}
    </main>
  );
}

function BillResult({ entry, trip, shop, canRecord, reload }: { entry: any; trip: any; shop: any; canRecord: boolean; reload: () => Promise<void> }) {
  const { bill } = entry;
  const { act, busy } = useAct(reload);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<Record<string, string>>({});
  const [clientRef] = useState(newRef);

  const choices: DeliveryResult[] = bill.kind === "credit" ? ["credit_delivered", "credit_paid_cash", "partial", "not_delivered"] : ["cash_paid", "partial", "not_delivered"];
  const needsCash = result === "cash_paid" || result === "credit_paid_cash";
  const needsPhoto = result !== null && result !== "not_delivered";
  const reasons = result === "partial" ? PARTIAL_REASONS : result === "not_delivered" ? NOT_DELIVERED_REASONS : null;

  function choose(next: DeliveryResult) {
    setResult(next);
    setReason("");
    setCash(next === "cash_paid" || next === "credit_paid_cash" ? String(bill.openPaise / 100) : "");
  }

  async function save() {
    const gps = await getGps(shop.location);
    await api(`/delivery/trips/${trip._id}/bills/${bill._id}/result`, {
      body: {
        clientRef,
        result,
        ...(reason ? { reason } : {}),
        cashPaise: rupeesToPaise(Number(cash) || 0),
        ...(photoId ? { photoId } : {}),
        gps,
        ...(result === "partial"
          ? { items: bill.lines.map((l: any) => ({ productId: l.productId, deliveredQty: delivered[l.productId] === undefined ? l.quantity : Number(delivered[l.productId]) })) }
          : {}),
      },
    });
  }

  return (
    <div className="card">
      <div className="row between">
        <span><span className="mono">{bill.billNo}</span> <Stamp tone={bill.kind === "cash" ? "warn" : "info"}>{bill.kind}</Stamp></span>
        <Rs paise={bill.amountPaise} />
      </div>
      <div className="stack small muted" style={{ gap: 2 }}>
        {bill.lines.map((l: any) => <div key={l.productId} className="row between"><span>{l.name}</span><span className="mono">{l.quantity} {l.unit}</span></div>)}
      </div>

      {entry.result !== "pending" && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="row between">
            <Stamp tone={entry.result === "not_delivered" ? "bad" : entry.result === "partial" ? "warn" : "ok"}>{tr(DELIVERY_RESULT_LABEL[entry.result as DeliveryResult])}</Stamp>
            {entry.cashPaise > 0 && <span className="small">{tr("Cash ")}<Rs paise={entry.cashPaise} /></span>}
          </div>
          {entry.reason && <p className="small muted">{tr(entry.reason)}</p>}
          {entry.items?.filter((i: any) => i.deliveredQty !== i.billedQty).map((i: any) => <p key={i.productId} className="small">{i.name}{tr(": delivered ")}{i.deliveredQty}{tr(" of ")}{i.billedQty}</p>)}
          {entry.photoId && <a href={`/api/photos/${entry.photoId}`} target="_blank" rel="noreferrer"><img className="thumb" src={`/api/photos/${entry.photoId}`} alt={tr("Signed copy")} /></a>}
        </div>
      )}

      {entry.result === "pending" && canRecord && (
        <>
          <div className="grid2">
            {choices.map((c) => <Btn key={c} tone={result === c ? "primary" : "ghost"} size="small" onClick={() => choose(c)}>{tr(DELIVERY_RESULT_LABEL[c])}</Btn>)}
          </div>
          {reasons && (
            <Field label="Reason">
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">{tr("Choose")}</option>
                {reasons.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
              </select>
            </Field>
          )}
          {result === "partial" &&
            bill.lines.map((l: any) => (
              <Field key={l.productId} label={`${l.name}: delivered of ${l.quantity} ${l.unit}`}>
                <input type="number" inputMode="numeric" min="0" max={l.quantity} value={delivered[l.productId] ?? String(l.quantity)} onChange={(e) => setDelivered((d) => ({ ...d, [l.productId]: e.target.value }))} />
              </Field>
            ))}
          {(needsCash || result === "partial") && (
            <Field label={needsCash ? "Cash received (₹)" : "Cash received, if any (₹)"}>
              <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
            </Field>
          )}
          {needsCash && <p className="small muted">{tr("Full amount is ")}{formatRupees(bill.openPaise)}.</p>}
          {needsPhoto && <PhotoInput kind="signed_bill" label="Photo of the signed copy" onChange={setPhotoId} />}
          {result && <Btn full disabled={busy || (needsPhoto && !photoId) || (reasons !== null && !reason)} onClick={() => act(save, "Saved")}>{tr("Save result")}</Btn>}
        </>
      )}
    </div>
  );
}
