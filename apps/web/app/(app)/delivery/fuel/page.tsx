"use client";

import { tr } from "@/lib/i18n";
import { businessDate, rupeesToPaise } from "@repo/shared";
import Link from "next/link";
import { useState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { useAct, useToast } from "@/components/providers";
import { Btn, Field, Loading, PageTitle, Rs, Stamp, Status } from "@/components/ui";
import { api, getGps, useData } from "@/lib/api";

export default function FuelPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useData("/delivery/fuel");
  const { act, busy } = useAct(reload);
  const [odometer, setOdometer] = useState("");
  const [litres, setLitres] = useState("");
  const [amount, setAmount] = useState("");
  const [pumpName, setPumpName] = useState("");
  const [pumpBillNo, setPumpBillNo] = useState("");
  const [pumpBillDate, setPumpBillDate] = useState(businessDate());
  const [odometerPhotoId, setOdometerPhoto] = useState<string | null>(null);
  const [meterPhotoId, setMeterPhoto] = useState<string | null>(null);
  const [billPhotoId, setBillPhoto] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  const ready = odometer && litres && amount && pumpBillNo && odometerPhotoId && meterPhotoId && billPhotoId;

  async function save() {
    const result = await api("/delivery/fuel", {
      body: { odometer: Number(odometer), litres: Number(litres), amountPaise: rupeesToPaise(Number(amount)), pumpName, pumpBillNo, pumpBillDate, odometerPhotoId, meterPhotoId, billPhotoId, gps: await getGps() },
    });
    toast(result.lowMileage ? "bad" : "ok", result.lowMileage ? `Saved. Mileage ${result.kmPerLitre} km/L is below normal and has been flagged.` : "Fuel entry saved");
    setOdometer(""); setLitres(""); setAmount(""); setPumpName(""); setPumpBillNo("");
    setOdometerPhoto(null); setMeterPhoto(null); setBillPhoto(null);
    setFormKey((k) => k + 1);
  }

  return (
    <main className="page wrap phone">
      <Link href="/delivery" className="small">{tr("Back to trip")}</Link>
      <PageTitle title="Fuel">{data.vehicle ? <span className="mono">{data.vehicle.number}</span> : tr("No vehicle today")}</PageTitle>

      {data.advance && (
        <div className="card">
          <div className="row between"><h3>{tr("Open cash advance")}</h3><Stamp tone="warn">{tr("Not settled")}</Stamp></div>
          <p>{tr("Given ")}<Rs paise={data.advance.amountPaise} />{tr(". Settle it with fuel bills and any cash left. No new advance can be given until then.")}</p>
        </div>
      )}

      {data.vehicle && (
        <div className="card" key={formKey}>
          <h2>{tr("New fuel entry")}</h2>
          <div className="grid2">
            <Field label="Odometer (km)"><input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>
            <Field label="Litres"><input type="number" inputMode="decimal" value={litres} onChange={(e) => setLitres(e.target.value)} /></Field>
            <Field label="Amount (₹)"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Pump name"><input type="text" value={pumpName} onChange={(e) => setPumpName(e.target.value)} /></Field>
            <Field label="Pump bill number"><input type="text" value={pumpBillNo} onChange={(e) => setPumpBillNo(e.target.value)} /></Field>
            <Field label="Bill date"><input type="date" value={pumpBillDate} onChange={(e) => setPumpBillDate(e.target.value)} /></Field>
          </div>
          <PhotoInput kind="odometer" label="Odometer photo" onChange={setOdometerPhoto} />
          <PhotoInput kind="pump_meter" label="Pump meter photo" onChange={setMeterPhoto} />
          <PhotoInput kind="fuel_bill" label="Fuel bill photo" onChange={setBillPhoto} />
          <Btn full disabled={busy || !ready} onClick={() => act(save)}>{tr("Save fuel entry")}</Btn>
        </div>
      )}

      <div className="stack">
        <h2>{tr("Recent entries")}</h2>
        {data.entries.map((e: any) => (
          <div key={e._id} className="card">
            <div className="row between"><span className="mono">{e.pumpBillNo}</span><Status value={e.status} /></div>
            <div className="row between small">
              <span>{e.litres} L, <Rs paise={e.amountPaise} /></span>
              <span>{e.kmPerLitre != null && <>{e.kmPerLitre}{tr(" km/L")}</>} {e.lowMileage && <Stamp tone="bad">{tr("Low mileage")}</Stamp>}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
