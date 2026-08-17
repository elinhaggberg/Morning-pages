import { saveDraftText, commitEntry, decryptEntry, countWords, todayKey, getWordGoal } from "./storage.js";
import { formatDate } from "./util.js";
import { openSheet } from "./sheet.js";

const CHECK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.5l5 5 10-11"/></svg>';

// The core writing surface: a textarea that fills whatever space it's
// given, plus a quiet footer with a word count against the daily goal and
// a "Save to log" action. Used two ways -- mounted directly into Home for
// today's page (no chrome of its own needed, Home already has one), and
// wrapped in a sheet (see openEntryEditorSheet) for adding a second page to
// a day, editing an existing one, or catching up on a past date.
export async function buildEditorEl({ dateKey, draftEntry, onCommitted, onChange }) {
  let currentId = draftEntry?.id || null;
  const initialText = draftEntry ? await decryptEntry(draftEntry) : "";
  const wordGoal = getWordGoal();

  const el = document.createElement("div");
  el.className = "editor-view";
  el.innerHTML = `
    <textarea class="editor-textarea" placeholder="What's on your mind?" autocomplete="off" spellcheck="true"></textarea>
    <div class="editor-footer">
      <p class="editor-error hidden"></p>
      <div class="editor-footer-row">
        <span class="editor-wordcount"><span class="editor-wordcount-num">0</span> / ${wordGoal}<span class="editor-check hidden">${CHECK_ICON}</span></span>
        <button type="button" class="text-btn editor-save-btn">${draftEntry?.committed ? "Save changes" : "Save to log"}</button>
      </div>
    </div>
  `;

  const textarea = el.querySelector(".editor-textarea");
  const wordcountNum = el.querySelector(".editor-wordcount-num");
  const checkEl = el.querySelector(".editor-check");
  const errorEl = el.querySelector(".editor-error");
  const saveBtn = el.querySelector(".editor-save-btn");

  textarea.value = initialText;

  function renderCount() {
    const n = countWords(textarea.value);
    wordcountNum.textContent = n;
    checkEl.classList.toggle("hidden", n < wordGoal);
  }
  renderCount();

  let saveTimer = null;
  let flushing = null;

  async function flush() {
    if (flushing) await flushing;
    flushing = (async () => {
      const record = await saveDraftText(currentId, dateKey, textarea.value);
      currentId = record?.id || null;
      if (onChange) onChange(record);
    })();
    await flushing;
    flushing = null;
  }

  textarea.addEventListener("input", () => {
    renderCount();
    errorEl.classList.add("hidden");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  });
  textarea.addEventListener("blur", () => {
    clearTimeout(saveTimer);
    flush();
  });

  // Safety net for a debounce that never got to fire -- a tab close or
  // backgrounding shouldn't cost the last few words typed.
  const flushOnHide = () => {
    if (document.hidden) flush();
  };
  document.addEventListener("visibilitychange", flushOnHide);
  const cleanupObserver = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.removeEventListener("visibilitychange", flushOnHide);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  saveBtn.addEventListener("click", async () => {
    clearTimeout(saveTimer);
    await flush();
    if (!currentId) {
      errorEl.textContent = "Write something before saving to log.";
      errorEl.classList.remove("hidden");
      return;
    }
    const committed = await commitEntry(currentId);
    if (onCommitted) onCommitted(committed);
  });

  return { el, focus: () => textarea.focus() };
}

export async function openEntryEditorSheet({ dateKey, draftEntry, onChange }) {
  const sheet = openSheet("tpl-entry-editor");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  const isToday = dateKey === todayKey();
  el.querySelector("#entry-editor-title").textContent = draftEntry ? "Continue writing" : "New page";
  const dateEl = el.querySelector("#entry-editor-date");
  if (isToday) {
    dateEl.classList.add("hidden");
  } else {
    dateEl.textContent = formatDate(dateKey);
  }

  const slot = el.querySelector("#entry-editor-slot");
  const editor = await buildEditorEl({
    dateKey,
    draftEntry,
    onCommitted: () => {
      sheet.close();
      if (onChange) onChange();
    },
    onChange: () => {
      if (onChange) onChange();
    },
  });
  slot.replaceChildren(editor.el);
  editor.focus();
}
