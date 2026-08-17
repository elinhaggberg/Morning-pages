import { openSheet } from "./sheet.js";
import { getTheme, setTheme, PLAYFUL_SWATCHES } from "./theme.js";
import { getWordGoal, setWordGoal } from "./storage.js";
import { openDataManagementSheet, openImportSheet } from "./dataManagement.js";
import { lock, isUnlocked, isBiometricAvailable, hasBiometricUnlock, enableBiometricUnlock, disableBiometricUnlock } from "./crypto.js";
import { promptUnlock } from "./unlock.js";

export function openSettingsMenu(refresh) {
  const sheet = openSheet("tpl-settings-menu");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  el.querySelector("#log-btn").addEventListener("click", () => {
    sheet.close();
    location.hash = "#/log";
  });
  el.querySelector("#calendar-btn").addEventListener("click", () => {
    sheet.close();
    location.hash = "#/calendar";
  });
  el.querySelector("#instructions-btn").addEventListener("click", () => {
    sheet.close();
    openInstructions();
  });
  el.querySelector("#about-btn").addEventListener("click", () => {
    sheet.close();
    openAbout();
  });
  el.querySelector("#customize-btn").addEventListener("click", () => {
    sheet.close();
    openCustomize();
  });
  el.querySelector("#biometric-btn").addEventListener("click", () => {
    sheet.close();
    openBiometricSheet();
  });
  el.querySelector("#data-btn").addEventListener("click", () => {
    sheet.close();
    openDataManagementSheet();
  });
  el.querySelector("#import-btn").addEventListener("click", () => {
    sheet.close();
    openImportSheet(refresh);
  });
  el.querySelector("#lock-btn").addEventListener("click", () => {
    lock();
    sheet.close();
  });
  el.querySelector("#app-library-link-btn").addEventListener("click", () => {
    sheet.close();
    openAppLibraryPromo();
  });
}

function openAppLibraryPromo() {
  const sheet = openSheet("tpl-app-library-promo");
  sheet.el.querySelector(".cancel-btn").addEventListener("click", () => sheet.close());
}

function openInstructions() {
  const sheet = openSheet("tpl-instructions");
  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
}

function openAbout() {
  const sheet = openSheet("tpl-about");
  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
}

async function openBiometricSheet() {
  const sheet = openSheet("tpl-biometric");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  const statusEl = el.querySelector("#biometric-status");
  const actionBtn = el.querySelector("#biometric-action-btn");
  const errorEl = el.querySelector("#biometric-error");

  const available = await isBiometricAvailable();

  function render() {
    errorEl.classList.add("hidden");
    if (!available) {
      statusEl.textContent = "This device or browser doesn't support Face ID, Touch ID, or fingerprint unlock.";
      actionBtn.classList.add("hidden");
      return;
    }
    actionBtn.classList.remove("hidden");
    if (hasBiometricUnlock()) {
      statusEl.textContent = "On for this device. Your four words still work everywhere and remain the fallback.";
      actionBtn.textContent = "Turn off";
      actionBtn.className = "text-btn danger";
    } else {
      statusEl.textContent = "Unlock with Face ID, Touch ID, or a fingerprint instead of typing your four words — your phrase still works too, and stays the fallback.";
      actionBtn.textContent = "Turn on";
      actionBtn.className = "text-btn primary";
    }
  }

  actionBtn.addEventListener("click", async () => {
    errorEl.classList.add("hidden");
    if (hasBiometricUnlock()) {
      disableBiometricUnlock();
      render();
      return;
    }
    if (!isUnlocked()) {
      const unlocked = await promptUnlock();
      if (!unlocked) return;
    }
    actionBtn.disabled = true;
    const ok = await enableBiometricUnlock();
    actionBtn.disabled = false;
    if (!ok) {
      errorEl.textContent = "That didn't work — try again, or check that Face ID / Touch ID is set up on this device.";
      errorEl.classList.remove("hidden");
      return;
    }
    render();
  });

  render();
}

function openCustomize() {
  const sheet = openSheet("tpl-customize");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  const accentPicker = el.querySelector("#playful-accent-picker");
  const themeButtons = el.querySelectorAll(".theme-option");
  const swatchRow = el.querySelector("#playful-swatch-row");
  swatchRow.replaceChildren(
    ...PLAYFUL_SWATCHES.map((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn";
      btn.dataset.accent = s.id;
      btn.style.background = s.accent;
      btn.setAttribute("aria-label", s.label);
      return btn;
    })
  );
  const swatchButtons = el.querySelectorAll(".swatch-btn");

  function renderActive() {
    const pref = getTheme();
    themeButtons.forEach((b) => b.classList.toggle("active", b.dataset.themeMode === pref.mode));
    swatchButtons.forEach((b) => b.classList.toggle("active", b.dataset.accent === pref.playfulAccent));
    accentPicker.classList.toggle("hidden", pref.mode !== "playful");
  }

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme({ ...getTheme(), mode: btn.dataset.themeMode });
      renderActive();
    });
  });
  swatchButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme({ ...getTheme(), playfulAccent: btn.dataset.accent });
      renderActive();
    });
  });

  renderActive();

  const goalInput = el.querySelector("#word-goal-input");
  goalInput.value = getWordGoal();
  goalInput.addEventListener("change", () => {
    const n = Number(goalInput.value);
    if (n > 0) setWordGoal(n);
    goalInput.value = getWordGoal();
  });
}
