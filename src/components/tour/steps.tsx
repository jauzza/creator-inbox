"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, MessageSquare, Plug, Sparkles } from "lucide-react";
import { getJson, post, useApi } from "@/lib/client";

export type TourData = { conversationId?: string; draftId?: string | null; draftOutcome?: string; drafting?: boolean };

export type TourStep = {
  id: string;
  chapter: "welcome" | "inbox" | "auto" | "ai" | "ppv" | "control" | "done";
  title: string;
  body: ReactNode | ((d: TourData) => ReactNode);
  /** Route to open when the step starts. `routeLoose` accepts any query string on the same path. */
  route?: string | ((d: TourData) => string);
  routeLoose?: boolean;
  /** data-tour attribute of the element to highlight. Omit for a centred card. */
  target?: string;
  placement?: "right" | "left" | "top" | "bottom";
  /** Allow clicks on the highlighted element even without a task. */
  interactive?: boolean;
  /** Something the user does; the step completes when the UI emits `event` (or the route matches `path`). */
  task?: { label: string; event: string; path?: (fullPath: string, d: TourData) => boolean };
  /** A button in the card that performs a real action, then advances. */
  primary?: { label: string; busyLabel?: string; optional?: boolean; run: (d: TourData) => Promise<Partial<TourData> | void> };
  /** Prepare prerequisites when entering (so Back/Skip never leave the user stranded). */
  ensure?: (d: TourData) => Promise<Partial<TourData> | void>;
};

export const CHAPTERS = [
  { id: "welcome", label: "Welcome" },
  { id: "inbox", label: "Your inbox" },
  { id: "auto", label: "Auto-reply" },
  { id: "ai", label: "Personality" },
  { id: "ppv", label: "PPV" },
  { id: "control", label: "You're in control" },
  { id: "done", label: "All set" },
] as const;

async function ensureConversation(d: TourData): Promise<Partial<TourData> | void> {
  if (d.conversationId) {
    const ok = await getJson(`/api/conversations/${d.conversationId}`).then(() => true).catch(() => false);
    if (ok) return;
  }
  const r = await post("/api/tour", { action: "receive" });
  return { conversationId: r.conversationId, draftId: null };
}

async function ensureDraft(d: TourData): Promise<Partial<TourData> | void> {
  const patch = (await ensureConversation(d)) ?? {};
  const id = patch.conversationId ?? d.conversationId!;
  const c = await getJson(`/api/conversations/${id}`);
  const active = c.drafts.find((x: any) => ["PROPOSED", "QUEUED", "APPROVED", "SENDING", "HANDOFF"].includes(x.status));
  const sent = c.messages.some((m: any) => m.direction === "OUTBOUND");
  if (active || sent) return { ...patch, draftId: active?.id ?? d.draftId };
  const r = await post("/api/tour", { action: "draft", conversationId: id });
  return { ...patch, draftId: r.draftId, draftOutcome: r.outcome };
}

const convoRoute = (d: TourData) => (d.conversationId ? `/inbox?c=${d.conversationId}` : "/inbox");

export const STEPS: TourStep[] = [
  {
    id: "welcome",
    chapter: "welcome",
    title: "Hi! Let's take a quick tour",
    body: (
      <>
        <p>In about four minutes you'll watch a subscriber's message arrive, see the AI write a reply, switch on auto-reply and watch it wait before sending, change a model's personality, see a natural PPV moment, and learn how to take over.</p>
        <p>Everything happens in a <b>safe demo</b>. Nothing is sent to real customers.</p>
      </>
    ),
  },
  {
    id: "home-status",
    chapter: "welcome",
    route: "/",
    target: "home-status",
    placement: "bottom",
    title: "Your models, at a glance",
    body: (
      <>
        <p>Each creator account you manage gets a card: its own AI personality, its own connection and its own AI switch (<b>Off</b>, <b>Drafts</b> or <b>Auto</b>).</p>
        <p>These two are demo models, so you can try everything without connecting a real account.</p>
      </>
    ),
  },
  {
    id: "stop-intro",
    interactive: true,
    chapter: "welcome",
    target: "emergency-stop",
    placement: "right",
    title: "Your safety button",
    body: (
      <>
        <p>This stops <b>every</b> message from being sent, everywhere in the app, with one click. It's always visible, even during this tour.</p>
        <p>You don't need to press it now.</p>
      </>
    ),
  },
  {
    id: "nav-inbox",
    chapter: "inbox",
    target: "nav-inbox",
    placement: "right",
    title: "Let's open your inbox",
    body: "Your inbox is where every customer conversation lives.",
    task: { label: "click Inbox.", event: "nav-inbox", path: (p) => p.startsWith("/inbox") },
  },
  {
    id: "inbox-list",
    chapter: "inbox",
    route: "/inbox",
    routeLoose: true,
    target: "inbox-list",
    placement: "right",
    title: "This is where messages arrive",
    body: (
      <>
        <p>New messages float to the top. Conversations that need a person are marked <b>Needs you</b>, and ready-to-approve replies are marked <b>Draft ready</b>.</p>
        <p>The ones marked <b>Demo</b> are pretend customers from the built-in simulator.</p>
      </>
    ),
  },
  {
    id: "receive",
    chapter: "inbox",
    route: "/inbox",
    routeLoose: true,
    target: "inbox-list",
    placement: "right",
    title: "A new customer writes in",
    body: (
      <>
        <p>Let's pretend a new fan just sent you a message. We'll send one from <b>Taylor</b>, a test customer:</p>
        <p className="rounded-lg bg-panel-2 px-3 py-2 text-fg">“Hey! I'm new here. What kind of content do you offer?”</p>
        <p className="text-xs text-faint">Demo only: this message never leaves the app.</p>
      </>
    ),
    primary: { label: "Send test message", busyLabel: "Sending…", run: async () => {
      const r = await post("/api/tour", { action: "receive" });
      return { conversationId: r.conversationId, draftId: null };
    } },
  },
  {
    id: "open-convo",
    chapter: "inbox",
    route: "/inbox",
    routeLoose: true,
    target: "tour-convo",
    placement: "right",
    ensure: ensureConversation,
    title: "Taylor's message just arrived",
    body: "The dot means it's new and unread. In your real inbox, messages show up here the moment a customer sends them.",
    task: { label: "open Taylor's conversation.", event: "open-convo", path: (p, d) => !!d.conversationId && p.includes(`c=${d.conversationId}`) },
  },
  {
    id: "watch-draft",
    chapter: "inbox",
    route: convoRoute,
    target: "draft-area",
    placement: "top",
    ensure: ensureConversation,
    title: "Now watch the AI write a reply",
    body: (
      <>
        <p>Your AI reads the conversation plus the facts you've approved about yourself, then writes a suggested reply.</p>
        <p>It only <b>writes</b>. Sending is a separate step that stays with you.</p>
      </>
    ),
    primary: { label: "Write a reply", busyLabel: "Writing…", run: async (d) => {
      // Built-in sample rules answer instantly; keep the "writing" state visible long enough to notice.
      const [r] = await Promise.all([post("/api/tour", { action: "draft", conversationId: d.conversationId }), new Promise((res) => setTimeout(res, 1400))]);
      return { draftId: r.draftId, draftOutcome: r.outcome };
    } },
  },
  {
    id: "explain-draft",
    chapter: "inbox",
    route: convoRoute,
    target: "draft-card",
    placement: "top",
    ensure: ensureDraft,
    title: "Here's the draft. It isn't sent yet",
    body: <DraftExplain />,
  },
  {
    id: "edit-draft",
    chapter: "inbox",
    route: convoRoute,
    target: "draft-card",
    placement: "top",
    ensure: ensureDraft,
    title: "Make it yours",
    body: "You can change anything before it goes out, or reject it entirely. Your edits are remembered as feedback.",
    task: { label: "change a word in the reply.", event: "draft-edited" },
  },
  {
    id: "auto-on",
    chapter: "auto",
    route: "/",
    target: "model-switch",
    placement: "bottom",
    title: "Now let the AI handle Mira's chats",
    body: (
      <>
        <p>So far the AI only wrote drafts. Switch Mira to <b>Auto</b> and it will reply by itself, in her style, with natural timing.</p>
        <p className="text-xs text-faint">Mira is a demo model, so replies only go to the simulator. You'll be asked to confirm.</p>
      </>
    ),
    task: { label: "set Mira to Auto and confirm.", event: "auto-on" },
  },
  {
    id: "auto-wait",
    chapter: "auto",
    route: convoRoute,
    target: "draft-area",
    placement: "top",
    ensure: ensureConversation,
    title: "Taylor writes again",
    body: "Let's have Taylor send another message. Watch what the AI does on Auto: it writes the reply, then waits a natural moment before sending, just like a person reading and typing.",
    primary: { label: "Send Taylor's next message", busyLabel: "Writing…", run: async (d) => {
      const [r] = await Promise.all([post("/api/tour", { action: "followup", conversationId: d.conversationId, kind: "chat" }), new Promise((res) => setTimeout(res, 1200))]);
      return { draftId: r.draftId, draftOutcome: r.outcome };
    } },
  },
  {
    id: "auto-countdown",
    chapter: "auto",
    route: convoRoute,
    target: "draft-card",
    placement: "top",
    title: "Written, then a natural pause",
    body: (
      <>
        <p>The countdown shows when it will send. If several messages arrive quickly, the AI waits for the burst to finish and answers them together. If the subscriber writes again before it sends, the old reply is thrown away and rewritten.</p>
        <p>You can still edit it, press <b>Don't send</b>, or take over. In the demo you can skip the wait.</p>
      </>
    ),
  },
  {
    id: "nav-settings",
    chapter: "ai",
    target: "nav-settings",
    placement: "right",
    title: "Give each model her own voice",
    body: "Every model has her own personality: tone, length, emoji, phrases she likes, things she'd never say, and her PPV menu. No technical setup needed.",
    task: { label: "click Settings.", event: "nav-settings", path: (p) => p.startsWith("/settings") },
  },
  {
    id: "personality",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-personality",
    placement: "right",
    title: "Pick how Mira sounds",
    body: "Choose a personality, then fine-tune with the sliders. The live preview shows what each change does to a real reply.",
    task: { label: "choose a different personality or move a slider.", event: "style-changed" },
  },
  {
    id: "try-style",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-try",
    placement: "left",
    title: "See the difference instantly",
    body: "We'll answer the same subscriber message again, this time with your new settings.",
    task: { label: "click “Try this style”.", event: "style-tried" },
  },
  {
    id: "compare",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-compare",
    placement: "left",
    title: "Before and after",
    body: (
      <>
        <p>The first reply uses Mira's saved style; the second uses your changes. What you changed is listed underneath.</p>
        <p><b>Keep</b> saves it. <b>Undo</b> puts everything back. Or keep experimenting.</p>
      </>
    ),
    task: { label: "click Keep or Undo, or press Next.", event: "style-decided" },
  },
  {
    id: "ppv",
    chapter: "ppv",
    route: convoRoute,
    target: "draft-area",
    placement: "top",
    ensure: ensureConversation,
    title: "A subscriber shows real interest",
    body: (
      <>
        <p>Taylor will now ask about Mira's hiking photos. The AI only brings up paid content when someone is genuinely interested, never in plain small talk, and never again right after a no.</p>
      </>
    ),
    primary: { label: "Send Taylor's question", busyLabel: "Writing…", run: async (d) => {
      const [r] = await Promise.all([post("/api/tour", { action: "followup", conversationId: d.conversationId, kind: "ppv" }), new Promise((res) => setTimeout(res, 1200))]);
      return { draftId: r.draftId, draftOutcome: r.outcome };
    } },
  },
  {
    id: "ppv-explain",
    chapter: "ppv",
    route: convoRoute,
    target: "draft-card",
    placement: "top",
    title: "One fitting item, real price",
    body: (
      <>
        <p>The AI picked the one PPV item that fits what Taylor asked about, with its exact price from Mira's PPV menu. No made-up discounts, no pressure.</p>
        <p>It only <b>mentions</b> the item. Sending the paid message itself is your call: <b>Prepare PPV</b> lines it up for your approval.</p>
      </>
    ),
  },
  {
    id: "pause",
    chapter: "control",
    route: convoRoute,
    target: "ai-toggle",
    placement: "bottom",
    title: "Pause the AI for one chat",
    body: "Want the AI to stay out of one conversation? Pause it here. Other chats keep working as normal.",
    task: { label: "click “Pause AI”.", event: "ai-paused" },
  },
  {
    id: "resume",
    chapter: "control",
    route: convoRoute,
    target: "ai-toggle",
    placement: "bottom",
    title: "And bring it back",
    body: "The AI never comes back on its own after you pause it. You choose when.",
    task: { label: "click “Resume AI”.", event: "ai-resumed" },
  },
  {
    id: "takeover",
    chapter: "control",
    route: convoRoute,
    target: "takeover",
    placement: "bottom",
    title: "Take over a conversation",
    body: "Taking over means you're personally handling it: any waiting AI draft is cancelled and nothing goes out automatically until you hand it back.",
    task: { label: "click “Take over”.", event: "took-over" },
  },
  {
    id: "handback",
    chapter: "control",
    route: convoRoute,
    target: "takeover",
    placement: "bottom",
    title: "Hand it back when you're done",
    body: "One click returns the conversation to your AI.",
    task: { label: "click “Hand back to AI”.", event: "handed-back" },
  },
  {
    id: "stop",
    interactive: true,
    chapter: "control",
    target: "emergency-stop",
    placement: "right",
    title: "And remember the big red button",
    body: (
      <>
        <p>One click stops every send in the whole app: automatic replies, approved drafts and messages you type yourself. Waiting replies go back to drafts.</p>
        <p>Release it whenever you're ready.</p>
      </>
    ),
  },
  {
    id: "finish",
    chapter: "done",
    route: "/",
    title: "You're ready to start using your inbox",
    body: <Finish />,
  },
];

function DraftExplain() {
  return (
    <>
      <p>The AI drafted this because Taylor asked a question it can answer from your approved facts. Open <b>Why this reply?</b> to see exactly what it used.</p>
      <ul className="space-y-1 text-[13px]">
        <li><b>Draft only</b> (now): the AI writes, you approve.</li>
        <li><b>Automatic</b>: simple, safe replies may send by themselves.</li>
        <li><b>Manual</b>: you write everything; the AI stays quiet.</li>
      </ul>
      <p className="text-xs text-faint">If no AI is connected yet, the label says <b>Sample reply</b>: it was written by built-in example rules so you can try everything without setting anything up.</p>
    </>
  );
}

function Finish() {
  const { data } = useApi<any>("/api/integrations");
  const live = data?.accounts?.filter((a: any) => !a.isSimulated) ?? [];
  const messagingOk = live.some((a: any) => a.connectionStatus === "CONNECTED");
  const aiOk = data ? data.ai.settings.provider !== "offline" && data.ai.settings.verifiedModel === data.ai.settings.replyModel : false;
  const learned = ["Messages arrive in one inbox, for all your models", "On Auto, the AI replies by itself after a natural pause", "Each model has her own personality and PPV menu", "Paid items come up only on real interest; sending PPV is your call", "Pause, take over, or stop everything any time"];
  return (
    <div className="space-y-3">
      <ul className="grid gap-1.5">
        {learned.map((l) => (
          <li key={l} className="flex items-center gap-2 text-fg/90">
            <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> {l}
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-line bg-panel-2/60 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Next: real setup</p>
        <SetupLine done={messagingOk} icon={<MessageSquare className="size-3.5" />} href="/setup" label="Connect your creator accounts" />
        <SetupLine done={aiOk} icon={<Sparkles className="size-3.5" />} href="/setup?step=ai" label="Connect an AI model (optional)" />
        <SetupLine done={false} icon={<Plug className="size-3.5" />} href="/settings/ai" label="Set each model's personality and PPV menu" />
      </div>
      <p className="text-xs text-faint">Mira (demo) is still on Auto; switch her back on Home whenever you like. The demo chats stay in your inbox, and you can restart this tour from “Guided tour” any time.</p>
    </div>
  );
}

function SetupLine({ done, icon, href, label }: { done: boolean; icon: ReactNode; href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-fg/90 hover:bg-panel-3">
      {done ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <Circle className="size-4 text-faint" aria-hidden />}
      <span className="text-muted">{icon}</span>
      <span className={done ? "text-muted line-through" : undefined}>{label}</span>
    </Link>
  );
}
