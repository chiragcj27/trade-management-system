"use client";

import { tr } from "@/lib/i18n";
import { ROLE_LABEL, type Role } from "@repo/shared";
import Link from "next/link";
import { Empty, Loading, PageTitle, Stamp } from "@/components/ui";
import { timeOf, useData } from "@/lib/api";

export default function EveningList() {
  const { data, error, loading } = useData("/office/evening");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Evening check">{tr("This replaces cutting entries from the diary. Count first. The expected figures appear only after you save.")}</PageTitle>
      <div className="stack">
        <h2>{tr("Collection beats waiting")}</h2>
        {data.runs.length === 0 && <Empty>{tr("No beats are waiting.")}</Empty>}
        {data.runs.map((r: any) => (
          <Link key={r._id} className="card" href={`/office/evening/run/${r._id}`}>
            <div className="row between"><strong>{r.staffId.name}</strong><Stamp tone="warn">{tr("To check")}</Stamp></div>
            <p className="small muted">{tr(ROLE_LABEL[r.staffId.role as Role])}, {r.beatId.name}. {r.bills.length}{tr(" bills issued. ")}{r.date}{tr(", ended ")}{timeOf(r.endedAt)}.</p>
          </Link>
        ))}
      </div>
      <div className="stack">
        <h2>{tr("Delivery trips waiting")}</h2>
        {data.trips.length === 0 && <Empty>{tr("No trips are waiting.")}</Empty>}
        {data.trips.map((t: any) => (
          <Link key={t._id} className="card" href={`/office/evening/trip/${t._id}`}>
            <div className="row between"><strong>{t.driverId.name}{tr(" and ")}{t.helperId.name}</strong><Stamp tone="warn">{tr("To check")}</Stamp></div>
            <p className="small muted"><span className="mono">{t.vehicleId.number}</span>, {t.beatId.name}. {t.bills.length}{tr(" bills. Ended ")}{timeOf(t.endedAt)}.</p>
          </Link>
        ))}
      </div>
      {data.recent.length > 0 && (
        <div className="stack">
          <h2>{tr("Recently checked")}</h2>
          {data.recent.map((r: any) => (
            <Link key={r._id} className="card" href={`/office/evening/run/${r._id}`}>
              <div className="row between"><strong>{r.staffId.name}</strong><Stamp tone="ok">{tr("Checked")}</Stamp></div>
              <p className="small muted">{r.beatId.name}, {r.date}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
