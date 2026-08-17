import { formatDateShort } from "./util.js";

// One card in My Log's grid: the date, page count, and total words that
// day -- no text, same as entryCard.js.
export function createDayCardNode(day, onOpen) {
  const totalWords = day.entries.reduce((sum, e) => sum + (e.wordCount || 0), 0);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "day-card";
  button.innerHTML = `
    <p class="day-card-date">${formatDateShort(day.dateKey)}</p>
    <p class="day-card-count">${day.entries.length} page${day.entries.length === 1 ? "" : "s"} · ${totalWords} word${totalWords === 1 ? "" : "s"}</p>
  `;
  button.addEventListener("click", () => onOpen(day.dateKey));
  return button;
}
