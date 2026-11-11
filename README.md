# Creator Inbox

A self-hosted inbox and customer-management system for creator accounts. It brings conversations into one place and adds draft-first AI replies for non-explicit support and conversation. It also includes intent ranking, human handoffs, Telegram alerts and a fully working simulator.

> **Status: working software, not production-certified.** It is verified against the simulator and an automated test suite (see [Test results](#test-results)). The live messaging adapter has **not** been verified against a real account because no credentials were available. Read [RESEARCH.md](RESEARCH.md) for what is and isn't confirmed.

## What it does

The app has four areas: **Home**, **Inbox**, **Customers** and **Settings**. Everything technical lives in Settings, mostly behind "Advanced" sections. The automation status and the **Stop all sends** button are always visible: in the sidebar on desktop, in the top bar on phones.

- **First run.** Home offers **Explore with a demo** (an interactive spotlight tour that uses the simulator, no keys needed) or **Set up my account** (a four-step wizard). See [WALKTHROUGH.md](WALKTHROUGH.md).
- **Home.**
  - Plain-language status cards: Inbox, AI assistant, Automation.
  - A "Needs you" queue.
  - Today's numbers, with demo numbers labelled.
  - Setup progress.
  - A link to the full report.
- **Inbox.**
  - Conversation list with filters: All · Needs you · Unread · Drafts · Mine.
  - Chat bubbles with day separators and "who sent this" labels.
  - A highlighted draft card marked **Not sent yet**, with "Why this reply?" and feedback chips.
  - Customer details in a drawer.
  - One click to **Pause AI / Resume AI** and **Take over / Hand back to AI**.
  - Handoffs are a "Needs you" banner inside the chat, with *I'm on it* and *Mark as handled*.
  - Per-chat mode, redraft, notes, tags, summary, preferences and offers are all still there.
- **AI drafts for permitted, non-explicit replies only.**
  - Deterministic triage runs first. Explicit requests, billing disputes, complaints, safety issues, opt-outs and "real person" requests go straight to a human.
  - The model's JSON output is checked against a schema and validated: no invented prices, live activity, delivery claims, pressure or denial of automation.
  - At most one bounded rewrite, then the conversation is handed off.
  - A customer-facing disclosure and the provider-required `#ai` tag are added by the app, not the model.
- **Automation you control.**
  - Modes: Disabled / Draft only / Automatic. Global, account and conversation settings are combined, and the most restrictive wins.
  - A global emergency stop.
  - Timing rules with a preview: delays with distributions, debounce with a max wait, active hours with timezone/DST, quiet hours, caps, pacing, maximum draft age.
  - An inspectable durable job queue.
- **Safe sending.**
  - Every send is revalidated at dispatch under a per-conversation row lock: stop, mode, takeover, version, age, caps and hours.
  - Uses a transactional outbox with provider idempotency keys.
  - Ambiguous results go to a visible "uncertain" state and are reconciled; they are never blindly retried.
- **Customers.**
  - A decaying 0–100 intent heuristic, with evidence for every point. It is a ranking, not a probability.
  - Engagement and verified spend are tracked separately.
  - Outcomes, decline cooldowns, a do-not-contact flag, and an offer ledger in which a human confirms recipient, asset and price. Paid messages are sent by a person on the platform.
- **AI Assistant (personality editor).**
  - Personality presets: Friendly, Playful, Confident, Professional, Short & sweet.
  - Reply length, emoji, a Casual↔Polished slider and a Reserved↔Expressive slider.
  - Facts, favourite phrases, "never say", boundaries and example replies.
  - A **live preview** with **Try this style** and a before/after comparison that lists the changed settings. **Keep** saves a new version; **Undo** reverts.
  - Previews say clearly whether a connected model or the built-in **sample rules** wrote them. The sample rules apply your tone, length, emoji, formality and expressiveness with simple text rules, so changes are visible without a key.
  - Model, address, token limits and creativity (temperature) live under Advanced → AI connection → Technical options.
  - Versioned style packs with rollback.
  - A reply-quality workbench with 81 synthetic eval cases and blind A/B review.
  - Customer-level experiments.
- **Analytics.** Every metric states its data source. Simulated data is kept separate, and the app says plainly when there isn't enough evidence.
- **Security.**
  - Login: argon2id passwords, httpOnly sessions, CSRF (origin check plus token), login throttling.
  - Secrets: AES-256-GCM keys under a `MASTER_KEY` kept outside the database, write-only key fields, redacted logs.
  - Outbound calls: an SSRF-safe client (https only, private addresses blocked at connect time, no redirects).
  - Webhooks: HMAC verification with dedupe.

## Quick start (local, Docker)

Requirements: Docker Desktop (macOS/Windows) or Docker Engine (Linux).

```bash
cp .env.example .env
```

Generate the master key and the database password, and put them into `.env` as `MASTER_KEY` and `POSTGRES_PASSWORD`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
docker compose up -d --build
```

Open http://localhost:3000. On first visit the login page offers to **create the owner account** (this only works from localhost). Then:

1. Choose **Explore with a demo** for the interactive tour, or **Set up my account**.
2. More test scenarios live in **Settings → Advanced → Demo lab**.

The **worker** container must be running: it generates drafts, sends on schedule and delivers notifications.

> **Local mode only works while your computer is awake.** Scheduled replies and polling pause when it sleeps and resume on wake: jobs are durable, and stale drafts are re-evaluated rather than sent late. Provider **webhooks cannot reach localhost**; use automatic checking (Settings → Messaging accounts) or the VPS setup.

## Quick start (local, no Docker)

Requirements: Node 22+, and PostgreSQL 16+ running locally.

```bash
npm ci
```

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` and `MASTER_KEY`, and optionally `SEED_OWNER_*`. Then:

```bash
sh scripts/dev-local.sh
```

`dev-local.sh` creates the database if it is missing, applies migrations, seeds the simulator, and runs the worker and `next dev` together. Set `PORT=3100` if port 3000 is taken.

## VPS deployment (Ubuntu)

1. Install Docker Engine and the compose plugin, then point a DNS A/AAAA record at the server.
2. Clone the repository and create `.env` from `.env.example`. Set:
   - `MASTER_KEY` and `POSTGRES_PASSWORD` (strong random values)
   - `DOMAIN=inbox.example.com`
   - `APP_URL=https://inbox.example.com`
   - `COOKIE_SECURE=true`
3. Open only ports 22, 80 and 443:

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
   ```

4. Start everything, including the HTTPS proxy:

   ```bash
   docker compose --profile proxy up -d --build
   ```

   Caddy obtains a Let's Encrypt certificate automatically.
5. Create the owner. Web setup is localhost-only, by design:

   ```bash
   docker compose exec app npx tsx scripts/create-user.ts --email you@example.com --role owner
   ```

6. Optional: register `https://inbox.example.com/api/webhooks/onlyfansapi_com` in the provider dashboard with a signing secret, and paste the same secret under Settings → Messaging accounts → Advanced.

Postgres is never published to the host; it is reachable only on the private compose network. The app binds to `127.0.0.1`, and only Caddy is public.

### Resource assumptions and how to measure them

The working assumption is one creator account, a few thousand messages a day and 1–3 operators. That should fit a **1 vCPU / 2 GB RAM** VPS: Postgres ~150 MB, app ~250 MB, worker ~150 MB, Caddy ~30 MB. Measure your actual use instead of trusting this:

```bash
docker stats --no-stream
```

```bash
docker compose exec db psql -U inbox -d creator_inbox -c "select pg_size_pretty(pg_database_size('creator_inbox'));"
```

```bash
docker compose exec db psql -U inbox -d creator_inbox -c "select type,status,count(*) from \"Job\" group by 1,2;"
```

## Credentials you'll need (never paste them into chat)

| What | Where | Needed for |
|---|---|---|
| Fans API key | Settings → Messaging accounts | Live messaging (optional; the simulator needs none) |
| Creator authorization | Provider's hosted flow or dashboard | Connecting the real account (the creator does this) |
| DeepSeek (or OpenAI-compatible) key | Settings → AI Assistant → Advanced → AI connection (or the setup wizard) | Real AI drafts; the offline simulator rules need none |
| Telegram bot token + chat id | Settings → Notifications ("Find it for me" fills in the chat id) | Optional external alerts |

Keys are encrypted with `MASTER_KEY`, never shown again, never sent to the AI and never logged. Rotate a key by saving a new one; delete it with the Delete button.

## Backup & restore

Back up the database regularly, and keep `MASTER_KEY` **separately** (in a password manager). Without it, the encrypted provider/AI/Telegram keys can't be decrypted. That is by design: a stolen dump alone doesn't leak them.

Docker backup:

```bash
docker compose exec -T db pg_dump -U inbox -Fc creator_inbox > backups/inbox-$(date +%F).dump
```

Docker restore (stop app and worker first):

```bash
docker compose stop app worker
```

```bash
docker compose exec -T db pg_restore -U inbox -d creator_inbox --clean --if-exists < backups/inbox-YYYY-MM-DD.dump
```

```bash
docker compose start app worker
```

Without Docker:

```bash
npm run backup
```

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists backups/<file>.dump
```

Schedule nightly backups with cron, and copy them off the server:

```
0 3 * * * cd /opt/creator-inbox && docker compose exec -T db pg_dump -U inbox -Fc creator_inbox > backups/inbox-$(date +\%F).dump
```

Test a restore into a scratch database before relying on it. Retention purges live under Activity & settings → Retention.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No drafts appear | The worker isn't running (`docker compose logs worker`), or the chat is Manual/Paused/excluded (tag `manual-only`). Home shows "Your background helper isn't running" when the worker heartbeat is stale. |
| "Your AI connection needs a quick test" | Settings → AI Assistant → Advanced → AI connection → Connect & test. Any change to provider, model or address requires a new test. |
| Webhooks never arrive | Localhost isn't reachable: use automatic checking (Settings → Messaging accounts → Advanced), or deploy with HTTPS. Check that the signing secret matches (bad signatures get a 401 and are logged). |
| Account shows "Needs a login code" / "Needs reconnecting" | Reconnect in the Fans API dashboard, then Settings → Messaging accounts → Check again. |
| "Send result uncertain" | Check the platform. Then choose "I can see it was delivered", "Retry (same key)" or "Discard" in the chat. The app never resends on its own. |
| Login says too many attempts | Wait 15 minutes (per-email and per-IP throttling). |
| `npm install` fails downloading Prisma engines behind a proxy | Download `schema-engine` for your platform from binaries.prisma.sh, verify its `.sha256`, and set `PRISMA_SCHEMA_ENGINE_BINARY`. |

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run worker` | Web app / background worker (development). Restart the worker after changing server code: it doesn't hot-reload. |
| `npm test` | Unit, integration (PGlite: real Postgres in-process) and adapter tests |
| `npm run typecheck` | TypeScript |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed simulator and eval cases |
| `npm run user:create -- --email x --role owner` | Create or reset a user (password read from the terminal) |
| `npm run eval -- primary` | Run the 81-case evaluation set from the CLI |
| `npm run backup` | pg_dump to `backups/` |

## Test results

Run on 2026-11-11 (macOS arm64, Node 22.23):

- `npm test`: **63 passed** across 3 files. This includes the guided-tour flow (simulated account only, drafts on request, nothing sent, restart replaces the test chat) and the Telegram chat lookup.
  - Policy, timing (including the DST switch and windows that cross midnight), validator, triage/scoring, crypto/redaction, SSRF guard, experiments and disclosure.
  - Integration flows on in-process Postgres:
    - draft and auto modes, debounce, duplicate and out-of-order events, bad signatures
    - invalidation on new inbound, takeover race, emergency stop, stale drafts, per-chat override, exclusions
    - ambiguous sends (delivered and lost), rate limits, rejects, crash recovery
    - AI failure, budget cap, explicit/billing routing, prompt injection, opt-out
    - account isolation, encrypted secrets, the simulator/live boundary, the offer approval freeze
  - Fans API and AI adapters against a mocked transport.
- `npm run typecheck`: clean. `next build`: succeeds (45 routes).
- **Eval workbench, offline simulator rules, 81 cases:**
  - First run: 81% next-action accuracy and 2 forbidden-phrase hits.
  - The workbench exposed two **triage gaps**: "billed but nothing unlocked" and "talk to her personally" were not routed to a human. It also exposed an off-topic catalog answer. All three are fixed and covered by regression tests.
  - Final run: **96% accuracy, 0 forbidden hits, 0 errors**. The 3 remaining misses are conservative handoffs.
  - These figures measure the pipeline and the safety routing, not writing quality. Run the same set against DeepSeek once a key is configured.
- Browser check of the redesign (1024 px desktop and 375 px mobile; page text, DOM geometry and real clicks):
  - The full guided tour from Welcome to "All set": test message, AI draft, edit, personality change, *Try this style* before/after, approve (sent to the simulator, labelled "AI draft · approved · Demo"), pause/resume, take over/hand back, and emergency stop on/off from the tour overlay.
  - Back, Esc-to-exit, resume, resume after reload, and Skip tour.
  - Mobile layouts: the bottom tab bar, the stop button in the top bar, the one-pane inbox, and the tour card as a top/bottom sheet.
  - Every Settings section.
  - The browser pane did not render animation frames in mobile emulation, so motion and visual polish on phones were not visually verified.

**Not verified (requires your credentials):**
- Live Fans API connection, chat/message shapes, sends, webhooks and idempotency replays.
- DeepSeek model listing and real reply quality.
- Telegram delivery.

## Documents

- [RESEARCH.md](RESEARCH.md): providers, terms status, decisions, unresolved questions.
- [ARCHITECTURE.md](ARCHITECTURE.md): components, data flow, queue, send state machine, security.
- [WALKTHROUGH.md](WALKTHROUGH.md): the interactive guided tour and setup wizard.
