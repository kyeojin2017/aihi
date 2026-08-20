const Visits = (() => {
  let formMode = null; // null | "add" | { edit: id }

  function init() {
    document.getElementById("addVisitBtn").addEventListener("click", () => {
      formMode = "add";
      render();
    });
    document.getElementById("visitFilterClear").addEventListener("click", () => {
      AppState.visitFilterDate = null;
      AppState.visitFilterMonth = null;
      render();
    });
    document.getElementById("visitList").addEventListener("click", onListClick);
  }

  function onListClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "edit") {
      formMode = { edit: actionEl.dataset.id };
      render();
    } else if (action === "delete") {
      if (window.confirm("이 병원 방문 기록을 삭제할까요?")) {
        Storage.deleteVisit(actionEl.dataset.id);
        refresh();
      }
    } else if (action === "cancel") {
      formMode = null;
      render();
    } else if (action === "save") {
      const cardEl = actionEl.closest(".card");
      const data = {};
      cardEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.date || !data.hospital) {
        window.alert("날짜와 병원 이름은 필수입니다.");
        return;
      }
      if (!data.nextVisitDate) data.nextVisitDate = null;
      data.memberId = AppState.memberId;

      const editingId = cardEl.dataset.editingId;
      if (editingId) Storage.updateVisit(editingId, data);
      else Storage.addVisit(data);

      formMode = null;
      refresh();
    }
  }

  function refresh() {
    if (typeof window.refreshAll === "function") window.refreshAll();
    else render();
  }

  function render() {
    const listEl = document.getElementById("visitList");
    if (!listEl) return;

    const all = Storage.getVisits().filter(v => v.memberId === AppState.memberId);
    const calendarYear = window.calendarState ? String(window.calendarState.year) : null;
    let filtered = all;
    if (AppState.visitFilterDate) filtered = all.filter(v => v.date === AppState.visitFilterDate);
    else if (AppState.visitFilterMonth) filtered = all.filter(v => (v.date || "").startsWith(AppState.visitFilterMonth));
    else if (calendarYear) filtered = all.filter(v => (v.date || "").startsWith(calendarYear));
    const sorted = filtered.slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));

    document.getElementById("visitCount").textContent = `${all.length}건`;

    const filterChip = document.getElementById("visitFilterChip");
    if (AppState.visitFilterDate) {
      filterChip.style.display = "flex";
      document.getElementById("visitFilterLabel").textContent = `${formatDateLabel(AppState.visitFilterDate)} 기록만 보는 중`;
    } else if (AppState.visitFilterMonth) {
      filterChip.style.display = "flex";
      document.getElementById("visitFilterLabel").textContent = `${formatMonthLabel(AppState.visitFilterMonth)} 기록만 보는 중`;
    } else {
      filterChip.style.display = "none";
    }

    const formHtml = formMode ? renderForm(formMode && typeof formMode === "object" ? findVisit(formMode.edit) : null) : "";
    const itemsHtml = sorted
      .filter(v => !(formMode && typeof formMode === "object" && formMode.edit === v.id))
      .map(renderCard)
      .join("");

    if (!formHtml && sorted.length === 0) {
      const emptyMsg = AppState.visitFilterDate ? "이 날짜에 병원 방문 기록이 없습니다."
        : AppState.visitFilterMonth ? "이 달에 병원 방문 기록이 없습니다."
        : calendarYear ? `${calendarYear}년에 병원 방문 기록이 없습니다.`
        : "아직 병원 방문 기록이 없습니다.";
      listEl.innerHTML = `<div class="empty-state"><p>${emptyMsg}</p></div>`;
    } else {
      listEl.innerHTML = formHtml + itemsHtml;
    }
  }

  function findVisit(id) {
    return Storage.getVisits().find(v => v.id === id) || null;
  }

  function formatDateLabel(dateKey) {
    const [, m, d] = dateKey.split("-").map(Number);
    return `${m}월 ${d}일`;
  }

  function formatMonthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return `${y}년 ${m}월`;
  }

  function formatDateFull(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  function renderCard(v) {
    return `
      <div class="card card-accent-blue">
        <div class="card-head">
          <div class="card-head-left">
            <span class="card-title">${Storage.escapeHtml(v.hospital || "병원 방문")}</span>
            <span class="badge badge-blue">${Storage.escapeHtml(v.department || "-")}</span>
          </div>
          <span style="display:flex; gap:10px;">
            <span class="card-link" data-action="edit" data-id="${v.id}">수정</span>
            <span class="card-link danger" data-action="delete" data-id="${v.id}">삭제</span>
          </span>
        </div>
        <div class="visit-grid">
          <div class="field"><span class="field-label">날짜 · 시간</span><span class="field-box">${formatDateFull(v.date)} ${v.time || ""}</span></div>
          <div class="field"><span class="field-label">병원</span><span class="field-box">${Storage.escapeHtml(v.hospital || "-")}</span></div>
          <div class="field"><span class="field-label">진료과</span><span class="field-box">${Storage.escapeHtml(v.department || "-")}</span></div>
          <div class="field"><span class="field-label">담당 의사</span><span class="field-box">${Storage.escapeHtml(v.doctor || "-")}</span></div>
          <div class="field"><span class="field-label">다음 예약</span><span class="field-box accent">${formatDateFull(v.nextVisitDate)}</span></div>
        </div>
        ${v.diagnosisMemo ? `<div class="memo-row"><span class="memo-label">진단 메모</span><span class="memo-box">${Storage.escapeHtml(v.diagnosisMemo)}</span></div>` : ""}
      </div>`;
  }

  function renderForm(existing) {
    const v = existing || {
      date: Storage.toDateKey(AppState.selectedDate), time: "", hospital: "",
      department: "", doctor: "", nextVisitDate: "", diagnosisMemo: ""
    };
    return `
      <div class="card card-accent-blue" data-editing-id="${existing ? existing.id : ""}">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">${existing ? "병원 방문 수정" : "병원 방문 등록"}</span></div>
        </div>
        <div class="visit-grid">
          <div class="field"><span class="field-label">날짜</span><input class="field-box" type="date" data-field="date" value="${v.date || ""}"></div>
          <div class="field"><span class="field-label">시간</span><input class="field-box" type="time" data-field="time" value="${v.time || ""}"></div>
          <div class="field"><span class="field-label">병원</span><input class="field-box" type="text" data-field="hospital" value="${Storage.escapeHtml(v.hospital || "")}" placeholder="병원 이름"></div>
          <div class="field"><span class="field-label">진료과</span><input class="field-box" type="text" data-field="department" value="${Storage.escapeHtml(v.department || "")}" placeholder="예: 내과"></div>
          <div class="field"><span class="field-label">담당 의사</span><input class="field-box" type="text" data-field="doctor" value="${Storage.escapeHtml(v.doctor || "")}" placeholder="의사 이름"></div>
          <div class="field"><span class="field-label">다음 예약</span><input class="field-box" type="date" data-field="nextVisitDate" value="${v.nextVisitDate || ""}"></div>
        </div>
        <div class="memo-row">
          <span class="memo-label">진단 메모</span>
          <textarea class="memo-box" data-field="diagnosisMemo" placeholder="소견, 검사결과 등">${Storage.escapeHtml(v.diagnosisMemo || "")}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-action="cancel">취소</button>
          <button type="button" class="btn btn-primary" data-action="save">저장</button>
        </div>
      </div>`;
  }

  function openAddForm() {
    formMode = "add";
    render();
  }

  return { render, init, openAddForm };
})();
