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

1. **Welcome**, then **Your models**: one card per model, each with its own AI switch (Off / Drafts / Auto).
2. **Safety button**: where the emergency stop lives.
3. **Open the inbox** *(your turn)*, then **where messages arrive**.
4. **A subscriber writes in**: "Taylor (test customer)" sends "Hey! I'm new here. What kind of content do you offer?" through the signed simulator webhook.
5. **Open Taylor's chat** *(your turn)*, then **watch the AI write a reply**. It shows a writing state, then a draft labelled **Not sent yet**. Without an AI model connected, it is labelled **Sample reply**.
6. **Make it yours** *(your turn: edit a word)*.
7. **Auto-reply**:
   1. Set Mira to **Auto** *(your turn, with a confirmation)*.
   2. Taylor writes again. The AI writes the reply and waits, with a live "Sending in 0:42" countdown.
   3. The tour explains batching of quick messages, discarding stale replies, reply hours, and "Don't send" or take over. In demo mode you can skip a natural wait. Waits caused by reply hours can't be skipped.
8. **Personality**:
   1. Open Settings *(your turn)*.
   2. Pick a personality or move a slider *(your turn)*.
   3. Press **Try this style** *(your turn)*.
   4. Compare **before / after**, with the changed settings listed. Then **Keep** or **Undo**.
9. **PPV**: Taylor asks about hiking photos. The AI names one fitting item with its real price (Autumn Hike, $12), and a PPV chip offers **Prepare PPV** for your approval. The AI never sends paid content itself.
10. **You're in control**:
    1. Pause AI *(your turn)*, then Resume *(your turn)*.
    2. Take over *(your turn)*, then Hand back *(your turn)*.
    3. The big red stop button.
11. **All set**: what you learned, and the next real setup steps.

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
