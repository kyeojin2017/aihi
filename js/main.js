const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DOT_COLOR = { visit: "#2C6BA8", rx: "#7E6BB0", pain: "#C08A5E", shot: "#5B9E7E", life: "#AE5480" };

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

// 값이 하나라도 들어간 날만 캘린더에 표시한다 (빈 기록은 점을 찍지 않는다)
function hasLifeEntry(log) {
  return (log.meals && log.meals.length > 0) ||
    log.sleepHours != null || log.waterMl != null ||
    log.exerciseHours != null || log.exerciseMinutes != null ||
    log.caffeineCups != null ||
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
const MAX_FAMILY_MEMBERS = 5;

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
      <span class="family-avatar">${Storage.escapeHtml(m.avatarLabel || (m.relation || m.nickname || "?").charAt(0))}</span>
      ${Storage.escapeHtml(m.nickname || m.relation || "관계 없음")}
      <span class="family-count">${countMemberRecords(m.id)}건</span>
    </div>`).join("");

  const atLimit = members.length >= MAX_FAMILY_MEMBERS;
  const addHtml = familyAddMode && !atLimit ? `
    <div class="family-add-form">
      <select class="field-box" data-field="relation">
        ${["배우자", "자녀", "부모", "형제자매", "기타"].map(r => `<option value="${r}">${r}</option>`).join("")}
      </select>
      <input type="text" class="field-box" data-field="nickname" placeholder="이름이나 별명을 입력 (안 넣어도 됨)">
      <div class="btn-row">
        <button type="button" class="btn" data-action="cancel-add-member">취소</button>
        <button type="button" class="btn btn-primary" data-action="save-add-member">추가</button>
      </div>
    </div>` : atLimit
    ? `<div class="family-item family-add-disabled">최대 ${MAX_FAMILY_MEMBERS}명까지 등록할 수 있습니다</div>`
    : `<div class="family-item family-add" data-action="open-add-member"><span class="family-avatar">+</span>구성원 추가</div>`;

  el.innerHTML = itemsHtml + addHtml;
}

function updateTopbarIdentity() {
  const member = Storage.getFamilyMember(AppState.memberId);
  const nameEl = document.getElementById("patientName");
  if (nameEl) nameEl.textContent = member ? (member.nickname || member.relation || "구성원") : "";
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

function formatMonthDay(dateKey) {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

function computeUpcoming(memberId) {
  const today = new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth(), REAL_TODAY.getDate());
  const items = [];

  Storage.getCheckups(memberId).forEach(c => {
    if (!c.date) return;
    const days = Math.round((new Date(c.date) - today) / 86400000);
    if (days >= -14 && days <= 60) items.push({ label: c.name || "접종·검진", date: c.date, days });
  });

  Storage.getVisits().filter(v => v.memberId === memberId && v.nextVisitDate).forEach(v => {
    const days = Math.round((new Date(v.nextVisitDate) - today) / 86400000);
    if (days >= -14 && days <= 60) items.push({ label: `${v.hospital || "병원"} 다음 예약`, date: v.nextVisitDate, days });
  });

  items.sort((a, b) => a.days - b.days);
  return items;
}

function renderUpcomingBanner() {
  const banner = document.getElementById("upcomingBanner");
  if (!banner) return;

  const items = computeUpcoming(AppState.memberId);
  if (!items.length) {
    banner.classList.remove("show");
    banner.innerHTML = "";
    return;
  }

  banner.classList.add("show");
  banner.innerHTML = `
    <div class="upcoming-head">⚠ 다가오는 일정 <span class="count">(${items.length}건)</span></div>
    <div class="upcoming-list">
      ${items.slice(0, 5).map(it => `
        <div class="upcoming-item">
          <span>${Storage.escapeHtml(it.label)} — ${formatMonthDay(it.date)}</span>
          <span class="dday${it.days < 0 ? " overdue" : ""}">${it.days < 0 ? `${-it.days}일 지남` : it.days === 0 ? "오늘" : `D-${it.days}`}</span>
        </div>`).join("")}
    </div>`;
}

let recordViewMode = "daily";

function renderRecordList() {
  const el = document.getElementById("recordBodyList");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const memberId = AppState.memberId;
  const rows = [];

  const symptom = Storage.getSymptom(dateKey, memberId);
  if (symptom && symptom.hasSymptom) {
    const tagText = (symptom.tags || []).join(", ") || "증상 있음";
    rows.push({ badge: "증상", badgeClass: "badge-neutral", text: `<strong>${Storage.escapeHtml(tagText)}</strong>${symptom.painLevel ? ` · 통증 ${symptom.painLevel}` : ""}${symptom.temperature ? ` · ${symptom.temperature}℃` : ""}` });
  }

  Storage.getVisits().filter(v => v.memberId === memberId && v.date === dateKey).forEach(v => {
    rows.push({ badge: "병원방문", badgeClass: "badge-blue", text: `<strong>${Storage.escapeHtml(v.hospital || "병원")}</strong>${v.department ? ` · ${Storage.escapeHtml(v.department)}` : ""}${v.time ? ` · ${v.time}` : ""}` });
  });

  Storage.getPrescriptions(memberId).filter(p => p.startDate && dateKey >= p.startDate && dateKey <= (p.endDate || p.startDate)).forEach(p => {
    const count = (p.items || []).length;
    rows.push({ badge: "처방전", badgeClass: "badge-neutral", text: `<strong>약 ${count}종</strong>${p.items && p.items[0] ? ` · ${Storage.escapeHtml(p.items[0].drugName)} 외` : ""}` });
  });

  Storage.getCheckups(memberId).filter(c => c.date === dateKey).forEach(c => {
    rows.push({ badge: "접종·검진", badgeClass: "badge-green", text: `<strong>${Storage.escapeHtml(c.name || "")}</strong>${c.status ? ` · ${Storage.escapeHtml(c.status)}` : ""}` });
  });

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><p>이 날짜에는 기록이 없습니다.</p></div>`;
    return;
  }

  el.innerHTML = rows.map(r => `
    <div class="record-list-item">
      <span class="badge ${r.badgeClass}">${r.badge}</span>
      <span class="record-list-text">${r.text}</span>
    </div>`).join("");
}

function formatDateFull(dateKey) {
  if (!dateKey) return "-";
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

function goToTab(tab) {
  document.querySelectorAll(".subtab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  setView(tab);
}

function renderTodayVisits() {
  const el = document.getElementById("todayVisitBody");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const visits = Storage.getVisits().filter(v => v.memberId === AppState.memberId && v.date === dateKey);

  if (!visits.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">병원 방문</span></div>
          <span class="card-link" data-action="goVisitTab">전체 보기</span>
        </div>
        <p class="symptom-hint">이 날짜에 병원 방문 기록이 없습니다.</p>
      </div>`;
    return;
  }

  el.innerHTML = visits.map(v => `
    <div class="card card-accent-blue">
      <div class="card-head">
        <div class="card-head-left">
          <span class="card-title">${Storage.escapeHtml(v.hospital || "병원 방문")}</span>
          ${v.department ? `<span class="badge badge-blue">${Storage.escapeHtml(v.department)}</span>` : ""}
        </div>
        <span class="card-link" data-action="goVisitTab" data-date="${dateKey}">수정</span>
      </div>
      <div class="visit-grid">
        <div class="field"><span class="field-label">날짜 · 시간</span><span class="field-box">${formatDateFull(v.date)} ${v.time || ""}</span></div>
        <div class="field"><span class="field-label">병원</span><span class="field-box">${Storage.escapeHtml(v.hospital || "-")}</span></div>
        <div class="field"><span class="field-label">진료과</span><span class="field-box">${Storage.escapeHtml(v.department || "-")}</span></div>
        <div class="field"><span class="field-label">담당 의사</span><span class="field-box">${Storage.escapeHtml(v.doctor || "-")}</span></div>
        <div class="field"><span class="field-label">다음 예약</span><span class="field-box accent">${formatDateFull(v.nextVisitDate)}</span></div>
      </div>
      ${v.diagnosisMemo ? `<div class="memo-row"><span class="memo-label">진단 메모</span><span class="memo-box">${Storage.escapeHtml(v.diagnosisMemo)}</span></div>` : ""}
    </div>`).join("");
}

function renderTodayRx() {
  const el = document.getElementById("todayRxBody");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const prescriptions = Storage.getPrescriptions(AppState.memberId)
    .filter(p => p.startDate && dateKey >= p.startDate && dateKey <= (p.endDate || p.startDate));

  if (!prescriptions.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">처방전</span></div>
          <span class="card-link" data-action="goRxTab">전체 보기</span>
        </div>
        <p class="symptom-hint">이 날짜에 복용 중인 처방전이 없습니다.</p>
      </div>`;
    return;
  }

  el.innerHTML = prescriptions.map(p => `
    <div class="card card-accent-purple rx-card">
      <div class="card-head">
        <div class="card-head-left">
          <span class="card-title">처방전</span>
          <span class="card-subtitle">${formatDateFull(p.startDate)} – ${formatDateFull(p.endDate).slice(5)}</span>
        </div>
        <span class="card-link" data-action="goRxTab">수정</span>
      </div>
      <div class="rx-table">
        <div class="rx-row head"><span>약 이름</span><span>용량</span><span>복용</span><span>비고</span></div>
        ${(p.items || []).map((it, i) => `
          <div class="rx-row${i === (p.items.length - 1) ? " last" : ""}">
            <span>${Storage.escapeHtml(it.drugName || "")}</span>
            <span class="rx-dose">${Storage.escapeHtml(it.dose || "")}</span>
            <span class="rx-freq">${Storage.escapeHtml(it.frequency || "")}</span>
            <span class="rx-note">${Storage.escapeHtml(it.note || "")}</span>
          </div>`).join("")}
      </div>
      ${p.cautionMemo ? `<div class="rx-memo-row"><span class="memo-label">주의 메모</span><span class="memo-box">${Storage.escapeHtml(p.cautionMemo)}</span></div>` : ""}
    </div>`).join("");
}

function bindTodayRecordActions() {
  document.getElementById("addVisitTodayBtn").addEventListener("click", () => {
    goToTab("visit");
    Visits.openAddForm();
  });
  document.getElementById("addRxTodayBtn").addEventListener("click", () => {
    goToTab("rx");
    Prescriptions.openAddForm();
  });
  document.getElementById("todayVisitBody").addEventListener("click", e => {
    const el = e.target.closest("[data-action='goVisitTab']");
    if (!el) return;
    if (el.dataset.date) AppState.visitFilterDate = el.dataset.date;
    goToTab("visit");
  });
  document.getElementById("todayRxBody").addEventListener("click", e => {
    if (!e.target.closest("[data-action='goRxTab']")) return;
    goToTab("rx");
  });
}

function buildReportSummaryText() {
  const period = document.querySelector("#reportPeriodToggle button.active")?.dataset.period || "month";
  const today = new Date();
  const member = Storage.getFamilyMember(AppState.memberId);
  const summary = period === "month"
    ? Report.computeSummary(AppState.memberId, today.getFullYear(), today.getMonth())
    : Report.computeSummary(AppState.memberId, today.getFullYear(), null);
  const deptRows = Report.computeDeptBreakdown(AppState.memberId, today.getFullYear());
  const periodLabel = period === "month" ? `${today.getFullYear()}년 ${today.getMonth() + 1}월` : `${today.getFullYear()}년`;

  const lines = [`${periodLabel} 통계 · 리포트 (${member ? member.relation : "구성원"})`, ""];
  lines.push(`- 병원 방문: ${summary.visitCount}회`);
  lines.push(`- 처방 일수: ${summary.prescriptionDays}일`);
  lines.push(`- 증상 기록: ${summary.symptomDays}일`);
  lines.push(`- 접종·검진: ${summary.checkupCount}건`);
  if (deptRows.length) {
    lines.push("", `진료과별 · ${today.getFullYear()}년`);
    deptRows.forEach(r => lines.push(`- ${r.name}: ${r.count}회`));
  }
  return lines.join("\n");
}

const SEARCH_BADGE = { visit: ["병원방문", "badge-blue"], rx: ["처방전", "badge-neutral"], checkup: ["접종·검진", "badge-green"], symptom: ["증상", "badge-neutral"] };

function searchRecords(query) {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!keywords.length) return [];

  const memberId = AppState.memberId;
  const results = [];

  const matches = text => keywords.every(k => text.toLowerCase().includes(k));

  Storage.getVisits().filter(v => v.memberId === memberId).forEach(v => {
    const blob = [v.hospital, v.department, v.doctor, v.diagnosisMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "visit", date: v.date, text: `<strong>${Storage.escapeHtml(v.hospital || "")}</strong>${v.department ? ` · ${Storage.escapeHtml(v.department)}` : ""}` });
    }
  });

  Storage.getPrescriptions(memberId).forEach(p => {
    const blob = [(p.items || []).map(it => it.drugName).join(" "), p.cautionMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "rx", date: p.startDate, text: `<strong>${Storage.escapeHtml((p.items || []).map(it => it.drugName).join(", "))}</strong>` });
    }
  });

  Storage.getCheckups(memberId).forEach(c => {
    const blob = [c.name, c.category, c.resultMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "checkup", date: c.date, text: `<strong>${Storage.escapeHtml(c.name || "")}</strong>${c.category ? ` · ${Storage.escapeHtml(c.category)}` : ""}` });
    }
  });

  Storage.getSymptoms().filter(s => s.memberId === memberId && s.hasSymptom).forEach(s => {
    const blob = [(s.tags || []).join(" "), s.action].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "symptom", date: s.date, text: `<strong>${Storage.escapeHtml((s.tags || []).join(", ") || "증상")}</strong>${s.action ? ` · ${Storage.escapeHtml(s.action)}` : ""}` });
    }
  });

  results.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return results.slice(0, 20);
}

function renderSearchResults(query) {
  const panel = document.getElementById("aiSearchResults");
  if (!panel) return;

  if (!query.trim()) {
    panel.classList.remove("open");
    panel.innerHTML = "";
    return;
  }

  const results = searchRecords(query);
  panel.classList.add("open");

  if (!results.length) {
    panel.innerHTML = `<div class="ai-search-empty">"${Storage.escapeHtml(query)}"에 대한 검색 결과가 없습니다.</div>`;
    return;
  }

  panel.innerHTML = results.map(r => {
    const [label, badgeClass] = SEARCH_BADGE[r.type];
    return `
      <div class="ai-search-item" data-type="${r.type}" data-date="${r.date || ""}">
        <span class="badge ${badgeClass}">${label}</span>
        <span class="ai-search-item-text">${r.text}</span>
        <span class="ai-search-item-date">${r.date ? formatMonthDay(r.date) : ""}</span>
      </div>`;
  }).join("");
}

function bindAiSearch() {
  const input = document.getElementById("aiSearchInput");
  const panel = document.getElementById("aiSearchResults");
  if (!input || !panel) return;

  input.addEventListener("input", () => renderSearchResults(input.value));
  input.addEventListener("focus", () => { if (input.value.trim()) renderSearchResults(input.value); });

  panel.addEventListener("click", e => {
    const item = e.target.closest(".ai-search-item[data-date]");
    if (!item || !item.dataset.date) return;

    const [y, m, d] = item.dataset.date.split("-").map(Number);
    AppState.selectedDate = new Date(y, m - 1, d);

    const tabByType = { visit: "visit", rx: "rx", checkup: "checkup", symptom: "today" };
    const tab = tabByType[item.dataset.type] || "today";
    document.querySelectorAll(".subtab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (currentSection !== "diary") setSection("diary");
    setView(tab);
    window.refreshAll();

    input.value = "";
    panel.classList.remove("open");
    panel.innerHTML = "";
  });

  document.addEventListener("click", e => {
    if (!document.querySelector(".ai-search").contains(e.target)) {
      panel.classList.remove("open");
    }
  });
}

function bindTopbarActions() {
  document.getElementById("exportPdfBtn").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("sendMailBtn").addEventListener("click", () => {
    const subject = "건강비서 - 통계 · 리포트";
    const body = buildReportSummaryText();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

function bindRecordViewToggle() {
  document.querySelectorAll(".view-toggle button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      recordViewMode = btn.dataset.view;
      document.getElementById("recordBodyDaily").style.display = recordViewMode === "daily" ? "flex" : "none";
      document.getElementById("recordBodyList").style.display = recordViewMode === "list" ? "flex" : "none";
      if (recordViewMode === "list") renderRecordList();
    });
  });
}

function setView(view) {
  currentView = view;
  const panels = document.querySelectorAll(".view-panel");
  const hasDedicatedPanel = Array.from(panels).some(p => p.dataset.view === view);
  panels.forEach(panel => {
    const isPlaceholderFallback = panel.dataset.view === "placeholder" && !hasDedicatedPanel;
    if (panel.dataset.view === view || isPlaceholderFallback) {
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
  renderUpcomingBanner();
  Symptoms.render();
  renderTodayVisits();
  renderTodayRx();
  if (recordViewMode === "list") renderRecordList();
  if (currentView === "visit") Visits.render();
  if (currentView === "rx") Prescriptions.render();
  if (currentView === "checkup") Checkups.render();
  if (currentView === "report") Report.render();
  if (currentSection === "profile") Profile.render();
  if (currentSection === "biorhythm") LifeLogs.render();
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
  if (section === "biorhythm") LifeLogs.render();
}

function bindLifeDateNav() {
  const shiftDay = delta => {
    const d = new Date(AppState.selectedDate);
    d.setDate(d.getDate() + delta);
    AppState.selectedDate = d;
    window.refreshAll();
  };
  document.getElementById("lifeDatePrev").addEventListener("click", () => shiftDay(-1));
  document.getElementById("lifeDateNext").addEventListener("click", () => shiftDay(1));

  const picker = document.getElementById("lifeDatePicker");
  document.getElementById("lifeDateBox").addEventListener("click", () => {
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.focus();
  });
  picker.addEventListener("change", () => {
    if (!picker.value) return;
    const [y, m, d] = picker.value.split("-").map(Number);
    AppState.selectedDate = new Date(y, m - 1, d);
    window.refreshAll();
  });
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

const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
let pickerYear = calendarState.year;

function renderMonthPicker() {
  document.getElementById("pickerYearLabel").textContent = `${pickerYear}년`;
  const grid = document.getElementById("pickerMonthGrid");
  grid.innerHTML = MONTH_LABELS.map((label, i) => {
    const isCurrentMonth = pickerYear === REAL_TODAY.getFullYear() && i === REAL_TODAY.getMonth();
    const isSelected = pickerYear === calendarState.year && i === calendarState.month;
    const classes = ["", isSelected ? "selected" : (isCurrentMonth ? "current" : "")].join(" ").trim();
    return `<button type="button" class="${classes}" data-month="${i}">${label}</button>`;
  }).join("");
}

function openMonthPicker() {
  pickerYear = calendarState.year;
  renderMonthPicker();
  document.getElementById("monthPicker").classList.add("open");
}

function closeMonthPicker() {
  document.getElementById("monthPicker").classList.remove("open");
}

function bindMonthPicker() {
  document.getElementById("calendarMonthBtn").addEventListener("click", e => {
    e.stopPropagation();
    const popover = document.getElementById("monthPicker");
    if (popover.classList.contains("open")) closeMonthPicker();
    else openMonthPicker();
  });

  document.getElementById("pickerYearPrev").addEventListener("click", () => {
    pickerYear -= 1;
    renderMonthPicker();
  });
  document.getElementById("pickerYearNext").addEventListener("click", () => {
    pickerYear += 1;
    renderMonthPicker();
  });

  document.getElementById("pickerMonthGrid").addEventListener("click", e => {
    const btn = e.target.closest("button[data-month]");
    if (!btn) return;
    calendarState.year = pickerYear;
    calendarState.month = Number(btn.dataset.month);
    closeMonthPicker();
    renderCalendar();
  });

  document.addEventListener("click", e => {
    const picker = document.getElementById("calendarMonthBtn").parentElement;
    if (!picker.contains(e.target)) closeMonthPicker();
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
      if (Storage.getFamilyMembers().length >= MAX_FAMILY_MEMBERS) return;
      familyAddMode = true;
      renderFamilyList();
    } else if (action === "cancel-add-member") {
      familyAddMode = false;
      renderFamilyList();
    } else if (action === "save-add-member") {
      if (Storage.getFamilyMembers().length >= MAX_FAMILY_MEMBERS) {
        familyAddMode = false;
        renderFamilyList();
        return;
      }
      const form = actionEl.closest(".family-add-form");
      const relation = form.querySelector('[data-field="relation"]').value;
      const nickname = form.querySelector('[data-field="nickname"]').value.trim();
      Storage.addFamilyMember({ relation, nickname });
      familyAddMode = false;
      renderFamilyList();
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

  document.getElementById("sideCheckupAddLink").addEventListener("click", () => {
    document.querySelectorAll(".subtab").forEach(t => t.classList.toggle("active", t.dataset.tab === "checkup"));
    setView("checkup");
    Checkups.openAddForm();
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
renderUpcomingBanner();
renderTodayVisits();
renderTodayRx();
refreshFamilyIdentity();
Symptoms.render();
Visits.init();
Profile.init();
Prescriptions.init();
Checkups.init();
Report.init();
LifeLogs.init();
setView("today");

bindCalendarNav();
bindLifeDateNav();
bindMonthPicker();
bindSubtabs();
bindFamilySwitch();
bindTodayRecordActions();
bindTopNav();
bindTabLinks();
bindRecordViewToggle();
bindTopbarActions();
bindAiSearch();
