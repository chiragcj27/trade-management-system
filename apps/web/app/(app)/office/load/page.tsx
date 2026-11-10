"use client";

import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Empty, Field, Loading, PageTitle, Rs, Stamp } from "@/components/ui";
import { api, useData } from "@/lib/api";

export default function LoadPage() {
  const { data, error, loading, reload } = useData("/office/load");
  const { act, busy } = useAct(reload);
  const [beatId, setBeatId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [helperId, setHelperId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  const beatsWithBills = data.beats.filter((b: any) => data.bills.some((x: any) => x.beatId === b._id));
  const bills = data.bills.filter((b: any) => b.beatId === beatId);
  const busyIds = new Set(data.trips.filter((t: any) => ["planned", "accepted", "started"].includes(t.status)).flatMap((t: any) => [t.driverId, t.helperId, t.vehicleId]));
  const free = (rows: any[]) => rows.filter((r) => !busyIds.has(r._id));

  return (
    <main className="page wrap">
      <PageTitle title="Make a load sheet">{tr("Choose a beat, a vehicle and a two-person crew. Both must accept on their phones.")}</PageTitle>
      {data.bills.length === 0 && <Empty>{tr("No bills are waiting to be loaded.")}</Empty>}
      {data.bills.length > 0 && (
        <div className="card">
          <div className="grid4">
            <Field label="Beat">
              <select value={beatId} onChange={(e) => { setBeatId(e.target.value); setSelected(data.bills.filter((b: any) => b.beatId === e.target.value).map((b: any) => b._id)); }}>
                <option value="">{tr("Choose")}</option>
                {beatsWithBills.map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Vehicle">
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">{tr("Choose")}</option>{free(data.vehicles).map((v: any) => <option key={v._id} value={v._id}>{v.number}</option>)}</select>
            </Field>
            <Field label="Driver">
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">{tr("Choose")}</option>{free(data.drivers).map((v: any) => <option key={v._id} value={v._id}>{v.name}</option>)}</select>
            </Field>
            <Field label="Helper">
              <select value={helperId} onChange={(e) => setHelperId(e.target.value)}><option value="">{tr("Choose")}</option>{free(data.helpers).map((v: any) => <option key={v._id} value={v._id}>{v.name}</option>)}</select>
            </Field>
          </div>
          {bills.map((b: any) => (
            <label key={b._id} className="check">
              <input type="checkbox" checked={selected.includes(b._id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, b._id] : s.filter((x) => x !== b._id)))} />
              <span style={{ flex: 1 }}><span className="mono">{b.billNo}</span> {b.shopId.name} <Stamp>{b.kind}</Stamp></span>
              <Rs paise={b.amountPaise} />
            </label>
          ))}
          <Btn disabled={busy || !beatId || !vehicleId || !driverId || !helperId || selected.length === 0} onClick={() => act(async () => { await api("/office/trips", { body: { beatId, vehicleId, driverId, helperId, billIds: selected } }); setSelected([]); setBeatId(""); }, "Load sheet created")}>{tr("Create load sheet with ")}{selected.length}{tr(" bills")}</Btn>
        </div>
      )}
    </main>
  );
}
