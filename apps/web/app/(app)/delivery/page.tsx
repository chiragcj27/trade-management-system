"use client";

import { tr } from "@/lib/i18n";
import { DELIVERY_RESULT_LABEL, type DeliveryResult, formatRupees } from "@repo/shared";
import Link from "next/link";
import { useState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { useAct } from "@/components/providers";
import { useMe } from "@/components/shell";
import { Btn, Field, Loading, PageTitle, Progress, Rs, Stamp, Status } from "@/components/ui";
import { api, getGps, minutesBetween, timeOf, useData } from "@/lib/api";

export default function DeliveryHome() {
  const { staff } = useMe();
  const { data, error, loading, reload } = useData("/delivery/today");
  const { act, busy } = useAct(reload);
  const [odometer, setOdometer] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);

  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  if (!data.trip) {
    return (
      <main className="page wrap phone">
        <PageTitle title="No load sheet yet">{tr("The office has not assigned a trip to you today.")}</PageTitle>
        <Link className="btn ghost" href="/delivery/fuel">{tr("Fuel")}</Link>
      </main>
    );
  }

  const { trip, beat, vehicle, stops, myRole } = data;
  const isDriver = staff.role === "driver";
  const iAccepted = myRole === "driver" ? trip.driverAcceptedAt : trip.helperAcceptedAt;
  const allBills = stops.flatMap((s: any) => s.bills);
  const done = allBills.filter((b: any) => b.result !== "pending").length;
  const finished = ["ended", "checked"].includes(trip.status);
  const cash = allBills.reduce((s: number, b: any) => s + (b.cashPaise ?? 0), 0);
  const km = trip.endOdometer && trip.startOdometer ? trip.endOdometer - trip.startOdometer : null;

  const odometerAction = (path: "start" | "end", message: string) =>
    act(async () => {
      await api(`/delivery/trips/${trip._id}/${path}`, { body: { odometer: Number(odometer), photoId, gps: await getGps() } });
      setOdometer("");
      setPhotoId(null);
    }, message);

  return (
    <main className="page wrap phone">
      <PageTitle title={beat.name}>
        <Status value={trip.status} /> <span className="mono">{vehicle.number}</span>. {done}{tr(" of ")}{allBills.length}{tr(" bills done.")}{km != null && <> {km}{tr(" km run.")}</>}
      </PageTitle>

      <Link className="btn ghost" href="/delivery/fuel">{tr("Fuel")}</Link>

      {trip.status === "planned" && (
        <div className="card">
          <h2>{tr("Load sheet: ")}{allBills.length}{tr(" bills")}</h2>
          <div className="row small">
            <Stamp tone={trip.driverAcceptedAt ? "ok" : "warn"}>{tr("Driver ")}{trip.driverAcceptedAt ? tr("accepted") : tr("waiting")}</Stamp>
            <Stamp tone={trip.helperAcceptedAt ? "ok" : "warn"}>{tr("Helper ")}{trip.helperAcceptedAt ? tr("accepted") : tr("waiting")}</Stamp>
          </div>
          {allBills.map((b: any) => (
            <div key={b.billId} className="row between small">
              <span><span className="mono">{b.bill.billNo}</span> <Stamp>{b.bill.kind}</Stamp></span>
              <Rs paise={b.bill.amountPaise} />
            </div>
          ))}
          {iAccepted ? (
            <p className="small muted">{tr("You have accepted. The trip opens when the other person accepts too.")}</p>
          ) : (
            <Btn full disabled={busy} onClick={() => act(() => api(`/delivery/trips/${trip._id}/accept`, { body: {} }), "Load sheet accepted")}>{tr("I have checked the load. Accept")}</Btn>
          )}
        </div>
      )}

      {trip.status === "accepted" &&
        (isDriver ? (
          <div className="card">
            <h2>{tr("Start trip")}</h2>
            <Field label={`Opening odometer (last ${vehicle.lastOdometer} km)`}><input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>
            <PhotoInput kind="odometer" label="Photo of the odometer" onChange={setPhotoId} />
            <Btn full disabled={busy || !odometer || !photoId} onClick={() => odometerAction("start", "Trip started")}>{tr("Start trip")}</Btn>
          </div>
        ) : (
          <div className="card">{tr("Both have accepted. The driver will now start the trip.")}</div>
        ))}

      {trip.status !== "planned" && trip.status !== "accepted" && (
        <div className="stack">
          <h2>{tr("Stops")}</h2>
          <Progress done={done} total={allBills.length} />
          {stops.map((stop: any) => {
            const pending = stop.bills.filter((b: any) => b.result === "pending").length;
            return (
              <Link key={stop.shopId} className="card" href={`/delivery/stop/${stop.shopId}`}>
                <div className="row between">
                  <h3 className="seq-title"><span className="seq">{stop.sequence}</span>{stop.shop?.name}</h3>
                  {pending === 0 ? <Stamp tone="ok">{tr("Done")}</Stamp> : stop.arrivedAt ? <Stamp tone="info">{tr("At shop")}</Stamp> : <Stamp>{tr("To go")}</Stamp>}
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  {stop.bills.map((b: any) => (
                    <div key={b.billId} className="row between small">
                      <span className="mono">{b.bill.billNo}</span>
                      <span className={b.result === "not_delivered" ? "bad-text" : "muted"}>{tr(DELIVERY_RESULT_LABEL[b.result as DeliveryResult])}</span>
                    </div>
                  ))}
                </div>
                {stop.arrivedAt && <p className="small muted">{tr("Arrived ")}{timeOf(stop.arrivedAt)}{stop.departedAt && tr(`, ${minutesBetween(stop.arrivedAt, stop.departedAt)} min at stop`)}</p>}
              </Link>
            );
          })}
        </div>
      )}

      {trip.status === "started" && isDriver && (
        <div className="card">
          <h2>{tr("End trip")}</h2>
          <p className="small muted">{tr("Cash to hand in so far: ")}{formatRupees(cash)}</p>
          <Field label={`Closing odometer (opened at ${trip.startOdometer} km)`}><input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>
          <PhotoInput kind="odometer" label="Photo of the odometer" onChange={setPhotoId} />
          <Btn full disabled={busy || !odometer || !photoId} onClick={() => odometerAction("end", "Trip ended. Hand everything to the office.")}>{tr("End trip")}</Btn>
        </div>
      )}

      {finished && (
        <div className="card">
          <h2>{trip.status === "ended" ? tr("Hand back to the office") : tr("Checked by the office")}</h2>
          {trip.status === "ended" && <p className="small">{tr("Signed copies, both copies of cash bills, ")}{formatRupees(cash)}{tr(" cash, and all undelivered goods.")}</p>}
        </div>
      )}
    </main>
  );
}
