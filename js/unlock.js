import { unlock } from "./crypto.js";
import { openSheet } from "./sheet.js";

function wordInputsRow() {
  const row = document.createElement("div");
  row.className = "word-input-row";
  row.innerHTML = [0, 1, 2, 3]
    .map((i) => `<input type="text" class="word-input" data-idx="${i}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="word ${i + 1}" />`)
    .join("");
  return row;
}

// A quick, cancellable ask for the four words -- shown only at the moment
// something actually needs the vault (saving a page to the log, or opening
// one already saved), never at app open. Resolves true once unlocked,
// false if dismissed, in which case the caller just doesn't do the thing
// that needed it -- nothing is lost, since drafts autosave under the
// device key regardless.
export function promptUnlock() {
  return new Promise((resolve) => {
    const sheet = openSheet("tpl-unlock-prompt");
    const el = sheet.el;
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
      sheet.close();
    }
    el.querySelector(".close-btn").addEventListener("click", () => finish(false));
    el.addEventListener("click", (e) => {
      if (e.target === el) finish(false);
    });

    const body = el.querySelector("#unlock-prompt-body");

    function showAsk() {
      body.innerHTML = `
        <div id="unlock-prompt-word-slot"></div>
        <p class="onboarding-error hidden" id="unlock-prompt-error"></p>
        <div class="form-actions">
          <button type="button" class="text-btn secondary" id="unlock-prompt-cancel-btn">Cancel</button>
          <button type="button" class="text-btn primary" id="unlock-prompt-unlock-btn">Unlock</button>
        </div>
        <button type="button" class="onboarding-link-btn" id="unlock-prompt-forgot-link">Forgot your phrase?</button>
      `;
      const row = wordInputsRow();
      body.querySelector("#unlock-prompt-word-slot").appendChild(row);
      const inputs = [...row.querySelectorAll(".word-input")];
      inputs[0].focus();
      const errorEl = body.querySelector("#unlock-prompt-error");
      const unlockBtn = body.querySelector("#unlock-prompt-unlock-btn");

      async function attempt() {
        const words = inputs.map((i) => i.value);
        errorEl.classList.add("hidden");
        unlockBtn.disabled = true;
        const ok = await unlock(words);
        unlockBtn.disabled = false;
        if (!ok) {
          errorEl.textContent = "That doesn't match. Try again.";
          errorEl.classList.remove("hidden");
          return;
        }
        finish(true);
      }
      unlockBtn.addEventListener("click", attempt);
      inputs.forEach((input, idx) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            if (idx < inputs.length - 1) inputs[idx + 1].focus();
            else attempt();
          }
        });
      });
      body.querySelector("#unlock-prompt-cancel-btn").addEventListener("click", () => finish(false));
      body.querySelector("#unlock-prompt-forgot-link").addEventListener("click", showForgot);
    }

    function showForgot() {
      body.innerHTML = `
        <p class="settings-note">Your four words were never stored anywhere, so there's no way to recover them -- not by this app, not by anyone. The only way forward is erasing this device's Morning Pages and starting fresh, from the menu's <strong>Export &amp; manage data</strong> once you close this.</p>
        <div class="form-actions">
          <button type="button" class="text-btn secondary" id="unlock-prompt-back-btn">Back</button>
        </div>
      `;
      body.querySelector("#unlock-prompt-back-btn").addEventListener("click", showAsk);
    }

    showAsk();
  });
}
