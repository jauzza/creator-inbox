"use client";
import Link from "next/link";
import { Card, Notice, PageHeader } from "@/components/ui";
import { Checklist } from "@/components/checklist";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  { id: "launch", title: "1. Launch", body: <>Locally: <code>docker compose up -d</code> (or <code>sh scripts/dev-local.sh</code> with a local Postgres). The <b>worker</b> must run too: it generates drafts, sends on schedule and delivers notifications. Local mode only works while your computer is awake. See README for the VPS.</> },
  { id: "login", title: "2. Sign in", body: <>The first owner is created on the login page (localhost only) or with <code>npm run user:create</code>. Sessions are httpOnly cookies; failed logins are throttled.</> },
  { id: "sim", title: "3. Simulated inbox", body: <>Open <Link href="/simulator">Simulator</Link>, fire “burst”, then open the chat in <Link href="/inbox">Inbox</Link>. Use “Skip waits” to avoid waiting for debounce and pacing.</> },
  { id: "provider", title: "4. Provider setup", body: <>Optional for evaluation. <Link href="/integrations">Integrations</Link> → save the Fans API key → Test → connect the creator in the provider's hosted flow → List → Select. The key, the account id and the AI key are three different things.</> },
  { id: "ai", title: "5. AI connection", body: <>Out of the box, drafts come from “Simulator AI (offline rules)”, clearly labelled. For real drafts choose DeepSeek, save a key, and press <b>Test model</b>. Untested models are refused.</> },
  { id: "style", title: "6. Style preview", body: <><Link href="/style">Creator style</Link> → edit facts/examples/tone → save a version → Preview playground shows the draft and which settings were applied.</> },
  { id: "timing", title: "7. Timing", body: <><Link href="/automation">Automation</Link> → Timing &amp; schedule. Preview shows exactly when a reply would go out for a sample burst.</> },
  { id: "approve", title: "8. Draft approval", body: <>Drafts show the next action, the reason, validator checks, model and cost. Edit, label (too formal, invented fact…), then Approve &amp; send, or Reject.</> },
  { id: "pause", title: "9. Per-chat pause", body: <>In a conversation header: Pause, or set the mode override. The most restrictive of global/account/chat wins.</> },
  { id: "stop", title: "10. Global stop", body: <>“Stop all sends” in the top bar blocks every new send attempt immediately. A message the provider already accepted can't be retracted.</> },
  { id: "scoring", title: "11. Scoring", body: <>Fire “high_interest” and open <Link href="/customers">Customers</Link>: intent shows its evidence and decays over time. It ranks; it does not predict.</> },
  { id: "notify", title: "12. Notification test", body: <><Link href="/integrations#telegram">Integrations → Telegram</Link>: send an in-app or Telegram test. Alerts never include message bodies.</> },
  { id: "takeover", title: "13. Takeover / resume", body: <>Take over cancels pending AI drafts and sends. Automation only comes back when someone presses Resume (or an expiry you configured).</> },
  { id: "logs", title: "14. Logs", body: <><Link href="/activity">Activity &amp; settings</Link> lists every control action, failed jobs and webhook errors.</> },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Guide" description="A walkthrough you can follow in order, skip, or come back to. Progress is detected from what you actually did." />
      <Notice>
        What this tool will not do: generate explicit or sexual content, deny that AI assists, invent facts, prices, availability or scarcity, or send paid messages without a human confirming recipient, asset and price. Conversations outside scope go to a person.
      </Notice>
      <Checklist />
      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.id} title={s.title}>
            <div id={s.id} className="text-[13px] leading-relaxed text-muted [&_a]:text-accent [&_a:hover]:underline [&_code]:rounded [&_code]:bg-bg [&_code]:px-1">{s.body}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
