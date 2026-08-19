const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DOT_COLOR = { visit: "#2C6BA8", rx: "#7E6BB0", pain: "#C08A5E", shot: "#5B9E7E", life: "#AE5480" };

const REAL_TODAY = new Date();

window.AppState = {
  selectedDate: new Date(REAL_TODAY),
  memberId: "self",
  visitFilterDate: null
};

let currentView = "today";
let currentPage = "diary";
const calendarState = { year: REAL_TODAY.getFullYear(), month: REAL_TODAY.getMonth() };

function pad2(n) { return String(n).padStart(2, "0"); }

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// 값이 하나라도 들어간 날만 캘린더에 표시한다 (빈 기록은 점을 찍지 않는다)
function hasLifeEntry(log) {
  return (log.meals && log.meals.length > 0) ||
    log.sleepHours != null || log.waterMl != null ||
    log.exerciseMin != null || log.caffeineMg != null ||
    log.alcohol === true || log.isPeriodDay === true ||
    (log.memo || "").trim() !== "";
}

function computeMarks(year, month) {
  const prefix = `${year}-${pad2(month + 1)}-`;
  const marks = {};

  Storage.getVisits()
    .filter(v => v.memberId === AppState.memberId && v.date && v.date.startsWith(prefix))
    .forEach(v => {
      const day = Number(v.date.slice(8, 10));
      (marks[day] = marks[day] || new Set()).add("visit");
    });

  Storage.getSymptoms()
    .filter(s => s.memberId === AppState.memberId && s.date && s.date.startsWith(prefix) && s.hasSymptom)
    .forEach(s => {
      const day = Number(s.date.slice(8, 10));
      (marks[day] = marks[day] || new Set()).add("pain");
    });

  Storage.getLifeLogs()
    .filter(l => l.memberId === AppState.memberId && l.date && l.date.startsWith(prefix) && hasLifeEntry(l))
    .forEach(l => {
      const day = Number(l.date.slice(8, 10));
      (marks[day] = marks[day] || new Set()).add("life");
    });

  const result = {};
  Object.keys(marks).forEach(k => { result[k] = Array.from(marks[k]); });
  return result;
}

function renderCalendar() {
  const { year, month } = calendarState;

  document.getElementById("calendarMonth").textContent = `${year}년 ${month + 1}월`;
  document.getElementById("calendarWeekdays").innerHTML = WEEKDAYS.map(w => `<div>${w}</div>`).join("");

  const lead = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const marks = computeMarks(year, month);
  const isRealCurrentMonth = year === REAL_TODAY.getFullYear() && month === REAL_TODAY.getMonth();
  const selectedKey = Storage.toDateKey(AppState.selectedDate);

  const cells = [];
  for (let i = 0; i < lead; i++) {
    cells.push(`<div class="day-cell empty"></div>`);
  }
  for (let n = 1; n <= total; n++) {
    const dateKey = `${year}-${pad2(month + 1)}-${pad2(n)}`;
    const isToday = isRealCurrentMonth && n === REAL_TODAY.getDate();
    const isSelected = dateKey === selectedKey;
    const isFuture = isRealCurrentMonth && n > REAL_TODAY.getDate();
    const dots = (marks[n] || []).map(k => `<span class="day-dot" style="background:${DOT_COLOR[k]};"></span>`).join("");

    const classes = ["day-cell"];
    if (isToday) classes.push("today");
    if (isSelected) classes.push("selected");
    if (isFuture) classes.push("future");

    cells.push(`<div class="${classes.join(" ")}" data-date="${dateKey}"><span class="day-num">${n}</span><span class="day-dots">${dots}</span></div>`);
  }
  document.getElementById("calendarDays").innerHTML = cells.join("");
}

function renderRecordDate() {
  const d = AppState.selectedDate;
  document.getElementById("recordDate").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".view-panel").forEach(panel => {
    if (panel.dataset.view === view) {
      panel.style.display = view === "today" ? "contents" : "flex";
    } else {
      panel.style.display = "none";
    }
  });

  if (view === "visit") {
    Visits.render();
  } else if (view !== "today") {
    const label = document.querySelector(`.subtab[data-tab="${view}"]`)?.textContent || "이 화면";
    document.getElementById("placeholderText").textContent = `${label} 화면은 준비 중입니다.`;
  }
}

function setPage(page) {
  currentPage = page;
  document.body.dataset.page = page;

  document.querySelector(".subtabs").style.display = page === "diary" ? "" : "none";
  document.querySelector(".page-name").textContent = page === "life" ? "생활 바이오리듬" : "건강일기";

  if (page === "diary") {
    setView(currentView);
    return;
  }

  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.style.display = panel.dataset.view === page ? "flex" : "none";
  });
  if (page === "life") LifeLogs.render();
}

window.refreshAll = function refreshAll() {
  renderCalendar();
  renderRecordDate();
  Symptoms.render();
  if (currentPage === "life") {
    LifeLogs.render();
    return;
  }
  if (currentView === "visit") Visits.render();
};

function bindCalendarNav() {
  document.getElementById("calendarPrev").addEventListener("click", () => {
    calendarState.month -= 1;
    if (calendarState.month < 0) { calendarState.month = 11; calendarState.year -= 1; }
    renderCalendar();
  });
  document.getElementById("calendarNext").addEventListener("click", () => {
    calendarState.month += 1;
    if (calendarState.month > 11) { calendarState.month = 0; calendarState.year += 1; }
    renderCalendar();
  });
  document.getElementById("calendarDays").addEventListener("click", e => {
    const cell = e.target.closest(".day-cell");
    if (!cell || cell.classList.contains("empty")) return;
    const dateKey = cell.dataset.date;
    const [y, m, d] = dateKey.split("-").map(Number);
    AppState.selectedDate = new Date(y, m - 1, d);
    if (currentView === "visit") AppState.visitFilterDate = dateKey;
    window.refreshAll();
  });
}

function bindSubtabs() {
  document.querySelectorAll(".subtab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".subtab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      setView(tab.dataset.tab);
    });
  });
}

function bindNav() {
  document.querySelectorAll(".nav-item[data-page]").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      setPage(item.dataset.page);
    });
  });
}

function bindFamilySwitch() {
  document.querySelectorAll(".family-item[data-member]").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".family-item[data-member]").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      AppState.memberId = item.dataset.member;
      AppState.visitFilterDate = null;
      window.refreshAll();
    });
  });
}

function bindExclusiveToggle(selector) {
  document.querySelectorAll(selector).forEach(group => {
    group.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn || !group.contains(btn)) return;
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

Storage.seedIfEmpty();
renderCalendar();
renderRecordDate();
Symptoms.render();
Visits.init();
LifeLogs.init();
setView("today");

bindCalendarNav();
bindSubtabs();
bindNav();
bindFamilySwitch();
bindExclusiveToggle(".view-toggle");
