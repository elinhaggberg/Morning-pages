import { getDaysWithEntries, toDateKey, getFirstOpenAt, todayKey } from "../storage.js";
import { openDayDetail, addEntryForDate } from "../dayDetail.js";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function renderCalendar(root, nav) {
  const tpl = document.getElementById("tpl-calendar");
  root.replaceChildren(tpl.content.cloneNode(true));
  root.querySelector(".back-btn").addEventListener("click", () => nav.toHome());

  const monthLabelEl = root.querySelector("#calendar-month-label");
  const gridEl = root.querySelector("#calendar-grid");
  const prevBtn = root.querySelector("#calendar-prev-btn");
  const nextBtn = root.querySelector("#calendar-next-btn");

  const weekdayRow = root.querySelector("#calendar-weekdays");
  weekdayRow.replaceChildren(
    ...WEEKDAY_LABELS.map((label) => {
      const el = document.createElement("span");
      el.textContent = label;
      return el;
    })
  );

  const today = new Date();
  const viewState = { year: today.getFullYear(), month: today.getMonth() };

  prevBtn.addEventListener("click", () => {
    viewState.month -= 1;
    if (viewState.month < 0) {
      viewState.month = 11;
      viewState.year -= 1;
    }
    draw();
  });
  nextBtn.addEventListener("click", () => {
    if (nextBtn.disabled) return;
    viewState.month += 1;
    if (viewState.month > 11) {
      viewState.month = 0;
      viewState.year += 1;
    }
    draw();
  });

  draw();

  async function draw() {
    const days = await getDaysWithEntries();
    const doneDates = new Set(days.map((d) => d.dateKey));
    const earliestEntryKey = days.length ? days[days.length - 1].dateKey : null;
    const firstOpenKey = toDateKey(new Date(getFirstOpenAt()));
    const startKey = earliestEntryKey && earliestEntryKey < firstOpenKey ? earliestEntryKey : firstOpenKey;
    const todayKeyValue = todayKey();

    const isCurrentMonth = viewState.year === today.getFullYear() && viewState.month === today.getMonth();
    nextBtn.disabled = isCurrentMonth;
    nextBtn.classList.toggle("disabled", isCurrentMonth);

    const monthStart = new Date(viewState.year, viewState.month, 1);
    monthLabelEl.textContent = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const daysInMonth = new Date(viewState.year, viewState.month + 1, 0).getDate();
    const leadingBlanks = mondayIndex(monthStart);

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(document.createElement("span"));

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(viewState.year, viewState.month, day);
      const dateKey = toDateKey(cellDate);
      const isBeforeStart = dateKey < startKey;
      const isFuture = dateKey > todayKeyValue;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-day";
      if (dateKey === todayKeyValue) cell.classList.add("is-today");

      const dayNum = document.createElement("span");
      dayNum.className = "calendar-day-num";
      dayNum.textContent = String(day);
      cell.appendChild(dayNum);

      const dot = document.createElement("span");
      dot.className = "calendar-day-dot";
      cell.appendChild(dot);

      if (doneDates.has(dateKey)) {
        cell.classList.add("is-done");
        cell.addEventListener("click", () => openDayDetail(dateKey, { onChange: draw }));
      } else if (isBeforeStart || isFuture) {
        cell.classList.add("is-blank");
        cell.disabled = true;
      } else if (dateKey === todayKeyValue) {
        cell.addEventListener("click", () => nav.toHome());
      } else {
        cell.classList.add("is-missed");
        cell.addEventListener("click", () => addEntryForDate(dateKey, draw));
      }

      cells.push(cell);
    }

    gridEl.replaceChildren(...cells);
  }
}
