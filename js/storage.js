const Storage = (() => {
  const NS = "healthDiary";

  function read(key) {
    try {
      const raw = localStorage.getItem(`${NS}.${key}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function write(key, data) {
    localStorage.setItem(`${NS}.${key}`, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getVisits() {
    return read("visits");
  }

  function addVisit(visit) {
    const list = getVisits();
    const now = new Date().toISOString();
    const rec = { id: uid(), createdAt: now, updatedAt: now, ...visit };
    list.push(rec);
    write("visits", list);
    return rec;
  }

  function updateVisit(id, patch) {
    const list = getVisits();
    const idx = list.findIndex(v => v.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    write("visits", list);
    return list[idx];
  }

  function deleteVisit(id) {
    write("visits", getVisits().filter(v => v.id !== id));
  }

  function getSymptoms() {
    return read("symptoms");
  }

  function getSymptom(date, memberId) {
    return getSymptoms().find(s => s.date === date && s.memberId === memberId) || null;
  }

  function saveSymptom(date, memberId, patch) {
    const list = getSymptoms();
    const idx = list.findIndex(s => s.date === date && s.memberId === memberId);
    const now = new Date().toISOString();
    if (idx === -1) {
      const rec = {
        id: uid(), date, memberId,
        hasSymptom: null, tags: [], painLevel: null, temperature: null, action: "",
        createdAt: now, updatedAt: now,
        ...patch
      };
      list.push(rec);
      write("symptoms", list);
      return rec;
    }
    list[idx] = { ...list[idx], ...patch, updatedAt: now };
    write("symptoms", list);
    return list[idx];
  }

  function getLifeLogs() {
    return read("lifeLogs");
  }

  function getLifeLog(date, memberId) {
    return getLifeLogs().find(l => l.date === date && l.memberId === memberId) || null;
  }

  function saveLifeLog(date, memberId, patch) {
    const list = getLifeLogs();
    const idx = list.findIndex(l => l.date === date && l.memberId === memberId);
    const now = new Date().toISOString();
    if (idx === -1) {
      const rec = {
        id: uid(), date, memberId,
        meals: [], exerciseMin: null, sleepHours: null, waterMl: null,
        alcohol: false, caffeineMg: null, isPeriodDay: false, memo: "",
        createdAt: now, updatedAt: now,
        ...patch
      };
      list.push(rec);
      write("lifeLogs", list);
      return rec;
    }
    list[idx] = { ...list[idx], ...patch, updatedAt: now };
    write("lifeLogs", list);
    return list[idx];
  }

  function seedIfEmpty() {
    if (getVisits().length === 0) {
      addVisit({
        memberId: "self",
        date: "2026-08-08",
        time: "09:40",
        hospital: "서울연세내과의원",
        department: "내과",
        doctor: "박정우 원장",
        nextVisitDate: "2026-08-13",
        diagnosisMemo: "급성 인두염 소견. 신속항원 음성, CRP 정상 범위. 3일 내 열 지속되면 재방문 권유."
      });
    }
    if (!getSymptom("2026-08-08", "self")) {
      saveSymptom("2026-08-08", "self", {
        hasSymptom: true,
        tags: ["인후통", "오한"],
        painLevel: 3,
        temperature: 37.8,
        action: "타이레놀 1정 14:20 · 수분 1.2L"
      });
    }
    if (!getLifeLog("2026-08-08", "self")) {
      saveLifeLog("2026-08-08", "self", {
        meals: [
          { time: "08:10", memo: "죽, 계란찜" },
          { time: "12:40", memo: "미역국, 흰밥" },
          { time: "19:00", memo: "누룽지" }
        ],
        exerciseMin: 20,
        sleepHours: 6.5,
        waterMl: 1200,
        alcohol: false,
        caffeineMg: 0,
        isPeriodDay: false,
        memo: "미열로 산책만 짧게. 커피는 쉬었음."
      });
    }
  }

  return {
    toDateKey, escapeHtml,
    getVisits, addVisit, updateVisit, deleteVisit,
    getSymptoms, getSymptom, saveSymptom,
    getLifeLogs, getLifeLog, saveLifeLog,
    seedIfEmpty
  };
})();
