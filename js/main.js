const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DOT_COLOR = { visit: "#2C6BA8", rx: "#7E6BB0", pain: "#C08A5E", shot: "#5B9E7E" };

const REAL_TODAY = new Date();

window.AppState = {
  selectedDate: new Date(REAL_TODAY),
  memberId: "self",
  visitFilterDate: null
};

let currentView = "today";
let currentSection = "diary";
const calendarState = { year: REAL_TODAY.getFullYear(), month: REAL_TODAY.getMonth() };
const SECTION_LABEL = { diary: "건강일기", profile: "개인정보", biorhythm: "생활 바이오리듬" };

function pad2(n) { return String(n).padStart(2, "0"); }

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
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

  renderSummaryPanel();
}

const DEPT_COLORS = ["#2C6BA8", "#3E8FA8", "#7E6BB0", "#C08A5E", "#5B9E7E"];

function renderSummaryPanel() {
  const { year, month } = calendarState;
  const summary = Report.computeSummary(AppState.memberId, year, month);
  const deptRows = Report.computeDeptBreakdown(AppState.memberId, year);

  document.getElementById("monthlySummaryTitle").textContent = `${month + 1}월 누계`;
  document.getElementById("calStatVisit").innerHTML = `${summary.visitCount}<span class="stat-unit">회</span>`;
  document.getElementById("calStatRx").innerHTML = `${summary.prescriptionDays}<span class="stat-unit">일</span>`;
  document.getElementById("calStatSymptom").innerHTML = `${summary.symptomDays}<span class="stat-unit">일</span>`;
  document.getElementById("calStatCheckup").innerHTML = `${summary.checkupCount}<span class="stat-unit">건</span>`;

  document.getElementById("calendarDeptTitle").textContent = `진료과별 · ${year}년`;
  const deptList = document.getElementById("calendarDeptList");
  deptList.innerHTML = deptRows.length ? deptRows.map((r, i) => `
    <div class="dept-row">
      <span class="dept-name">${Storage.escapeHtml(r.name)}</span>
      <span class="dept-bar"><span class="dept-bar-fill" style="width:${r.pct}%; background:${DEPT_COLORS[i % DEPT_COLORS.length]};"></span></span>
      <span class="dept-count">${r.count}</span>
    </div>`).join("") : `<div class="symptom-hint">${year}년 병원 방문 기록이 없습니다.</div>`;
}

let familyAddMode = false;

function countMemberRecords(memberId) {
  return Storage.getVisits().filter(v => v.memberId === memberId).length
    + Storage.getSymptoms().filter(s => s.memberId === memberId && s.hasSymptom).length
    + Storage.getPrescriptions(memberId).length
    + Storage.getCheckups(memberId).length;
}

function renderFamilyList() {
  const el = document.getElementById("familyList");
  if (!el) return;

  const members = Storage.getFamilyMembers();
  const itemsHtml = members.map(m => `
    <div class="family-item${m.id === AppState.memberId ? " active" : ""}" data-member="${m.id}">
      <span class="family-avatar">${Storage.escapeHtml(m.avatarLabel || (m.name || "?").charAt(0))}</span>
      ${Storage.escapeHtml(m.name || "이름 없음")}
      <span class="family-count">${countMemberRecords(m.id)}건</span>
    </div>`).join("");

  const addHtml = familyAddMode ? `
    <div class="family-add-form">
      <input type="text" class="field-box" data-field="name" placeholder="이름">
      <select class="field-box" data-field="relation">
        ${["배우자", "자녀", "부모", "형제자매", "기타"].map(r => `<option value="${r}">${r}</option>`).join("")}
      </select>
      <div class="btn-row">
        <button type="button" class="btn" data-action="cancel-add-member">취소</button>
        <button type="button" class="btn btn-primary" data-action="save-add-member">추가</button>
      </div>
    </div>` : `<div class="family-item family-add" data-action="open-add-member"><span class="family-avatar">+</span>구성원 추가</div>`;

  el.innerHTML = itemsHtml + addHtml;
}

function updateTopbarIdentity() {
  const member = Storage.getFamilyMember(AppState.memberId);
  const nameEl = document.getElementById("patientName");
  if (nameEl) nameEl.textContent = member ? `${member.relation || "구성원"} · ${member.name || "이름 없음"}` : "";
}

function refreshFamilyIdentity() {
  renderFamilyList();
  updateTopbarIdentity();
}
window.refreshFamilyIdentity = refreshFamilyIdentity;

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
  } else if (view === "rx") {
    Prescriptions.render();
  } else if (view === "checkup") {
    Checkups.render();
  } else if (view === "photo") {
    Photos.render();
  } else if (view === "report") {
    Report.render();
  } else if (view !== "today") {
    const label = document.querySelector(`.subtab[data-tab="${view}"]`)?.textContent || "이 화면";
    document.getElementById("placeholderText").textContent = `${label} 화면은 준비 중입니다.`;
  }
}

window.refreshAll = function refreshAll() {
  renderCalendar();
  renderRecordDate();
  Symptoms.render();
  if (currentView === "visit") Visits.render();
  if (currentView === "rx") Prescriptions.render();
  if (currentView === "checkup") Checkups.render();
  if (currentView === "photo") Photos.render();
  if (currentView === "report") Report.render();
  if (currentSection === "profile") Profile.render();
  refreshFamilyIdentity();
};

function setSection(section) {
  currentSection = section;
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.view === section);
  });
  document.getElementById("diarySection").style.display = section === "diary" ? "flex" : "none";
  document.getElementById("profileSection").style.display = section === "profile" ? "flex" : "none";
  document.getElementById("biorhythmSection").style.display = section === "biorhythm" ? "flex" : "none";
  document.getElementById("pageName").textContent = SECTION_LABEL[section];
  if (section === "profile") Profile.render();
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
    const memberEl = e.target.closest(".family-item[data-member]");
    if (memberEl) {
      AppState.memberId = memberEl.dataset.member;
      AppState.visitFilterDate = null;
      window.refreshAll();
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "open-add-member") {
      familyAddMode = true;
      renderFamilyList();
    } else if (action === "cancel-add-member") {
      familyAddMode = false;
      renderFamilyList();
    } else if (action === "save-add-member") {
      const form = actionEl.closest(".family-add-form");
      const name = form.querySelector('[data-field="name"]').value.trim();
      const relation = form.querySelector('[data-field="relation"]').value;
      if (!name) {
        window.alert("이름을 입력해주세요.");
        return;
      }
      const member = Storage.addFamilyMember({ name, relation });
      familyAddMode = false;
      AppState.memberId = member.id;
      AppState.visitFilterDate = null;
      window.refreshAll();
    }
  });
}

function bindTopNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => setSection(item.dataset.view));
  });
}

function bindTabLinks() {
  document.querySelectorAll("[data-tab-link]").forEach(link => {
    link.addEventListener("click", () => {
      const tab = link.dataset.tabLink;
      document.querySelectorAll(".subtab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
      setView(tab);
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
refreshFamilyIdentity();
Symptoms.render();
Visits.init();
Profile.init();
Prescriptions.init();
Checkups.init();
Photos.init();
Report.init();
setView("today");

bindCalendarNav();
bindSubtabs();
bindFamilySwitch();
bindTopNav();
bindTabLinks();
bindExclusiveToggle(".view-toggle");
