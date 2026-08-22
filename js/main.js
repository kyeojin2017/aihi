const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DOT_COLOR = { visit: "#2C6BA8", rx: "#7E6BB0", pain: "#C08A5E", shot: "#5B9E7E" };

const REAL_TODAY = new Date();

window.AppState = {
  selectedDate: new Date(REAL_TODAY),
  memberId: "self",
  visitFilterDate: null,
  visitFilterMonth: null,
  rxFilterMonth: null
};

// Save/load actions call the Supabase client without try/catch, so a DB error
// (bad column value, RLS denial, network drop) otherwise just rejects silently
// and the button looks like it did nothing. Surface it instead.
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled error:", e.reason);
  const reason = e.reason || {};
  const msg = reason.message || reason.error_description || String(reason);

  // Postgres 42501 = insufficient_privilege (RLS denial). This almost always means
  // the browser's Supabase session is stale/expired — the client-side "has a
  // session" check in auth.js can still pass with a token the server no longer
  // honors, so every insert/update gets silently rejected as "not your row."
  // Re-authenticating (not a code fix) is what actually resolves it.
  if (reason.code === "42501" || /row-level security/i.test(msg)) {
    window.alert("로그인 세션에 문제가 있어 저장하지 못했습니다. 다시 로그인해주세요.");
    supabaseClient.auth.signOut().finally(() => { window.location.href = "login.html"; });
    return;
  }
  window.alert("저장/불러오기 중 오류가 발생했습니다: " + msg);
});

let currentView = "today";
let currentSection = "diary";
const calendarState = { year: REAL_TODAY.getFullYear(), month: REAL_TODAY.getMonth() };
window.calendarState = calendarState;
const SECTION_LABEL = { diary: "건강일기", profile: "개인정보", biorhythm: "생활 바이오리듬" };
let boundOnce = false;

function pad2(n) { return String(n).padStart(2, "0"); }

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

async function computeMarks(year, month) {
  const prefix = `${year}-${pad2(month + 1)}-`;
  const marks = {};

  const [visits, symptoms] = await Promise.all([
    Storage.getVisits(), Storage.getSymptoms()
  ]);

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

  await renderSummaryPanel();
}

async function renderSummaryPanel() {
  const { year, month } = calendarState;
  const summary = await Report.computeSummary(AppState.memberId, year, month);

  document.getElementById("monthlySummaryTitle").textContent = `${month + 1}월 누계`;
  document.getElementById("calStatVisit").innerHTML = `${summary.visitCount}<span class="stat-unit">회</span>`;
  document.getElementById("calStatRx").innerHTML = `${summary.prescriptionCount}<span class="stat-unit">회</span>`;
  document.getElementById("calStatSymptom").innerHTML = `${summary.symptomDays}<span class="stat-unit">일</span>`;
  document.getElementById("calStatCheckup").innerHTML = `${summary.checkupCount}<span class="stat-unit">건</span>`;
}

let familyAddMode = false;
const MAX_FAMILY_MEMBERS = 6;
let draggedMemberId = null;

async function renderFamilyList() {
  const el = document.getElementById("familyList");
  const addPanelEl = document.getElementById("familyAddPanel");
  if (!el) return;

  const members = await Storage.getFamilyMembers();
  const itemsHtml = members.map(m => `
    <div class="family-item${m.id === AppState.memberId ? " active" : ""}" data-member="${m.id}" draggable="true">
      <span class="family-avatar">${Storage.escapeHtml(m.avatarLabel || (m.relation || m.nickname || "?").charAt(0))}</span>
      ${Storage.escapeHtml(m.nickname || m.relation || "관계 없음")}
    </div>`).join("");

  const atLimit = members.length >= MAX_FAMILY_MEMBERS;
  const triggerHtml = atLimit
    ? `<div class="family-item family-add-disabled">최대 ${MAX_FAMILY_MEMBERS}명까지 등록할 수 있습니다</div>`
    : `<div class="family-item family-add" data-action="open-add-member"><span class="family-avatar">+</span>구성원 추가</div>`;

  el.innerHTML = itemsHtml + triggerHtml;

  if (addPanelEl) {
    addPanelEl.innerHTML = familyAddMode && !atLimit ? `
      <div class="family-add-form">
        <select class="field-box" data-field="relation">
          ${["배우자", "자녀", "부모", "형제자매", "기타"].map(r => `<option value="${r}">${r}</option>`).join("")}
        </select>
        <input type="text" class="field-box" data-field="nickname" placeholder="이름이나 별명을 입력 (안 넣어도 됨)">
        <div class="btn-row">
          <button type="button" class="btn" data-action="cancel-add-member">취소</button>
          <button type="button" class="btn btn-primary" data-action="save-add-member">추가</button>
        </div>
      </div>` : "";
  }
}

async function updateTopbarIdentity() {
  const member = await Storage.getFamilyMember(AppState.memberId);
  const nameEl = document.getElementById("patientName");
  if (nameEl) nameEl.textContent = member ? (member.nickname || member.relation || "구성원") : "";
}

async function refreshFamilyIdentity() {
  await renderFamilyList();
  await updateTopbarIdentity();
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

function formatYearMonthDay(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

async function computeUpcoming(memberId) {
  const today = new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth(), REAL_TODAY.getDate());
  const items = [];

  const [checkups, visits] = await Promise.all([Storage.getCheckups(memberId), Storage.getVisits()]);

  checkups.forEach(c => {
    if (!c.date || c.status === "완료") return;
    const days = Math.round((new Date(c.date) - today) / 86400000);
    if (days > 0 && days <= 60) items.push({ label: c.name || "접종·검진", date: c.date, days });
  });

  visits.filter(v => v.memberId === memberId && v.nextVisitDate).forEach(v => {
    const days = Math.round((new Date(v.nextVisitDate) - today) / 86400000);
    if (days > 0 && days <= 60) items.push({ label: `${v.hospital || "병원"} 다음 예약`, date: v.nextVisitDate, days });
  });

  // Same hospital + same next-appointment date can come from more than one visit
  // record (e.g. a follow-up date carried over across visits) — collapse those
  // to a single banner entry instead of repeating it once per source row.
  const seen = new Set();
  const deduped = items.filter(it => {
    const key = `${it.label}__${it.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.days - b.days);
  return deduped;
}

async function renderUpcomingBanner() {
  const banner = document.getElementById("upcomingBanner");
  if (!banner) return;

  const items = await computeUpcoming(AppState.memberId);
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
          <span class="dday">D-${it.days}</span>
        </div>`).join("")}
    </div>`;
}

window.recordViewMode = "daily";

async function renderRecordList() {
  const el = document.getElementById("recordBodyList");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const memberId = AppState.memberId;
  const rows = [];

  const [symptom, visits, prescriptions, checkups] = await Promise.all([
    Storage.getSymptom(dateKey, memberId), Storage.getVisits(), Storage.getPrescriptions(memberId), Storage.getCheckups(memberId)
  ]);

  if (symptom && symptom.hasSymptom) {
    const tagText = (symptom.tags || []).join(", ") || "증상 있음";
    rows.push({ badge: "증상", badgeClass: "badge-neutral", text: `<strong>${Storage.escapeHtml(tagText)}</strong>${symptom.painLevel ? ` · 통증 ${symptom.painLevel}` : ""}${symptom.temperature ? ` · ${symptom.temperature}℃` : ""}` });
  }

  visits.filter(v => v.memberId === memberId && v.date === dateKey).forEach(v => {
    rows.push({ badge: "병원방문", badgeClass: "badge-blue", text: `<strong>${Storage.escapeHtml(v.hospital || "병원")}</strong>${v.department ? ` · ${Storage.escapeHtml(v.department)}` : ""}${v.time ? ` · ${v.time}` : ""}` });
  });

  prescriptions.filter(p => p.startDate && dateKey >= p.startDate && dateKey <= (p.endDate || p.startDate)).forEach(p => {
    const count = (p.items || []).length;
    rows.push({ badge: "처방전", badgeClass: "badge-neutral", text: `<strong>약 ${count}종</strong>${p.items && p.items[0] ? ` · ${Storage.escapeHtml(p.items[0].drugName)} 외` : ""}` });
  });

  checkups.filter(c => c.date === dateKey).forEach(c => {
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

async function renderTodayVisits() {
  const el = document.getElementById("todayVisitBody");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const visits = (await Storage.getVisits()).filter(v => v.memberId === AppState.memberId && v.date === dateKey);

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

async function renderTodayRx() {
  const el = document.getElementById("todayRxBody");
  if (!el) return;

  const dateKey = Storage.toDateKey(AppState.selectedDate);
  const prescriptions = (await Storage.getPrescriptions(AppState.memberId))
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

async function renderSideCheckupSummary() {
  const el = document.getElementById("sideCheckupList");
  if (!el) return;

  const all = (await Storage.getCheckups(AppState.memberId))
    .filter(c => c.date && Number(c.date.slice(0, 4)) === calendarState.year);
  if (!all.length) {
    el.innerHTML = `<div class="symptom-hint">${calendarState.year}년에 등록된 접종·검진이 없습니다.</div>`;
    return;
  }

  const upcoming = all.filter(c => c.status !== "완료").sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const completed = all.filter(c => c.status === "완료").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const rows = [...upcoming, ...completed].slice(0, 5);

  el.innerHTML = rows.map(c => {
    const badgeClass = c.type === "screening" ? "badge-blue" : "badge-green";
    const badgeLabel = c.category || (c.type === "screening" ? "검진" : "접종");
    const isUpcoming = c.status !== "완료";
    const dateText = c.date ? (isUpcoming ? `예정 ${formatMonthDay(c.date)}` : formatDateFull(c.date).slice(0, 7)) : "-";
    return `
      <div class="vaccine-item">
        <span class="badge ${badgeClass}">${Storage.escapeHtml(badgeLabel)}</span>
        <span class="vaccine-name">${Storage.escapeHtml(c.name || "")}</span>
        <span class="vaccine-date${isUpcoming ? " upcoming" : ""}">${Storage.escapeHtml(dateText)}</span>
      </div>`;
  }).join("");
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
    if (el.dataset.date) {
      AppState.visitFilterDate = el.dataset.date;
      AppState.visitFilterMonth = null;
    } else {
      AppState.visitFilterDate = null;
      AppState.visitFilterMonth = Storage.toDateKey(AppState.selectedDate).slice(0, 7);
    }
    goToTab("visit");
  });
  document.getElementById("todayRxBody").addEventListener("click", e => {
    if (!e.target.closest("[data-action='goRxTab']")) return;
    AppState.rxFilterMonth = Storage.toDateKey(AppState.selectedDate).slice(0, 7);
    goToTab("rx");
  });
}

async function buildReportSummaryText() {
  const period = document.querySelector("#reportPeriodToggle button.active")?.dataset.period || "month";
  const year = calendarState.year;
  const month = calendarState.month;
  const member = await Storage.getFamilyMember(AppState.memberId);
  const summary = period === "month"
    ? await Report.computeSummary(AppState.memberId, year, month)
    : await Report.computeSummary(AppState.memberId, year, null);
  const deptRows = await Report.computeDeptBreakdown(AppState.memberId, year);
  const periodLabel = period === "month" ? `${year}년 ${month + 1}월` : `${year}년`;

  const lines = [`${periodLabel} 통계 · 리포트 (${member ? member.relation : "구성원"})`, ""];
  lines.push(`- 병원 방문: ${summary.visitCount}회`);
  lines.push(`- 처방 횟수: ${summary.prescriptionCount}회`);
  lines.push(`- 증상 기록: ${summary.symptomDays}일`);
  lines.push(`- 접종·검진: ${summary.checkupCount}건`);
  if (deptRows.length) {
    lines.push("", `진료과별 · ${year}년`);
    deptRows.forEach(r => lines.push(`- ${r.name}: ${r.count}회`));
  }
  return lines.join("\n");
}

const SEARCH_BADGE = { visit: ["병원방문", "badge-blue"], rx: ["처방전", "badge-neutral"], checkup: ["접종·검진", "badge-green"], symptom: ["증상", "badge-neutral"] };

async function searchRecords(query) {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!keywords.length) return [];

  const memberId = AppState.memberId;
  const results = [];

  const matches = text => keywords.every(k => text.toLowerCase().includes(k));

  const [visits, prescriptions, checkups, symptoms] = await Promise.all([
    Storage.getVisits(), Storage.getPrescriptions(memberId), Storage.getCheckups(memberId), Storage.getSymptoms()
  ]);

  // 검색어가 실제 진단명(진료 메모)과 일치하면 그 병명으로 진단받은 병원방문 기록만 보여준다
  const diagnosisMatches = visits
    .filter(v => v.memberId === memberId && v.diagnosisMemo && matches(v.diagnosisMemo))
    .map(v => ({ type: "visit", date: v.date, text: `<strong>${Storage.escapeHtml(v.hospital || "")}</strong>${v.department ? ` · ${Storage.escapeHtml(v.department)}` : ""}` }));
  if (diagnosisMatches.length) {
    diagnosisMatches.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return diagnosisMatches.slice(0, 20);
  }

  visits.filter(v => v.memberId === memberId).forEach(v => {
    const blob = [v.hospital, v.department, v.doctor, v.diagnosisMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "visit", date: v.date, text: `<strong>${Storage.escapeHtml(v.hospital || "")}</strong>${v.department ? ` · ${Storage.escapeHtml(v.department)}` : ""}` });
    }
  });

  prescriptions.forEach(p => {
    const blob = [(p.items || []).map(it => it.drugName).join(" "), p.cautionMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "rx", date: p.startDate, text: `<strong>${Storage.escapeHtml((p.items || []).map(it => it.drugName).join(", "))}</strong>` });
    }
  });

  checkups.forEach(c => {
    const blob = [c.name, c.category, c.resultMemo].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "checkup", date: c.date, text: `<strong>${Storage.escapeHtml(c.name || "")}</strong>${c.category ? ` · ${Storage.escapeHtml(c.category)}` : ""}` });
    }
  });

  symptoms.filter(s => s.memberId === memberId && s.hasSymptom).forEach(s => {
    const blob = [(s.tags || []).join(" "), s.action].filter(Boolean).join(" ");
    if (matches(blob)) {
      results.push({ type: "symptom", date: s.date, text: `<strong>${Storage.escapeHtml((s.tags || []).join(", ") || "증상")}</strong>${s.action ? ` · ${Storage.escapeHtml(s.action)}` : ""}` });
    }
  });

  results.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return results.slice(0, 20);
}

async function renderSearchResults(query) {
  const panel = document.getElementById("aiSearchResults");
  if (!panel) return;

  if (!query.trim()) {
    panel.classList.remove("open");
    panel.innerHTML = "";
    return;
  }

  const results = await searchRecords(query);
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
        <span class="ai-search-item-date">${r.date ? formatYearMonthDay(r.date) : ""}</span>
      </div>`;
  }).join("");
}

function bindAiSearch() {
  const input = document.getElementById("aiSearchInput");
  const panel = document.getElementById("aiSearchResults");
  if (!input || !panel) return;

  input.addEventListener("input", () => renderSearchResults(input.value));
  input.addEventListener("focus", () => { if (input.value.trim()) renderSearchResults(input.value); });

  panel.addEventListener("click", async e => {
    const item = e.target.closest(".ai-search-item[data-date]");
    if (!item || !item.dataset.date) return;

    const [y, m, d] = item.dataset.date.split("-").map(Number);
    AppState.selectedDate = new Date(y, m - 1, d);

    const tabByType = { visit: "visit", rx: "rx", checkup: "checkup", symptom: "today" };
    const tab = tabByType[item.dataset.type] || "today";
    document.querySelectorAll(".subtab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (currentSection !== "diary") await setSection("diary");
    setView(tab);
    await window.refreshAll();

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
  document.getElementById("exportPdfBtn").addEventListener("click", async () => {
    const year = calendarState.year;
    const month = calendarState.month;
    const member = await Storage.getFamilyMember(AppState.memberId);
    const memberLabel = member ? (member.name || member.relation) : "구성원";

    await Report.renderPrintable(AppState.memberId, year, month, memberLabel);
    document.body.classList.add("printing-report");

    const isNativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (isNativeApp) {
      // Android WebView's print adapter ignores @media print and captures whatever is
      // actually on screen, so swap the visible content directly instead of relying on it.
      const appShell = document.querySelector(".app-shell");
      const printEl = document.getElementById("printReport");
      const prevAppShellDisplay = appShell.style.display;
      const prevPrintDisplay = printEl.style.display;
      appShell.style.display = "none";
      printEl.style.display = "block";
      try {
        await window.Capacitor.Plugins.PrintBridge.print();
      } finally {
        appShell.style.display = prevAppShellDisplay;
        printEl.style.display = prevPrintDisplay;
        document.body.classList.remove("printing-report");
      }
    } else {
      window.print();
    }
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-report");
  });

  document.getElementById("sendMailBtn").addEventListener("click", async () => {
    const subject = "건강비서 - 통계 · 리포트";
    const body = await buildReportSummaryText();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

function bindRecordViewToggle() {
  document.querySelectorAll(".view-toggle button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.recordViewMode = btn.dataset.view;
      AppState.visitFilterDate = null;
      AppState.visitFilterMonth = null;
      AppState.rxFilterMonth = null;
      document.getElementById("recordBodyDaily").style.display = window.recordViewMode === "daily" ? "flex" : "none";
      document.getElementById("recordBodyList").style.display = window.recordViewMode === "list" ? "flex" : "none";
      window.refreshAll();
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

window.refreshAll = async function refreshAll() {
  await Promise.all([renderCalendar(), Symptoms.render()]);
  renderRecordDate();
  await renderUpcomingBanner();
  await renderTodayVisits();
  await renderTodayRx();
  await renderSideCheckupSummary();
  if (window.recordViewMode === "list") await renderRecordList();
  if (currentView === "visit") await Visits.render();
  if (currentView === "rx") await Prescriptions.render();
  if (currentView === "checkup") await Checkups.render();
  if (currentView === "report") await Report.render();
  if (currentSection === "profile") await Profile.render();
  if (currentSection === "biorhythm") await LifeLogs.render();
  await refreshFamilyIdentity();
};

async function setSection(section) {
  currentSection = section;
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.view === section);
  });
  document.getElementById("diarySection").style.display = section === "diary" ? "flex" : "none";
  document.getElementById("profileSection").style.display = section === "profile" ? "flex" : "none";
  document.getElementById("biorhythmSection").style.display = section === "biorhythm" ? "flex" : "none";
  document.getElementById("pageName").textContent = SECTION_LABEL[section];
  if (section === "diary") {
    AppState.selectedDate = new Date(REAL_TODAY);
    calendarState.year = REAL_TODAY.getFullYear();
    calendarState.month = REAL_TODAY.getMonth();
    AppState.visitFilterDate = null;
    AppState.visitFilterMonth = null;
    AppState.rxFilterMonth = null;
    await window.refreshAll();
  }
  if (section === "profile") await Profile.render();
  if (section === "biorhythm") await LifeLogs.render();
}

function bindLifeDateNav() {
  const shiftDay = async delta => {
    const d = new Date(AppState.selectedDate);
    d.setDate(d.getDate() + delta);
    AppState.selectedDate = d;
    await window.refreshAll();
  };
  document.getElementById("lifeDatePrev").addEventListener("click", () => shiftDay(-1));
  document.getElementById("lifeDateNext").addEventListener("click", () => shiftDay(1));

  const picker = document.getElementById("lifeDatePicker");
  document.getElementById("lifeDateBox").addEventListener("click", () => {
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.focus();
  });
  picker.addEventListener("change", async () => {
    if (!picker.value) return;
    const [y, m, d] = picker.value.split("-").map(Number);
    AppState.selectedDate = new Date(y, m - 1, d);
    await window.refreshAll();
  });
}

function bindCalendarNav() {
  document.getElementById("calendarPrev").addEventListener("click", () => {
    calendarState.month -= 1;
    if (calendarState.month < 0) { calendarState.month = 11; calendarState.year -= 1; }
    window.refreshAll();
  });
  document.getElementById("calendarNext").addEventListener("click", () => {
    calendarState.month += 1;
    if (calendarState.month > 11) { calendarState.month = 0; calendarState.year += 1; }
    window.refreshAll();
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
    window.refreshAll();
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

async function onFamilyPanelClick(e) {
  const memberEl = e.target.closest(".family-item[data-member]");
  if (memberEl) {
    AppState.memberId = memberEl.dataset.member;
    AppState.visitFilterDate = null;
    await window.refreshAll();
    return;
  }

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "open-add-member") {
    if ((await Storage.getFamilyMembers()).length >= MAX_FAMILY_MEMBERS) return;
    familyAddMode = true;
    await renderFamilyList();
  } else if (action === "cancel-add-member") {
    familyAddMode = false;
    await renderFamilyList();
  } else if (action === "save-add-member") {
    if ((await Storage.getFamilyMembers()).length >= MAX_FAMILY_MEMBERS) {
      familyAddMode = false;
      await renderFamilyList();
      return;
    }
    const form = actionEl.closest(".family-add-form");
    const relation = form.querySelector('[data-field="relation"]').value;
    const nickname = form.querySelector('[data-field="nickname"]').value.trim();
    await Storage.addFamilyMember({ relation, nickname });
    familyAddMode = false;
    await renderFamilyList();
  }
}

async function bindFamilySwitch() {
  document.getElementById("familyList").addEventListener("click", onFamilyPanelClick);
  document.getElementById("familyAddPanel").addEventListener("click", onFamilyPanelClick);

  const familyListEl = document.getElementById("familyList");

  familyListEl.addEventListener("dragstart", e => {
    const memberEl = e.target.closest(".family-item[data-member]");
    if (!memberEl) return;
    draggedMemberId = memberEl.dataset.member;
    memberEl.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  familyListEl.addEventListener("dragover", e => {
    const memberEl = e.target.closest(".family-item[data-member]");
    if (!memberEl || !draggedMemberId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (memberEl.dataset.member !== draggedMemberId) memberEl.classList.add("drag-over");
  });

  familyListEl.addEventListener("dragleave", e => {
    const memberEl = e.target.closest(".family-item[data-member]");
    if (memberEl) memberEl.classList.remove("drag-over");
  });

  familyListEl.addEventListener("drop", async e => {
    const memberEl = e.target.closest(".family-item[data-member]");
    if (!memberEl || !draggedMemberId) return;
    e.preventDefault();
    memberEl.classList.remove("drag-over");
    const targetId = memberEl.dataset.member;
    if (targetId !== draggedMemberId) {
      await Storage.reorderFamilyMembers(draggedMemberId, targetId);
      await renderFamilyList();
    }
  });

  familyListEl.addEventListener("dragend", () => {
    draggedMemberId = null;
    familyListEl.querySelectorAll(".family-item").forEach(el => el.classList.remove("dragging", "drag-over"));
  });
}

function bindTopNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => setSection(item.dataset.view));
  });
  const brandMark = document.querySelector(".brand-mark");
  if (brandMark) brandMark.addEventListener("click", () => setSection("diary"));
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

window.initApp = async function initApp() {
  const members = await Storage.ensureDefaultMember();
  if (!members.some(m => m.id === AppState.memberId)) {
    AppState.memberId = members[0].id;
  }
  await renderCalendar();
  renderRecordDate();
  await renderUpcomingBanner();
  await renderTodayVisits();
  await renderTodayRx();
  await renderSideCheckupSummary();
  await refreshFamilyIdentity();
  await Symptoms.render();
  if (!boundOnce) {
    Visits.init();
    Profile.init();
    Prescriptions.init();
    Checkups.init();
    Report.init();
    LifeLogs.init();
    bindCalendarNav();
    bindLifeDateNav();
    bindMonthPicker();
    bindSubtabs();
    await bindFamilySwitch();
    bindTodayRecordActions();
    bindTopNav();
    bindTabLinks();
    bindRecordViewToggle();
    bindTopbarActions();
    bindAiSearch();
    bindExclusiveToggle(".view-toggle");
    boundOnce = true;
  }
  setView("today");
};

window.initApp();
