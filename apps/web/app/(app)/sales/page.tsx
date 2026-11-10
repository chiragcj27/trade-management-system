"use client";

import { tr } from "@/lib/i18n";
import { EXCEPTION_LABEL, OUTCOME_LABEL, SKIP_REASONS, type BillOutcome, type ExceptionType, formatRupees } from "@repo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Loading, PageTitle, Progress, Rs, Severity, Stamp, Stat, Status } from "@/components/ui";
import { api, getGps, minutesBetween, timeOf, useData } from "@/lib/api";

export default function SalesHome() {
  const router = useRouter();
  const { data, error, loading, reload } = useData("/field/today");
  const { act, busy } = useAct(reload);
  const [notReceived, setNotReceived] = useState<string[]>([]);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<string>(SKIP_REASONS[0]);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveReason, setMoveReason] = useState("");

  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  if (!data.run) return <main className="page wrap phone"><PageTitle title="No beat today">{tr("Your weekly plan has no beat for today.")}</PageTitle></main>;

  const { run, beat, shops, bills, exceptions, totals, receiptBook } = data;
  const onRoad = run.status === "started";
  const finished = ["ended", "checked"].includes(run.status);
  const nextShop = shops.find((r: any) => !r.visit);
  const openShop = shops.find((r: any) => r.visit?.status === "checked_in");
  const handed = bills.filter((b: any) => b.entry?.acceptedAt);

  async function checkIn(row: any) {
    await act(async () => {
      const gps = await getGps(row.shop.location);
      const { visitId } = await api(`/field/runs/${run._id}/visits`, { body: { shopId: row.shop._id, gps, deviceAt: new Date() } });
      router.push(`/sales/visit/${visitId}`);
    });
  }

  return (
    <main className="page wrap phone">
      <PageTitle title={beat.name}>
        <Status value={run.status} /> {run.startedAt && <>{tr("Started ")}{timeOf(run.startedAt)}.</>} {run.endedAt && <>{tr("Ended ")}{timeOf(run.endedAt)}.</>}
      </PageTitle>

      {exceptions.length > 0 && (
        <div className="card alert">
          <h3>{tr("Problems on your name")}</h3>
          {exceptions.slice(0, 5).map((e: any) => (
            <div key={e._id} className="row small">
              <Severity value={e.severity} />
              <span style={{ flex: 1, minWidth: 180 }}><strong>{tr(EXCEPTION_LABEL[e.type as ExceptionType])}.</strong> {tr(e.message)}</span>
            </div>
          ))}
        </div>
      )}

      {run.status === "planned" && bills.length === 0 && !onRoad && (
        <div className="card">
          <p>{tr("No bills have been issued to you yet. You can wait for the office or start without bills.")}</p>
          <Btn full disabled={busy} onClick={() => act(async () => api(`/field/runs/${run._id}/start`, { body: { gps: await getGps(), deviceAt: new Date() } }), "Beat started")}>{tr("Start beat without bills")}</Btn>
        </div>
      )}

      {run.status === "issued" && (
        <div className="card">
          <h2>{tr("Accept ")}{bills.length}{tr(" bills")}</h2>
          <p className="small muted">{tr("Accepting makes you responsible for these original bills. Untick any bill you did not physically receive.")}</p>
          {bills.map((b: any) => (
            <label key={b._id} className="check">
              <input type="checkbox" checked={!notReceived.includes(b._id)} onChange={(e) => setNotReceived((list) => (e.target.checked ? list.filter((x) => x !== b._id) : [...list, b._id]))} />
              <span style={{ flex: 1 }}>
                <span className="mono">{b.billNo}</span> {b.shopName}
                <br /><span className="small muted">{b.billDate}</span>
              </span>
              <Rs paise={b.openPaise} />
            </label>
          ))}
          <Btn full disabled={busy} onClick={() => act(() => api(`/field/runs/${run._id}/accept`, { body: { notReceivedBillIds: notReceived } }), "Bills accepted")}>{tr("Accept ")}{bills.length - notReceived.length}{tr(" bills")}{notReceived.length > 0 ? tr(`, ${notReceived.length} not received`) : ""}
          </Btn>
        </div>
      )}

      {run.status === "accepted" && (
        <Btn full disabled={busy} onClick={() => act(async () => api(`/field/runs/${run._id}/start`, { body: { gps: await getGps(), deviceAt: new Date() } }), "Beat started")}>{tr("Start beat")}</Btn>
      )}

      {(onRoad || finished) && (
        <div className="card">
          <div className="grid2">
            <Stat label="Cash"><Rs paise={totals.cashPaise} /></Stat>
            <Stat label="Cheque"><Rs paise={totals.chequePaise} /></Stat>
            <Stat label="UPI"><Rs paise={totals.upiPaise} /></Stat>
            <Stat label="Orders">{totals.orders}</Stat>
          </div>
          {receiptBook && <p className="small muted">{tr("Next receipt page: ")}<span className="mono">{receiptBook.nextSerial}</span></p>}
        </div>
      )}

      {openShop && (
        <Link href={`/sales/visit/${openShop.visit._id}`} className="btn full">{tr("Continue at ")}{openShop.shop.name}</Link>
      )}

      <div className="stack">
        <h2>{tr("Shops")}</h2>
        {(onRoad || finished) && <Progress done={shops.filter((r: any) => r.visit && r.visit.status !== "checked_in").length} total={shops.length} />}
        {shops.map((row: any) => {
          const v = row.visit;
          const isNext = onRoad && nextShop && nextShop.shop._id === row.shop._id && !openShop;
          const minutes = v && v.status !== "skipped" ? minutesBetween(v.checkInAt, v.checkOutAt) : null;
          return (
            <div key={row.shop._id} className={`card ${isNext ? "current" : ""}`}>
              <div className="row between">
                <h3 className="seq-title"><span className="seq">{row.shop.sequence}</span>{row.shop.name}</h3>
                {v ? <Status value={v.status} /> : isNext ? <Stamp tone="info">{tr("Next")}</Stamp> : null}
              </div>
              <div className="row small muted">
                <span>{row.billCount} {row.billCount === 1 ? tr("bill") : tr("bills")}{row.billCount > 0 && <>, <Rs paise={row.pendingPaise} />{tr(" pending")}</>}</span>
                {minutes != null && <span>{minutes}{tr(" min in shop")}</span>}
                {v?.skipReason && <span>{tr(v.skipReason)}</span>}
                {!row.shop.location && <Stamp tone="info">{tr("Location will be saved at first check-in")}</Stamp>}
              </div>
              {onRoad && !v && !openShop && (
                <div className="row">
                  <Btn disabled={busy} onClick={() => checkIn(row)}>{tr("Check in")}</Btn>
                  <Btn tone="ghost" disabled={busy} onClick={() => setSkipping(skipping === row.shop._id ? null : row.shop._id)}>{tr("Skip")}</Btn>
                  {row.shop.location && <Btn tone="ghost" disabled={busy} onClick={() => setMoving(moving === row.shop._id ? null : row.shop._id)}>{tr("Shop moved")}</Btn>}
                </div>
              )}
              {moving === row.shop._id && (
                <div className="stack">
                  <p className="small muted">{tr("Stand at the shop's new place. The office must approve the change.")}</p>
                  <input aria-label={tr("Why the location changed")} type="text" placeholder={tr("What changed?")} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
                  <Btn disabled={busy || moveReason.trim().length < 3} onClick={() => act(async () => { await api(`/field/shops/${row.shop._id}/location-request`, { body: { gps: await getGps(row.shop.location), reason: moveReason } }); setMoving(null); setMoveReason(""); }, "Sent to the office for approval")}>{tr("Send to office")}</Btn>
                </div>
              )}
              {skipping === row.shop._id && (
                <div className="row">
                  <select aria-label={tr("Reason for skipping")} value={skipReason} onChange={(e) => setSkipReason(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                    {SKIP_REASONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
                  </select>
                  <Btn tone="danger" disabled={busy} onClick={() => act(async () => { await api(`/field/runs/${run._id}/skip`, { body: { shopId: row.shop._id, reason: skipReason, gps: await getGps(row.shop.location) } }); setSkipping(null); }, "Shop skipped")}>{tr("Confirm skip")}</Btn>
                </div>
              )}
              {v?.status === "checked_in" && <Link className="btn ghost" href={`/sales/visit/${v._id}`}>{tr("Open shop")}</Link>}
            </div>
          );
        })}
      </div>

      {onRoad && (
        <Btn full tone="ghost" disabled={busy} onClick={() => act(async () => api(`/field/runs/${run._id}/end`, { body: { gps: await getGps(), deviceAt: new Date() } }), "Beat ended. Hand everything to the office.")}>{tr("End beat")}</Btn>
      )}

      {finished && (
        <div className="stack">
          <h2>{run.status === "ended" ? tr("Hand back to the office") : tr("Today's bills")}</h2>
          {run.status === "ended" && <p className="small muted">{tr("Return every bill below, plus all cash (")}{formatRupees(totals.cashPaise)}{tr(") and cheques.")}</p>}
          <div className="scroll">
            <table>
              <thead><tr><th>{tr("Bill")}</th><th>{tr("Shop")}</th><th>{tr("Result")}</th></tr></thead>
              <tbody>
                {handed.map((b: any) => (
                  <tr key={b._id}>
                    <td className="mono">{b.billNo}</td>
                    <td>{b.shopName}</td>
                    <td>{b.entry?.outcome ? tr(OUTCOME_LABEL[b.entry.outcome as BillOutcome]) : tr("No result")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
