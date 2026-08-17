import { getEntriesForDate, getDraftForDate, getDayNumber } from "./storage.js";
import { openSheet } from "./sheet.js";
import { formatDate } from "./util.js";
import { createEntryCardNode } from "./entryCard.js";
import { openEntryDetail } from "./entryDetail.js";
import { openEntryEditorSheet } from "./editor.js";

export async function addEntryForDate(dateKey, refresh) {
  const draft = await getDraftForDate(dateKey);
  openEntryEditorSheet({ dateKey, draftEntry: draft, onChange: refresh });
}

// The full view of one day for anywhere that isn't today's Home -- My Log
// and the Calendar. Lists every page written that day and offers to add
// another.
export async function openDayDetail(dateKey, { onChange } = {}) {
  const sheet = openSheet("tpl-day-detail");
  const el = sheet.el;
  el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

  async function refresh() {
    const dayNumber = await getDayNumber(dateKey);
    el.querySelector("#day-detail-daynum").textContent = `Day ${dayNumber}`;
    el.querySelector("#day-detail-date").textContent = formatDate(dateKey);

    const entries = await getEntriesForDate(dateKey);
    const entriesEl = el.querySelector("#day-detail-entries");
    const emptyEl = el.querySelector("#day-detail-empty");

    if (entries.length === 0) {
      entriesEl.replaceChildren();
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      entriesEl.replaceChildren(...entries.map((e) => createEntryCardNode(e, (entry) => openEntryDetail(entry, { refresh }))));
    }

    if (onChange) onChange();
  }

  el.querySelector("#day-detail-add-btn").addEventListener("click", () => addEntryForDate(dateKey, refresh));

  refresh();
}
