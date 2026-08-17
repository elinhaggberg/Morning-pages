import { getDaysWithEntries } from "../storage.js";
import { createDayCardNode } from "../dayCard.js";
import { openDayDetail } from "../dayDetail.js";
import { openSettingsMenu } from "../settingsMenu.js";

export async function renderLog(root, nav) {
  const tpl = document.getElementById("tpl-log");
  root.replaceChildren(tpl.content.cloneNode(true));

  root.querySelector(".back-btn").addEventListener("click", () => nav.toHome());
  root.querySelector("#menu-btn").addEventListener("click", () => openSettingsMenu(refresh));

  const grid = root.querySelector("#log-grid");

  async function refresh() {
    const days = await getDaysWithEntries();
    if (days.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nothing logged yet — head back and write today's page.";
      grid.replaceChildren(empty);
      return;
    }
    grid.replaceChildren(...days.map((day) => createDayCardNode(day, (dateKey) => openDayDetail(dateKey, { onChange: refresh }))));
  }

  refresh();
}
