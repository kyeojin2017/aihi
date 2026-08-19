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

  // ---- family members ----

  async function getFamilyMembers() {
    return read("familyMembers");
  }

  async function ensureSeedFamilyMembers() {
    const existing = read("familyMembers");
    if (existing.length > 0) return existing;
    const defaults = [
      { id: "self", name: "본인", avatarLabel: "나" },
      { id: "spouse", name: "배우자", avatarLabel: "배" },
      { id: "seojun", name: "서준", avatarLabel: "아" }
    ];
    write("familyMembers", defaults);
    return defaults;
  }

  // ---- visits ----

  async function getVisits() {
    return read("visits");
  }

  async function addVisit(visit) {
    const list = read("visits");
    const now = new Date().toISOString();
    const rec = { id: uid(), createdAt: now, updatedAt: now, ...visit };
    list.push(rec);
    write("visits", list);
    return rec;
  }

  async function updateVisit(id, patch) {
    const list = read("visits");
    const idx = list.findIndex(v => v.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    write("visits", list);
    return list[idx];
  }

  async function deleteVisit(id) {
    write("visits", read("visits").filter(v => v.id !== id));
  }

  // ---- symptoms ----

  async function getSymptoms() {
    return read("symptoms");
  }

  async function getSymptom(date, memberId) {
    return read("symptoms").find(s => s.date === date && s.memberId === memberId) || null;
  }

  async function saveSymptom(date, memberId, patch) {
    const list = read("symptoms");
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

  async function seedSampleData() {
    const visits = read("visits");
    if (visits.length === 0) {
      await addVisit({
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
    if (!(await getSymptom("2026-08-08", "self"))) {
      await saveSymptom("2026-08-08", "self", {
        hasSymptom: true,
        tags: ["인후통", "오한"],
        painLevel: 3,
        temperature: 37.8,
        action: "타이레놀 1정 14:20 · 수분 1.2L"
      });
    }
  }

  return {
    toDateKey, escapeHtml,
    getFamilyMembers, ensureSeedFamilyMembers,
    getVisits, addVisit, updateVisit, deleteVisit,
    getSymptoms, getSymptom, saveSymptom,
    seedSampleData
  };
})();
