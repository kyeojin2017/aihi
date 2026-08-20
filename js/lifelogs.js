const LifeLogs = (() => {
  const WATER_STEP = 250;
  const WATER_GOAL = 2000;
  const TREND_DAYS = 7;
  let editingExerciseCustom = false;

  // 카드 아이콘 — 외부 라이브러리 없이 인라인 SVG로 그린다
  const ICON = {
    sleep: `<path d="M17.5 12.8A6.5 6.5 0 0 1 9.2 4.5a7 7 0 1 0 8.3 8.3Z"/>`,
    water: `<path d="M12 3.5c3 3.6 5.5 6.6 5.5 9.4a5.5 5.5 0 0 1-11 0c0-2.8 2.5-5.8 5.5-9.4Z"/>`,
    exercise: `<path d="M5 9v6M8 7.5v9M16 7.5v9M19 9v6M8 12h8"/>`,
    caffeine: `<path d="M5 8h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8ZM16 9.5h1.5a2.25 2.25 0 0 1 0 4.5H16M6 20h11"/>`,
    meal: `<path d="M6 3.5v7M9 3.5v7M7.5 10.5V20M15 3.5c-1.2 1.6-1.5 3.4-1.5 5.2 0 1.5.7 2.3 2 2.3h1.5V20"/>`,
    trend: `<path d="M4 16.5 9 11l3.5 3.5L20 7"/><path d="M15.5 7H20v4.5"/>`,
    alcohol: `<path d="M7 4h10l-1 5a4 4 0 0 1-8 0Z"/><path d="M12 13v6M9 19h6"/>`,
    period: `<path d="M12 3.5c3 3.6 5.5 6.6 5.5 9.4a5.5 5.5 0 0 1-11 0c0-2.8 2.5-5.8 5.5-9.4Z"/><path d="M12 16.5v.01"/>`,
    status: `<path d="M12 4.5 13.9 9l4.6.4-3.5 3.1 1 4.5-4-2.4-4 2.4 1-4.5L5.5 9.4 10.1 9Z"/>`
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
  }

  function init() {
    const panel = document.getElementById("biorhythmSection");
    if (!panel) return;
    panel.addEventListener("click", onClick);
    panel.addEventListener("change", onChange);
    document.addEventListener("click", closePickersOutside);
  }

  function current() {
    const dateKey = Storage.toDateKey(AppState.selectedDate);
    const rec = Storage.getLifeLog(dateKey, AppState.memberId) || {
      meals: [], exerciseType: "", exerciseCustomLabel: "", exerciseIntensity: "", exerciseHours: null, exerciseMinutes: null,
      sleepHours: null, waterMl: null,
      alcohol: false, caffeineType: "", caffeineCups: null, isPeriodDay: false, memo: ""
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
    if (field === "exerciseCustomLabel") {
      editingExerciseCustom = !el.value.trim();
      save({ [field]: el.value });
      return;
    }
    if (field === "memo") {
      save({ [field]: el.value });
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
    } else if (action === "toggleTypePicker") {
      const popover = document.getElementById(el.dataset.target);
      const wasOpen = popover.classList.contains("open");
      document.querySelectorAll(".type-picker.open").forEach(p => p.classList.remove("open"));
      if (!wasOpen) popover.classList.add("open");
    } else if (action === "pickType") {
      const patch = { [el.dataset.field]: el.dataset.value };
      if (el.dataset.field === "exerciseType") {
        if (el.dataset.value === "기타") {
          editingExerciseCustom = true;
        } else {
          patch.exerciseCustomLabel = "";
          editingExerciseCustom = false;
        }
      }
      save(patch);
    }
  }

  function closePickersOutside(e) {
    if (!e.target.closest(".metric-icon-wrap")) {
      document.querySelectorAll(".type-picker.open").forEach(p => p.classList.remove("open"));
    }
  }

  function trendData(dateKey, logs) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const days = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      const key = Storage.toDateKey(day);
      const log = logs.find(l => l.date === key && l.memberId === AppState.memberId);
      days.push({ key, day, sleepHours: log && log.sleepHours != null ? log.sleepHours : null });
    }
    return days;
  }

  function renderTrend(dateKey, logs) {
    const days = trendData(dateKey, logs);
    const recorded = days.filter(d => d.sleepHours != null);
    if (recorded.length === 0) {
      return `<div class="life-empty">아직 수면 기록이 없습니다. 수면 시간을 입력하면 여기에 추이가 쌓입니다.</div>`;
    }
    const max = Math.max(9, ...recorded.map(d => d.sleepHours));
    const avg = recorded.reduce((sum, d) => sum + d.sleepHours, 0) / recorded.length;

    return `
      <div class="trend-bars">
        ${days.map(d => {
          const has = d.sleepHours != null;
          const pct = has ? Math.round((d.sleepHours / max) * 100) : 0;
          const selected = d.key === dateKey;
          return `
            <div class="trend-col${selected ? " selected" : ""}">
              <span class="trend-value">${has ? d.sleepHours : "·"}</span>
              <span class="trend-track"><span class="trend-fill" style="height:${pct}%;"></span></span>
              <span class="trend-day">${d.day.getDate()}</span>
            </div>`;
        }).join("")}
      </div>
      <div class="trend-note">기록한 ${recorded.length}일 평균 <strong>${avg.toFixed(1)}시간</strong></div>`;
  }

  function metricTile({ tone, name, label, unit, value, field, step, min, max, extra }) {
    const shown = value == null ? "" : value;
    return `
      <div class="metric tone-${tone} metric-compact">
        <span class="metric-icon">${icon(name)}</span>
        <span class="metric-label">${label}</span>
        <span class="metric-value">
          <input type="number" data-field="${field}" value="${shown}" placeholder="0"
            step="${step}" min="${min}"${max ? ` max="${max}"` : ""} aria-label="${label}">
          <span class="metric-unit">${unit}</span>
        </span>
        ${extra || ""}
      </div>`;
  }

  const EXERCISE_TYPES = ["걷기", "달리기", "자전거", "수영", "헬스", "요가", "등산", "기타"];
  const CAFFEINE_TYPES = ["커피", "에너지드링크", "차", "탄산음료", "기타"];

  function typePicker(id, field, options, value) {
    return `
      <div class="type-picker" id="${id}">
        ${options.map(o => `<button type="button" class="type-chip${value === o ? " active" : ""}" data-action="pickType" data-field="${field}" data-value="${o}">${o}</button>`).join("")}
      </div>`;
  }

  function iconWithPicker(tone, name, pickerId, ariaLabel, popoverHtml) {
    return `
      <span class="metric-icon-wrap">
        <button type="button" class="metric-icon" data-action="toggleTypePicker" data-target="${pickerId}" aria-label="${ariaLabel}">${icon(name)}</button>
        ${popoverHtml}
      </span>`;
  }

  const INTENSITY_LEVELS = ["하", "중", "상"];

  function exerciseTile(rec) {
    const isCustom = rec.exerciseType === "기타";
    if (!isCustom) editingExerciseCustom = false;
    const typeLabel = isCustom && rec.exerciseCustomLabel ? rec.exerciseCustomLabel : rec.exerciseType;
    const showCustomInput = isCustom && (editingExerciseCustom || !rec.exerciseCustomLabel);
    const showMinutes = !(rec.exerciseHours > 0 && !rec.exerciseMinutes);
    return `
      <div class="metric tone-exercise metric-compact">
        <div class="metric-head-row">
          ${iconWithPicker("exercise", "exercise", "exerciseTypePicker", "운동 종류 선택",
            typePicker("exerciseTypePicker", "exerciseType", EXERCISE_TYPES, rec.exerciseType))}
          <div class="metric-intensity-inline">
            <span class="metric-intensity-label">운동강도</span>
            ${INTENSITY_LEVELS.map(lv => `<button type="button" class="type-chip mini${rec.exerciseIntensity === lv ? " active" : ""}" data-action="pickType" data-field="exerciseIntensity" data-value="${lv}">${lv}</button>`).join("")}
          </div>
        </div>
        <span class="metric-label">운동${typeLabel ? `<span class="metric-type-tag">${Storage.escapeHtml(typeLabel)}</span>` : ""}</span>
        ${showCustomInput ? `<input type="text" class="metric-custom-input" data-field="exerciseCustomLabel" value="${Storage.escapeHtml(rec.exerciseCustomLabel || "")}" placeholder="운동 이름 입력">` : ""}
        <span class="metric-duo">
          <span class="metric-duo-group">
            <input type="number" data-field="exerciseHours" value="${rec.exerciseHours ?? ""}" placeholder="0" step="1" min="0" aria-label="운동 시간">
            <span class="metric-unit">시간</span>
          </span>
          ${showMinutes ? `
          <span class="metric-duo-group">
            <input type="number" data-field="exerciseMinutes" value="${rec.exerciseMinutes ?? ""}" placeholder="0" step="5" min="0" max="59" aria-label="운동 분">
            <span class="metric-unit">분</span>
          </span>` : ""}
        </span>
      </div>`;
  }

  function caffeineTile(rec) {
    return `
      <div class="metric tone-caffeine metric-compact">
        ${iconWithPicker("caffeine", "caffeine", "caffeineTypePicker", "카페인 음료 종류 선택",
          typePicker("caffeineTypePicker", "caffeineType", CAFFEINE_TYPES, rec.caffeineType))}
        <span class="metric-label">카페인${rec.caffeineType ? `<span class="metric-type-tag">${Storage.escapeHtml(rec.caffeineType)}</span>` : ""}</span>
        <span class="metric-value">
          <input type="number" data-field="caffeineCups" value="${rec.caffeineCups ?? ""}" placeholder="0" step="1" min="0" aria-label="카페인 잔 수">
          <span class="metric-unit">잔</span>
        </span>
      </div>`;
  }

  function renderMeals(rec) {
    const meals = rec.meals || [];
    if (meals.length === 0) {
      return `<div class="life-empty">기록된 식사가 없습니다.</div>`;
    }
    return meals.map((meal, i) => `
      <div class="meal-row">
        <input class="field-box meal-time" type="time" data-field="mealTime" data-index="${i}"
          value="${Storage.escapeHtml(meal.time || "")}" aria-label="식사 시간">
        <input class="field-box" type="text" data-field="mealMemo" data-index="${i}"
          value="${Storage.escapeHtml(meal.memo || "")}" placeholder="먹은 음식">
        <button type="button" class="meal-remove" data-action="removeMeal" data-index="${i}" aria-label="식사 삭제">✕</button>
      </div>`).join("");
  }

  function render() {
    const body = document.getElementById("lifeBody");
    if (!body) return;

    const { dateKey, rec } = current();
    const allLogs = Storage.getLifeLogs();
    const d = AppState.selectedDate;
    document.getElementById("lifeDate").textContent =
      `${d.getMonth() + 1}월 ${d.getDate()}일 기록`;
    document.getElementById("lifeDatePicker").value = dateKey;

    const water = rec.waterMl || 0;
    const waterPct = Math.min(100, Math.round((water / WATER_GOAL) * 100));

    body.innerHTML = `
      <div class="metric-grid">
        ${metricTile({
          tone: "sleep", name: "sleep", label: "수면", unit: "시간",
          value: rec.sleepHours, field: "sleepHours", step: "0.5", min: "0", max: "24"
        })}
        ${metricTile({
          tone: "water", name: "water", label: "수분", unit: "ml",
          value: rec.waterMl, field: "waterMl", step: "50", min: "0",
          extra: `
            <div class="metric-progress"><span style="width:${waterPct}%"></span></div>
            <div class="metric-actions">
              <button type="button" data-action="water" data-delta="-${WATER_STEP}" aria-label="250ml 빼기">−</button>
              <span class="metric-hint">목표의 ${waterPct}%</span>
              <button type="button" data-action="water" data-delta="${WATER_STEP}" aria-label="250ml 더하기">+</button>
            </div>`
        })}
        ${exerciseTile(rec)}
        ${caffeineTile(rec)}
      </div>

      <div class="card life-card">
        <div class="section-head">
          <span class="section-icon tone-meal">${icon("meal")}</span>
          <span class="section-title">식사</span>
          <span class="section-count">${(rec.meals || []).length}끼</span>
          <span class="section-actions">
            <button type="button" class="flag tone-alcohol${rec.alcohol ? " on" : ""}" data-action="toggleAlcohol">
              <span class="flag-icon">${icon("alcohol")}</span>음주
            </button>
            <button type="button" class="chip-btn" data-action="addMeal">+ 추가</button>
          </span>
        </div>
        <div class="meal-list">${renderMeals(rec)}</div>
      </div>

      <div class="card life-card">
        <div class="section-head">
          <span class="section-icon tone-period">${icon("period")}</span>
          <span class="section-title">월경</span>
        </div>
        <div class="flag-row">
          <button type="button" class="flag tone-period${rec.isPeriodDay ? " on" : ""}" data-action="togglePeriod">
            <span class="flag-icon">${icon("period")}</span>오늘 월경일
          </button>
        </div>
      </div>

      <div class="card life-card">
        <div class="section-head">
          <span class="section-icon tone-caffeine">${icon("status")}</span>
          <span class="section-title">메모</span>
        </div>
        <textarea class="life-memo" data-field="memo"
          placeholder="컨디션, 특이사항을 적어두세요">${Storage.escapeHtml(rec.memo || "")}</textarea>
      </div>

      <div class="card life-card">
        <div class="section-head">
          <span class="section-icon tone-sleep">${icon("trend")}</span>
          <span class="section-title">수면 추이</span>
          <span class="section-count">최근 7일</span>
        </div>
        <div class="trend">${renderTrend(dateKey, allLogs)}</div>
      </div>
    `;
  }

  return { init, render };
})();
