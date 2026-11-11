# WALKTHROUGH.md

The walkthrough is built into the app as an **interactive guided tour**. It dims and blurs the screen, highlights one thing at a time, and asks you to try each control yourself. On a first visit, Home offers two choices: **Explore with a demo** (starts the tour) or **Set up my account** (starts the setup wizard).

You can restart or resume the tour any time: use **Guided tour** in the sidebar (on a phone, the ••• menu), or go to Settings → Appearance & preferences.

## How the tour behaves

- One explanation at a time, placed next to the highlighted element. On phones it becomes a sheet at the top or bottom of the screen.
- **Back**, **Next**, **Skip this step**, **Skip tour** and **✕ / Esc** (exit) are always available. The arrow keys move between steps.
- "Your turn" steps advance by themselves when you do the action. Skipping one still prepares what later steps need (for example the test message and its draft), so you never get stuck.
- Progress is remembered on this device. A running tour continues after a page reload; a tour you exited waits until you resume it.
- The tour never blocks the emergency stop. A **Stop all sends** button floats above the tour overlay at all times.
- Everything happens on the built-in simulator. The demo account has no network code, so nothing in the tour can reach a real customer.

## The steps

1. **Welcome.** What the tour covers, and a reminder that it's a safe demo.
2. **Home.** The three status cards: Inbox, AI assistant, Automation, all in plain words.
3. **Safety button.** Where the emergency stop lives.
4. **Open the inbox.** *Your turn: click Inbox.*
5. **Where messages arrive.** The list, with its "Needs you", "Draft ready" and "Demo" markers.
6. **A new customer writes in.** Press *Send test message*: "Taylor (test customer)" sends "Hey! I'm new here. What kind of content do you offer?" through the normal simulated-webhook path.
7. **Open Taylor's conversation.** *Your turn.* The unread dot shows it's new.
8. **Watch the AI write a reply.** Press *Write a reply*. The draft area shows that the AI is writing (no hidden reasoning is shown). Then it runs the real pipeline: policy, AI, safety checks, draft.
   - With a connected and tested AI model, that model writes the draft.
   - Without one, the built-in sample rules write it, and it's labelled **Sample reply**.
9. **The draft isn't sent yet.** What "Why this reply?" shows, and what Draft, Automatic and Manual mean.
10. **Make it yours.** *Your turn: change a word in the reply.*
11. **Open Settings.** *Your turn.*
12. **Pick how your AI sounds.** *Your turn:* choose a personality preset (Friendly, Playful, Confident, Professional, Short & sweet) or move a slider.
13. **Try this style.** *Your turn.* The same test message is answered again with your unsaved settings.
14. **Before and after.** Both replies appear, with the changed settings listed. **Keep this style** saves a new style version; **Undo changes** restores the old one.
15. **Approve the reply.** *Your turn:* Approve & send. The reply goes to the simulator only. This step explains the difference between a draft and a sent message.
16. **Sent, and clearly labelled.** The sent bubble reads "AI draft · approved · Demo".
17. **Pause the AI for one chat**, then **18. Resume AI.** *Your turn* for both.
19. **Take over**, then **20. Hand back to AI.** *Your turn* for both. Taking over cancels waiting AI drafts.
21. **The big red button.** The emergency stop: what it blocks, and how to release it.
22. **All set.** What you learned, and the remaining real setup: connect messaging, connect an AI model (optional), choose the automation level.

## Setup wizard (`/setup`)

1. **Messaging.**
   1. Paste the Fans API key; the app saves it and checks it.
   2. Connect the creator account in the Fans API dashboard. This app never asks for the platform password.
   3. Press **Find my accounts**, then **Use this account**.
2. **AI.** Choose Sample replies (free, built in), DeepSeek (Fast or Most capable), or another OpenAI-compatible provider. Paste a key, then **Connect & test**. A model is used only after it passes the test.
3. **Test a reply.** See how your AI answers a typical first message. Nothing is sent.
4. **Automation.** Choose Drafts only (recommended), Automatic (asks you to confirm), or Off.

Every failure is explained in plain language, with the original error under **Technical details**.

## Failure drills (Settings → Advanced → Demo lab)

- **Timeout, but delivered.** The send becomes "uncertain", then reconciliation finds it and marks it sent. No duplicate is created.
- **Timeout, lost.** The conversation shows "We're not sure this reply was delivered", and a person chooses: *I can see it was delivered*, *Try again* (same idempotency key, so it can't double-send), or *Discard*.
- **Rate limited.** The send is retried after Retry-After.
- **Rejected.** The send fails visibly and a notification is raised.
- **Next AI call fails.** The result is a visible "The AI couldn't write a reply" card plus a "Needs you" banner.
- **Duplicate webhook / out-of-order messages / bad signature / prompt injection.** Each is handled as described in ARCHITECTURE.md.
