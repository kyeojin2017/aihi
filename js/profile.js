const Profile = (() => {
  const GENDER_LABEL = { male: "남성", female: "여성", other: "기타" };
  const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const RELATIONS = ["본인", "배우자", "자녀", "부모", "형제자매", "기타"];

  const ENTITY_CONFIG = {
    conditions: { title: "질병", addLabel: "+ 질병 추가", empty: "등록된 질병이 없습니다.", hasDoseFreq: false },
    medications: { title: "복용중인 약", addLabel: "+ 약 추가", empty: "복용중인 약이 없습니다.", hasDoseFreq: true },
    supplements: { title: "영양제", addLabel: "+ 영양제 추가", empty: "등록된 영양제가 없습니다.", hasDoseFreq: true }
  };

  const STORAGE_FN = {
    conditions: { getAll: Storage.getConditions, add: Storage.addCondition, update: Storage.updateCondition, remove: Storage.deleteCondition },
    medications: { getAll: Storage.getMedications, add: Storage.addMedication, update: Storage.updateMedication, remove: Storage.deleteMedication },
    supplements: { getAll: Storage.getSupplements, add: Storage.addSupplement, update: Storage.updateSupplement, remove: Storage.deleteSupplement }
  };

  let editingInfo = false;
  const formState = { conditions: null, medications: null, supplements: null };

  function calcAge(birthDate) {
    if (!birthDate) return null;
    const [y, m, d] = birthDate.split("-").map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
    return age;
  }

  function calcBmi(heightCm, weightKg) {
    if (!heightCm || !weightKg) return null;
    const h = Number(heightCm) / 100;
    if (!h) return null;
    return Math.round((Number(weightKg) / (h * h)) * 10) / 10;
  }

  function bmiCategory(bmi) {
    if (bmi === null) return "";
    if (bmi < 18.5) return "저체중";
    if (bmi < 23) return "정상";
    if (bmi < 25) return "과체중";
    return "비만";
  }

  function formatBirthDate(birthDate) {
    if (!birthDate) return "-";
    const [y, m, d] = birthDate.split("-");
    return `${y}.${m}.${d}`;
  }

  function render() {
    renderInfoCard();
    renderEntityCard("conditions");
    renderEntityCard("medications");
    renderEntityCard("supplements");
  }

  function renderInfoCard() {
    const el = document.getElementById("profileInfoCard");
    if (!el) return;
    const info = Storage.getFamilyMember(AppState.memberId) || {};
    el.innerHTML = editingInfo ? renderInfoForm(info) : renderInfoView(info);
  }

  function renderInfoView(info) {
    const age = calcAge(info.birthDate);
    const bmi = calcBmi(info.heightCm, info.weightKg);
    return `
      <div class="card-head">
        <div class="card-head-left"><span class="card-title">기본 정보</span></div>
        <span class="card-link" data-action="edit-info">수정</span>
      </div>
      <div class="visit-grid">
        <div class="field"><span class="field-label">이름</span><span class="field-box">${Storage.escapeHtml(info.name || "-")}</span></div>
        <div class="field"><span class="field-label">관계</span><span class="field-box">${Storage.escapeHtml(info.relation || "-")}</span></div>
        <div class="field"><span class="field-label">성별</span><span class="field-box">${GENDER_LABEL[info.gender] || "-"}</span></div>
        <div class="field"><span class="field-label">생년월일</span><span class="field-box">${formatBirthDate(info.birthDate)}${age !== null ? ` (만 ${age}세)` : ""}</span></div>
        <div class="field"><span class="field-label">혈액형</span><span class="field-box">${info.bloodType || "-"}</span></div>
        <div class="field"><span class="field-label">키</span><span class="field-box">${info.heightCm ? `${info.heightCm} cm` : "-"}</span></div>
        <div class="field"><span class="field-label">몸무게</span><span class="field-box">${info.weightKg ? `${info.weightKg} kg` : "-"}</span></div>
        <div class="field"><span class="field-label">BMI</span><span class="field-box accent">${bmi !== null ? `${bmi} · ${bmiCategory(bmi)}` : "-"}</span></div>
      </div>`;
  }

  function renderInfoForm(info) {
    return `
      <div class="card-head">
        <div class="card-head-left"><span class="card-title">기본 정보 수정</span></div>
      </div>
      <div class="visit-grid">
        <div class="field"><span class="field-label">이름</span><input class="field-box" type="text" data-field="name" value="${Storage.escapeHtml(info.name || "")}" placeholder="이름"></div>
        <div class="field">
          <span class="field-label">관계</span>
          <select class="field-box" data-field="relation">
            ${RELATIONS.map(r => `<option value="${r}"${info.relation === r ? " selected" : ""}>${r}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <span class="field-label">성별</span>
          <select class="field-box" data-field="gender">
            <option value="">선택 안 함</option>
            ${Object.entries(GENDER_LABEL).map(([v, label]) => `<option value="${v}"${info.gender === v ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <div class="field"><span class="field-label">생년월일</span><input class="field-box" type="date" data-field="birthDate" value="${info.birthDate || ""}"></div>
        <div class="field">
          <span class="field-label">혈액형</span>
          <select class="field-box" data-field="bloodType">
            <option value="">선택 안 함</option>
            ${BLOOD_TYPES.map(t => `<option value="${t}"${info.bloodType === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="field"><span class="field-label">키 (cm)</span><input class="field-box" type="number" step="0.1" data-field="heightCm" value="${info.heightCm ?? ""}" placeholder="예: 162"></div>
        <div class="field"><span class="field-label">몸무게 (kg)</span><input class="field-box" type="number" step="0.1" data-field="weightKg" value="${info.weightKg ?? ""}" placeholder="예: 54"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="cancel-info">취소</button>
        <button type="button" class="btn btn-primary" data-action="save-info">저장</button>
      </div>`;
  }

  function renderEntityCard(type) {
    const cfg = ENTITY_CONFIG[type];
    const container = document.getElementById(`${type}Card`);
    if (!container) return;

    const items = STORAGE_FN[type].getAll(AppState.memberId);
    const mode = formState[type];

    const formHtml = mode ? renderEntityForm(type, cfg, mode && typeof mode === "object" ? items.find(i => i.id === mode.edit) : null) : "";
    const itemsHtml = items
      .filter(i => !(mode && typeof mode === "object" && mode.edit === i.id))
      .map(i => renderEntityItem(type, i))
      .join("");

    container.innerHTML = `
      <div class="card-head">
        <div class="card-head-left"><span class="card-title" style="font-size:15px;">${cfg.title}</span></div>
        <span class="card-link" data-action="add" data-type="${type}">${cfg.addLabel}</span>
      </div>
      <div class="simple-list">
        ${formHtml}
        ${itemsHtml}
        ${!formHtml && items.length === 0 ? `<div class="symptom-hint">${cfg.empty}</div>` : ""}
      </div>`;
  }

  function renderEntityItem(type, item) {
    const metaParts = [item.dosage, item.frequency].filter(Boolean).map(Storage.escapeHtml);
    return `
      <div class="simple-item">
        <div class="simple-item-head">
          <span class="simple-item-name">${Storage.escapeHtml(item.name || "")}</span>
          <span class="simple-item-actions">
            <span class="card-link" data-action="edit" data-type="${type}" data-id="${item.id}">수정</span>
            <span class="card-link danger" data-action="delete" data-type="${type}" data-id="${item.id}">삭제</span>
          </span>
        </div>
        ${metaParts.length ? `<span class="simple-item-meta">${metaParts.join(" · ")}</span>` : ""}
        ${item.memo ? `<span class="simple-item-memo">${Storage.escapeHtml(item.memo)}</span>` : ""}
      </div>`;
  }

  function renderEntityForm(type, cfg, existing) {
    const v = existing || { name: "", dosage: "", frequency: "", memo: "" };
    return `
      <div class="simple-item simple-item-form" data-editing-id="${existing ? existing.id : ""}">
        <div class="field"><span class="field-label">이름</span><input class="field-box" type="text" data-field="name" value="${Storage.escapeHtml(v.name || "")}" placeholder="이름"></div>
        ${cfg.hasDoseFreq ? `
        <div style="display:flex; gap:10px;">
          <div class="field" style="flex:1;"><span class="field-label">용량</span><input class="field-box" type="text" data-field="dosage" value="${Storage.escapeHtml(v.dosage || "")}" placeholder="예: 500mg"></div>
          <div class="field" style="flex:1;"><span class="field-label">복용</span><input class="field-box" type="text" data-field="frequency" value="${Storage.escapeHtml(v.frequency || "")}" placeholder="예: 1일 1회"></div>
        </div>` : ""}
        <div class="field"><span class="field-label">메모</span><textarea class="memo-box" data-field="memo" placeholder="메모">${Storage.escapeHtml(v.memo || "")}</textarea></div>
        <div class="form-actions">
          <button type="button" class="btn" data-action="cancel" data-type="${type}">취소</button>
          <button type="button" class="btn btn-primary" data-action="save" data-type="${type}">저장</button>
        </div>
      </div>`;
  }

  function onRootClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "edit-info") { editingInfo = true; renderInfoCard(); return; }
    if (action === "cancel-info") { editingInfo = false; renderInfoCard(); return; }
    if (action === "save-info") {
      const cardEl = document.getElementById("profileInfoCard");
      const data = {};
      cardEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.name || !data.name.trim()) {
        window.alert("이름을 입력해주세요.");
        return;
      }
      data.heightCm = data.heightCm === "" ? null : Number(data.heightCm);
      data.weightKg = data.weightKg === "" ? null : Number(data.weightKg);
      data.birthDate = data.birthDate || null;
      data.gender = data.gender || null;
      data.bloodType = data.bloodType || null;
      Storage.updateFamilyMember(AppState.memberId, data);
      editingInfo = false;
      renderInfoCard();
      if (typeof window.refreshFamilyIdentity === "function") window.refreshFamilyIdentity();
      return;
    }

    const type = actionEl.dataset.type;
    if (!type || !ENTITY_CONFIG[type]) return;
    const store = STORAGE_FN[type];

    if (action === "add") {
      formState[type] = "add";
      renderEntityCard(type);
    } else if (action === "edit") {
      formState[type] = { edit: actionEl.dataset.id };
      renderEntityCard(type);
    } else if (action === "cancel") {
      formState[type] = null;
      renderEntityCard(type);
    } else if (action === "delete") {
      if (window.confirm("삭제할까요?")) {
        store.remove(actionEl.dataset.id);
        renderEntityCard(type);
      }
    } else if (action === "save") {
      const formEl = actionEl.closest(".simple-item-form");
      const data = {};
      formEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.name || !data.name.trim()) {
        window.alert("이름을 입력해주세요.");
        return;
      }
      const editingId = formEl.dataset.editingId;
      if (editingId) store.update(editingId, data);
      else store.add(AppState.memberId, data);
      formState[type] = null;
      renderEntityCard(type);
    }
  }

  function init() {
    const root = document.getElementById("profileSection");
    if (!root) return;
    root.addEventListener("click", onRootClick);
  }

  return { render, init };
})();
