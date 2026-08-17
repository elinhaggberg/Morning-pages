import { exportBackupData, importEntries, markBackedUp, eraseEverything } from "./storage.js";
import { getConfig } from "./crypto.js";
import { openSheet } from "./sheet.js";
import { shareOrDownload, filenameFor } from "./share.js";

export function openDataManagementSheet() {
  const sheet = openSheet("tpl-data-management");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  el.querySelector("#data-export-all-btn").addEventListener("click", async () => {
    const data = await exportBackupData(getConfig());
    await shareOrDownload(filenameFor("morning-pages-backup"), JSON.stringify(data, null, 2));
    markBackedUp();
  });

  el.querySelector("#data-erase-btn").addEventListener("click", () => {
    const confirmSheet = openSheet("tpl-confirm-delete");
    confirmSheet.el.querySelector(".confirm-title").textContent = "Erase everything?";
    confirmSheet.el.querySelector(".confirm-message").textContent =
      "This permanently deletes every page and your passphrase from this device. Export a backup first if you want to keep anything. This can't be undone.";
    confirmSheet.el.querySelector(".confirm-btn").textContent = "Erase";
    confirmSheet.el.querySelector(".cancel-btn").addEventListener("click", () => confirmSheet.close());
    confirmSheet.el.querySelector(".confirm-btn").addEventListener("click", async () => {
      await eraseEverything();
      window.location.reload();
    });
  });
}

export async function openImportSheet(refresh) {
  const sheet = openSheet("tpl-import");
  const fileInput = sheet.el.querySelector(".import-file-input");
  const messageEl = sheet.el.querySelector(".import-message");

  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
  sheet.el.querySelector(".import-file-btn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    messageEl.classList.remove("error");

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      messageEl.textContent = "That doesn't look like valid JSON.";
      messageEl.classList.add("error");
      return;
    }

    const localConfig = getConfig();
    if (!parsed?.crypto?.salt || !localConfig || parsed.crypto.salt !== localConfig.salt) {
      messageEl.textContent = "This backup was encrypted with a different phrase — it can only be imported into a device unlocked with the same four words it was created under.";
      messageEl.classList.add("error");
      return;
    }

    try {
      const result = await importEntries(parsed);
      messageEl.textContent = result.entryCount ? `Imported ${result.entryCount} page${result.entryCount !== 1 ? "s" : ""}.` : "Import complete.";
      if (refresh) refresh();
      setTimeout(() => sheet.close(), 900);
    } catch (err) {
      messageEl.textContent = err.message || "That doesn't look like a valid backup file.";
      messageEl.classList.add("error");
    }
  });
}
