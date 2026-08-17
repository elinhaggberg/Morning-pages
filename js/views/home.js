import { getDayNumber, todayKey, getCommittedForDate, getDraftForDate, shouldShowBackupBanner, dismissBackupBanner, markBackedUp, exportBackupData } from "../storage.js";
import { getConfig } from "../crypto.js";
import { formatDate } from "../util.js";
import { buildEditorEl } from "../editor.js";
import { createEntryCardNode } from "../entryCard.js";
import { openEntryDetail } from "../entryDetail.js";
import { addEntryForDate } from "../dayDetail.js";
import { openSettingsMenu } from "../settingsMenu.js";
import { checkWhatsNew } from "../whatsNew.js";
import { shareOrDownload, filenameFor } from "../share.js";

export async function renderHome(root, nav) {
  const tpl = document.getElementById("tpl-home");
  root.replaceChildren(tpl.content.cloneNode(true));

  const today = todayKey();
  const dayNumber = await getDayNumber(today);
  root.querySelector("#home-daynum").innerHTML = `Day ${dayNumber}<span class="home-date">${formatDate(today)}</span>`;

  root.querySelector("#menu-btn").addEventListener("click", () => openSettingsMenu(refresh));

  const body = root.querySelector("#home-body");
  const fab = root.querySelector("#add-btn");
  const committed = await getCommittedForDate(today);

  if (committed.length === 0) {
    // Nothing filed away yet today -- the whole screen is the page itself,
    // resuming an in-progress draft if there is one.
    const draft = await getDraftForDate(today);
    body.classList.add("home-body-writing");
    const editor = await buildEditorEl({
      dateKey: today,
      draftEntry: draft,
      onCommitted: refresh,
    });
    body.replaceChildren(editor.el);
    editor.focus();
    fab.classList.add("hidden");
  } else {
    body.classList.remove("home-body-writing");
    const wrap = document.createElement("div");
    wrap.className = "today-cards";
    const stack = document.createElement("div");
    stack.className = "entry-stack";
    stack.replaceChildren(...committed.map((e) => createEntryCardNode(e, (entry) => openEntryDetail(entry, { refresh }))));
    wrap.appendChild(stack);
    body.replaceChildren(wrap);

    fab.classList.remove("hidden");
    fab.onclick = () => addEntryForDate(today, refresh);
  }

  async function refresh() {
    renderHome(root, nav);
  }

  const banner = root.querySelector("#backup-banner");
  if (await shouldShowBackupBanner()) {
    banner.classList.remove("hidden");
    banner.querySelector("#backup-now-btn").addEventListener("click", async () => {
      const data = await exportBackupData(getConfig());
      await shareOrDownload(filenameFor("morning-pages-backup"), JSON.stringify(data, null, 2));
      markBackedUp();
      banner.classList.add("hidden");
    });
    banner.querySelector("#backup-dismiss-btn").addEventListener("click", () => {
      dismissBackupBanner();
      banner.classList.add("hidden");
    });
  }

  checkWhatsNew();
}
