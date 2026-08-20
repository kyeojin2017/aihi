const Checkups = (() => {
  let formMode = null; // null | "add" | { edit: id }
  let selectedYear = new Date().getFullYear();

  function init() {
    document.getElementById("addCheckupBtn").addEventListener("click", () => {
      formMode = "add";
      render();
    });
    document.getElementById("checkupList").addEventListener("click", onListClick);
    document.getElementById("checkupYearSelect").addEventListener("change", e => {
      selectedYear = Number(e.target.value);
      render();
    });
  }

  function refresh() {
    if (typeof window.refreshAll === "function") window.refreshAll();
    else render();
  }

  function findCheckup(id) {
    return Storage.getCheckups(AppState.memberId).find(c => c.id === id) || null;
  }

  function formatDateFull(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  function typeLabel(type) {
    return type === "screening" ? "건강검진" : "예방접종";
  }

  function renderUpcomingBanner(all) {
    const banner = document.getElementById("checkupUpcomingBanner");
    if (!banner) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = all
      .filter(c => c.date && c.status !== "완료")
      .map(c => ({ ...c, days: Math.round((new Date(c.date) - today) / 86400000) }))
      .filter(c => c.days > 0 && c.days <= 60)
      .sort((a, b) => a.days - b.days);

    if (!upcoming.length) {
      banner.classList.remove("show");
      banner.innerHTML = "";
      return;
    }

    banner.classList.add("show");
    banner.innerHTML = `
      <div class="upcoming-head">⚠ 다음 접종·검진 <span class="count">(${upcoming.length}건)</span></div>
      <div class="upcoming-list">
        ${upcoming.slice(0, 5).map(c => `
          <div class="upcoming-item">
            <span>${Storage.escapeHtml(c.name || "")} — ${formatDateFull(c.date)}</span>
            <span class="dday">D-${c.days}</span>
          </div>`).join("")}
      </div>`;
  }

  function populateYearSelect(allRaw) {
    const select = document.getElementById("checkupYearSelect");
    if (!select) return;
    const years = new Set(allRaw.filter(c => c.date).map(c => Number(c.date.slice(0, 4))));
    years.add(selectedYear);
    years.add(new Date().getFullYear());
    const sorted = Array.from(years).sort((a, b) => b - a);
    select.innerHTML = sorted.map(y => `<option value="${y}"${y === selectedYear ? " selected" : ""}>${y}년</option>`).join("");
  }

  function renderGroup(title, badgeClass, items, emptyMsg) {
    return `
      <div class="checkup-group">
        <div class="checkup-group-head">
          <span class="badge ${badgeClass}">${title}</span>
          <span class="checkup-group-count">${items.length}건</span>
        </div>
        ${items.length ? items.map(renderCard).join("") : `<div class="empty-state small"><p>${emptyMsg}</p></div>`}
      </div>`;
  }

  function render() {
    const listEl = document.getElementById("checkupList");
    if (!listEl) return;

    const allRaw = Storage.getCheckups(AppState.memberId).slice();
    populateYearSelect(allRaw);

    document.getElementById("checkupCount").textContent = `${allRaw.length}건`;
    renderUpcomingBanner(allRaw);

    const all = allRaw
      .filter(c => c.date && Number(c.date.slice(0, 4)) === selectedYear)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .filter(c => !(formMode && typeof formMode === "object" && formMode.edit === c.id));

    const screenings = all.filter(c => c.type === "screening");
    const vaccines = all.filter(c => c.type !== "screening");

    const formHtml = formMode ? renderForm(formMode && typeof formMode === "object" ? findCheckup(formMode.edit) : null) : "";
    const groupsHtml =
      renderGroup("건강검진", "badge-blue", screenings, `${selectedYear}년에 건강검진 기록이 없습니다.`) +
      renderGroup("예방접종", "badge-green", vaccines, `${selectedYear}년에 예방접종 기록이 없습니다.`);

    listEl.innerHTML = formHtml + groupsHtml;
  }

  function renderCard(c) {
    const badgeClass = c.type === "screening" ? "badge-blue" : "badge-green";
    return `
      <div class="card ${c.type === "screening" ? "card-accent-blue" : "card-accent-green"}">
        <div class="card-head">
          <div class="card-head-left">
            <span class="badge ${badgeClass}">${Storage.escapeHtml(c.category || typeLabel(c.type))}</span>
            <span class="card-title">${Storage.escapeHtml(c.name || "")}</span>
            <span class="card-subtitle">${typeLabel(c.type)}</span>
          </div>
          <span style="display:flex; gap:10px;">
            <span class="card-link" data-action="edit" data-id="${c.id}">수정</span>
            <span class="card-link danger" data-action="delete" data-id="${c.id}">삭제</span>
          </span>
        </div>
        <div class="visit-grid">
          <div class="field"><span class="field-label">날짜</span><span class="field-box">${formatDateFull(c.date)}</span></div>
          <div class="field"><span class="field-label">구분</span><span class="field-box">${Storage.escapeHtml(c.category || "-")}</span></div>
          <div class="field"><span class="field-label">상태</span><span class="field-box">${Storage.escapeHtml(c.status || "-")}</span></div>
        </div>
        ${c.resultMemo ? `<div class="memo-row"><span class="memo-label">결과 메모</span><span class="memo-box">${Storage.escapeHtml(c.resultMemo)}</span></div>` : ""}
      </div>`;
  }

  function renderForm(existing) {
    const c = existing || { type: "vaccine", category: "", name: "", date: Storage.toDateKey(AppState.selectedDate), status: "예정", resultMemo: "" };
    return `
      <div class="card card-accent-green" data-editing-id="${existing ? existing.id : ""}">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">${existing ? "접종·검진 수정" : "접종·검진 등록"}</span></div>
          <div class="toggle-group" id="checkupTypeToggle">
            <button type="button" class="toggle-btn${c.type !== "screening" ? " active" : ""}" data-type="vaccine">예방접종</button>
            <button type="button" class="toggle-btn${c.type === "screening" ? " active" : ""}" data-type="screening">건강검진</button>
          </div>
        </div>
        <input type="hidden" data-field="type" value="${c.type === "screening" ? "screening" : "vaccine"}">
        <div class="visit-grid">
          <div class="field"><span class="field-label">이름</span><input class="field-box" type="text" data-field="name" value="${Storage.escapeHtml(c.name || "")}" placeholder="예: 인플루엔자 4가"></div>
          <div class="field"><span class="field-label">날짜</span><input class="field-box" type="date" data-field="date" value="${c.date || ""}"></div>
          <div class="field"><span class="field-label">구분</span><input class="field-box" type="text" data-field="category" value="${Storage.escapeHtml(c.category || "")}" placeholder="예: 필수 / 국가 / 개인"></div>
          <div class="field">
            <span class="field-label">상태</span>
            <select class="field-box" data-field="status">
              <option value="예정"${c.status === "예정" ? " selected" : ""}>예정</option>
              <option value="완료"${c.status === "완료" ? " selected" : ""}>완료</option>
            </select>
          </div>
        </div>
        <div class="memo-row">
          <span class="memo-label">결과 메모</span>
          <textarea class="memo-box" data-field="resultMemo" placeholder="검사 결과, 경과관찰 사항 등">${Storage.escapeHtml(c.resultMemo || "")}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-action="cancel">취소</button>
          <button type="button" class="btn btn-primary" data-action="save">저장</button>
        </div>
      </div>`;
  }

  function onListClick(e) {
    const typeBtn = e.target.closest("#checkupTypeToggle button[data-type]");
    if (typeBtn) {
      const group = typeBtn.closest("#checkupTypeToggle");
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      typeBtn.classList.add("active");
      group.closest(".card").querySelector('input[data-field="type"]').value = typeBtn.dataset.type;
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "edit") {
      formMode = { edit: actionEl.dataset.id };
      render();
    } else if (action === "delete") {
      if (window.confirm("이 접종·검진 기록을 삭제할까요?")) {
        Storage.deleteCheckup(actionEl.dataset.id);
        refresh();
      }
    } else if (action === "cancel") {
      formMode = null;
      render();
    } else if (action === "save") {
      const cardEl = actionEl.closest(".card");
      const data = {};
      cardEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.name || !data.name.trim() || !data.date) {
        window.alert("이름과 날짜는 필수입니다.");
        return;
      }

      const editingId = cardEl.dataset.editingId;
      if (editingId) Storage.updateCheckup(editingId, data);
      else Storage.addCheckup(AppState.memberId, data);

      formMode = null;
      refresh();
    }
  }

  function openAddForm() {
    formMode = "add";
    render();
  }

  return { render, init, openAddForm };
})();
