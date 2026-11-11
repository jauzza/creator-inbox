# ARCHITECTURE.md

## Components

```
Browser (Next.js React UI)
   │  same-origin JSON API (session cookie + CSRF token)
   ▼
Next.js app (route handlers in src/app/api/**) ── src/server/** (domain services)
   │                                               │
   │        Postgres 16 (Prisma 7, pg adapter) ◄───┘
   │            ▲  ▲
   │            │  └── Job table = durable queue (FOR UPDATE SKIP LOCKED)
   ▼            │
Worker process (src/worker/main.ts) ── claims jobs ── providers:
   ├─ MessagingProvider: SimulatorProvider (DB only, no network) | FansApiProvider (https, allow-listed hosts)
   ├─ AiProvider: OfflineRulesProvider (sample rules; applies style settings deterministically) | OpenAiCompatibleProvider (DeepSeek / custom)
   └─ Telegram notifier
Optional: Caddy (HTTPS) → app; public provider webhooks → /api/webhooks/onlyfansapi_com
```

The stack is single-workspace, with no microservices and no Kubernetes. There are three replaceable interfaces:
- `MessagingProvider`: `src/server/providers/messaging/types.ts`
- `AiProvider`: `src/server/ai/types.ts`
- the notification channel: `src/server/notify/*`

**AI proposes, code decides.** The model only returns `{action, reply, explanation}`. Permissions, scheduling and sending are decided by deterministic code: `automation/policy.ts`, `automation/timing.ts` and `services/dispatch.ts`.

## Frontend structure

- **Navigation:** `src/components/shell.tsx`.
  - Four areas: Home `/`, Inbox `/inbox`, Customers `/customers`, Settings `/settings/*`.
  - The automation status card and **Stop all sends** are always visible.
  - Bottom tab bar plus top bar on phones.
- **Old URLs** (`/handoffs`, `/automation`, `/style`, `/integrations`, `/analytics`, `/simulator`, `/activity`, `/help`) redirect to their new homes (`next.config.ts`).
- **Settings sections:** AI Assistant, Messaging accounts, Automation & scheduling, Notifications, Appearance & preferences, Advanced.
  - Advanced holds the Activity log, Demo lab (the simulator), Team, Data & backups, and Troubleshooting.
  - The full report is at `/insights`.
- **Setup wizard:** `/setup`.
- **Design system:** `src/components/ui.tsx` (tokens in `globals.css`).
  - `humanize()` in `src/lib/client.ts` turns technical errors into plain sentences. Every error UI keeps the original under "Technical details".
- **Guided tour:** `src/components/tour/`.
  - `tour.tsx` is the engine.
    - The spotlight is four dimmed, blurred panels around the target's rectangle, so the target stays sharp and clickable.
    - Targets are tracked every animation frame, with a timer fallback.
    - Explanations are placed next to the target; on phones they become a sheet.
    - Keyboard: Esc and the arrow keys. Progress is kept in `localStorage`.
    - A floating stop button sits above the overlay.
  - `steps.tsx` holds the content. Steps can navigate, wait for a UI signal (`tour.signal(event)`) or a route change, run a real action, or `ensure` prerequisites so skipping never strands the user.
- **Tour backend:** `src/server/services/tour.ts` and `POST /api/tour`.
  - `receive` re-creates the "Taylor (test customer)" chat on the **simulated** account and delivers the test message through the signed simulator webhook.
  - `draft` runs the normal `generateReply` pipeline on demand.
  - Both refuse anything that isn't the simulated tour conversation.

## Substitution: Postgres queue instead of Redis/BullMQ

The brief preferred BullMQ. I chose a Postgres-backed queue (`src/server/queue/jobs.ts`) for these reasons:
1. **True transactional outbox.** Jobs are created and cancelled in the same transaction as the domain change: message insert, version bump, draft invalidation, takeover. With Redis, a crash between a DB commit and the queue write can leave orphaned or missing jobs.
2. **One fewer stateful service** to secure, bind privately, persist and back up.
3. **Inspectable with SQL**, which is what the Automation → Job queue page shows.

The trade-off is a lower throughput ceiling, which doesn't matter at this scale.

Details:
- A partial unique index allows only one PENDING job per dedupe key.
- `claimOne` uses `FOR UPDATE SKIP LOCKED` and skips conversations that already have a RUNNING job.
- Stuck RUNNING jobs are recovered after 5 minutes.
- The worker writes a heartbeat that the dashboard shows.

## Conversation pipeline

```
inbound (webhook | polling | simulator, all → ingestInbound)
  tx { lock conversation row
       dedupe on (conversation, provider message id)
       insert message (ordered by provider timestamp, so out-of-order is fine)
       version++  → invalidate PROPOSED/APPROVED/QUEUED drafts (STALE), cancel dispatch jobs
       score intent (rules + evidence rows), decline → suppression cooldown
       triage → handoff (+ pause, + notification) for out-of-scope categories
       if policy allows drafting: debounce `generate_reply` job (quiet gap, capped by max wait) }

generate_reply (worker)
  policy check → budget check → resolve provider (untested model ⇒ fail clearly)
  bounded context: last N messages, summary, approved facts, catalog (+already purchased), prefs
  model call OUTSIDE any transaction → parse schema → validate → ≤1 rewrite
  tx { lock; if conversation.version changed → discard (newer job exists)
       HANDOFF / blocked → visible failed draft + handoff
       WAIT → draft that says "no reply needed"
       else add disclosure + #ai; AUTO & no warnings & caps/hours OK → QUEUED + dispatch job at planned time
                                   otherwise → PROPOSED + "draft ready" notification }

dispatch_draft (worker)          ── tx with conversation row lock, re-reading everything:
  emergency stop? mode still allows? version unchanged? draft age? caps? active hours? cooldown? provider pacing?
  → OutboundSend(idempotencyKey = draft_<id>, PENDING) → IN_FLIGHT (unique: one per conversation)
  provider.sendText(…, Idempotency-Key)
     accepted        → ACCEPTED, outbound message, version++, draft SENT
     rejected        → FAILED (+notification)
     retryable       → PENDING again, retry after Retry-After
     unknown/timeout → UNCERTAIN → reconcile_send (×3: search recent provider messages)
                        found → ACCEPTED; not found → handoff "uncertain send"; human chooses
                        mark delivered | retry with the SAME key | discard.  Never auto-resent.
```

There is no exactly-once delivery claim. Fans API documents idempotency for roughly 24 hours and says it is not a guarantee. A worker crash while IN_FLIGHT is recovered as UNCERTAIN, never resent.

## Modes and precedence

`effectiveMode()` takes the **most restrictive** of these inputs:
- global mode
- account override
- conversation override
- active takeover (MANUAL)
- exclusion tag (MANUAL)
- do-not-contact (PAUSED)
- emergency stop (PAUSED, blocks all sends)
- disconnected account (PAUSED)

Order: `PAUSED > MANUAL > DRAFT > AUTO`. New installs start in DRAFT. Takeover cancels pending AI work. Automation resumes only through Resume or a configured expiry job. Handoff pauses are a conversation-level PAUSED override, cleared only by explicit action.

## Data model highlights (prisma/schema.prisma)

- `Conversation.version`: a monotonic counter. Every draft records `basedOnVersion`, and dispatch requires equality.
- `OutboundSend`: the outbox, with a unique `idempotencyKey` and a partial unique index allowing one IN_FLIGHT row per conversation.
- `WebhookEvent (provider, eventId)`: a permanent dedupe table. Failed events keep their error and can be reprocessed.
- `IntentSignal`: evidence rows (signal, weight, quoted text, time) behind the decaying `Customer.intentScore`.
- `Offer.approvalHash = sha256(customer|asset|price)`: freezes an approval. Any change invalidates it.
- `Purchase.verified`: true only for provider or simulator transaction records. Manual entries are unverified.
- `StyleProfile`: versioned style packs, with exactly one active per account.
- `EvalCase / EvalRun / EvalResult`: the workbench, with blind labels.
- `AuditLog`: every control action. Details pass through `redact()`.

## Security

| Concern | Implementation |
|---|---|
| Passwords | argon2id (19 MiB, t=2). Unknown emails take the same time as wrong passwords. |
| Sessions | 32-byte random token in an httpOnly SameSite=Lax cookie (Secure on HTTPS). Only the sha256 is stored. 7-day TTL. |
| CSRF | Mutations require a same-origin `Origin` **and** an `x-csrf-token` that matches the session. |
| Throttling | 5 failures per email or 20 per IP per 15 minutes. |
| Authorization | Checked server-side on every route. Operators only reach accounts granted via `AccountAccess`; owner-only settings use `requireOwner`. |
| Secrets | AES-256-GCM. The key is `MASTER_KEY` from the environment, and the secret id is bound as AAD. Values are write-only in the UI and never returned, logged, put in browser storage or sent to the model. |
| SSRF | `safeFetch` checks: https only; port 443; no URL credentials; internal hostnames and private/link-local/CGNAT/IPv6-ULA addresses blocked, with **DNS answers checked at connect time** (defeats rebinding); per-integration host allow-lists; no redirects; timeouts; size cap. |
| Webhooks | HMAC-SHA256 with a constant-time compare and a required secret. Dedupe on the provider event id. Message events older than 24h are rejected, because the provider sends no timestamp for replay protection. Simulator webhooks are not exposed publicly. |
| Prompt injection | Customer text is escaped and wrapped as untrusted data. The model has no tools, so its output can only become a draft. Settings, purchases and sends are never model-driven. The validator blocks leaks and invented claims. |
| Simulation boundary | Simulated accounts always resolve to `SimulatorProvider`, which has no network code. Dispatch also asserts that the provider's and account's `isSimulated` flags match. |
| Headers | CSP (self only), frame-ancestors none, nosniff, strict referrer. HSTS via Caddy. |
| Network | Postgres is unpublished; the app is bound to 127.0.0.1 behind Caddy. |

## Testing strategy

- **PGlite** (real Postgres compiled to WASM) runs the actual migration SQL in-process, so integration tests exercise real `SKIP LOCKED`, partial unique indexes and row locks without a database server.
- The network transport is replaced in tests and **throws on any unexpected call**.
- See README → Test results for the list of what is covered.
