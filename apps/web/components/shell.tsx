"use client";

import { tr } from "@/lib/i18n";
import { ROLE_LABEL, type Role } from "@repo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { type LocationMode, api, getLocationMode, getStaffId, setLocationMode, setStaffId, useData } from "@/lib/api";
import { LangToggle, useToast } from "./providers";

interface Me {
  staff: { _id: string; name: string; role: Role };
  demo: boolean;
  firm: { name: string; upiId: string };
}
const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe needs the app shell");
  return me;
}

const FIELD_ROLES: Role[] = ["salesman", "collection_agent", "driver", "helper"];

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [location, setLocation] = useState<LocationMode>("shop");

  useEffect(() => {
    if (!getStaffId()) {
      router.replace("/");
      return;
    }
    setLocation(getLocationMode());
    setShowGuide(window.innerWidth >= 720);
    setReady(true);
  }, [router]);

  const { data: me, error } = useData<Me>(ready ? "/me" : null);
  const { data: demoData } = useData<{ personas: { staffId: { _id: string }; title: string; story: string; tryThis: string[] }[] }>(me?.demo ? "/demo/personas" : null);

  useEffect(() => {
    if (error) {
      setStaffId(null);
      router.replace("/");
    }
  }, [error, router]);

  if (!me) return <p className="wrap muted" style={{ paddingTop: 24 }}>{tr("Loading...")}</p>;

  const persona = demoData?.personas.find((p) => p.staffId._id === me.staff._id);
  const isField = FIELD_ROLES.includes(me.staff.role);

  async function reset() {
    setResetting(true);
    try {
      await api("/demo/reset", { method: "POST", body: {} });
      toast("ok", "Demo data restored");
      setStaffId(null);
      window.location.href = "/";
    } catch (e) {
      toast("bad", (e as Error).message);
      setResetting(false);
    }
  }

  return (
    <MeContext.Provider value={me}>
      <div className="demobar">
        <div className="wrap inner">
          <div className="avatar on-band" aria-hidden="true">{me.staff.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
          <div className="who">
            <strong>{me.staff.name}</strong>
            <span>{tr(ROLE_LABEL[me.staff.role])}{me.demo && " · Demo"}</span>
          </div>
          <LangToggle />
          {me.demo && isField && (
            <select
              aria-label={tr("Demo location")}
              value={location}
              onChange={(e) => {
                const mode = e.target.value as LocationMode;
                setLocation(mode);
                setLocationMode(mode);
              }}
            >
              <option value="shop">{tr("Location: at shop")}</option>
              <option value="away">{tr("Location: away")}</option>
              <option value="real">{tr("Location: real GPS")}</option>
            </select>
          )}
          {persona && <button type="button" onClick={() => setShowGuide((v) => !v)}>{showGuide ? tr("Hide guide") : tr("Guide")}</button>}
          <Link className="link" href="/" onClick={() => setStaffId(null)}>{tr("Switch role")}</Link>
          {me.demo &&
            (confirming ? (
              <button type="button" disabled={resetting} onClick={reset}>{resetting ? tr("Restoring...") : tr("Confirm reset")}</button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)}>{tr("Reset demo")}</button>
            ))}
        </div>
      </div>
      {persona && showGuide && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <div className="guide">
            <h3>{tr(persona.title)}</h3>
            <p className="small">{tr(persona.story)}</p>
            <ul>{persona.tryThis.map((t) => <li key={t}>{tr(t)}</li>)}</ul>
          </div>
        </div>
      )}
      {children}
    </MeContext.Provider>
  );
}
