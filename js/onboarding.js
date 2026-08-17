import { setupPassphrase, adoptConfig, verifyAgainstConfig, unlock, generatePassphrase, isBiometricAvailable, enableBiometricUnlock } from "./crypto.js";
import { importEntries } from "./storage.js";
import { openSheet } from "./sheet.js";

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

// Runs the full first-open flow: a general "how this app works" orientation
// first (before anything is set up, since it's the one chance to say
// "install this now, before your passphrase exists, or you may end up
// setting one up somewhere you won't be using day to day"), then why pages
// are encrypted, a generated four-word phrase to save, and an optional
// Face ID / Touch ID offer -- or, via the restore link on the privacy
// screen, skip straight to recovering an existing backup instead.
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

  // The Make It Local family's standard first-open explainer -- same
  // template shape, sections, and "Got it" button as Creative Daily's
  // tpl-how-it-works, just triggered here instead of from Home (there's no
  // Home yet without a passphrase) and chaining into the rest of setup
  // once dismissed, rather than just closing.
  function showHowItWorksSheet() {
    const sheet = openSheet("tpl-how-it-works", { dismissible: false });
    const proceed = () => {
      sheet.close();
      showIntro();
    };
    sheet.el.querySelector(".close-btn").addEventListener("click", proceed);
    sheet.el.querySelector("#how-it-works-got-it-btn").addEventListener("click", proceed);
  }

  function showIntro() {
    show((card) => {
      card.innerHTML = `
        <p class="onboarding-eyebrow">Before you begin</p>
        <h1 class="onboarding-title">These pages are private</h1>
        <div class="onboarding-body">
          <p>Morning Pages are traditionally written for no one — not an audience, not even a future version of yourself rereading them. The point is to let whatever's in your head land on the page without performing, editing, or worrying about who might see it.</p>
          <p>So every page here is encrypted with a phrase only you have — not stored anywhere, not recoverable by anyone, including whoever built this app. You won't be asked for it just to open the app or start writing, though: it's only asked for the moment you save a page to your permanent log, or go back to read one you already saved. Writing itself stays as frictionless as a blank page should be.</p>
          <p>Next, the app will generate four random words as your own private key.</p>
        </div>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="ob-begin-btn">Continue</button>
        </div>
        <button type="button" class="onboarding-link-btn" id="ob-restore-link">Already have Morning Pages elsewhere? Restore a backup</button>
      `;
      card.querySelector("#ob-begin-btn").addEventListener("click", showGenerated);
      card.querySelector("#ob-restore-link").addEventListener("click", showRestorePicker);
    });
  }

  // No retyping to confirm here -- there's nothing to mistype. The words
  // come from the app, displayed once; saving them somewhere safe (not
  // memorizing them) is the actual plan, same as before.
  function showGenerated() {
    const words = generatePassphrase();
    const phrase = words.join(" ");
    show((card) => {
      card.innerHTML = `
        <p class="onboarding-eyebrow">Your private key</p>
        <h1 class="onboarding-title">Save these four words</h1>
        <div class="onboarding-body"><p>Generated just now, for you alone. Don't like the combination? Regenerate for a new one -- either way, this phrase is the only way anything you write can be unlocked and read again.</p></div>
        <div class="onboarding-phrase-display" id="ob-phrase-display">${phrase}</div>
        <div class="onboarding-phrase-actions">
          <button type="button" class="text-btn secondary" id="ob-copy-btn">Copy</button>
          <button type="button" class="text-btn secondary" id="ob-regenerate-btn">Regenerate</button>
        </div>
        <div class="onboarding-warning">
          <strong>There is no password reset.</strong> If you lose these four words, every page you've written becomes permanently unreadable — there is no other way in.
          <p>Save your passphrase in a secure location — physical or a password manager is recommended.</p>
        </div>
        <p class="settings-note">Once this is set, opening the app or writing a fresh page will never ask for it — only <strong>Save to log</strong>, and opening a page you already saved.</p>
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
      card.querySelector("#ob-regenerate-btn").addEventListener("click", () => showGenerated());
      const checkbox = card.querySelector("#ob-saved-check");
      const continueBtn = card.querySelector("#ob-save-continue-btn");
      checkbox.addEventListener("change", () => {
        continueBtn.disabled = !checkbox.checked;
      });
      continueBtn.addEventListener("click", async () => {
        continueBtn.disabled = true;
        await setupPassphrase(words);
        if (await isBiometricAvailable()) {
          showBiometricOffer();
        } else {
          onComplete();
        }
      });
    });
  }

  // Only ever reached when isBiometricAvailable() already said yes, so
  // there's something real to offer -- entirely optional, and skippable
  // without losing anything (the phrase from the previous screen already
  // works on its own).
  function showBiometricOffer() {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">Unlock with Face ID or Touch ID?</h1>
        <div class="onboarding-body">
          <p>Instead of typing your four words every time you save a page or reopen one, you can unlock with whatever this device already uses — Face ID, Touch ID, or a fingerprint.</p>
          <p>Your phrase still works everywhere, on every device, and remains the fallback if this is ever unavailable — this only adds a shortcut, it never replaces it.</p>
        </div>
        <p class="onboarding-error hidden" id="ob-bio-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn secondary" id="ob-bio-skip-btn">Not now</button>
          <button type="button" class="text-btn primary" id="ob-bio-enable-btn">Enable</button>
        </div>
      `;
      card.querySelector("#ob-bio-skip-btn").addEventListener("click", onComplete);
      card.querySelector("#ob-bio-enable-btn").addEventListener("click", async () => {
        const btn = card.querySelector("#ob-bio-enable-btn");
        const errorEl = card.querySelector("#ob-bio-error");
        btn.disabled = true;
        const ok = await enableBiometricUnlock();
        if (ok) {
          onComplete();
          return;
        }
        btn.disabled = false;
        errorEl.textContent = "That didn't work — you can try again later from the menu, or just keep using your four words.";
        errorEl.classList.remove("hidden");
      });
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

  showHowItWorksSheet();
}
