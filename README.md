# Morning Pages

A private, single-purpose app for writing Julia Cameron-style Morning Pages — three pages of unfiltered, stream-of-consciousness writing, done first thing, for no audience at all.

Open it and it goes straight to a blank page. No prompts, no setup, no decisions to make. A quiet word count at the bottom tracks against a daily goal (750 words by default — roughly three handwritten pages) with a small checkmark once you reach it, but there's nothing stopping you from writing less, or a lot more.

Part of the [Make It Local](https://github.com/elinhaggberg) family of small, ad-free, local-first apps: no accounts, no cloud, no subscriptions. Everything you write stays on your device.

## Features

- **Straight to the page.** No home screen to navigate through — the app opens directly into today's writing.
- **A quiet word goal**, not a requirement. Default 750 words (about three handwritten pages), adjustable in Customize.
- **Save to log**, or don't. Everything autosaves as you type either way, so nothing is lost if you close the app mid-thought. "Save to log" just files the page away as a card and clears space for a new one — useful if you want to write more than once a day, diary-style.
- **My Log & Calendar catch-up** — every day you've written something, and a way to retroactively write for a day you missed.
- **Playful / Light / Dark themes**, with a choice of accent colors in Playful mode. Playful with the Midnight accent is the default.

## Privacy by encryption

Morning Pages are traditionally written for no one — not an audience, not even a future version of yourself rereading them. To make that private-by-nature, every page in this app is **encrypted**, but never at the cost of making writing itself feel gated:

- The first time you open the app, it generates your own **four-word phrase** — picked at random from the same standard wordlist crypto wallets use (BIP-39), so it carries real, guaranteed entropy rather than whatever a person might pick themselves. It becomes the key that protects your permanent log — never stored anywhere, not in this app, not on any server.
- Writing a fresh page never asks for it. A page in progress is encrypted the instant you type, under a key that lives quietly on this device — enough to keep it from being plainly readable, though not a secret the way your phrase is.
- Your four words only get asked for at two moments: **Save to log** — which re-encrypts the page under your phrase and is what actually makes it part of the protected, permanent log — and opening a page you already saved.
- If your device supports it, **Face ID, Touch ID, or a fingerprint** can stand in for typing the phrase at either of those moments — an optional, revocable shortcut (via WebAuthn's PRF extension) that wraps a local copy of the vault key. Your four words always keep working too, on every device, and are never replaced.
- A page's actual words are never shown anywhere except the moment you deliberately tap to open it. Cards in My Log and the Calendar only ever show a date, a time, and a word count — never a preview of the text.
- **There is no password reset.** If you lose your four words, everything already saved to your log is permanently unreadable. Onboarding makes you save the generated phrase and confirm you've done so before you can start.

This is a deliberate trade: real privacy for anything you file away, in exchange for real responsibility for the phrase that protects it. Save it somewhere durable (a password manager, a safe, anywhere but "I'll remember it").

## Running it

This is a dependency-free, build-free Progressive Web App — plain HTML/CSS/JS. Serve the folder with any static file server and open it in a browser, or add it to your phone's Home Screen to install it like a native app.

```
npx serve .
```

## Data & privacy

Everything is stored locally in this browser (IndexedDB for entries, all of it encrypted; localStorage for the salt/verifier used to check your phrase, an unprotected local key for in-progress pages, and preferences) — there's no account, no backend, and no analytics. Removing the app from your Home Screen deletes its data too, so back up from the menu every so often. The exported backup only includes pages saved to your log (a page still in progress isn't part of it yet) and stays fully encrypted, so it's safe to store anywhere — it's only ever readable with the four words it was made under.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
