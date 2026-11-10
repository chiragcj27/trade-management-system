"use client";

import { type Lang, applyLang, getLang, storedLang, tr } from "@/lib/i18n";
import { Fragment, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { tone: "ok" | "bad"; text: string } | null;
const ToastContext = createContext<(tone: "ok" | "bad", text: string) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({ lang: "hi", setLang: () => undefined });

export function LangToggle() {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div className="lang" role="group" aria-label="Language">
      <button type="button" className={lang === "hi" ? "on" : ""} aria-pressed={lang === "hi"} onClick={() => setLang("hi")}>Hinglish</button>
      <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lang, setLangState] = useState<Lang>(getLang());

  const setLang = useCallback((next: Lang) => {
    applyLang(next);
    setLangState(next);
  }, []);

  useEffect(() => {
    const saved = storedLang();
    if (saved && saved !== getLang()) setLang(saved);
  }, [setLang]);

  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi-Latn" : "en";
  }, [lang]);

  const show = useCallback((tone: "ok" | "bad", text: string) => {
    setToast({ tone, text: tr(text) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), tone === "bad" ? 6000 : 3000);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <LangContext.Provider value={{ lang, setLang }}>
        {/* Changing language redraws every screen in the new wording. */}
        <Fragment key={lang}>{children}</Fragment>
      </LangContext.Provider>
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Runs a save, blocks double taps, and reports the outcome in plain words. */
export function useAct(after?: () => void | Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const act = useCallback(
    async (work: () => Promise<unknown>, done?: string): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        await work();
        if (done) toast("ok", done);
        await after?.();
        return true;
      } catch (e) {
        toast("bad", (e as Error).message);
        await after?.();
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [after, toast],
  );

  return { busy, act };
}
