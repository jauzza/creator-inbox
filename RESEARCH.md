# RESEARCH.md: Integration research and decisions

Research date: **2026-11-11**. Pages were fetched with automated tooling, so treat exact strings as "as reported" and re-verify before going live.

Labels used below:
- **(A)** Provider claim, read from vendor documentation.
- **(B)** Independently confirmed from public source code or the GitHub API.
- **(C)** Not retrieved or not documented.

## 1. Platform status (OnlyFans)

- We found no verified official public OnlyFans developer API.
- Every provider below is an independent third party. A provider API key is **not** an "OnlyFans key", and the fact that an API exists does not mean the platform permits it.
- **https://onlyfans.com/terms could not be retrieved (C).** Our fetch tooling blocks the domain.
- Secondary sources say a revised version takes effect **1 Nov 2026**. They describe clause 8(g) as restricting data-collection tools and AI training on creator content, and clause 8(b) as keeping the creator responsible when third parties help operate the account. Commentators disagree on whether CRMs are in scope.
- **Unresolved:** read the current terms yourself, or with counsel, before connecting a live account. Until then the app works fully with the simulator and in draft-only mode.

## 2. Messaging provider comparison

| | **Fans API (onlyfansapi.com, migrating to fansapi.com)** | **OnlyFansAPI.io** |
|---|---|---|
| Operator | Fans Holdings OÜ (A); "not affiliated with OnlyFans" | Fans Origin LLC, Wyoming (A, terms page dated 26 Oct 2026) |
| Related? | No evidence they are related: different entities, hosts, auth headers, pricing and API design. Treat as separate vendors. | |
| Auth | `Authorization: Bearer <key>` (A, B: TS SDK `src/client.ts`) | `x-api-key` header (A) |
| Base URL | `https://app.onlyfansapi.com/api/`. New: `https://api.fansapi.com/api/`. Old-domain calls are **not** redirected; no cutoff date given (A). | `https://v1.onlyfansapi.io/api/` (A) |
| Account connection | Hosted "Login with OnlyFans" embed (`POST /client-sessions` returns token; `@onlyfansapi/auth` modal); programmatic `/authenticate` with 2FA polling; Auth+ app; dashboard; cURL import (A, B: auth example repo) | Console only: cURL import, or credentials with a mobile proxy (A) |
| Read chats | `GET /api/{acct}/chats`; offset pagination, `limit` ≤100 (A, B) | `GET /api/{acct}/chats`; `meta.hasMore/nextOffset`; params undocumented (A) |
| Read messages | `GET /api/{acct}/chats/{chat}/messages`; cursor `first_id`/`last_id`, follow `_pagination.next_page` (A). Sample conflicts with param names; **verify live**. | `meta.hasMore` only (A) |
| Send | `POST /api/{acct}/chats/{chat}/messages` with `text`, `price`, `lockedText`, `mediaFiles`, … (A, B) | `text` (HTML) only (A) |
| Idempotency | `Idempotency-Key` header on send, stored ~24h. 503 `not_sent` is safe to retry; 503 `unknown` means do **not** resend, reconcile (A) | None documented (C) |
| Webhooks | `messages.received`, `messages.sent`, `accounts.*` session events. `Signature` header = hex HMAC-SHA256 of the raw body with a secret you choose. **No timestamp / replay protection.** Dedupe on `X-OFAPI-Idempotency-Key`. 3 attempts (A) | "Being written"; signature undocumented (C) |
| Rate limits | 60 / 1000 / 5000 RPM per team by plan (A) | 1000 / 1000 / 5000 RPM; `X-RateLimit-*` headers (A) |
| Pricing | Free / $69 / $299 per month plus credit packs; 1 credit per uncached request (A). Free-credit figures conflict between pages. | Free / $59 / $149 per month (A) |
| Data handling | Deleted on disconnect; no AI training; logs kept 14 days; keys currently full-access (A) | "Encrypted"; retention not retrieved (C) |
| Disconnect | `DELETE /api/accounts/{id}` (B: SDK only); `accounts.disconnected` event (A) | Undocumented (C) |
| Typing / read receipts | Inbound `users.typing` webhook; no read-receipt webhook; `seenByFan` on messages (A) | Undocumented |
| AI content rule | **AI-written messages must carry `#ai`**; human review recommended; mass unsolicited messaging prohibited (A, compliance page) | Not found |

**Decision:** we implement a **Fans API (onlyfansapi.com) adapter**.
- Reasons: it documents send idempotency, webhook signatures, a hosted creator-completed connection flow (no passwords or session material in our app), disconnect, and reconciliation guidance.
- The base URL is configurable, with both documented hosts allow-listed, to handle the domain migration.
- OnlyFansAPI.io is not implemented, because it lacks documented webhook signing and idempotency.
- The adapter is **unverified against a live account** (we have no credentials). It is labelled that way in the UI, and every unknown response shape fails closed: an ambiguous send goes to the UNCERTAIN review state, never to "sent".

### Three separate credentials (shown separately in the UI)

1. **Messaging provider API key**: the Fans API team key. It is not an OnlyFans credential.
2. **Connected creator account ID** (`acct_…`): created by the creator completing the provider's hosted flow. It is not a secret.
3. **AI provider key** (DeepSeek or another OpenAI-compatible endpoint).

### What we explicitly did not do

- No undocumented scraping, copied session cookies, CAPTCHA bypass, or anti-detection techniques.
- No claims about competitors' private backends.
- Supercreator and Infloww help pages only show that the user-facing pattern is "the creator logs in, the tool keeps a connected session, and it reconnects on 2FA or verification prompts" (A). Infloww documents explicit linked-account states such as disconnected, 2FA required and identity verification required, which we mirror in `ConnectionStatus`.

## 3. AI provider (DeepSeek)

- OpenAI-compatible base URL is `https://api.deepseek.com` (A).
- Current model IDs (A): `deepseek-flash` and `deepseek-v4-pro`. `deepseek-v4-flash` is a retired alias. We do **not** hardcode any model ID as current.
  - The Integrations page calls `GET /models` on the configured endpoint and only allows saving a model that the endpoint lists **and** that passes a test completion.
  - If the endpoint does not support `/models`, the test completion alone decides.
- JSON mode is `response_format: {type: "json_object"}`. The prompt must say "json"; blank content can be returned and must be retried once (A).
- Thinking mode is on by default; in it, `temperature` and penalties are ignored (A). Our adapter exposes `thinking` (enabled/disabled) and only sends sampling parameters the operator enables. Replies default to thinking **disabled**, for latency and cost. We do not assume a reasoning model writes better replies; compare them in the Eval workbench.
- Pricing per 1M tokens, off-peak (A): Flash $0.15 input (cache miss), $0.60 output; Pro $0.66 input, $1.98 output. Peak hours roughly double this.
  - Prices are stored as editable per-model settings used for the daily budget cap, not hardcoded truths.
  - Cost shown in the app is an **estimate** from token counts × configured price.
- An alternative is any OpenAI-compatible endpoint (base URL + key + model), using the same adapter and the same eval cases.

## 4. Notifications (Telegram)

- `POST https://api.telegram.org/bot<token>/sendMessage` with `{chat_id, text}`. On 429, honour `parameters.retry_after` (A, partially retrieved).
- Guidance is about 1 msg/s per chat (A). We deduplicate and cool down per (kind, conversation) and retry with backoff through the durable queue.
- Alerts carry minimal information plus a dashboard link, never message bodies by default.

## 5. Repositories considered

| Repo | License | Activity (2026-11-11) | Decision |
|---|---|---|---|
| onlyfansapi/onlyfansapi-typescript-sdk | Apache-2.0 | v0.3.0, pushed 2026-10-21 | **Reference only.** Stainless-generated, 265 endpoints. We hand-write a thin client for the five endpoints we use, so the dependency surface stays small and SSRF/redirect controls stay ours. Endpoint shapes cross-checked against it (B). |
| onlyfansapi/auth-example-nextjs-prisma | MIT | pushed 2026-01-18 | **Pattern reused** (not code): server creates a client session; the creator completes auth in the provider's modal; we store only the returned account id. |
| onlyfansapi/onlyfansapi-python | Apache-2.0 | v0.2.0 | Not used; no Python backend. |
| chatwoot/chatwoot | MIT outside `enterprise/` (which has its own license) | v4.19.1, active | **Design reference only** (Rails): inbox three-pane layout, assignment, private notes, handoff queue. No code copied. |
| taskforcesh/bullmq | MIT | v6.7.3 (2026-11-10) | **Not used. Substituted** with a Postgres-backed queue (see ARCHITECTURE.md §Queue). Benefit: job creation and cancellation happen in the **same transaction** as message/draft/version changes (a true transactional outbox), one fewer service to secure and back up, and the queue is inspectable with SQL. Trade-off: lower throughput ceiling, which is irrelevant at single-workspace scale (dozens of sends per minute). |
| shadcn-ui/ui | MIT | shadcn@4.23.0 | **Pattern adopted:** shadcn's copy-in approach (cva + tailwind-merge + Tailwind tokens) with hand-written components in `src/components/ui`. We did not run the shadcn CLI, so there is no network fetch at build time and no Radix dependency tree. |

No repository was installed merely because it mentions OnlyFans.

## 6. Versions selected (npm registry, 2026-11-11)

- next 16.4.6, react 19.3.1, tailwindcss 4.3.5, zod 4.6.7, pg 8.23.1, @node-rs/argon2 2.2.2, vitest 5.1.0.
- **Prisma 7.10.1.** npm's `latest` tag points at `8.0.0-rc.33`, a release candidate, so we pinned the last stable version.
- **TypeScript 5.9.3.** TS 7 (native) was released, but Next.js tooling compatibility is unverified.
- PGlite 0.5.16 plus pglite-prisma-adapter 0.7.2 are used **only in tests**, for in-process Postgres.

## 7. Capabilities actually implemented

| Capability | Simulator | Fans API adapter |
|---|---|---|
| Test connection | ✅ | ✅ `GET /whoami` (unverified live) |
| List/select connected accounts | ✅ | ✅ `GET /accounts` (unverified live) |
| Hosted creator connection | n/a | ✅ server creates `POST /client-sessions` token; browser flow needs the provider's `@onlyfansapi/auth` script, which we do **not** bundle. The UI explains how to connect in the provider dashboard and then pick the account (see unresolved #4). |
| Poll chats/messages | ✅ | ✅ `GET /{acct}/chats`, `GET /{acct}/chats/{id}/messages` (unverified live) |
| Webhook ingest + HMAC verify + dedupe | ✅ (same code path, simulator secret) | ✅ `Signature` HMAC-SHA256; dedupe on `X-OFAPI-Idempotency-Key` |
| Send text with idempotency key | ✅ | ✅ `Idempotency-Key` header; 503 `unknown` maps to UNCERTAIN plus reconcile |
| Reconcile ambiguous sends | ✅ | ✅ scans recent outbound messages for exact text match after the attempt time; otherwise human review |
| Paid (PPV) sends | Recorded as an offer, with human confirmation of recipient, asset and price | **Not sent via API in v1.** The operator sends the paid message on the platform, then records it. Reason: price/media semantics unverified live. |
| Typing / read receipts | Not shown | Not shown (only inbound typing exists; not surfaced) |
| Disconnect | ✅ | ✅ marks disconnected locally; provider-side `DELETE` offered as an explicit owner action |

## 8. Unresolved questions

1. Current OnlyFans terms text, and what it says about third-party tools, AI-assisted replies and disclosure (blocked).
2. Live cursor parameter for List Chat Messages (`id` vs `first_id`/`last_id`). The adapter follows `_pagination.next_page` URLs, restricted to the same host.
3. Full `authentication_progress` values; whether session expiry is visible on the account object or only via webhook.
4. The `@onlyfansapi/auth` browser package would have to be loaded from npm/CDN. This would need a CSP relaxation and a supply-chain review, so it is deferred.
5. Fans API's free-credit figures and plan details conflict between pages.
6. Deadline for the `app.onlyfansapi.com` → `api.fansapi.com` migration.
7. Exact text-formatting rules (HTML?) for send. We send plain text.

## 9. Chat datasets: what was checked, what was used (2026-11-11)

The goal was to make the AI chat like a real creator DM thread, not to collect data. All five datasets were inspected through their Hugging Face cards, metadata and the dataset viewer ("first rows", aggregate statistics only). No dataset files were downloaded, and **no dataset record is copied into the product, its prompts or its tests**.

| Dataset | License | Content | Decision |
|---|---|---|---|
| raylek/kassyy-chatter-v2 | "other" (unspecified) | Fine-tuning windows "distilled from ~1,300 real fan conversations", with per-fan summaries, PPV action tokens and a 6h script cooling rule | **Records not used.** Real subscribers' private messages, no stated consent, unclear license. The *design ideas* on its public card were used: per-fan brief (who / what works / what to avoid), a cooling period between offers, tracking what was bought. |
| PygmalionAI/PIPPA | Apache-2.0 | ~26k Character.AI roleplay logs, NSFW warning, user-submitted with PII redaction attempts | **Records not used.** Long narrated roleplay (asterisk actions, essays) is the opposite of DM style, and much of it is explicit. Insight used: persona definitions work best with short example dialogues, so each model's example replies are injected and selected by relevance. |
| backpropSukuna/wifu-chat-dataset | Apache-2.0 | 403 synthetic "companion" chats, includes NSFW categories | **Records not used.** Non-explicit categories were analysed as a *negative reference*: median assistant reply 490 characters, emoji in 100% of replies, a question in 56%, narrated *actions* in 23%. That is what "AI-sounding" chat looks like, and the prompt and validator steer away from it. |
| utsavm/NSFW_Chat_Dataset | Apache-2.0 | Explicit erotic roleplay pairs | **Excluded entirely.** This product does not generate sexual content; explicit requests go to a person. |
| shirshatzman/flirtflip-dataset | MIT | 1,071 synthetic one-liners rewritten as gentle / playful / bold | **Records not used.** The lines are in-person dating openers, and 20% of the "bold" ones push meeting up or asking for a number, which this product never does. Insight used: the same message at three intensities, 50–60 characters each, maps onto the personality presets and the Reserved↔Expressive slider. |

Fine-tuning was not justified: there is no clean, permitted, non-explicit creator-DM dataset. The approach is **better prompting, plus original examples, plus deterministic chat signals in code**:

- `src/server/ai/chatcraft.ts`:
  - Situation detection: greeting, small talk, compliment, reaction, goodbye, content or price question, buying interest, hesitation, decline, money worries, AI question, meet-up request, "are you online".
  - Subscriber style: their length, case and emoji, which become a length target for the reply.
  - Offer policy:
    - None by default.
    - "answer" when they ask.
    - "suggest one fitting item" on genuine interest.
    - A cooling period after an offer (6h by default) and after a "no" (14 days by default).
    - Never re-offer what they bought.
  - Per-fan brief (memory).
  - Original "good move" examples per situation.
- **Prompt `reply-v2.0`** (`src/server/ai/prompt.ts`):
  - DM rules: short turns, react first, optional questions, no narration or customer-service phrases, answer bursts together, WAIT when nothing needs saying.
  - Sections fed to the model: situation, offer policy, subscriber style, remembered facts and "latest messages".
  - New output fields `offer_item` and `remember`.
- **Validator:**
  - New warnings: question streaks, much longer than the subscriber, narration, repeated offers.
  - New block: unprompted offers.
  - Style problems now get one rewrite.
- **Memory:** facts the AI chooses to remember are stored on the subscriber (max 12, service-relevant only) and fed back in the brief.

### Measured effect (sample-reply engine, 33 original scenarios, `tests/chat-quality.test.ts`)

| Metric | Before | After |
|---|---|---|
| Duplicate replies across scenarios | 18 | 0 |
| Generic customer-service phrasing | 57% | 0% |
| Replies that ask a question | 61% | 21% |
| Missed genuine buying moments | 2 | 0 |
| Offers nobody asked for | 0 | 0 |
| "Goodnight" correctly left unanswered | 0/1 | 1/1 |
| Median reply length | 76 chars | 53 chars |

The original 81-case safety/action set went from 96% to 100% correct next actions, with 0 forbidden-phrase hits.

**Not measured:** how much prompt v2.0 improves a *real* model (DeepSeek or another provider). No key was available. Once one is connected:
1. Run Settings → AI personality → Advanced → Reply quality lab.
2. Compare it with a run of the previous commit.
3. Read the replies.
