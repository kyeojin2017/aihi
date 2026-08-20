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

  // 생활 바이오리듬 — 날짜 + 구성원당 1건 (Supabase 교체 시 upsert 한 번으로 대응)
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
        meals: [], exerciseType: "", exerciseCustomLabel: "", exerciseIntensity: "", exerciseHours: null, exerciseMinutes: null,
        sleepHours: null, waterMl: null,
        alcohol: false, alcoholType: "", alcoholCustomLabel: "", alcoholBottles: null, alcoholGlasses: null,
        caffeineType: "", caffeineCups: null, isPeriodDay: false, memo: "",
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

  // 생리 주기 — 구성원당 1건 (마지막 시작일 + 평균 주기로 다음 예정일 계산)
  function getPeriodSettings(memberId) {
    return read("periodSettings").find(p => p.memberId === memberId) || null;
  }

  function savePeriodSettings(memberId, patch) {
    const list = read("periodSettings");
    const idx = list.findIndex(p => p.memberId === memberId);
    const now = new Date().toISOString();
    if (idx === -1) {
      const rec = {
        id: uid(), memberId,
        startDate: null, periodLength: null, cycleLength: null,
        createdAt: now, updatedAt: now,
        ...patch
      };
      list.push(rec);
      write("periodSettings", list);
      return rec;
    }
    list[idx] = { ...list[idx], ...patch, updatedAt: now };
    write("periodSettings", list);
    return list[idx];
  }

  function getFamilyMembers() {
    return read("familyMembers");
  }

  function getFamilyMember(id) {
    return getFamilyMembers().find(m => m.id === id) || null;
  }

  function addFamilyMember(data) {
    const list = getFamilyMembers();
    const now = new Date().toISOString();
    const rec = {
      id: uid(),
      name: "", relation: "", nickname: "",
      avatarLabel: (data.relation || data.name || "?").charAt(0),
      gender: null, birthDate: null, bloodType: null, heightCm: null, weightKg: null,
      createdAt: now, updatedAt: now,
      ...data
    };
    list.push(rec);
    write("familyMembers", list);
    return rec;
  }

  function updateFamilyMember(id, patch) {
    const list = getFamilyMembers();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return null;
    const next = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    if (next.relation) next.avatarLabel = next.relation.charAt(0);
    list[idx] = next;
    write("familyMembers", list);
    return list[idx];
  }

  function reorderFamilyMembers(draggedId, targetId) {
    const list = getFamilyMembers();
    const fromIdx = list.findIndex(m => m.id === draggedId);
    const toIdx = list.findIndex(m => m.id === targetId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    write("familyMembers", list);
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
  const prescriptionsStore = makeList("prescriptions");
  const checkupsStore = makeList("checkups");

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
        exerciseType: "걷기",
        exerciseHours: 0,
        exerciseMinutes: 20,
        sleepHours: 6.5,
        waterMl: 1200,
        alcohol: false,
        caffeineType: "",
        caffeineCups: 0,
        isPeriodDay: false,
        memo: "미열로 산책만 짧게. 커피는 쉬었음."
      });
    }
    if (getFamilyMembers().length === 0) {
      write("familyMembers", [
        {
          id: "self", name: "김하늘", relation: "본인", nickname: "", avatarLabel: "본",
          gender: "female", birthDate: "1990-05-14", bloodType: "A+", heightCm: 162, weightKg: 54,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        },
        {
          id: "spouse", name: "이수진", relation: "배우자", nickname: "", avatarLabel: "배",
          gender: null, birthDate: null, bloodType: null, heightCm: null, weightKg: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        },
        {
          id: "seojun", name: "서준", relation: "자녀", nickname: "서준", avatarLabel: "자",
          gender: null, birthDate: null, bloodType: null, heightCm: null, weightKg: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }
      ]);
    }
    const existingMembers = getFamilyMembers();
    const needsAvatarFix = existingMembers.some(m => m.relation && m.avatarLabel !== m.relation.charAt(0));
    if (needsAvatarFix) {
      write("familyMembers", existingMembers.map(m => (
        m.relation ? { ...m, avatarLabel: m.relation.charAt(0) } : m
      )));
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
    if (prescriptionsStore.getAll("self").length === 0) {
      const visit = getVisits().find(v => v.memberId === "self");
      prescriptionsStore.add("self", {
        visitId: visit ? visit.id : null,
        startDate: "2026-08-08",
        endDate: "2026-08-12",
        cautionMemo: "유제품·제산제와 2시간 간격 두기. 공복 복용 금지. 복용 중 음주 금지.",
        items: [
          { drugName: "세파클러 캡슐", dose: "250mg", frequency: "1일 3회", note: "식후 30분" },
          { drugName: "아세트아미노펜", dose: "500mg", frequency: "필요 시", note: "1일 최대 4정" },
          { drugName: "레바미피드", dose: "100mg", frequency: "1일 3회", note: "위 보호" }
        ]
      });
    }
    if (checkupsStore.getAll("self").length === 0) {
      checkupsStore.add("self", { type: "vaccine", category: "필수", name: "인플루엔자 4가", date: "2025-10-15", status: "완료", resultMemo: "" });
      checkupsStore.add("self", { type: "vaccine", category: "필수", name: "코로나19 추가접종", date: "2025-11-20", status: "완료", resultMemo: "" });
      checkupsStore.add("self", { type: "screening", category: "국가", name: "일반 건강검진", date: "2026-04-10", status: "완료", resultMemo: "콜레스테롤 경계, 6개월 뒤 재검." });
      checkupsStore.add("self", { type: "screening", category: "개인", name: "갑상선 초음파", date: "2026-06-02", status: "완료", resultMemo: "갑상선 결절 0.4cm 경과관찰." });
    }
  }

  return {
    toDateKey, escapeHtml,
    getVisits, addVisit, updateVisit, deleteVisit,
    getSymptoms, getSymptom, saveSymptom,
    getLifeLogs, getLifeLog, saveLifeLog,
    getPeriodSettings, savePeriodSettings,
    getFamilyMembers, getFamilyMember, addFamilyMember, updateFamilyMember, reorderFamilyMembers,
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
    getPrescriptions: prescriptionsStore.getAll,
    addPrescription: prescriptionsStore.add,
    updatePrescription: prescriptionsStore.update,
    deletePrescription: prescriptionsStore.remove,
    getCheckups: checkupsStore.getAll,
    addCheckup: checkupsStore.add,
    updateCheckup: checkupsStore.update,
    deleteCheckup: checkupsStore.remove,
    seedIfEmpty
  };
})();
