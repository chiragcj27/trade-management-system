"use client";

import { tr } from "@/lib/i18n";
import { formatRupees } from "@repo/shared";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const Rs = ({ paise }: { paise: number | null | undefined }) => (
  <span className="mono nowrap">{formatRupees(paise ?? 0)}</span>
);

export function Btn({
  tone = "primary",
  size,
  full,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger"; size?: "small"; full?: boolean }) {
  const classes = ["btn", tone === "primary" ? "" : tone, size === "small" ? "small-btn" : "", full ? "full" : "", className ?? ""];
  return <button type="button" {...props} className={classes.filter(Boolean).join(" ")} />;
}

export type StampTone = "ok" | "warn" | "bad" | "info" | "plain";
export const Stamp = ({ tone = "plain", children }: { tone?: StampTone; children: ReactNode }) => (
  <span className={`stamp ${tone}`}>{children}</span>
);

export const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="stat">
    <span className="lab">{tr(label)}</span>
    <span className="num-big">{children}</span>
  </div>
);

export function Loading({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <div className="card alert">{tr(error)}</div>;
  if (loading) return <p className="muted">{tr("Loading...")}</p>;
  return null;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="card muted">{children}</div>;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {tr(label)}
      {children}
    </label>
  );
}

export function Segments<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {tr(o.label)}
        </button>
      ))}
    </div>
  );
}

const STATUS: Record<string, [string, StampTone]> = {
  planned: ["Not started", "plain"],
  issued: ["Bills to accept", "warn"],
  accepted: ["Ready to start", "info"],
  started: ["On the road", "info"],
  ended: ["Waiting for check", "warn"],
  checked: ["Checked", "ok"],
  claimed: ["Unconfirmed", "warn"],
  confirmed: ["Confirmed", "ok"],
  rejected: ["Rejected", "bad"],
  cancelled: ["Cancelled", "plain"],
  qr_shown: ["QR open", "info"],
  checked_in: ["In shop now", "info"],
  checked_out: ["Done", "ok"],
  skipped: ["Skipped", "warn"],
  pending: ["Waiting", "warn"],
  approved: ["Approved", "ok"],
  submitted: ["To review", "warn"],
  open: ["Open", "warn"],
  settled: ["Settled", "ok"],
  resolved: ["Resolved", "ok"],
  received: ["In hand", "info"],
  deposited: ["Deposited", "warn"],
  cleared: ["Cleared", "ok"],
  bounced: ["Bounced", "bad"],
};

export function Status({ value }: { value: string }) {
  const [label, tone] = STATUS[value] ?? [value, "plain" as StampTone];
  return <Stamp tone={tone}>{tr(label)}</Stamp>;
}

export function Severity({ value }: { value: string }) {
  return <Stamp tone={value === "critical" ? "bad" : value === "warning" ? "warn" : "info"}>{value === "critical" ? tr("Serious") : value === "warning" ? tr("Check") : tr("Note")}</Stamp>;
}

export function Progress({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" role="img" aria-label={`${done} / ${total}`}>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      <span className="mono small">{done}/{total}</span>
    </div>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <h1>{tr(title)}</h1>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
