const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DOT_COLOR = { visit: "#2C6BA8", rx: "#7E6BB0", pain: "#C08A5E", shot: "#5B9E7E" };

const REAL_TODAY = new Date();

window.AppState = {
  selectedDate: new Date(REAL_TODAY),
  memberId: null,
  visitFilterDate: null
};

let currentView = "today";
const calendarState = { year: REAL_TODAY.getFullYear(), month: REAL_TODAY.getMonth() };
let boundOnce = false;

function pad2(n) { return String(n).padStart(2, "0"); }

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

async function computeMarks(year, month) {
  const prefix = `${year}-${pad2(month + 1)}-`;
  const marks = {};

  const [visits, symptoms] = await Promise.all([Storage.getVisits(), Storage.getSymptoms()]);

  visits
    .filter(v => v.memberId === AppState.memberId && v.date && v.date.startsWith(prefix))
    .forEach(v => {
      const day = Number(v.date.slice(8, 10));
      (marks[day] = marks[day] || new Set()).add("visit");
    });

  symptoms
    .filter(s => s.memberId === AppState.memberId && s.date && s.date.startsWith(prefix) && s.hasSymptom)
    .forEach(s => {
      const day = Number(s.date.slice(8, 10));
      (marks[day] = marks[day] || new Set()).add("pain");
    });

  const result = {};
  Object.keys(marks).forEach(k => { result[k] = Array.from(marks[k]); });
  return result;
}

async function renderCalendar() {
  const { year, month } = calendarState;

  document.getElementById("calendarMonth").textContent = `${year}년 ${month + 1}월`;
  document.getElementById("calendarWeekdays").innerHTML = WEEKDAYS.map(w => `<div>${w}</div>`).join("");

  const lead = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const marks = await computeMarks(year, month);
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

window.refreshAll = async function refreshAll() {
  await Promise.all([renderCalendar(), Symptoms.render()]);
  renderRecordDate();
  if (currentView === "visit") await Visits.render();
};

function renderFamilySidebar(members) {
  const list = document.getElementById("familyList");
  const itemsHtml = members.map(m => `
    <div class="family-item${m.id === AppState.memberId ? " active" : ""}" data-member="${m.id}">
      <span class="family-avatar">${Storage.escapeHtml(m.avatarLabel || m.name.slice(0, 1))}</span>${Storage.escapeHtml(m.name)}
    </div>`).join("");
  list.innerHTML = itemsHtml + `
    <div class="family-item family-add"><span class="family-avatar">+</span>구성원 추가</div>`;

  const activeMember = members.find(m => m.id === AppState.memberId);
  if (activeMember) {
    document.querySelector(".patient-name").textContent = `${activeMember.name} · 김하늘`;
    document.querySelector(".avatar-badge").textContent = activeMember.avatarLabel || activeMember.name.slice(0, 1);
  }
}

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

function bindFamilySwitch() {
  document.getElementById("familyList").addEventListener("click", e => {
    const item = e.target.closest(".family-item[data-member]");
    if (!item) return;
    document.querySelectorAll(".family-item[data-member]").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    AppState.memberId = item.dataset.member;
    AppState.visitFilterDate = null;
    const name = item.textContent.trim();
    document.querySelector(".patient-name").textContent = `${name} · 김하늘`;
    window.refreshAll();
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

window.initApp = async function initApp() {
  const members = await Storage.ensureSeedFamilyMembers();
  await Storage.seedSampleData();
  AppState.memberId = members[0].id;
  renderFamilySidebar(members);

  await renderCalendar();
  renderRecordDate();
  await Symptoms.render();
  if (!boundOnce) {
    Visits.init();
    bindCalendarNav();
    bindSubtabs();
    bindFamilySwitch();
    bindExclusiveToggle(".view-toggle");
    boundOnce = true;
  }
  setView("today");
};

window.initApp();
