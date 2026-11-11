"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, MessageSquare, Plug, Sparkles } from "lucide-react";
import { getJson, post, useApi } from "@/lib/client";

export type TourData = { conversationId?: string; draftId?: string | null; draftOutcome?: string; drafting?: boolean };

export type TourStep = {
  id: string;
  chapter: "welcome" | "inbox" | "ai" | "control" | "done";
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
  { id: "ai", label: "Your AI" },
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
        <p>In about three minutes you'll watch a test customer message arrive, see your AI write a reply, give your AI a personality, and learn how to stay in control.</p>
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
    title: "Everything at a glance",
    body: "These cards tell you, in plain words, whether messages are coming in, whether your AI is ready, and how much the AI is allowed to do on its own.",
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
    id: "nav-settings",
    chapter: "ai",
    target: "nav-settings",
    placement: "right",
    title: "Give your AI a personality",
    body: "You decide how your AI sounds: friendly, playful, confident or professional. No technical setup needed.",
    task: { label: "click Settings.", event: "nav-settings", path: (p) => p.startsWith("/settings") },
  },
  {
    id: "personality",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-personality",
    placement: "right",
    title: "Pick how your AI sounds",
    body: "Choose a tone, then fine-tune with the sliders. Each one changes how replies are written, and the live preview shows you what that looks like.",
    task: { label: "choose a different tone or move a slider.", event: "style-changed" },
  },
  {
    id: "try-style",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-try",
    placement: "left",
    title: "See the difference instantly",
    body: "We'll answer Taylor's same message again, this time using your new settings.",
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
        <p>The first reply uses your saved style; the second uses your changes. The settings you changed are listed underneath.</p>
        <p><b>Keep</b> saves the new style. <b>Undo</b> puts everything back. Or keep experimenting.</p>
      </>
    ),
    task: { label: "click Keep or Undo, or press Next.", event: "style-decided" },
  },
  {
    id: "approve",
    chapter: "control",
    route: convoRoute,
    target: "draft-card",
    placement: "top",
    ensure: ensureDraft,
    title: "Approve the reply",
    body: (
      <>
        <p>A <b>draft</b> is written but not sent. When you approve it, it's <b>sent</b>. Here it goes only to the demo customer.</p>
        <p>In <b>Automatic</b> mode the AI could send simple, safe replies like this one itself. New accounts always start in Draft mode, so nothing is sent without you.</p>
      </>
    ),
    task: { label: "click “Approve & send”.", event: "draft-approved" },
  },
  {
    id: "sent",
    chapter: "control",
    route: convoRoute,
    target: "message-list",
    placement: "left",
    title: "Sent, and clearly labelled",
    body: (
      <>
        <p>Sent messages appear on the right, labelled with who sent them. Drafts always sit in their own box below, marked <b>Not sent yet</b>.</p>
        <p className="text-xs text-faint">Because Taylor is a demo customer, the reply went to the built-in simulator and nowhere else. If it doesn't appear in a few seconds, the background helper may be off; Home will tell you.</p>
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
  const learned = ["Messages arrive in your inbox", "The AI writes drafts; you approve", "You can give your AI a personality", "Pause, take over, or stop everything any time"];
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
        <SetupLine done={messagingOk} icon={<MessageSquare className="size-3.5" />} href="/setup" label="Connect your messaging account" />
        <SetupLine done={aiOk} icon={<Sparkles className="size-3.5" />} href="/setup?step=ai" label="Connect an AI model (optional)" />
        <SetupLine done={false} icon={<Plug className="size-3.5" />} href="/settings/automation" label="Choose how much the AI may do" />
      </div>
      <p className="text-xs text-faint">Prefer to keep exploring? The demo customers stay in your inbox. You can restart this tour from “Guided tour” any time.</p>
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
