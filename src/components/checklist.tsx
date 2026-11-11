"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button, Card } from "./ui";
import { useApi } from "@/lib/client";

export const STEPS: { key: string; title: string; href: string; how: string }[] = [
  { key: "launch", title: "Launch the app", href: "/help#launch", how: "You're here. The app and its database are running." },
  { key: "login", title: "Sign in", href: "/help#login", how: "Owner account created and signed in." },
  { key: "simulator", title: "Try the simulated inbox", href: "/simulator", how: "Trigger a scenario (e.g. “burst”) and watch it arrive in the Inbox." },
  { key: "provider", title: "Messaging provider key (optional)", href: "/integrations", how: "Enter a Fans API key, test it, connect and select an account. Skip if you're only evaluating." },
  { key: "ai", title: "AI connection", href: "/integrations#ai", how: "Offline simulator rules work out of the box. For real drafts, add a DeepSeek key and pass the model test." },
  { key: "style", title: "Preview the creator style", href: "/style", how: "Run the preview playground and see which settings were applied." },
  { key: "timing", title: "Review timing rules", href: "/automation", how: "Check delays, active hours and caps; use the preview, then save." },
  { key: "approve", title: "Approve a draft", href: "/inbox?filter=drafts", how: "Open a conversation with a draft, edit if needed, and send." },
  { key: "pause", title: "Pause one chat", href: "/inbox", how: "Set a conversation's mode to Paused or Manual in the conversation header." },
  { key: "stop", title: "Test the global stop", href: "/automation", how: "Press “Stop all sends”, confirm queued replies are held, then release it." },
  { key: "scoring", title: "See intent scoring", href: "/customers", how: "Trigger the “high_interest” scenario, then check the evidence on Customers." },
  { key: "notify", title: "Test notifications", href: "/integrations#telegram", how: "Send a Telegram test (or in-app test) notification." },
  { key: "takeover", title: "Take over and resume", href: "/inbox", how: "Take over a conversation (pending AI work is cancelled), then resume it explicitly." },
  { key: "logs", title: "Check the activity log", href: "/activity", how: "Every control above leaves an audit entry. Troubleshooting lives here too." },
];

export function Checklist({ compact }: { compact?: boolean }) {
  const { data } = useApi<{ steps: Record<string, boolean> }>("/api/onboarding", { poll: 20000 });
  const [hidden, setHidden] = useState(false);
  const [logsSeen, setLogsSeen] = useState(false);
  useEffect(() => {
    // UI preference only (no secrets): whether the checklist was dismissed / logs visited.
    setHidden(localStorage.getItem("ci_checklist_hidden") === "1");
    setLogsSeen(localStorage.getItem("ci_logs_seen") === "1");
  }, []);
  if (!data) return null;
  const done = (k: string) => (k === "logs" ? logsSeen : !!data.steps[k]);
  const count = STEPS.filter((s) => done(s.key)).length;
  if (compact && hidden)
    return (
      <Card title="Getting started" actions={<Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem("ci_checklist_hidden"); setHidden(false); }}>Show</Button>}>
        <p className="text-xs text-muted">{count}/{STEPS.length} steps done. The full guide is under Guide.</p>
      </Card>
    );
  return (
    <Card
      title={`Getting started · ${count}/${STEPS.length}`}
      description="Each step is detected from what you actually did. Skip any time; revisit under Guide."
      actions={compact && <Button size="sm" variant="ghost" onClick={() => { localStorage.setItem("ci_checklist_hidden", "1"); setHidden(true); }}>Hide</Button>}
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded bg-panel-2" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>
      <ol className={compact ? "grid gap-x-4 gap-y-1.5 sm:grid-cols-2" : "space-y-2"}>
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-start gap-2">
            {done(s.key) ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" aria-label="not done" />}
            <div className="min-w-0">
              <Link href={s.href} className="text-[13px] hover:text-accent">
                {i + 1}. {s.title}
              </Link>
              {!compact && <p className="text-xs text-muted">{s.how}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
