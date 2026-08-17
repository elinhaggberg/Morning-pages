import { decryptEntry, deleteEntry } from "./storage.js";
import { openSheet } from "./sheet.js";
import { formatTime } from "./util.js";
import { openEntryEditorSheet } from "./editor.js";
import { isUnlocked } from "./crypto.js";
import { promptUnlock } from "./unlock.js";

// The one place a page's actual words ever get shown -- always an explicit
// tap away from its card, never a preview. Read-only; editing reopens it in
// the same writing surface used to create it.
//
// A committed page lives under the vault key, so opening one is exactly
// the other moment (besides Save to log) that asks for the four words --
// asked before the sheet even opens, so a cancelled unlock just leaves the
// card unopened instead of showing a stuck "couldn't decrypt" sheet.
export async function openEntryDetail(entry, { refresh }) {
  if (entry.committed && !isUnlocked()) {
    const unlocked = await promptUnlock();
    if (!unlocked) return;
  }

  const sheet = openSheet("tpl-entry-detail");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  el.querySelector("#entry-detail-meta").textContent = `${formatTime(entry.createdAt)} · ${entry.wordCount} word${entry.wordCount === 1 ? "" : "s"}`;

  const bodyEl = el.querySelector("#entry-detail-body");
  bodyEl.textContent = "Decrypting…";
  try {
    bodyEl.textContent = await decryptEntry(entry);
  } catch {
    bodyEl.textContent = "Couldn't decrypt this page.";
  }

  el.querySelector("#entry-detail-edit-btn").addEventListener("click", () => {
    sheet.close();
    openEntryEditorSheet({ dateKey: entry.dateKey, draftEntry: entry, onChange: refresh });
  });

  el.querySelector("#entry-detail-delete-btn").addEventListener("click", () => {
    const confirmSheet = openSheet("tpl-confirm-delete");
    confirmSheet.el.querySelector(".confirm-title").textContent = "Delete this page?";
    confirmSheet.el.querySelector(".confirm-message").textContent = "This can't be undone.";
    confirmSheet.el.querySelector(".cancel-btn").addEventListener("click", () => confirmSheet.close());
    confirmSheet.el.querySelector(".confirm-btn").addEventListener("click", async () => {
      await deleteEntry(entry.id);
      confirmSheet.close();
      sheet.close();
      if (refresh) refresh();
    });
  });
}
