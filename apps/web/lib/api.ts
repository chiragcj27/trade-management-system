"use client";

import { useCallback, useEffect, useState } from "react";

const STAFF_KEY = "beat-register.staff";
const LOCATION_KEY = "beat-register.location";

export type LocationMode = "shop" | "away" | "real";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing can block storage; the app still works for this page view.
  }
}

export const getStaffId = () => read(STAFF_KEY);
export const setStaffId = (id: string | null) => write(STAFF_KEY, id);
export const getLocationMode = (): LocationMode => (read(LOCATION_KEY) as LocationMode | null) ?? "shop";
export const setLocationMode = (mode: LocationMode) => write(LOCATION_KEY, mode);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", "x-staff-id": getStaffId() ?? "" },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // A failed proxy can answer with something that is not JSON.
  }
  if (!res.ok) {
    const payload = data as { error?: string; code?: string } | null;
    throw new ApiError(payload?.error ?? "The server could not complete this.", res.status, payload?.code);
  }
  return data as T;
}

export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api<T>(path);
      setData(result);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export function timeOf(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

export function dateTimeOf(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function minutesBetween(from: string | null | undefined, to?: string | null): number | null {
  if (!from) return null;
  return Math.max(0, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000));
}

export interface Gps {
  lat: number;
  lng: number;
  accuracy?: number;
}

const FALLBACK = { lat: 26.9124, lng: 75.7873 };

/** Reads the position for an action. Demo mode can pretend to be at, or away from, the target. */
export function getGps(target?: { lat?: number | null; lng?: number | null } | null): Promise<Gps> {
  const mode = getLocationMode();
  const point = target?.lat != null && target.lng != null ? { lat: target.lat, lng: target.lng } : FALLBACK;
  if (mode === "shop") return Promise.resolve({ lat: point.lat + 0.0001, lng: point.lng + 0.0001, accuracy: 12 });
  if (mode === "away") return Promise.resolve({ lat: point.lat + 0.012, lng: point.lng + 0.008, accuracy: 15 });
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This phone cannot share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location permission is off. Turn it on for this app to continue."
              : "Could not get your location. Move to open sky and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
