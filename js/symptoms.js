const Symptoms = (() => {
  const PRESET_TAGS = ["인후통", "오한", "두통", "복통"];

  function render() {
    const card = document.getElementById("symptomCard");
    if (!card) return;

    const dateKey = Storage.toDateKey(AppState.selectedDate);
    const rec = Storage.getSymptom(dateKey, AppState.memberId) ||
      { hasSymptom: null, tags: [], painLevel: null, temperature: null, action: "" };

    card.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <span class="badge" style="width:8px; height:8px; padding:0; border-radius:2px; background:#C08A5E;"></span>
          <span class="card-title">오늘의 증상</span>
          <span class="card-subtitle">병원에 가지 않아도 매일 기록</span>
        </div>
        <div class="toggle-group" id="symptomToggle">
          <button type="button" class="toggle-btn${rec.hasSymptom === true ? " active" : ""}" data-has="true">있음</button>
          <button type="button" class="toggle-btn${rec.hasSymptom === false ? " active" : ""}" data-has="false">없음</button>
        </div>
      </div>
      <div class="symptom-body">${renderBody(rec)}</div>
    `;

    bindEvents(card, dateKey, rec);
  }

  function renderBody(rec) {
    if (rec.hasSymptom === null) {
      return `<div class="symptom-hint">오늘 증상 여부를 선택해주세요.</div>`;
    }
    if (rec.hasSymptom === false) {
      return `
        <div class="symptom-row">
          <span class="row-label">메모</span>
          <input class="field-value grow" id="symptomAction" type="text"
            value="${Storage.escapeHtml(rec.action || "")}" placeholder="컨디션이나 기분을 입력해 보세요">
        </div>`;
    }
    const availableTags = Array.from(new Set([...PRESET_TAGS, ...(rec.tags || [])]));
    return `
      <div class="symptom-row">
        <span class="row-label">증상</span>
        <span class="tag-group" id="symptomTags">
          ${availableTags.map(t => `<button type="button" class="tag${rec.tags.includes(t) ? " active" : ""}" data-tag="${Storage.escapeHtml(t)}">${Storage.escapeHtml(t)}</button>`).join("")}
          <button type="button" class="tag dashed" id="symptomTagAdd">+ 직접 입력</button>
        </span>
      </div>
      <div class="symptom-row">
        <span class="row-label">통증 정도</span>
        <span class="pain-scale" id="symptomPain">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="pain-btn${rec.painLevel === n ? " active" : ""}" data-pain="${n}">${n}</button>`).join("")}
        </span>
        <span class="field-inline">체온</span>
        <input class="field-value" id="symptomTemp" type="number" step="0.1" style="width:78px;"
          value="${rec.temperature ?? ""}" placeholder="36.5">
      </div>
      <div class="symptom-row">
        <span class="row-label">대처</span>
        <input class="field-value grow" id="symptomAction" type="text"
          value="${Storage.escapeHtml(rec.action || "")}" placeholder="복용한 약, 조치 등">
      </div>`;
  }

  function save(dateKey, patch) {
    Storage.saveSymptom(dateKey, AppState.memberId, patch);
    if (typeof window.refreshAll === "function") window.refreshAll();
    else render();
  }

  function bindEvents(card, dateKey, rec) {
    card.querySelector("#symptomToggle").addEventListener("click", e => {
      const btn = e.target.closest("button[data-has]");
      if (!btn) return;
      save(dateKey, { hasSymptom: btn.dataset.has === "true" });
    });

    const tagGroup = card.querySelector("#symptomTags");
    if (tagGroup) {
      tagGroup.addEventListener("click", e => {
        if (e.target.closest("#symptomTagAdd")) {
          const value = window.prompt("증상을 입력하세요");
          if (value && value.trim()) {
            const tags = Array.from(new Set([...(rec.tags || []), value.trim()]));
            save(dateKey, { tags });
          }
          return;
        }
        const tagBtn = e.target.closest("button[data-tag]");
        if (!tagBtn) return;
        const tagSet = new Set(rec.tags || []);
        const tag = tagBtn.dataset.tag;
        if (tagSet.has(tag)) tagSet.delete(tag); else tagSet.add(tag);
        save(dateKey, { tags: Array.from(tagSet) });
      });
    }

    const painGroup = card.querySelector("#symptomPain");
    if (painGroup) {
      painGroup.addEventListener("click", e => {
        const btn = e.target.closest("button[data-pain]");
        if (!btn) return;
        save(dateKey, { painLevel: Number(btn.dataset.pain) });
      });
    }

    const tempInput = card.querySelector("#symptomTemp");
    if (tempInput) {
      tempInput.addEventListener("change", () => {
        save(dateKey, { temperature: tempInput.value === "" ? null : Number(tempInput.value) });
      });
    }

    const actionInput = card.querySelector("#symptomAction");
    if (actionInput) {
      actionInput.addEventListener("change", () => {
        save(dateKey, { action: actionInput.value });
      });
    }
  }

  return { render };
})();
