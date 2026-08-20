const LifeLogs = (() => {
  const WATER_STEP = 250;
  const WATER_GOAL = 2000;
  let editingExerciseCustom = false;
  let editingExerciseDuration = false;
  let editingCaffeineCustom = false;
  let mealsVisible = true;
  let draggingAlcohol = false;
  let periodProjectionYear = null;

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

    panel.addEventListener("dragstart", e => {
      if (e.target.closest(".alcohol-detail")) {
        draggingAlcohol = true;
        e.dataTransfer.effectAllowed = "move";
      }
    });
    panel.addEventListener("dragover", e => {
      if (draggingAlcohol && e.target.closest("[data-drop-zone]")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    });
    panel.addEventListener("drop", async e => {
      const zone = e.target.closest("[data-drop-zone]");
      if (draggingAlcohol && zone) {
        e.preventDefault();
        const { rec } = await current();
        const meals = rec.meals || [];
        let position;
        if (zone.dataset.dropZone === "meal-row") {
          const idx = Number(zone.dataset.index);
          const rect = zone.getBoundingClientRect();
          const isTopHalf = (e.clientY - rect.top) < rect.height / 2;
          position = isTopHalf ? idx : idx + 1;
        } else {
          position = meals.length;
        }
        save({ alcoholPosition: position });
      }
      draggingAlcohol = false;
    });
    panel.addEventListener("dragend", () => { draggingAlcohol = false; });
  }

  async function current() {
    const dateKey = Storage.toDateKey(AppState.selectedDate);
    const rec = (await Storage.getLifeLog(dateKey, AppState.memberId)) || {
      meals: [], exerciseType: "", exerciseCustomLabel: "", exerciseIntensity: "", exerciseHours: null, exerciseMinutes: null,
      sleepHours: null, waterMl: null,
      alcohol: false, alcoholEntries: [], alcoholFood: "", alcoholPosition: 0,
      caffeineType: "", caffeineCustomLabel: "", caffeineCups: null, isPeriodDay: false, memo: ""
    };
    return { dateKey, rec };
  }

  async function save(patch) {
    const { dateKey } = await current();
    await Storage.saveLifeLog(dateKey, AppState.memberId, patch);
    if (typeof window.refreshAll === "function") await window.refreshAll();
    else await render();
  }

  function numOrNull(value) {
    return value === "" ? null : Number(value);
  }

  function to12Hour(h24) {
    const h = Number(h24);
    if (h === 0) return { period: "오전", hour: "12" };
    if (h < 12) return { period: "오전", hour: String(h) };
    if (h === 12) return { period: "오후", hour: "12" };
    return { period: "오후", hour: String(h - 12) };
  }

  function parseMealTime(timeStr) {
    if (!timeStr) return { period: "오전", hour: "", minute: "" };
    // 내부 저장 형식: "오전|시|분" — 시/분이 비어 있어도 오전/오후 선택은 보존한다
    const parts = timeStr.split("|");
    if (parts.length === 3 && (parts[0] === "오전" || parts[0] === "오후")) {
      return { period: parts[0], hour: parts[1], minute: parts[2] };
    }
    // 이전 자유입력 문자열("오후 12:30")이나 시드 데이터("08:10")도 인식한다
    const m = timeStr.match(/^(오전|오후)?\s*(\d{1,2}):(\d{1,2})$/);
    if (m) {
      if (m[1]) return { period: m[1], hour: m[2], minute: m[3] };
      const conv = to12Hour(m[2]);
      return { period: conv.period, hour: conv.hour, minute: m[3] };
    }
    return { period: "오전", hour: "", minute: "" };
  }

  function formatMealTime(period, hour, minute) {
    if (period === "오전" && !hour && !minute) return "";
    return `${period}|${hour}|${minute}`;
  }

  function computeNextPeriodDate(settings) {
    if (!settings || !settings.startDate) return null;
    const cycleLength = settings.cycleLength || 28;
    const [y, m, d] = settings.startDate.split("-").map(Number);
    return new Date(y, m - 1, d + Number(cycleLength));
  }

  async function computePeriodYearProjection(memberId, year, currentStartDate) {
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, day: null, isCurrent: false }));
    const entries = await Storage.getPeriodEntries(memberId);
    entries.forEach(en => {
      if (!en.date) return;
      const [ey, em, ed] = en.date.split("-").map(Number);
      if (ey !== year) return;
      months[em - 1].day = ed;
      if (en.date === currentStartDate) months[em - 1].isCurrent = true;
    });
    return months;
  }

  function formatMonthDay(date) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function formatDday(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);
    if (diff === 0) return "D-day";
    return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  }

  async function onChange(e) {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    const { rec } = await current();
    const field = el.dataset.field;

    if (field === "periodStartDate" || field === "periodLength" || field === "cycleLength") {
      const key = field === "periodStartDate" ? "startDate" : field;
      const value = field === "periodStartDate" ? (el.value || null) : numOrNull(el.value);
      if (field === "periodStartDate" && !value) {
        const prevSettings = await Storage.getPeriodSettings(AppState.memberId);
        if (prevSettings && prevSettings.startDate) await Storage.deletePeriodEntry(AppState.memberId, prevSettings.startDate);
      }
      await Storage.savePeriodSettings(AppState.memberId, { [key]: value });
      if (field === "periodStartDate" && value) await Storage.recordPeriodEntry(AppState.memberId, value);
      if (typeof window.refreshAll === "function") await window.refreshAll();
      else await render();
      return;
    }
    if (field === "mealMemo") {
      const idx = Number(el.dataset.index);
      const meals = (rec.meals || []).map((m, i) =>
        i === idx ? { ...m, memo: el.value } : m
      );
      save({ meals });
      return;
    }
    if (field === "mealHour" || field === "mealMinute") {
      const idx = Number(el.dataset.index);
      const digits = el.value.replace(/[^0-9]/g, "").slice(0, 2);
      el.value = digits;
      const meals = (rec.meals || []).map((m, i) => {
        if (i !== idx) return m;
        const parsed = parseMealTime(m.time);
        const hour = field === "mealHour" ? digits : parsed.hour;
        const minute = field === "mealMinute" ? digits : parsed.minute;
        return { ...m, time: formatMealTime(parsed.period, hour, minute) };
      });
      save({ meals });
      return;
    }
    if (field === "exerciseCustomLabel") {
      editingExerciseCustom = !el.value.trim();
      save({ [field]: el.value });
      return;
    }
    if (field === "caffeineCustomLabel") {
      editingCaffeineCustom = !el.value.trim();
      save({ [field]: el.value });
      return;
    }
    if (field === "alcoholFood") {
      save({ [field]: el.value });
      return;
    }
    if (field === "alcoholEntryLabel" || field === "alcoholEntryBottles" || field === "alcoholEntryGlasses") {
      const entryId = el.dataset.entryId;
      const key = field === "alcoholEntryLabel" ? "customLabel" : field === "alcoholEntryBottles" ? "bottles" : "glasses";
      const value = field === "alcoholEntryLabel" ? el.value : numOrNull(el.value);
      const entries = (rec.alcoholEntries || []).map(en => en.id === entryId ? { ...en, [key]: value } : en);
      save({ alcoholEntries: entries });
      return;
    }
    if (field === "exerciseHours" || field === "exerciseMinutes") {
      editingExerciseDuration = false;
      save({ [field]: numOrNull(el.value) });
      return;
    }
    save({ [field]: numOrNull(el.value) });
  }

  async function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { rec } = await current();
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
    } else if (action === "setMealPeriod") {
      const idx = Number(el.dataset.index);
      const meals = (rec.meals || []).map((m, i) => {
        if (i !== idx) return m;
        const parsed = parseMealTime(m.time);
        return { ...m, time: formatMealTime(el.dataset.value, parsed.hour, parsed.minute) };
      });
      save({ meals });
    } else if (action === "editDuration") {
      editingExerciseDuration = true;
      render();
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
      if (el.dataset.field === "caffeineType") {
        if (el.dataset.value === "기타") {
          editingCaffeineCustom = true;
        } else {
          patch.caffeineCustomLabel = "";
          editingCaffeineCustom = false;
        }
      }
      save(patch);
    } else if (action === "toggleAlcoholType") {
      const type = el.dataset.value;
      const entries = rec.alcoholEntries || [];
      const exists = entries.some(en => en.type === type);
      const nextEntries = exists
        ? entries.filter(en => en.type !== type)
        : [...entries, { id: Storage.uid(), type, customLabel: "", bottles: null, glasses: null }];
      save({ alcoholEntries: nextEntries, alcohol: true });
    } else if (action === "removeAlcoholEntry") {
      const entries = (rec.alcoholEntries || []).filter(en => en.id !== el.dataset.entryId);
      save({ alcoholEntries: entries });
    } else if (action === "toggleMeals") {
      mealsVisible = !mealsVisible;
      render();
    } else if (action === "periodProjectionYear") {
      const settings = (await Storage.getPeriodSettings(AppState.memberId)) || {};
      const base = periodProjectionYear ?? defaultPeriodProjectionYear(settings);
      periodProjectionYear = base + Number(el.dataset.delta);
      render();
    }
  }

  function closePickersOutside(e) {
    if (!e.target.closest(".metric-icon-wrap")) {
      document.querySelectorAll(".type-picker.open").forEach(p => p.classList.remove("open"));
    }
  }

  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  function sleepAverage(dateKey, logs, days) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < days; i++) {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      const key = Storage.toDateKey(day);
      const log = logs.find(l => l.date === key && l.memberId === AppState.memberId);
      if (log && log.sleepHours != null) { sum += log.sleepHours; count += 1; }
    }
    return { avg: count ? sum / count : null, count };
  }

  function sleepDailySeries(dateKey, logs, days) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      const key = Storage.toDateKey(day);
      const log = logs.find(l => l.date === key && l.memberId === AppState.memberId);
      series.push({ key, day, sleepHours: log && log.sleepHours != null ? log.sleepHours : null });
    }
    return series;
  }

  function sleepWeeklySeries(dateKey, logs, weeks) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const series = [];
    for (let w = weeks - 1; w >= 0; w--) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const offset = w * 7 + i;
        const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
        const key = Storage.toDateKey(day);
        const log = logs.find(l => l.date === key && l.memberId === AppState.memberId);
        if (log && log.sleepHours != null) { sum += log.sleepHours; count += 1; }
      }
      series.push({ weekLabel: `${weeks - w}주`, avg: count ? sum / count : null, count });
    }
    return series;
  }

  function renderSleepWeeklyBars(series) {
    const recorded = series.filter(w => w.avg != null);
    if (!recorded.length) return "";
    const max = Math.max(9, ...recorded.map(w => w.avg));
    return `
      <div class="sleep-bars weekly">
        ${series.map(w => {
          const has = w.avg != null;
          const pct = has ? Math.round((w.avg / max) * 100) : 0;
          return `
            <div class="sleep-bar-col">
              <span class="sleep-bar-track"><span class="sleep-bar-fill" style="height:${pct}%;"></span></span>
              <span class="sleep-bar-label">${w.weekLabel}</span>
            </div>`;
        }).join("")}
      </div>`;
  }

  function renderSleepBars(series, showWeekday) {
    const recorded = series.filter(d => d.sleepHours != null);
    if (!recorded.length) return "";
    const max = Math.max(9, ...recorded.map(d => d.sleepHours));
    return `
      <div class="sleep-bars${showWeekday ? "" : " compact"}">
        ${series.map(d => {
          const has = d.sleepHours != null;
          const pct = has ? Math.round((d.sleepHours / max) * 100) : 0;
          return `
            <div class="sleep-bar-col">
              <span class="sleep-bar-track"><span class="sleep-bar-fill" style="height:${pct}%;"></span></span>
              ${showWeekday ? `<span class="sleep-bar-label">${WEEKDAY_LABELS[d.day.getDay()]}</span>` : ""}
            </div>`;
        }).join("")}
      </div>`;
  }

  function renderSleepAverages(dateKey, logs) {
    const week = sleepAverage(dateKey, logs, 7);
    const month = sleepAverage(dateKey, logs, 30);
    const weekBars = renderSleepBars(sleepDailySeries(dateKey, logs, 7), true);
    const monthBars = renderSleepWeeklyBars(sleepWeeklySeries(dateKey, logs, 5));
    const box = (label, sub, data, barsHtml) => `
      <div class="card life-card sleep-avg-card">
        <div class="sleep-avg-label"><span class="section-icon tone-sleep">${icon("trend")}</span>${label}</div>
        ${data.avg != null
          ? `<div class="sleep-avg-value">${data.avg.toFixed(1)}<span class="stat-unit">시간</span></div>
             <div class="sleep-avg-sub">기록 ${data.count}일 · ${sub}</div>
             ${barsHtml}`
          : `<div class="life-empty">기록 없음</div>`}
      </div>`;
    return `
      <div class="sleep-avg-grid">
        ${box("주간 평균 수면", "최근 7일", week, weekBars)}
        ${box("월간 평균 수면", "최근 30일", month, monthBars)}
      </div>`;
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
  const ALCOHOL_TYPES = ["소주", "맥주", "와인", "막걸리", "위스키", "기타"];

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
    const collapsed = rec.exerciseHours > 0 && !rec.exerciseMinutes && !editingExerciseDuration;
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
          ${collapsed ? `
          <button type="button" class="metric-duo-group metric-duo-display" data-action="editDuration" aria-label="운동 시간 수정">
            <span class="metric-duo-display-value">${rec.exerciseHours}</span>
            <span class="metric-unit">시간</span>
          </button>` : `
          <span class="metric-duo-group">
            <input type="number" data-field="exerciseHours" value="${rec.exerciseHours ?? ""}" placeholder="0" step="1" min="0" aria-label="운동 시간">
            <span class="metric-unit">시간</span>
          </span>
          <span class="metric-duo-group">
            <input type="number" data-field="exerciseMinutes" value="${rec.exerciseMinutes ?? ""}" placeholder="0" step="5" min="0" max="59" aria-label="운동 분">
            <span class="metric-unit">분</span>
          </span>`}
        </span>
      </div>`;
  }

  function caffeineTile(rec) {
    const isCustom = rec.caffeineType === "기타";
    if (!isCustom) editingCaffeineCustom = false;
    const typeLabel = isCustom && rec.caffeineCustomLabel ? rec.caffeineCustomLabel : rec.caffeineType;
    const showCustomInput = isCustom && (editingCaffeineCustom || !rec.caffeineCustomLabel);
    return `
      <div class="metric tone-caffeine metric-compact">
        ${iconWithPicker("caffeine", "caffeine", "caffeineTypePicker", "카페인 음료 종류 선택",
          typePicker("caffeineTypePicker", "caffeineType", CAFFEINE_TYPES, rec.caffeineType))}
        <span class="metric-label">카페인${typeLabel ? `<span class="metric-type-tag">${Storage.escapeHtml(typeLabel)}</span>` : ""}</span>
        ${showCustomInput ? `<input type="text" class="metric-custom-input" data-field="caffeineCustomLabel" value="${Storage.escapeHtml(rec.caffeineCustomLabel || "")}" placeholder="음료 이름 입력">` : ""}
        <span class="metric-value">
          <input type="number" data-field="caffeineCups" value="${rec.caffeineCups ?? ""}" placeholder="0" step="1" min="0" aria-label="카페인 잔 수">
          <span class="metric-unit">잔</span>
        </span>
      </div>`;
  }

  function renderMealRow(meal, i) {
    const t = parseMealTime(meal.time);
    return `
      <div class="meal-row" data-drop-zone="meal-row" data-index="${i}">
        <div class="meal-time-input">
          <div class="meal-ampm">
            <button type="button" class="meal-ampm-btn${t.period === "오전" ? " active" : ""}" data-action="setMealPeriod" data-index="${i}" data-value="오전">오전</button>
            <button type="button" class="meal-ampm-btn${t.period === "오후" ? " active" : ""}" data-action="setMealPeriod" data-index="${i}" data-value="오후">오후</button>
          </div>
          <input class="meal-hm" type="text" inputmode="numeric" maxlength="2" data-field="mealHour" data-index="${i}"
            value="${Storage.escapeHtml(t.hour)}" placeholder="12" aria-label="식사 시">
          <span class="meal-hm-colon">:</span>
          <input class="meal-hm" type="text" inputmode="numeric" maxlength="2" data-field="mealMinute" data-index="${i}"
            value="${Storage.escapeHtml(t.minute)}" placeholder="00" aria-label="식사 분">
        </div>
        <input class="field-box" type="text" data-field="mealMemo" data-index="${i}"
          value="${Storage.escapeHtml(meal.memo || "")}" placeholder="먹은 음식">
        <button type="button" class="meal-remove" data-action="removeMeal" data-index="${i}" aria-label="식사 삭제">✕</button>
      </div>`;
  }

  function renderMeals(rec) {
    const meals = rec.meals || [];
    if (meals.length === 0) {
      return `<div class="life-empty">기록된 식사가 없습니다.</div>`;
    }
    return meals.map((meal, i) => renderMealRow(meal, i)).join("");
  }

  function multiTypePicker(id, options, selectedTypes) {
    return `
      <div class="type-picker" id="${id}">
        ${options.map(o => `<button type="button" class="type-chip${selectedTypes.includes(o) ? " active" : ""}" data-action="toggleAlcoholType" data-value="${o}">${o}</button>`).join("")}
      </div>`;
  }

  function qtySelect(entryId, field, value, max) {
    const opts = [];
    for (let n = 0; n <= max; n++) opts.push(n);
    return `
      <select class="alcohol-entry-qty-select" data-entry-id="${entryId}" data-field="${field}">
        ${opts.map(n => `<option value="${n}"${Number(value) === n ? " selected" : ""}>${n}</option>`).join("")}
      </select>`;
  }

  function renderAlcoholEntryRow(en) {
    const isCustom = en.type === "기타";
    return `
      <div class="alcohol-entry-row">
        ${isCustom
          ? `<input type="text" class="alcohol-entry-name-input" data-entry-id="${en.id}" data-field="alcoholEntryLabel" value="${Storage.escapeHtml(en.customLabel || "")}" placeholder="이름 입력">`
          : `<span class="alcohol-entry-name">${Storage.escapeHtml(en.type)}</span>`}
        <span class="alcohol-entry-qty">
          ${qtySelect(en.id, "alcoholEntryBottles", en.bottles ?? 0, 10)}
          <span class="alcohol-entry-unit">병</span>
        </span>
        <span class="alcohol-entry-qty">
          ${qtySelect(en.id, "alcoholEntryGlasses", en.glasses ?? 0, 15)}
          <span class="alcohol-entry-unit">잔</span>
        </span>
        <button type="button" class="alcohol-entry-remove" data-action="removeAlcoholEntry" data-entry-id="${en.id}" aria-label="삭제">✕</button>
      </div>`;
  }

  function renderAlcoholDetail(rec) {
    const entries = rec.alcoholEntries || [];
    const selectedTypes = entries.map(en => en.type);
    return `
      <div class="alcohol-detail tone-alcohol" draggable="true">
        <div class="metric-head-row">
          ${iconWithPicker("alcohol", "alcohol", "alcoholTypePicker", "음주 종류 선택",
            multiTypePicker("alcoholTypePicker", ALCOHOL_TYPES, selectedTypes))}
          <span class="metric-label">음주 종류</span>
          <button type="button" class="alcohol-remove" data-action="toggleAlcohol" aria-label="음주 기록 삭제">✕</button>
        </div>
        ${entries.length
          ? `<div class="alcohol-entries">${entries.map(renderAlcoholEntryRow).join("")}</div>`
          : `<div class="life-empty">종류를 선택해주세요.</div>`}
        <div class="field alcohol-food-field">
          <span class="field-label">함께 먹은 음식</span>
          <input class="field-box" type="text" data-field="alcoholFood" value="${Storage.escapeHtml(rec.alcoholFood || "")}" placeholder="예: 삼겹살, 골뱅이무침">
        </div>
      </div>`;
  }

  function renderPeriodRow(m) {
    return `
      <div class="period-projection-row">
        <span class="period-projection-month">🌸 ${m.month}월</span>
        ${m.day
          ? `<span class="period-projection-date">${m.day}일</span>${m.isCurrent ? `<span class="period-projection-tag">현재</span>` : ""}`
          : `<span class="period-projection-date empty">-</span>`}
      </div>`;
  }

  function defaultPeriodProjectionYear(settings) {
    return settings.startDate ? Number(settings.startDate.split("-")[0]) : new Date().getFullYear();
  }

  async function renderPeriodCard(rec) {
    const settings = (await Storage.getPeriodSettings(AppState.memberId)) || {};
    const nextDate = computeNextPeriodDate(settings);
    const year = periodProjectionYear ?? defaultPeriodProjectionYear(settings);
    const yearMonths = await computePeriodYearProjection(AppState.memberId, year, settings.startDate);
    return `
      <div class="card life-card">
        <div class="section-head">
          <span class="section-icon tone-period">${icon("period")}</span>
          <span class="section-title">월경</span>
        </div>
        <div class="period-split">
          <div class="period-inputs">
            <div class="visit-grid period-grid">
              <div class="field"><span class="field-label">생리 시작일</span><input class="field-box" type="date" data-field="periodStartDate" value="${settings.startDate || ""}"></div>
              <div class="field"><span class="field-label">생리일수</span><input class="field-box" type="number" min="1" max="14" data-field="periodLength" value="${settings.periodLength ?? ""}" placeholder="예: 5"></div>
              <div class="field"><span class="field-label">평균주기</span><input class="field-box" type="number" min="15" max="60" data-field="cycleLength" value="${settings.cycleLength ?? ""}" placeholder="예: 28"></div>
            </div>
            ${nextDate ? `
            <div class="period-next">
              <span class="period-next-label">다음 생리 예정일</span>
              <span class="period-next-value">${formatMonthDay(nextDate)}</span>
              <span class="period-dday">${formatDday(nextDate)}</span>
            </div>` : `<div class="symptom-hint">생리 시작일을 입력하면 다음 예정일을 계산합니다.</div>`}
          </div>
          <div class="period-projection">
            <div class="period-projection-title">
              <button type="button" class="period-year-nav" data-action="periodProjectionYear" data-delta="-1" aria-label="이전 년도">‹</button>
              <span>${year}년 생리 시작일</span>
              <button type="button" class="period-year-nav" data-action="periodProjectionYear" data-delta="1" aria-label="다음 년도">›</button>
            </div>
            <div class="period-projection-cols">
              <div class="period-projection-col">${yearMonths.slice(0, 6).map(renderPeriodRow).join("")}</div>
              <div class="period-projection-col">${yearMonths.slice(6).map(renderPeriodRow).join("")}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function render() {
    const body = document.getElementById("lifeBody");
    if (!body) return;

    const { dateKey, rec } = await current();
    const allLogs = await Storage.getLifeLogs();
    const periodCardHtml = await renderPeriodCard(rec);
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
            <button type="button" class="flag tone-meal${mealsVisible ? " on" : ""}" data-action="toggleMeals">
              <span class="flag-icon">${icon("meal")}</span>식사
            </button>
            <button type="button" class="flag tone-alcohol${rec.alcohol ? " on" : ""}" data-action="toggleAlcohol">
              <span class="flag-icon">${icon("alcohol")}</span>음주
            </button>
            ${mealsVisible ? `<button type="button" class="chip-btn" data-action="addMeal">+ 추가</button>` : ""}
          </span>
        </div>
        ${(() => {
          if (!mealsVisible) return rec.alcohol ? renderAlcoholDetail(rec) : "";
          if (!rec.alcohol) return `<div class="meal-list" data-drop-zone="meals">${renderMeals(rec)}</div>`;
          const meals = rec.meals || [];
          const pos = Math.max(0, Math.min(rec.alcoholPosition ?? 0, meals.length));
          const beforeHtml = meals.slice(0, pos).map((m, i) => renderMealRow(m, i)).join("");
          const afterHtml = meals.slice(pos).map((m, i) => renderMealRow(m, i + pos)).join("");
          const emptyHtml = meals.length === 0 ? `<div class="life-empty">기록된 식사가 없습니다.</div>` : "";
          return `<div class="meal-list" data-drop-zone="meals">${beforeHtml}${renderAlcoholDetail(rec)}${afterHtml}${emptyHtml}</div>`;
        })()}
      </div>

      ${periodCardHtml}

      ${renderSleepAverages(dateKey, allLogs)}
    `;
  }

  return { init, render };
})();
