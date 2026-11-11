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

/**
 * Turn a technical error into a sentence a non-technical person can act on.
 * The original text is always kept so it can be shown under "Technical details".
 */
export function humanize(raw: string | null | undefined): { message: string; technical: string } {
  const t = (raw ?? "").trim();
  const low = t.toLowerCase();
  const m = (message: string) => ({ message, technical: t });
  if (!t) return m("Something went wrong. Please try again.");
  if (/\b(401|403|unauthori[sz]ed|forbidden|invalid (api )?key|authentication)\b/.test(low)) return m("We couldn't connect with those details. Check that you copied the whole key, then try again.");
  if (/\b429\b|rate.?limit|too many requests/.test(low)) return m("The service is busy right now. Wait a minute and try again.");
  if (/timeout|timed out|aborted/.test(low)) return m("The service took too long to answer. Check your internet connection and try again.");
  if (/enotfound|econnrefused|econnreset|network|fetch failed|getaddrinfo/.test(low)) return m("We couldn't reach the service. Check your internet connection and try again.");
  if (/\b5\d\d\b|server error|bad gateway|unavailable/.test(low)) return m("The service had a problem on its side. Try again in a few minutes.");
  if (/model.*(not (listed|found)|unknown)|not (listed|found).*model/.test(low)) return m("That AI model name wasn't found. Check the spelling, or pick one of the suggested models.");
  if (/not passed a connection test|needs test|retest/.test(low)) return m("Your AI connection needs a quick test before it can write replies.");
  if (/emergency stop/.test(low)) return m("Sending is stopped for everyone right now. Release the emergency stop to send again.");
  if (/budget/.test(low)) return m("Today's AI spending limit has been reached. Raise it in Settings or wait until tomorrow.");
  if (/csrf|origin/.test(low)) return m("Your session needs a refresh. Reload the page and try again.");
  if (/too many attempts|throttl/.test(low)) return m("Too many attempts. Wait 15 minutes and try again.");
  if (/private|internal address|https only|blocked/.test(low)) return m("That address can't be used. Use a public https:// address.");
  // Server messages written for people are passed through as-is.
  if (t.length < 160 && !/[{}<>]|\bat \w+\.\w+|stack|errno/i.test(t)) return { message: t, technical: t };
  return m("Something went wrong. Please try again, or open Technical details for more information.");
}
