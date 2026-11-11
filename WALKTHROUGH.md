# WALKTHROUGH.md

A new owner goes through two required steps on first sign-in: **setup**, then a **guided tour**. Both work on their real accounts; nothing uses demo data.

## 1. Required setup (`/onboarding`)

Until setup is finished, every page leads here. Sign out and the emergency stop stay available.

1. **Welcome**: what you'll need (Fans API key, DeepSeek key, each model's facts and PPV items).
2. **Accounts**: paste the Fans API key (saved encrypted, then checked), connect the creators in the Fans API dashboard, then **Find my accounts → Use this account**. Continue unlocks once at least one account is connected.
3. **AI**: DeepSeek (Fast or Most capable) or another provider. **Connect & test**. If there's no key yet, tick "start with sample replies" to continue.
4. **Personality**, per model: the name she writes as, a preset (Friendly, Playful, Confident, Professional, Short & sweet), emoji, texting style, true facts, and phrases she uses or never uses. **Save**.
5. **PPV menu**, per model, optional: title, what's in it, price.
6. **Automation**: Off / Drafts / Auto per model (Auto asks for confirmation), and reply hours in your time zone.
7. **Finish**: a checklist of what's required and what's optional. **Finish & start the tour**. The server checks the minimums again.

## 2. Required guided tour

It starts by itself after setup.
- Spotlight on one element at a time; the rest of the screen is dimmed.
- Back and Next buttons; "Your turn" steps advance when you do them.
- Esc or ✕ pauses it, and it continues on the next visit until it's finished.
- There's no "Skip tour" the first time. The **Stop all sends** button stays clickable throughout.

1. Welcome.
2. Your models (one card each).
3. Off / Drafts / Auto.
4. The safety button.
5. Open the inbox *(your turn)*.
6. Conversations and the model switcher.
7. Open a conversation *(your turn; skipped automatically if nobody has written yet)*.
8. Where AI replies appear: Not sent yet, countdown, Why this reply?, PPV note.
9. Pause AI and Take over. These are explained only: the tour never presses them on a real subscriber's chat.
10. Open Settings *(your turn)*.
11. Change the personality *(your turn; nothing is saved until you press Save)*.
12. **Try this style** *(your turn; previews never reach subscribers)*.
13. The PPV menu.
14. Auto-reply and timing.
15. All set: a summary and "worth doing next" (connect a real AI, add PPV menus, phone alerts).

Completion is saved on the user, and the tour can be replayed from **Guided tour** at any time.

## Practice sandbox (optional)

Settings → Advanced → Practice sandbox → **Create a practice account** adds a simulated model with a few labelled practice chats, for trying failure drills without touching real subscribers:
- **Timeout but delivered / lost**: the send is reconciled, or a person decides; it is never resent automatically.
- **Rate limited / rejected**: retried after the wait, or failed visibly with an alert.
- **AI failure**: the AI's reply fails and the chat is marked "Needs you".
- **Duplicate or out-of-order webhooks, bad signature, prompt injection**: each is handled safely; see ARCHITECTURE.md.

**Remove practice data** deletes it again.
