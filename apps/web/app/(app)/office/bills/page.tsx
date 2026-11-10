"use client";

import { tr } from "@/lib/i18n";
import { BILL_STAGE_LABEL, type BillStage } from "@repo/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, PageTitle, Rs, Stamp } from "@/components/ui";
import { useData } from "@/lib/api";

export default function BillsPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useData(`/office/bills?q=${encodeURIComponent(query)}&stage=${stage}`);
  return (
    <main className="page wrap">
      <PageTitle title="Bills">{tr("Find any bill and see who holds it now.")}</PageTitle>
      <div className="grid2">
        <input type="search" aria-label={tr("Search by bill number or shop")} placeholder={tr("Bill number or shop")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label={tr("Filter by stage")} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">{tr("All stages")}</option>
          {Object.entries(BILL_STAGE_LABEL).map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}
        </select>
      </div>
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="scroll">
          <table style={{ minWidth: 700 }}>
            <thead><tr><th>{tr("Bill")}</th><th>{tr("Date")}</th><th>{tr("Shop")}</th><th>{tr("Stage")}</th><th>{tr("Held by")}</th><th className="num">{tr("Pending")}</th></tr></thead>
            <tbody>
              {data.items.map((b: any) => (
                <tr key={b._id}>
                  <td className="mono"><Link href={`/office/bills/${b._id}`}>{b.billNo}</Link></td>
                  <td className="mono small">{b.billDate}</td>
                  <td>{b.shopId.name}</td>
                  <td><Stamp tone={b.stage === "closed" ? "ok" : "plain"}>{tr(BILL_STAGE_LABEL[b.stage as BillStage])}</Stamp></td>
                  <td className="small">{tr(b.holderLabel)}</td>
                  <td className="num"><Rs paise={b.openPaise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
