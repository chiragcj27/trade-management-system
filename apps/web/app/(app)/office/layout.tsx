"use client";

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "@/components/shell";
import { useData } from "@/lib/api";

const ADMIN_TABS: [string, string, string?][] = [
  ["/office", "Today"],
  ["/office/orders", "Orders", "newOrders"],
  ["/office/load", "Load sheet", "toLoad"],
  ["/office/issue", "Issue bills", "inFile"],
  ["/office/evening", "Evening check", "toCheck"],
  ["/office/upi", "UPI", "upi"],
  ["/office/cheques", "Cheque diary", "cheques"],
  ["/office/marg", "To enter in Marg", "marg"],
  ["/office/discounts", "Discounts", "adjustments"],
  ["/office/fuel", "Fuel", "fuel"],
  ["/office/problems", "Problems", "exceptions"],
  ["/office/bills", "Bills"],
  ["/office/setup", "Setup", "locationRequests"],
];
const OWNER_TABS: [string, string][] = [["/owner", "Summary"], ["/office/problems", "Problems"], ["/office/bills", "Bills"], ["/office/cheques", "Cheque diary"], ["/office/fuel", "Fuel"]];

export default function OfficeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { staff } = useMe();
  const { data } = useData(staff.role === "admin" ? `/office/board?${pathname}` : null);
  const tabs: [string, string, string?][] = staff.role === "owner" ? OWNER_TABS : ADMIN_TABS;
  return (
    <>
      <nav className="tabs" aria-label={tr("Office sections")}>
        <div className="wrap" style={{ display: "flex", gap: 2 }}>
          {tabs.map(([href, label, key]) => {
            const on = href === "/office" ? pathname === href : pathname.startsWith(href);
            const count = key ? data?.queues?.[key] : 0;
            return <Link key={href} href={href} className={on ? "on" : ""}>{tr(label)}{count > 0 && <span className="count">{count}</span>}</Link>;
          })}
        </div>
      </nav>
      {children}
    </>
  );
}
