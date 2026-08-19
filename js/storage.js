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

  function getProfile(memberId) {
    return read("profiles").find(p => p.memberId === memberId) || null;
  }

  function saveProfile(memberId, patch) {
    const list = read("profiles");
    const idx = list.findIndex(p => p.memberId === memberId);
    const now = new Date().toISOString();
    if (idx === -1) {
      const rec = {
        memberId, gender: null, birthDate: null, bloodType: null, heightCm: null, weightKg: null,
        createdAt: now, updatedAt: now,
        ...patch
      };
      list.push(rec);
      write("profiles", list);
      return rec;
    }
    list[idx] = { ...list[idx], ...patch, updatedAt: now };
    write("profiles", list);
    return list[idx];
  }

  function makeList(storeKey) {
    function getAll(memberId) {
      return read(storeKey).filter(x => x.memberId === memberId);
    }
    function add(memberId, item) {
      const list = read(storeKey);
      const now = new Date().toISOString();
      const rec = { id: uid(), memberId, createdAt: now, updatedAt: now, ...item };
      list.push(rec);
      write(storeKey, list);
      return rec;
    }
    function update(id, patch) {
      const list = read(storeKey);
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
      write(storeKey, list);
      return list[idx];
    }
    function remove(id) {
      write(storeKey, read(storeKey).filter(x => x.id !== id));
    }
    return { getAll, add, update, remove };
  }

  const conditionsStore = makeList("conditions");
  const medicationsStore = makeList("medications");
  const supplementsStore = makeList("supplements");

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
    if (!getProfile("self")) {
      saveProfile("self", {
        gender: "female",
        birthDate: "1990-05-14",
        bloodType: "A+",
        heightCm: 162,
        weightKg: 54
      });
    }
    if (conditionsStore.getAll("self").length === 0) {
      conditionsStore.add("self", { name: "알레르기성 비염", memo: "환절기에 증상이 심해짐" });
    }
    if (medicationsStore.getAll("self").length === 0) {
      medicationsStore.add("self", { name: "타이레놀", dosage: "500mg", frequency: "필요 시", memo: "두통·발열 시 복용" });
    }
    if (supplementsStore.getAll("self").length === 0) {
      supplementsStore.add("self", { name: "비타민D", dosage: "1000IU", frequency: "1일 1회", memo: "아침 식후" });
    }
  }

  return {
    toDateKey, escapeHtml,
    getVisits, addVisit, updateVisit, deleteVisit,
    getSymptoms, getSymptom, saveSymptom,
    getProfile, saveProfile,
    getConditions: conditionsStore.getAll,
    addCondition: conditionsStore.add,
    updateCondition: conditionsStore.update,
    deleteCondition: conditionsStore.remove,
    getMedications: medicationsStore.getAll,
    addMedication: medicationsStore.add,
    updateMedication: medicationsStore.update,
    deleteMedication: medicationsStore.remove,
    getSupplements: supplementsStore.getAll,
    addSupplement: supplementsStore.add,
    updateSupplement: supplementsStore.update,
    deleteSupplement: supplementsStore.remove,
    seedIfEmpty
  };
})();
