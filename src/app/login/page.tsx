"use client";
import { useEffect, useState } from "react";
import { MessageCircleHeart } from "lucide-react";
import { Button, Field, Input, Notice, TechDetails } from "@/components/ui";
import { humanize } from "@/lib/client";

export default function LoginPage() {
  const [setup, setSetup] = useState<{ needsSetup: boolean; allowedHere: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/auth/setup").then((r) => r.json()).then(setSetup).catch(() => setSetup({ needsSetup: false, allowedHere: false }));
  }, []);
  const creating = setup?.needsSetup;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(creating ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(creating ? { email, password, name } : { email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(res.status === 401 ? "That email and password don't match. Check them and try again." : humanize(data.error ?? "Sign-in failed").message);
    location.href = "/";
  }
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-20%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
      <form onSubmit={submit} className="relative w-full max-w-[380px] animate-rise space-y-5 rounded-2xl border border-line bg-panel/90 p-7 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl">
        <div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-fg">
            <MessageCircleHeart className="size-5 text-bg" aria-hidden />
          </span>
          <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">{creating ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{creating ? "You're the first person here, so you'll be the owner." : "Sign in to your Creator Inbox."}</p>
        </div>
        {creating && !setup?.allowedHere && (
          <Notice tone="warn" title="Create the owner on the server">
            For safety, the first account can only be created on the computer running the app.
            <TechDetails>npm run user:create -- --email you@example.com --role owner</TechDetails>
          </Notice>
        )}
        {creating && (
          <Field label="Your name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}</Field>
        )}
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />}</Field>
        <Field label="Password" hint={creating ? "At least 12 characters. A password manager makes this easy." : undefined}>
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 12 : 1} />}
        </Field>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={creating && !setup?.allowedHere}>
          {creating ? "Create account" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
