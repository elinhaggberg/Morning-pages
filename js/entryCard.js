import { formatTime } from "./util.js";

const PAGE_ICON = '<svg class="icon icon-line" viewBox="0 0 24 24" aria-hidden="true" focusable="false" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9l4 4v13h-13z"/><path d="M14.5 3.5v4h4"/></svg>';

// Deliberately shows no text -- not even a snippet. A page's card is just
// when it was written and how long it is; reading it back is always its
// own explicit tap, in keeping with the idea that these aren't meant to be
// skimmed, even by their own author.
export function createEntryCardNode(entry, onOpen) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entry-card";
  button.innerHTML = `
    <span class="entry-card-icon">${PAGE_ICON}</span>
    <span class="entry-card-info">
      <span class="entry-card-time">${formatTime(entry.createdAt)}</span>
      <span class="entry-card-words">${entry.wordCount} word${entry.wordCount === 1 ? "" : "s"}</span>
    </span>
  `;
  button.addEventListener("click", () => onOpen(entry));
  return button;
}
