const Prescriptions = (() => {
  let formMode = null; // null | "add" | { edit: id }
  let draftItems = [];

  function init() {
    document.getElementById("addRxBtn").addEventListener("click", () => {
      formMode = "add";
      draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];
      render();
    });
    document.getElementById("rxList").addEventListener("click", onListClick);
    document.getElementById("rxList").addEventListener("change", onListChange);
    document.getElementById("rxFilterClear").addEventListener("click", () => {
      AppState.rxFilterMonth = null;
      render();
    });
  }

  function refresh() {
    if (typeof window.refreshAll === "function") window.refreshAll();
    else render();
  }

  function findVisit(id) {
    return Storage.getVisits().find(v => v.id === id) || null;
  }

  function findPrescription(id) {
    return Storage.getPrescriptions(AppState.memberId).find(p => p.id === id) || null;
  }

  function formatDateFull(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  function formatMonthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return `${y}년 ${m}월`;
  }

  function render() {
    const listEl = document.getElementById("rxList");
    if (!listEl) return;

    const all = Storage.getPrescriptions(AppState.memberId)
      .slice()
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    const selectedDateKey = Storage.toDateKey(AppState.selectedDate);
    const isDailyView = window.recordViewMode === "daily";
    const filtered = AppState.rxFilterMonth
      ? all.filter(p => (p.startDate || "").startsWith(AppState.rxFilterMonth))
      : isDailyView
        ? all.filter(p => p.startDate && selectedDateKey >= p.startDate && selectedDateKey <= (p.endDate || p.startDate))
        : all;

    document.getElementById("rxCount").textContent = `${all.length}건`;

    const filterChip = document.getElementById("rxFilterChip");
    if (AppState.rxFilterMonth) {
      filterChip.style.display = "flex";
      document.getElementById("rxFilterLabel").textContent = `${formatMonthLabel(AppState.rxFilterMonth)} 기록만 보는 중`;
    } else {
      filterChip.style.display = "none";
    }

    const formHtml = formMode ? renderForm(formMode && typeof formMode === "object" ? findPrescription(formMode.edit) : null) : "";
    const itemsHtml = filtered
      .filter(p => !(formMode && typeof formMode === "object" && formMode.edit === p.id))
      .map(renderCard)
      .join("");

    if (!formHtml && filtered.length === 0) {
      const emptyMsg = AppState.rxFilterMonth ? "이 달에 처방전 기록이 없습니다."
        : isDailyView ? "이 날짜에 복용 중인 처방전이 없습니다."
        : "아직 처방전 기록이 없습니다.";
      listEl.innerHTML = `<div class="empty-state"><p>${emptyMsg}</p></div>`;
    } else {
      listEl.innerHTML = formHtml + itemsHtml;
    }
  }

  function renderCard(p) {
    const visit = p.visitId ? findVisit(p.visitId) : null;
    const items = p.items || [];
    return `
      <div class="card card-accent-purple rx-card">
        <div class="card-head">
          <div class="card-head-left">
            <span class="card-title">처방전</span>
            <span class="card-subtitle">${formatDateFull(p.startDate)} – ${formatDateFull(p.endDate).slice(5)}${visit ? ` · ${Storage.escapeHtml(visit.hospital || "")}` : ""}</span>
          </div>
          <span style="display:flex; gap:10px;">
            <span class="card-link" data-action="edit" data-id="${p.id}">수정</span>
            <span class="card-link danger" data-action="delete" data-id="${p.id}">삭제</span>
          </span>
        </div>
        <div class="rx-table">
          <div class="rx-row head"><span>약 이름</span><span>용량</span><span>복용</span><span>비고</span></div>
          ${items.map((it, i) => `
            <div class="rx-row${i === items.length - 1 ? " last" : ""}">
              <span>${Storage.escapeHtml(it.drugName || "")}</span>
              <span class="rx-dose">${Storage.escapeHtml(it.dose || "")}</span>
              <span class="rx-freq">${Storage.escapeHtml(it.frequency || "")}</span>
              <span class="rx-note">${Storage.escapeHtml(it.note || "")}</span>
            </div>`).join("")}
        </div>
        ${p.cautionMemo ? `
        <div class="rx-memo-row">
          <span class="memo-label">주의 메모</span>
          <span class="memo-box">${Storage.escapeHtml(p.cautionMemo)}</span>
        </div>` : ""}
      </div>`;
  }

  function renderForm(existing) {
    const p = existing || { visitId: "", startDate: Storage.toDateKey(AppState.selectedDate), endDate: "", cautionMemo: "" };
    if (existing) draftItems = (existing.items && existing.items.length ? existing.items : [{ drugName: "", dose: "", frequency: "", note: "" }]);
    else if (!draftItems.length) draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];

    const visits = Storage.getVisits().filter(v => v.memberId === AppState.memberId)
      .slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return `
      <div class="card card-accent-purple rx-card" data-editing-id="${existing ? existing.id : ""}">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">${existing ? "처방전 수정" : "처방전 등록"}</span></div>
        </div>
        <div class="visit-grid">
          <div class="field"><span class="field-label">시작일</span><input class="field-box" type="date" data-field="startDate" value="${p.startDate || ""}"></div>
          <div class="field"><span class="field-label">종료일</span><input class="field-box" type="date" data-field="endDate" value="${p.endDate || ""}"></div>
          <div class="field">
            <span class="field-label">연결된 병원 방문</span>
            <select class="field-box" data-field="visitId">
              <option value="">선택 안 함</option>
              ${visits.map(v => `<option value="${v.id}"${p.visitId === v.id ? " selected" : ""}>${formatDateFull(v.date)} · ${Storage.escapeHtml(v.hospital || "")}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="rx-table" id="rxItemsEditor">
          <div class="rx-row head"><span>약 이름</span><span>용량</span><span>복용</span><span>비고</span></div>
          ${draftItems.map((it, i) => `
            <div class="rx-row">
              <input class="field-box" type="text" data-item-field="drugName" data-index="${i}" value="${Storage.escapeHtml(it.drugName || "")}" placeholder="약 이름">
              <input class="field-box" type="text" data-item-field="dose" data-index="${i}" value="${Storage.escapeHtml(it.dose || "")}" placeholder="250mg">
              <input class="field-box" type="text" data-item-field="frequency" data-index="${i}" value="${Storage.escapeHtml(it.frequency || "")}" placeholder="1일 3회">
              <span style="display:flex; gap:6px;">
                <input class="field-box" type="text" data-item-field="note" data-index="${i}" value="${Storage.escapeHtml(it.note || "")}" placeholder="비고" style="flex:1;">
                <button type="button" class="btn" data-action="removeItem" data-index="${i}" title="삭제">✕</button>
              </span>
            </div>`).join("")}
        </div>
        <button type="button" class="btn" data-action="addItem">+ 약 추가</button>
        <div class="memo-row">
          <span class="memo-label">주의 메모</span>
          <textarea class="memo-box" data-field="cautionMemo" placeholder="중복 성분, 복용 시 주의사항 등">${Storage.escapeHtml(p.cautionMemo || "")}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-action="cancel">취소</button>
          <button type="button" class="btn btn-primary" data-action="save">저장</button>
        </div>
      </div>`;
  }

  function onListChange(e) {
    const el = e.target.closest("[data-item-field]");
    if (!el) return;
    const idx = Number(el.dataset.index);
    draftItems[idx] = { ...draftItems[idx], [el.dataset.itemField]: el.value };
  }

  function syncDraftFromDom(cardEl) {
    if (!cardEl) return;
    cardEl.querySelectorAll("#rxItemsEditor [data-item-field]").forEach(el => {
      const idx = Number(el.dataset.index);
      if (!draftItems[idx]) draftItems[idx] = { drugName: "", dose: "", frequency: "", note: "" };
      draftItems[idx][el.dataset.itemField] = el.value;
    });
  }

  function onListClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "edit") {
      formMode = { edit: actionEl.dataset.id };
      render();
    } else if (action === "delete") {
      if (window.confirm("이 처방전 기록을 삭제할까요?")) {
        Storage.deletePrescription(actionEl.dataset.id);
        refresh();
      }
    } else if (action === "cancel") {
      formMode = null;
      render();
    } else if (action === "addItem") {
      syncDraftFromDom(actionEl.closest(".card"));
      draftItems.push({ drugName: "", dose: "", frequency: "", note: "" });
      render();
    } else if (action === "removeItem") {
      syncDraftFromDom(actionEl.closest(".card"));
      draftItems.splice(Number(actionEl.dataset.index), 1);
      if (!draftItems.length) draftItems.push({ drugName: "", dose: "", frequency: "", note: "" });
      render();
    } else if (action === "save") {
      const cardEl = actionEl.closest(".card");
      syncDraftFromDom(cardEl);
      const data = {};
      cardEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.startDate) {
        window.alert("시작일은 필수입니다.");
        return;
      }
      data.visitId = data.visitId || null;
      data.endDate = data.endDate || null;
      data.items = draftItems.filter(it => it.drugName && it.drugName.trim());

      const editingId = cardEl.dataset.editingId;
      if (editingId) Storage.updatePrescription(editingId, data);
      else Storage.addPrescription(AppState.memberId, data);

      formMode = null;
      draftItems = [];
      refresh();
    }
  }

  function openAddForm() {
    formMode = "add";
    draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];
    render();
  }

  return { render, init, openAddForm };
})();
