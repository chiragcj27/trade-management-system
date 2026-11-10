"use client";

import { tr } from "@/lib/i18n";
import { ROLES, ROLE_LABEL, type Role } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LangToggle, useAct } from "@/components/providers";
import { Btn, Loading } from "@/components/ui";
import { api, getStaffId, setStaffId, useData } from "@/lib/api";

interface Persona {
  _id: string;
  role: Role;
  title: string;
  story: string;
  home: string;
  staffId: { _id: string; name: string };
}

const ROLE_INTRO: Record<Role, string> = {
  salesman: "Beat, shop check-ins, orders and bill-to-bill collection.",
  collection_agent: "The same collection process, without taking orders.",
  driver: "Load sheet, delivery results, odometer and fuel.",
  helper: "Accepts the load with the driver and records deliveries.",
  godown: "Counts returned goods without seeing what is expected.",
  admin: "Issues bills, runs evening checks and clears every office queue.",
  owner: "Today's money, staff on the road, and every problem.",
};

export default function RolePicker() {
  const router = useRouter();
  const { data, error, loading, reload } = useData<{ seeded: boolean; personas: Persona[] }>("/demo/personas");
  const { act, busy } = useAct(reload);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const id = getStaffId();
    if (id && data) {
      const persona = data.personas.find((p) => p.staffId?._id === id);
      if (persona) router.replace(persona.home);
      else setStaffId(null);
    }
  }, [data, router]);

  function choose(persona: Persona) {
    setStaffId(persona.staffId._id);
    router.push(persona.home);
  }

  return (
    <>
      <header className="hero">
        <div className="wrap">
          <div className="row between"><span className="eyebrow">{tr("Demo")}</span><LangToggle /></div>
          <h1>{tr("Choose who you want to show")}</h1>
          <p style={{ maxWidth: "60ch" }}>{tr("Each card opens that person's real screen in a particular situation. Entries you make here are saved, and Reset restores the starting data.")}</p>
        </div>
      </header>
      <main className="page wrap">
        <Loading error={error} loading={loading} />
        {data && !data.seeded && (
          <div className="card">
            <p>{tr("The demo data has not been loaded yet.")}</p>
            <Btn disabled={busy} onClick={() => act(() => api("/demo/reset", { method: "POST", body: {} }), "Demo data loaded")}>{tr("Load demo data")}</Btn>
          </div>
        )}
        {data?.seeded &&
          ROLES.map((role) => {
            const people = data.personas.filter((p) => p.role === role && p.staffId);
            if (people.length === 0) return null;
            return (
              <section className="stack" key={role}>
                <div>
                  <h2>{tr(ROLE_LABEL[role])}</h2>
                  <p className="muted small">{tr(ROLE_INTRO[role])}</p>
                </div>
                <div className="persona-grid">
                  {people.map((p) => (
                    <button key={p._id} type="button" className="card" style={{ textAlign: "left", cursor: "pointer", alignContent: "start" }} onClick={() => choose(p)}>
                      <span className="persona-head"><span className="avatar" aria-hidden="true">{p.staffId.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span className="small muted">{p.staffId.name}</span></span>
                      <strong style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{tr(p.title)}</strong>
                      <span className="small">{tr(p.story)}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        {data?.seeded &&
          (confirming ? (
            <div className="row">
              <span>{tr("This replaces all demo entries with the starting data.")}</span>
              <Btn tone="danger" disabled={busy} onClick={() => act(() => api("/demo/reset", { method: "POST", body: {} }), "Demo data restored").then(() => setConfirming(false))}>{tr("Reset now")}</Btn>
              <Btn tone="ghost" onClick={() => setConfirming(false)}>{tr("Keep my entries")}</Btn>
            </div>
          ) : (
            <div><Btn tone="ghost" onClick={() => setConfirming(true)}>{tr("Reset demo data")}</Btn></div>
          ))}
      </main>
    </>
  );
}
