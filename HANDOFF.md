# Handing Creator Inbox to a new owner

This is the checklist for giving the app to the person who will run it. The app ships **empty**: no demo models, no demo chats. The new owner sets up their own accounts in a required first-run setup, then takes a short required tour.

## Before you hand it over

1. **Start from a fresh database** on the server they'll use (recommended).
   - Docker: deploy as in README → "VPS deployment". A new `db` volume is empty.
   - If you reuse an existing database, sign in to it and remove any practice data under Settings → Advanced → Practice sandbox → **Remove practice data**.
2. **Don't create the owner account for them.**
   - Leave `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` empty in `.env`.
   - On first visit from the server itself (localhost), the login page offers **Create your account**.
   - On a remote server, create it from a shell instead (the password is typed in the terminal, never in chat):

   ```bash
   docker compose exec app npx tsx scripts/create-user.ts --email them@example.com --role owner
   ```

3. **Generate a new `MASTER_KEY`** for their installation and give it to them separately, for example in their password manager. Without it, saved keys can't be decrypted from a backup.
4. Leave `SEED_PRACTICE` empty, so no practice accounts are created.

## What they need ready

- A **Fans API** account and its API key. Each creator logs in on Fans API's side; the app never asks for platform passwords.
- A **DeepSeek API key**, recommended. Without it, replies come from basic built-in sample rules.
- For each model: a few true facts about her, and her PPV items with prices.
- The platform's and provider's current terms for automated replies, read before turning any model to **Auto**.

## What happens on first sign-in

1. **Required setup** (`/onboarding`). The app opens nothing else until it's finished.
   1. Connect the Fans API key, then pick the connected creator accounts. **Required:** at least one connected account.
   2. Connect and test the AI. **Required**, or tick "start with sample replies".
   3. A personality for each model: preset, true facts, phrases she uses or never uses.
   4. Each model's PPV menu (optional; can be done later).
   5. Off / Drafts / Auto per model (Drafts recommended at first), and reply hours in their time zone.
2. **Required guided tour.**
   - A spotlight walk-through of Home, the inbox, pausing and taking over, personality, the PPV menu and timing.
   - Esc pauses it; it continues on the next visit until finished.
   - It never asks them to act on a real subscriber's chat.
   - Completion is stored on their user, so it isn't shown again (they can replay it from "Guided tour").
3. Team members added later get a short version: no account setup, just the tour.

## Optional for them

- Settings → Notifications: Telegram alerts ("Find it for me" fills in the chat number).
- Settings → Advanced → Practice sandbox: an opt-in practice account for trying tricky situations. Clearly labelled, and it never reaches a real person.

## Not verified in this build

The Fans API connection, sends and webhooks, DeepSeek reply quality, and Telegram delivery need real credentials and have only been tested against mocks and the simulator. See README → "Not verified".
