"use client";

import { tr } from "@/lib/i18n";
import { rupeesToPaise } from "@repo/shared";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { useMe } from "@/components/shell";
import { Btn, Field, Loading, PageTitle, Rs, Stamp, Status } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function OfficeFuel() {
  const { staff } = useMe();
  const { data, error, loading, reload } = useData("/office/fuel");
  const { act, busy } = useAct(reload);
  const [staffId, setStaffId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [amount, setAmount] = useState("");
  const isAdmin = staff.role === "admin";
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Fuel and advances" />
      <div className="stack">
        <h2>{tr("Fuel entries")}</h2>
        {data.entries.map((e: any) => <Entry key={e._id} entry={e} reload={reload} canReview={isAdmin} />)}
      </div>
      <div className="stack">
        <h2>{tr("Cash advances")}</h2>
        {isAdmin && (
          <div className="card">
            <div className="grid3">
              <Field label="Driver"><select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">{tr("Choose")}</option>{data.drivers.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></Field>
              <Field label="Vehicle"><select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">{tr("Choose")}</option>{data.vehicles.map((v: any) => <option key={v._id} value={v._id}>{v.number}</option>)}</select></Field>
              <Field label="Amount (₹)"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            </div>
            <div><Btn disabled={busy || !staffId || !vehicleId || !(Number(amount) > 0)} onClick={() => act(async () => { await api("/office/advances", { body: { staffId, vehicleId, amountPaise: rupeesToPaise(Number(amount)) } }); setAmount(""); }, "Advance recorded")}>{tr("Give advance")}</Btn></div>
          </div>
        )}
        {data.advances.map((a: any) => <Advance key={a._id} advance={a} reload={reload} canSettle={isAdmin} />)}
      </div>
    </main>
  );
}

function Entry({ entry: e, reload, canReview }: { entry: any; reload: () => Promise<void>; canReview: boolean }) {
  const { act, busy } = useAct(reload);
  const [note, setNote] = useState("");
  const review = (accept: boolean) => act(() => api(`/office/fuel/${e._id}/review`, { body: { accept, note } }), accept ? "Accepted" : "Rejected");
  return (
    <div className={`card ${e.lowMileage && e.status === "submitted" ? "alert" : ""}`}>
      <div className="row between"><span><span className="mono">{e.vehicleId.number}</span> {e.staffId.name}</span><Status value={e.status} /></div>
      <div className="row small">
        <span>{e.date}</span><span>{e.litres} L</span><Rs paise={e.amountPaise} /><span>{tr("Odometer ")}{e.odometer}</span>
        {e.kmPerLitre != null && <span>{e.kmPerLitre}{tr(" km/L (normal ")}{e.vehicleId.normalKmPerLitre})</span>}
        {e.lowMileage && <Stamp tone="bad">{tr("Low mileage")}</Stamp>}
      </div>
      <div className="row">
        {[["Odometer", e.odometerPhotoId], ["Pump meter", e.meterPhotoId], ["Bill", e.billPhotoId]].map(([label, id]) => <a key={id} href={`/api/photos/${id}`} target="_blank" rel="noreferrer"><img className="thumb" src={`/api/photos/${id}`} alt={label} /></a>)}
      </div>
      <p className="small muted">{tr("Pump bill ")}<span className="mono">{e.pumpBillNo}</span>, {e.pumpName}</p>
      {canReview && e.status === "submitted" && (
        <>
          <Field label="Note (needed to reject)"><input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} /></Field>
          <div className="row">
            <Btn size="small" disabled={busy} onClick={() => review(true)}>{tr("Accept")}</Btn>
            <Btn size="small" tone="danger" disabled={busy || !note.trim()} onClick={() => review(false)}>{tr("Reject")}</Btn>
          </div>
        </>
      )}
    </div>
  );
}

function Advance({ advance: a, reload, canSettle }: { advance: any; reload: () => Promise<void>; canSettle: boolean }) {
  const { act, busy } = useAct(reload);
  const [returned, setReturned] = useState("");
  return (
    <div className="card">
      <div className="row between"><span>{a.staffId.name} <span className="mono small">{a.vehicleId.number}</span></span><span className="row"><Rs paise={a.amountPaise} /><Status value={a.status} /></span></div>
      {a.status === "settled" && <p className="small muted">{tr("Cash returned ")}<Rs paise={a.returnedPaise} /></p>}
      {canSettle && a.status === "open" && (
        <div className="row">
          <input aria-label={tr("Cash returned")} type="number" inputMode="decimal" placeholder={tr("Cash returned (₹)")} value={returned} onChange={(e) => setReturned(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <Btn size="small" disabled={busy || returned === ""} onClick={() => act(() => api(`/office/advances/${a._id}/settle`, { body: { returnedPaise: rupeesToPaise(Number(returned)) } }), "Advance settled")}>{tr("Settle")}</Btn>
        </div>
      )}
    </div>
  );
}
