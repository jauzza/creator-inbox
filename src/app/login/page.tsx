"use client";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";

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
    if (!res.ok) return setError(data.error ?? "Sign-in failed");
    location.href = creating ? "/help" : "/";
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-accent" aria-hidden />
          <h1 className="text-base font-semibold">{creating ? "Create the owner account" : "Sign in to Creator Inbox"}</h1>
        </div>
        {creating && !setup?.allowedHere && (
          <Notice tone="warn">First-run setup only works from localhost. On a server run <code>npm run user:create -- --email you@example.com --role owner</code>.</Notice>
        )}
        {creating && setup?.allowedHere && <Notice>No users exist yet. This creates the workspace owner. Use a password manager; at least 12 characters.</Notice>}
        {creating && (
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}</Field>
        )}
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />}</Field>
        <Field label="Password">
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 12 : 1} />}
        </Field>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={creating && !setup?.allowedHere}>
          {creating ? "Create owner and continue" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
