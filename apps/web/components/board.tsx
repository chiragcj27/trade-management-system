"use client";

import { tr } from "@/lib/i18n";
import { ROLE_LABEL, type Role } from "@repo/shared";
import { minutesBetween, timeOf } from "@/lib/api";
import { Rs, Stamp, Status } from "./ui";

/** Who is where right now, shared by the office and owner dashboards. */
export function LiveBoard({ board }: { board: any }) {
  return (
    <div className="stack">
      <h2>{tr("Live board")}</h2>
      <div className="scroll">
        <table style={{ minWidth: 720 }}>
          <thead><tr><th>{tr("Staff")}</th><th>{tr("Beat")}</th><th>{tr("Status")}</th><th>{tr("Shops")}</th><th>{tr("Now")}</th><th className="num">{tr("Collected")}</th></tr></thead>
          <tbody>
            {board.runs.map((r: any) => {
              const over = r.status === "started" && r.startedAt && (minutesBetween(r.startedAt) ?? 0) > r.beat.plannedMinutes;
              return (
                <tr key={r._id}>
                  <td><strong>{r.staff.name}</strong><br /><span className="small muted">{tr(ROLE_LABEL[r.staff.role as Role])}</span></td>
                  <td>{r.beat.name}</td>
                  <td><Status value={r.status} /> {over && <Stamp tone="bad">{tr("Over time")}</Stamp>}</td>
                  <td className="mono">{r.shopsDone}/{r.shopsTotal}{r.shopsSkipped > 0 && <span className="small muted"> ({r.shopsSkipped}{tr(" skipped)")}</span>}</td>
                  <td className="small">{r.currentShop ? <>{r.currentShop}, {minutesBetween(r.currentSince)}{tr(" min")}</> : r.endedAt ? tr(`Ended ${timeOf(r.endedAt)}`) : r.startedAt ? tr("Between shops") : ""}</td>
                  <td className="num"><Rs paise={r.collectedPaise} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="scroll">
        <table style={{ minWidth: 720 }}>
          <thead><tr><th>{tr("Vehicle")}</th><th>{tr("Crew")}</th><th>{tr("Beat")}</th><th>{tr("Status")}</th><th>{tr("Stops")}</th><th>{tr("Bills done")}</th><th className="num">{tr("Km")}</th></tr></thead>
          <tbody>
            {board.trips.map((t: any) => (
              <tr key={t._id}>
                <td className="mono">{t.vehicle.number}</td>
                <td>{t.driver.name}<br /><span className="small muted">{t.helper.name}</span></td>
                <td>{t.beat.name}</td>
                <td><Status value={t.status} /></td>
                <td className="mono">{t.stopsDone}/{t.stopsTotal}</td>
                <td className="mono">{t.billsDone}/{t.billsTotal}</td>
                <td className="num">{t.endOdometer && t.startOdometer ? tr(`${t.endOdometer - t.startOdometer} / ${t.beat.plannedKm}`) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
