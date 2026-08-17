const LifeLogs = (() => {
  const WATER_STEP = 250;
  const TREND_DAYS = 7;

  function init() {
    const panel = document.getElementById("lifePanel");
    if (!panel) return;
    panel.addEventListener("click", onClick);
    panel.addEventListener("change", onChange);
  }

  function current() {
    const dateKey = Storage.toDateKey(AppState.selectedDate);
    const rec = Storage.getLifeLog(dateKey, AppState.memberId) || {
      meals: [], exerciseMin: null, sleepHours: null, waterMl: null,
      alcohol: false, caffeineMg: null, isPeriodDay: false, memo: ""
    };
    return { dateKey, rec };
  }

  function save(patch) {
    const { dateKey } = current();
    Storage.saveLifeLog(dateKey, AppState.memberId, patch);
    if (typeof window.refreshAll === "function") window.refreshAll();
    else render();
  }

  function numOrNull(value) {
    return value === "" ? null : Number(value);
  }

  function onChange(e) {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    const { rec } = current();
    const field = el.dataset.field;

    if (field === "mealTime" || field === "mealMemo") {
      const idx = Number(el.dataset.index);
      const meals = (rec.meals || []).map((m, i) =>
        i === idx ? { ...m, [field === "mealTime" ? "time" : "memo"]: el.value } : m
      );
      save({ meals });
      return;
    }
    if (field === "memo") {
      save({ memo: el.value });
      return;
    }
    save({ [field]: numOrNull(el.value) });
  }

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { rec } = current();
    const action = el.dataset.action;

    if (action === "addMeal") {
      save({ meals: [...(rec.meals || []), { time: "", memo: "" }] });
    } else if (action === "removeMeal") {
      const idx = Number(el.dataset.index);
      save({ meals: (rec.meals || []).filter((_, i) => i !== idx) });
    } else if (action === "water") {
      const next = Math.max(0, (rec.waterMl || 0) + Number(el.dataset.delta));
      save({ waterMl: next });
    } else if (action === "toggleAlcohol") {
      save({ alcohol: !rec.alcohol });
    } else if (action === "togglePeriod") {
      save({ isPeriodDay: !rec.isPeriodDay });
    }
  }

  function trendData(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const days = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      const key = Storage.toDateKey(day);
      const log = Storage.getLifeLog(key, AppState.memberId);
      days.push({ key, day, sleepHours: log && log.sleepHours != null ? log.sleepHours : null });
    }
    return days;
  }

  function renderTrend(dateKey) {
    const days = trendData(dateKey);
    const recorded = days.filter(d => d.sleepHours != null);
    if (recorded.length === 0) {
      return `<div class="life-trend-empty">최근 7일간 수면 기록이 없습니다.</div>`;
    }
    const max = Math.max(9, ...recorded.map(d => d.sleepHours));
    const avg = recorded.reduce((sum, d) => sum + d.sleepHours, 0) / recorded.length;

    return `
      <div class="life-trend-bars">
        ${days.map(d => {
          const has = d.sleepHours != null;
          const pct = has ? Math.round((d.sleepHours / max) * 100) : 0;
          const isSelected = d.key === dateKey;
          return `
            <div class="life-trend-col${isSelected ? " selected" : ""}">
              <span class="life-trend-value">${has ? d.sleepHours : ""}</span>
              <span class="life-trend-track"><span class="life-trend-fill${has ? "" : " none"}" style="height:${pct}%;"></span></span>
              <span class="life-trend-day">${d.day.getDate()}</span>
            </div>`;
        }).join("")}
      </div>
      <div class="life-trend-note">기록된 ${recorded.length}일 평균 <strong>${avg.toFixed(1)}시간</strong></div>`;
  }

  function renderMeals(rec) {
    const meals = rec.meals || [];
    if (meals.length === 0) {
      return `<div class="life-hint">기록된 식사가 없습니다.</div>`;
    }
    return meals.map((meal, i) => `
      <div class="meal-row">
        <input class="field-box meal-time" type="time" data-field="mealTime" data-index="${i}" value="${Storage.escapeHtml(meal.time || "")}">
        <input class="field-box" type="text" data-field="mealMemo" data-index="${i}"
          value="${Storage.escapeHtml(meal.memo || "")}" placeholder="먹은 음식">
        <button type="button" class="meal-remove" data-action="removeMeal" data-index="${i}" aria-label="식사 삭제">✕</button>
      </div>`).join("");
  }

  function render() {
    const body = document.getElementById("lifeBody");
    if (!body) return;

    const { dateKey, rec } = current();
    const d = AppState.selectedDate;
    document.getElementById("lifeDate").textContent =
      `${d.getMonth() + 1}월 ${d.getDate()}일 기록`;

    body.innerHTML = `
      <div class="card life-card">
        <div class="card-head">
          <div class="card-head-left">
            <span class="card-title">식사</span>
            <span class="card-subtitle">시간과 먹은 음식을 남겨두면 증상과 함께 볼 수 있습니다</span>
          </div>
          <span class="card-link" data-action="addMeal">+ 식사 추가</span>
        </div>
        <div class="meal-list">${renderMeals(rec)}</div>
      </div>

      <div class="card life-card">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">활동 · 수면</span></div>
        </div>
        <div class="life-grid">
          <div class="field">
            <span class="field-label">운동 (분)</span>
            <input class="field-box" type="number" min="0" step="5" data-field="exerciseMin"
              value="${rec.exerciseMin ?? ""}" placeholder="0">
          </div>
          <div class="field">
            <span class="field-label">수면 (시간)</span>
            <input class="field-box" type="number" min="0" max="24" step="0.5" data-field="sleepHours"
              value="${rec.sleepHours ?? ""}" placeholder="7.5">
          </div>
          <div class="field">
            <span class="field-label">카페인 (mg)</span>
            <input class="field-box" type="number" min="0" step="10" data-field="caffeineMg"
              value="${rec.caffeineMg ?? ""}" placeholder="0">
          </div>
        </div>
      </div>

      <div class="card life-card">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">수분</span></div>
          <span class="water-total">${(rec.waterMl || 0).toLocaleString()} ml</span>
        </div>
        <div class="water-row">
          <button type="button" class="btn" data-action="water" data-delta="-${WATER_STEP}">− ${WATER_STEP}</button>
          <button type="button" class="btn" data-action="water" data-delta="${WATER_STEP}">+ ${WATER_STEP}</button>
          <input class="field-box water-input" type="number" min="0" step="50" data-field="waterMl"
            value="${rec.waterMl ?? ""}" placeholder="직접 입력">
          <span class="water-hint">한 컵 ${WATER_STEP}ml 기준</span>
        </div>
      </div>

      <div class="card life-card">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">그 밖의 기록</span></div>
        </div>
        <div class="life-flags">
          <button type="button" class="toggle-btn${rec.alcohol ? " active" : ""}" data-action="toggleAlcohol">음주</button>
          <button type="button" class="toggle-btn${rec.isPeriodDay ? " active" : ""}" data-action="togglePeriod">월경</button>
        </div>
        <div class="memo-row">
          <span class="memo-label">메모</span>
          <textarea class="memo-box" data-field="memo" placeholder="컨디션, 특이사항 등">${Storage.escapeHtml(rec.memo || "")}</textarea>
        </div>
      </div>

      <div class="card life-card">
        <div class="card-head">
          <div class="card-head-left">
            <span class="card-title">수면 추이</span>
            <span class="card-subtitle">최근 7일</span>
          </div>
        </div>
        <div class="life-trend">${renderTrend(dateKey)}</div>
      </div>
    `;
  }

  return { init, render };
})();
