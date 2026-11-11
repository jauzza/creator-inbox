"use client";
import { useCallback, useEffect, useRef, useState } from "react";

let csrf = "";
export function setCsrf(t: string) {
  csrf = t;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: string[]) {
    super(message);
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login";
  if (!res.ok) throw new ApiError((data.error ?? `Request failed (${res.status})`) + (data.issues ? `: ${data.issues.join("; ")}` : ""), res.status, data.issues);
  return data;
}

export async function getJson<T = any>(url: string): Promise<T> {
  return parse(await fetch(url, { cache: "no-store", credentials: "same-origin" }));
}

export async function post<T = any>(url: string, body: unknown): Promise<T> {
  return parse(await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(body) }));
}

/** Minimal data hook with optional polling (pauses while the tab is hidden). */
export function useApi<T = any>(url: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;
  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const d = await getJson<T>(u);
      if (urlRef.current === u) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    setData(null);
    load();
  }, [url, load]);
  useEffect(() => {
    if (!opts.poll || !url) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, url, load]);
  return { data, error, loading, reload: load, setData };
}

export const money = (cents: number | null | undefined) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)}`);
export const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2)}`;
export function ago(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const fut = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return fut ? `in ${v}` : `${v} ago`;
}
export const fmtTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
