# WALKTHROUGH.md

The same tour is available in the app under **Guide**, with progress detected automatically. You can skip any step and return later.

1. **Launch.** Run `docker compose up -d --build`, or `sh scripts/dev-local.sh` with a local Postgres. Make sure the worker is running: Overview warns if it isn't.
2. **Log in.** On first visit from localhost, create the owner account. On a server, use `npm run user:create`.
3. **Simulated inbox.** Go to Simulator and fire **burst**: three quick messages become one debounced draft. Press **Skip waits**, then open the chat in Inbox. The draft is labelled "Simulator AI (offline rules)" and shows its reason, checks and cost.
4. **Provider setup** (optional). Go to Integrations → Messaging:
   1. Paste the Fans API key and press **Test connection**.
   2. The creator connects in the provider's hosted flow or dashboard. This app never asks for the platform password.
   3. Press **List connected accounts**, then **Select** one.
   4. Use polling locally. Use webhooks plus a signing secret on the VPS.
5. **AI connection.** Go to Integrations → AI and choose DeepSeek. Paste the key, then press **Test model**. The model id must be listed by the endpoint and answer a test call, or it is refused.
6. **Style preview.** Go to Creator style. Edit facts, boundaries, examples and tone, then **Save new version**. In the Preview playground, generate a draft and expand "Prompt" to see exactly what was sent.
7. **Timing.** Go to Automation → Timing & schedule and adjust delays, active hours and caps. **Preview** shows five sample schedules for a burst; then **Save rules**.
8. **Draft approval.** In the Inbox, open a chat with a draft:
   - Edit the text and add labels such as *too formal* or *invented fact*.
   - Press **Approve & send**. Watch the message arrive in Simulator → "What the simulated provider accepted".
9. **Per-chat pause.** In a conversation header, press **Pause**, or set the mode override. The big status badge updates. Queued AI work is cancelled.
10. **Global stop.**
    1. Set Automation → Global mode to **Automatic** (this asks for confirmation).
    2. Fire a scenario, then press **Stop all sends** in the top bar. Queued replies return to Draft; manual sends are blocked too.
    3. Release the stop. Afterwards, set the global mode back to Draft if you prefer.
11. **Scoring.** Fire **high_interest**, then open Customers. Intent shows evidence lines, a handoff appears in Handoffs, and a notification lands in the bell.
12. **Notification test.** Go to Integrations → Telegram. Use **Send in-app test**, or save a bot token and chat id and press **Send test**.
13. **Takeover/resume.** In a chat, press **Take over**: pending drafts are cancelled and nothing auto-sends. New inbound messages create no drafts. Press **Resume** to bring automation back.
14. **Logs.** Activity & settings → Audit log shows every action above. The Troubleshooting tab shows worker health, failed jobs and webhook errors.

## Failure drills (Simulator → Failures & edge cases)

- **Timeout, but delivered.** The send becomes "uncertain", then reconciliation finds it and marks it sent. No duplicate is created.
- **Timeout, lost.** The send stays uncertain, and a handoff asks a human to choose: mark delivered, retry with the same key, or discard.
- **Rate limited.** The send is retried after Retry-After.
- **Rejected.** The send fails visibly and a notification is raised.
- **Next AI call fails.** The result is a visible failed draft plus a handoff.
- **Duplicate webhook.** The second delivery is reported as a duplicate.
- **Out-of-order messages.** The older message is placed correctly, and any open draft goes stale.
- **Bad signature.** The request is rejected with a 401.
- **injection** scenario. The text is treated as data: no settings change, no secrets leak, no free offers.
