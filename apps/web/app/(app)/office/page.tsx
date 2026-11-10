"use client";

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { LiveBoard } from "@/components/board";
import { Loading, PageTitle } from "@/components/ui";
import { useData } from "@/lib/api";

const QUEUES: [string, string, string][] = [
  ["newOrders", "New orders to bill", "/office/orders"],
  ["toLoad", "Bills to load", "/office/load"],
  ["inFile", "Bills in the beat file", "/office/issue"],
  ["toCheck", "Evening checks waiting", "/office/evening"],
  ["upi", "UPI to match with bank", "/office/upi"],
  ["cheques", "Cheques in progress", "/office/cheques"],
  ["marg", "To enter in Marg", "/office/marg"],
  ["adjustments", "Discounts to review", "/office/discounts"],
  ["fuel", "Fuel entries to review", "/office/fuel"],
  ["exceptions", "Open problems", "/office/problems"],
  ["locationRequests", "Shop location changes", "/office/setup"],
];

export default function OfficeHome() {
  const { data, error, loading } = useData("/office/board");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Today in the office" />
      <div className="grid4">
        {QUEUES.map(([key, label, href]) => (
          <Link key={key} href={href} className={`card tile ${data.queues[key] > 0 ? (key === "exceptions" ? "danger" : "busy") : "idle"}`}>
            <span className="num-big">{data.queues[key]}</span>
            <span className="small muted">{tr(label)}</span>
          </Link>
        ))}
      </div>
      <LiveBoard board={data} />
    </main>
  );
}
