import { setupPassphrase, adoptConfig, verifyAgainstConfig, unlock, normalizePhrase } from "./crypto.js";
import { importEntries } from "./storage.js";

function wordInputsRow(values = ["", "", "", ""]) {
  const row = document.createElement("div");
  row.className = "word-input-row";
  row.innerHTML = values
    .map((v, i) => `<input type="text" class="word-input" data-idx="${i}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" value="${v}" placeholder="word ${i + 1}" />`)
    .join("");
  return row;
}

function readWords(row) {
  return [...row.querySelectorAll(".word-input")].map((i) => i.value);
}

// Runs the full first-open flow: explain why pages are encrypted, let the
// person choose their own four words, make them confirm it and save it
// somewhere safe, then a short "how this works" -- or, via the restore
// link on the very first screen, skip straight to recovering an existing
// backup instead of creating a new phrase.
export function renderOnboarding(root, onComplete) {
  function show(buildFn) {
    root.replaceChildren();
    const view = document.createElement("div");
    view.className = "onboarding-view";
    const card = document.createElement("div");
    card.className = "onboarding-card";
    view.appendChild(card);
    root.appendChild(view);
    buildFn(card);
  }

  function showIntro() {
    show((card) => {
      card.innerHTML = `
        <p class="onboarding-eyebrow">Before you begin</p>
        <h1 class="onboarding-title">These pages are private</h1>
        <div class="onboarding-body">
          <p>Morning Pages are traditionally written for no one — not an audience, not even a future version of yourself rereading them. The point is to let whatever's in your head land on the page without performing, editing, or worrying about who might see it.</p>
          <p>So every page here is encrypted with a phrase only you know. Not stored anywhere, not recoverable by anyone — including whoever built this app. That's what makes it safe to write completely freely.</p>
          <p>Next you'll choose four words as your own private key.</p>
        </div>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-begin-btn">Continue</button>
        </div>
        <button type="button" class="onboarding-link-btn" id="ob-restore-link">Already have Morning Pages elsewhere? Restore a backup</button>
      `;
      card.querySelector("#ob-begin-btn").addEventListener("click", showCreate);
      card.querySelector("#ob-restore-link").addEventListener("click", showRestorePicker);
    });
  }

  function showCreate() {
    show((card) => {
      card.innerHTML = `
        <p class="onboarding-eyebrow">Step 1 of 3</p>
        <h1 class="onboarding-title">Choose four words</h1>
        <div class="onboarding-body">
          <p>These four words are your key — the only way anything you write can be unlocked and read again. Pick something personal and memorable, not a quote from a book or song.</p>
        </div>
        <div id="ob-word-slot"></div>
        <p class="onboarding-error hidden" id="ob-create-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-create-continue-btn">Continue</button>
        </div>
      `;
      const row = wordInputsRow();
      card.querySelector("#ob-word-slot").appendChild(row);
      row.querySelector(".word-input").focus();
      card.querySelector("#ob-create-continue-btn").addEventListener("click", () => {
        const words = readWords(row);
        const errorEl = card.querySelector("#ob-create-error");
        if (words.some((w) => !w.trim())) {
          errorEl.textContent = "Fill in all four words.";
          errorEl.classList.remove("hidden");
          return;
        }
        showConfirm(words);
      });
    });
  }

  function showConfirm(chosenWords) {
    show((card) => {
      card.innerHTML = `
        <p class="onboarding-eyebrow">Step 2 of 3</p>
        <h1 class="onboarding-title">Type them again</h1>
        <div class="onboarding-body"><p>Just to be sure there's no typo — this is the only chance to catch one.</p></div>
        <div id="ob-word-slot"></div>
        <p class="onboarding-error hidden" id="ob-confirm-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn secondary" id="ob-confirm-back-btn">Back</button>
          <button type="button" class="text-btn primary" id="ob-confirm-continue-btn">Continue</button>
        </div>
      `;
      const row = wordInputsRow();
      card.querySelector("#ob-word-slot").appendChild(row);
      row.querySelector(".word-input").focus();
      card.querySelector("#ob-confirm-back-btn").addEventListener("click", showCreate);
      card.querySelector("#ob-confirm-continue-btn").addEventListener("click", () => {
        const retyped = readWords(row);
        const errorEl = card.querySelector("#ob-confirm-error");
        if (normalizePhrase(retyped) !== normalizePhrase(chosenWords)) {
          errorEl.textContent = "That doesn't match what you typed before. Try again.";
          errorEl.classList.remove("hidden");
          return;
        }
        showSave(chosenWords);
      });
    });
  }

  function showSave(words) {
    show((card) => {
      const phrase = words.map((w) => w.trim().toLowerCase()).join(" ");
      card.innerHTML = `
        <p class="onboarding-eyebrow">Step 3 of 3</p>
        <h1 class="onboarding-title">Save this somewhere safe</h1>
        <div class="onboarding-phrase-display" id="ob-phrase-display">${phrase}</div>
        <button type="button" class="text-btn secondary onboarding-copy-btn" id="ob-copy-btn">Copy</button>
        <div class="onboarding-warning">
          <strong>There is no password reset.</strong> If you lose these four words, every page you've written becomes permanently unreadable — there is no other way in.
          <p>Save your passphrase in a secure location — physical or a password manager is recommended.</p>
        </div>
        <label class="onboarding-checkbox-row">
          <input type="checkbox" id="ob-saved-check" />
          <span>I've saved this phrase somewhere safe</span>
        </label>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-save-continue-btn" disabled>Continue</button>
        </div>
      `;
      card.querySelector("#ob-copy-btn").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(phrase);
          const btn = card.querySelector("#ob-copy-btn");
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        } catch {}
      });
      const checkbox = card.querySelector("#ob-saved-check");
      const continueBtn = card.querySelector("#ob-save-continue-btn");
      checkbox.addEventListener("change", () => {
        continueBtn.disabled = !checkbox.checked;
      });
      continueBtn.addEventListener("click", async () => {
        continueBtn.disabled = true;
        await setupPassphrase(words);
        showHowItWorks();
      });
    });
  }

  function showHowItWorks() {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">How this works</h1>
        <div class="onboarding-body instructions-body">
          <section>
            <h3>A page a day</h3>
            <p>Open the app and start writing — no prompts, no setup. A quiet word count at the bottom tracks against a daily goal (750 words by default, about three handwritten pages), with a small checkmark once you reach it. Keep going or stop early — it's entirely up to you.</p>
          </section>
          <section>
            <h3>Save to log, or just write</h3>
            <p>Tap <strong>Save to log</strong> whenever you're done to file today's page away as a card. Everything also autosaves as you type either way, so nothing is lost if you close the app mid-thought.</p>
          </section>
          <section>
            <h3>Locked by default</h3>
            <p>Closing and reopening the app always asks for your four words again — that's what keeps these pages private. My Log and the Calendar (in the menu) let you revisit past days, but a page's actual words only ever show up when you deliberately tap to open it.</p>
          </section>
          <section>
            <h3>Your data, your device</h3>
            <p>Everything lives only in this browser, on this device, fully encrypted — no account, no server. Back it up from the menu every so often; the exported file stays encrypted too, so it's safe to store anywhere.</p>
          </section>
        </div>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-start-btn">Start writing</button>
        </div>
      `;
      card.querySelector("#ob-start-btn").addEventListener("click", onComplete);
    });
  }

  function showRestorePicker() {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">Restore a backup</h1>
        <div class="onboarding-body"><p>Choose a Morning Pages backup file exported from another device.</p></div>
        <button type="button" class="text-btn primary" id="ob-restore-file-btn">Choose file…</button>
        <input type="file" accept="application/json,.json" id="ob-restore-file-input" hidden />
        <p class="onboarding-error hidden" id="ob-restore-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn secondary" id="ob-restore-back-btn">Back</button>
        </div>
      `;
      card.querySelector("#ob-restore-back-btn").addEventListener("click", showIntro);
      const fileInput = card.querySelector("#ob-restore-file-input");
      card.querySelector("#ob-restore-file-btn").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const errorEl = card.querySelector("#ob-restore-error");
        errorEl.classList.add("hidden");
        let data;
        try {
          data = JSON.parse(await file.text());
        } catch {
          errorEl.textContent = "That doesn't look like valid JSON.";
          errorEl.classList.remove("hidden");
          return;
        }
        if (!data || data.type !== "morning-pages-backup" || !data.crypto) {
          errorEl.textContent = "That doesn't look like a Morning Pages backup file.";
          errorEl.classList.remove("hidden");
          return;
        }
        showRestoreUnlock(data);
      });
    });
  }

  function showRestoreUnlock(data) {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">Enter that backup's four words</h1>
        <div class="onboarding-body"><p>The same phrase that was set up when this backup was made.</p></div>
        <div id="ob-word-slot"></div>
        <p class="onboarding-error hidden" id="ob-restore-unlock-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-restore-unlock-btn">Restore</button>
        </div>
      `;
      const row = wordInputsRow();
      card.querySelector("#ob-word-slot").appendChild(row);
      row.querySelector(".word-input").focus();
      card.querySelector("#ob-restore-unlock-btn").addEventListener("click", async () => {
        const words = readWords(row);
        const errorEl = card.querySelector("#ob-restore-unlock-error");
        const ok = await verifyAgainstConfig(words, data.crypto);
        if (!ok) {
          errorEl.textContent = "That doesn't unlock this backup.";
          errorEl.classList.remove("hidden");
          return;
        }
        adoptConfig(data.crypto);
        await unlock(words);
        await importEntries(data);
        onComplete();
      });
    });
  }

  showIntro();
}
