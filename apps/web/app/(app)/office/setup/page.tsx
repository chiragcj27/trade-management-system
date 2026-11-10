"use client";

import { tr } from "@/lib/i18n";
import { ROLES, ROLE_LABEL, type Role, formatRupees, rupeesToPaise } from "@repo/shared";
import { useEffect, useState } from "react";
import { useAct } from "@/components/providers";
import { Btn, Field, Loading, PageTitle, Segments, Stamp } from "@/components/ui";
import { api, useData } from "@/lib/api";

type Tab = "shops" | "products" | "staff" | "beats" | "plan" | "vehicles" | "books" | "settings";
const TABS: { value: Tab; label: string }[] = [
  { value: "shops", label: "Shops" }, { value: "products", label: "Products" }, { value: "staff", label: "Staff" }, { value: "beats", label: "Beats" },
];
const TABS2: { value: Tab; label: string }[] = [
  { value: "plan", label: "Week plan" }, { value: "vehicles", label: "Vehicles" }, { value: "books", label: "Receipt books" }, { value: "settings", label: "Settings" },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SetupPage() {
  const [tab, setTab] = useState<Tab>("shops");
  const { data, error, loading, reload } = useData("/office/masters");
  if (!data) return <main className="page wrap"><Loading error={error} loading={loading} /></main>;
  return (
    <main className="page wrap">
      <PageTitle title="Setup" />
      <LocationRequests />
      <div className="stack" style={{ gap: 6 }}>
        <Segments value={TABS.some((t) => t.value === tab) ? tab : ("" as Tab)} onChange={setTab} options={TABS} />
        <Segments value={TABS2.some((t) => t.value === tab) ? tab : ("" as Tab)} onChange={setTab} options={TABS2} />
      </div>
      {tab === "shops" && <Shops data={data} reload={reload} />}
      {tab === "products" && <Products data={data} reload={reload} />}
      {tab === "staff" && <StaffList data={data} reload={reload} />}
      {tab === "beats" && <Beats data={data} reload={reload} />}
      {tab === "plan" && <WeekPlan data={data} reload={reload} />}
      {tab === "vehicles" && <Vehicles data={data} reload={reload} />}
      {tab === "books" && <Books />}
      {tab === "settings" && <SettingsForm />}
    </main>
  );
}

function LocationRequests() {
  const { data, reload } = useData("/office/location-requests");
  const { act, busy } = useAct(reload);
  if (!data || data.items.length === 0) return null;
  return (
    <div className="stack">
      <h2>{tr("Shop location changes to approve")}</h2>
      {data.items.map((s: any) => (
        <div key={s._id} className="card">
          <strong>{s.name}</strong>
          <p className="small muted">{s.locationRequest.staffId?.name}: {s.locationRequest.reason}</p>
          <a className="small" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${s.locationRequest.lat},${s.locationRequest.lng}`}>{tr("See requested place on map")}</a>
          <div className="row">
            <Btn size="small" disabled={busy} onClick={() => act(() => api(`/office/shops/${s._id}/location-decision`, { body: { approve: true } }), "Location updated")}>{tr("Approve")}</Btn>
            <Btn size="small" tone="danger" disabled={busy} onClick={() => act(() => api(`/office/shops/${s._id}/location-decision`, { body: { approve: false } }), "Request rejected")}>{tr("Reject")}</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

function useAdd(kind: string, reload: () => Promise<void>) {
  const { act, busy } = useAct(reload);
  return { busy, add: (body: object, reset: () => void) => act(async () => { await api(`/office/masters/${kind}`, { body }); reset(); }, "Added") };
}

function Shops({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { add, busy } = useAdd("shops", reload);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [beatId, setBeatId] = useState(""); const [sequence, setSequence] = useState("");
  return (
    <div className="stack">
      <div className="card">
        <div className="grid4">
          <Field label="Shop name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><input type="text" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Beat"><select value={beatId} onChange={(e) => setBeatId(e.target.value)}><option value="">{tr("Choose")}</option>{data.beats.map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
          <Field label="Visit order"><input type="number" inputMode="numeric" value={sequence} onChange={(e) => setSequence(e.target.value)} /></Field>
        </div>
        <div><Btn disabled={busy || !name.trim() || !beatId || !sequence} onClick={() => add({ name, phone, beatId, sequence: Number(sequence) }, () => { setName(""); setPhone(""); setSequence(""); })}>{tr("Add shop")}</Btn></div>
      </div>
      <div className="scroll"><table style={{ minWidth: 560 }}><thead><tr><th>{tr("Beat")}</th><th>#</th><th>{tr("Shop")}</th><th>{tr("Phone")}</th><th>{tr("Location")}</th></tr></thead><tbody>
        {data.shops.map((s: any) => <tr key={s._id}><td>{s.beatId?.name}</td><td className="mono">{s.sequence}</td><td>{s.name}</td><td className="mono small">{s.phone}</td><td>{s.location ? <Stamp tone="ok">{tr("Locked")}</Stamp> : <Stamp tone="warn">{tr("First visit will save it")}</Stamp>}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function Products({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { add, busy } = useAdd("products", reload);
  const { act } = useAct(reload);
  const [name, setName] = useState(""); const [unit, setUnit] = useState("carton"); const [priority, setPriority] = useState(""); const [rate, setRate] = useState("");
  return (
    <div className="stack">
      <div className="card">
        <div className="grid4">
          <Field label="Product"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Unit"><input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Priority (1 is first)"><input type="number" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} /></Field>
          <Field label="Rate (₹)"><input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        </div>
        <div><Btn disabled={busy || !name.trim() || !priority} onClick={() => add({ name, unit, priority: Number(priority), ratePaise: rupeesToPaise(Number(rate) || 0) }, () => { setName(""); setPriority(""); setRate(""); })}>{tr("Add product")}</Btn></div>
      </div>
      <div className="scroll"><table style={{ minWidth: 480 }}><thead><tr><th>{tr("Priority")}</th><th>{tr("Product")}</th><th>{tr("Unit")}</th><th className="num">{tr("Rate")}</th><th></th></tr></thead><tbody>
        {data.products.map((p: any) => <tr key={p._id}><td className="mono">{p.priority}</td><td>{p.name}</td><td>{p.unit}</td><td className="num">{formatRupees(p.ratePaise)}</td><td><Btn size="small" tone="ghost" onClick={() => act(() => api(`/office/masters/products/${p._id}`, { method: "PATCH", body: { active: !p.active } }))}>{p.active ? tr("Hide") : tr("Show")}</Btn></td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function StaffList({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { add, busy } = useAdd("staff", reload);
  const { act } = useAct(reload);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [role, setRole] = useState<Role>("salesman");
  return (
    <div className="stack">
      <div className="card">
        <div className="grid3">
          <Field label="Name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><input type="text" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{tr(ROLE_LABEL[r])}</option>)}</select></Field>
        </div>
        <div><Btn disabled={busy || name.trim().length < 2} onClick={() => add({ name, phone, role }, () => { setName(""); setPhone(""); })}>{tr("Add staff")}</Btn></div>
      </div>
      <div className="scroll"><table style={{ minWidth: 480 }}><thead><tr><th>{tr("Name")}</th><th>{tr("Role")}</th><th>{tr("Phone")}</th><th></th></tr></thead><tbody>
        {data.staff.map((s: any) => <tr key={s._id}><td>{s.name}</td><td>{tr(ROLE_LABEL[s.role as Role])}</td><td className="mono small">{s.phone}</td><td><Btn size="small" tone="ghost" onClick={() => act(() => api(`/office/masters/staff/${s._id}`, { method: "PATCH", body: { active: !s.active } }))}>{s.active ? tr("Deactivate") : tr("Activate")}</Btn></td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function Beats({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { add, busy } = useAdd("beats", reload);
  const [name, setName] = useState(""); const [minutes, setMinutes] = useState("300"); const [km, setKm] = useState("40");
  return (
    <div className="stack">
      <div className="card">
        <div className="grid3">
          <Field label="Beat name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Planned minutes"><input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          <Field label="Planned km"><input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
        </div>
        <div><Btn disabled={busy || name.trim().length < 2} onClick={() => add({ name, plannedMinutes: Number(minutes), plannedKm: Number(km) }, () => setName(""))}>{tr("Add beat")}</Btn></div>
      </div>
      <div className="scroll"><table><thead><tr><th>{tr("Beat")}</th><th className="num">{tr("Planned minutes")}</th><th className="num">{tr("Planned km")}</th></tr></thead><tbody>
        {data.beats.map((b: any) => <tr key={b._id}><td>{b.name}</td><td className="num">{b.plannedMinutes}</td><td className="num">{b.plannedKm}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function WeekPlan({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const collectors = data.staff.filter((s: any) => ["salesman", "collection_agent"].includes(s.role));
  const beatFor = (staffId: string, weekday: number) => data.plans.find((p: any) => p.staffId === staffId && p.weekday === weekday)?.beatId ?? "";
  return (
    <div className="scroll">
      <table style={{ minWidth: 1040 }}>
        <thead><tr><th>{tr("Staff")}</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {collectors.map((s: any) => (
            <tr key={s._id}>
              <td>{s.name}</td>
              {DAYS.map((d, weekday) => (
                <td key={d}>
                  <select aria-label={tr(`${s.name} on ${d}`)} disabled={busy} value={beatFor(s._id, weekday)} onChange={(e) => act(() => api("/office/beat-plans", { body: { staffId: s._id, weekday, beatId: e.target.value || null } }))} style={{ minWidth: 120, fontSize: 14 }}>
                    <option value="">{tr("None")}</option>
                    {data.beats.map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Vehicles({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { add, busy } = useAdd("vehicles", reload);
  const [number, setNumber] = useState(""); const [normal, setNormal] = useState("12");
  return (
    <div className="stack">
      <div className="card">
        <div className="grid2">
          <Field label="Vehicle number"><input type="text" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          <Field label="Normal km per litre"><input type="number" inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} /></Field>
        </div>
        <div><Btn disabled={busy || number.trim().length < 2} onClick={() => add({ number, normalKmPerLitre: Number(normal) }, () => setNumber(""))}>{tr("Add vehicle")}</Btn></div>
      </div>
      <div className="scroll"><table><thead><tr><th>{tr("Vehicle")}</th><th className="num">{tr("Normal km/L")}</th><th className="num">{tr("Last odometer")}</th></tr></thead><tbody>
        {data.vehicles.map((v: any) => <tr key={v._id}><td className="mono">{v.number}</td><td className="num">{v.normalKmPerLitre}</td><td className="num">{v.lastOdometer}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function Books() {
  const { data, error, loading, reload } = useData("/office/receipt-books");
  const { act, busy } = useAct(reload);
  const [staffId, setStaffId] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  if (!data) return <Loading error={error} loading={loading} />;
  return (
    <div className="stack">
      <div className="card">
        <div className="grid3">
          <Field label="Issue to"><select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">{tr("Choose")}</option>{data.staff.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
          <Field label="First page"><input type="number" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Last page"><input type="number" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div><Btn disabled={busy || !staffId || !from || !to} onClick={() => act(async () => { await api("/office/receipt-books", { body: { staffId, fromSerial: Number(from), toSerial: Number(to) } }); setFrom(""); setTo(""); }, "Book issued")}>{tr("Issue book")}</Btn></div>
      </div>
      <div className="scroll"><table><thead><tr><th>{tr("Staff")}</th><th>{tr("Pages")}</th><th>{tr("Checked up to")}</th></tr></thead><tbody>
        {data.books.map((b: any) => <tr key={b._id}><td>{b.staffId.name}</td><td className="mono">{b.fromSerial}{tr(" to ")}{b.toSerial}</td><td className="mono">{b.checkedUpto || tr("None")}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function SettingsForm() {
  const { data, error, loading, reload } = useData("/office/settings");
  const { act, busy } = useAct(reload);
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (data) setForm({ ...data, discountLimitPercent: data.discountLimitPercent ?? "" }); }, [data]);
  if (!form) return <Loading error={error} loading={loading} />;
  const set = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value }));
  const num: [string, string][] = [["checkInRadiusMeters", "Check-in distance (m)"], ["maxStopMinutes", "Long stop after (min)"], ["maxGapMinutes", "Long gap after (min)"], ["mileageTolerancePercent", "Mileage tolerance (%)"], ["lateEntryMinutes", "Late entry after (min)"]];
  return (
    <div className="card">
      <div className="grid2">
        <Field label="Firm name"><input type="text" value={form.firmName} onChange={(e) => set("firmName", e.target.value)} /></Field>
        <Field label="Firm UPI ID"><input type="text" value={form.firmUpiId} onChange={(e) => set("firmUpiId", e.target.value)} /></Field>
        <Field label="Cash discount limit % (blank means review all)"><input type="number" inputMode="decimal" value={form.discountLimitPercent} onChange={(e) => set("discountLimitPercent", e.target.value)} /></Field>
        {num.map(([key, label]) => <Field key={key} label={label}><input type="number" inputMode="numeric" value={form[key]} onChange={(e) => set(key, e.target.value)} /></Field>)}
      </div>
      <div><Btn disabled={busy} onClick={() => act(() => api("/office/settings", { method: "PATCH", body: { firmName: form.firmName, firmUpiId: form.firmUpiId, discountLimitPercent: form.discountLimitPercent === "" ? null : Number(form.discountLimitPercent), ...Object.fromEntries(num.map(([k]) => [k, Number(form[k])])) } }), "Settings saved")}>{tr("Save settings")}</Btn></div>
    </div>
  );
}
