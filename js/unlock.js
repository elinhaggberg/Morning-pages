import { unlock } from "./crypto.js";
import { eraseEverything } from "./storage.js";

function wordInputsRow() {
  const row = document.createElement("div");
  row.className = "word-input-row";
  row.innerHTML = [0, 1, 2, 3]
    .map((i) => `<input type="text" class="word-input" data-idx="${i}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="word ${i + 1}" />`)
    .join("");
  return row;
}

export function renderUnlock(root, onUnlocked) {
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

  function showUnlock() {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">Enter your four words</h1>
        <div class="onboarding-body"><p>To keep your pages private, every fresh visit starts locked.</p></div>
        <div id="unlock-word-slot"></div>
        <p class="onboarding-error hidden" id="unlock-error"></p>
        <div class="onboarding-actions">
          <button type="button" class="text-btn primary" id="unlock-btn">Unlock</button>
        </div>
        <button type="button" class="onboarding-link-btn" id="forgot-link">Forgot your phrase?</button>
      `;
      const row = wordInputsRow();
      card.querySelector("#unlock-word-slot").appendChild(row);
      const inputs = [...row.querySelectorAll(".word-input")];
      inputs[0].focus();

      const errorEl = card.querySelector("#unlock-error");
      const unlockBtn = card.querySelector("#unlock-btn");

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
        onUnlocked();
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

      card.querySelector("#forgot-link").addEventListener("click", showForgot);
    });
  }

  function showForgot() {
    show((card) => {
      card.innerHTML = `
        <h1 class="onboarding-title">No way back in</h1>
        <div class="onboarding-body">
          <p>Your four words were never stored anywhere — not by this app, not by anyone. If they're truly gone, so is everything written under them. There's no support line or account recovery that can help.</p>
          <p>The only option from here is to erase this device's Morning Pages and start over.</p>
        </div>
        <label class="onboarding-checkbox-row">
          <input type="checkbox" id="forgot-confirm-check" />
          <span>I understand this permanently deletes every page</span>
        </label>
        <div class="onboarding-actions">
          <button type="button" class="text-btn secondary" id="forgot-back-btn">Back</button>
          <button type="button" class="text-btn danger" id="forgot-erase-btn" disabled>Erase and start over</button>
        </div>
      `;
      card.querySelector("#forgot-back-btn").addEventListener("click", showUnlock);
      const checkbox = card.querySelector("#forgot-confirm-check");
      const eraseBtn = card.querySelector("#forgot-erase-btn");
      checkbox.addEventListener("change", () => {
        eraseBtn.disabled = !checkbox.checked;
      });
      eraseBtn.addEventListener("click", async () => {
        eraseBtn.disabled = true;
        await eraseEverything();
        window.location.reload();
      });
    });
  }

  showUnlock();
}
