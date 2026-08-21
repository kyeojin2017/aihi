const Storage = (() => {
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

  function nowIso() {
    return new Date().toISOString();
  }

  async function currentUserId() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session ? data.session.user.id : null;
  }

  // Converts a DB row (snake_case) into a JS object (camelCase) using [dbKey, jsKey] pairs.
  function mapRow(row, pairs) {
    const out = {};
    pairs.forEach(([dbKey, jsKey]) => { out[jsKey] = row[dbKey]; });
    return out;
  }

  // Converts a partial JS object (camelCase) into a DB row patch (snake_case), only including
  // keys that are actually present in obj so partial updates/upserts behave like a merge.
  function toRow(obj, pairs) {
    const out = {};
    pairs.forEach(([dbKey, jsKey]) => {
      if (obj[jsKey] !== undefined) out[dbKey] = obj[jsKey];
    });
    return out;
  }

  function throwIfError(error) {
    if (error) throw error;
  }

  // ---- family members ----

  const FAMILY_PAIRS = [
    ["id", "id"], ["name", "name"], ["relation", "relation"], ["nickname", "nickname"],
    ["avatar_label", "avatarLabel"], ["gender", "gender"], ["birth_date", "birthDate"],
    ["blood_type", "bloodType"], ["height_cm", "heightCm"], ["weight_kg", "weightKg"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];

  async function getFamilyMembers() {
    const { data, error } = await supabaseClient
      .from("family_members")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map(row => mapRow(row, FAMILY_PAIRS));
  }

  async function getFamilyMember(id) {
    if (!id) return null;
    const { data, error } = await supabaseClient.from("family_members").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapRow(data, FAMILY_PAIRS);
  }

  async function addFamilyMember(data) {
    const ownerId = await currentUserId();
    const { data: existing } = await supabaseClient
      .from("family_members").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const nextOrder = existing && existing.length ? (existing[0].sort_order || 0) + 1 : 0;
    const row = {
      owner_id: ownerId,
      name: data.name || "",
      relation: data.relation || "",
      nickname: data.nickname || "",
      avatar_label: (data.relation || data.name || "?").charAt(0),
      gender: data.gender ?? null,
      birth_date: data.birthDate ?? null,
      blood_type: data.bloodType ?? null,
      height_cm: data.heightCm ?? null,
      weight_kg: data.weightKg ?? null,
      sort_order: nextOrder
    };
    const { data: inserted, error } = await supabaseClient.from("family_members").insert(row).select().single();
    throwIfError(error);
    return mapRow(inserted, FAMILY_PAIRS);
  }

  async function updateFamilyMember(id, patch) {
    const row = toRow(patch, FAMILY_PAIRS);
    delete row.id;
    if (patch.relation) row.avatar_label = patch.relation.charAt(0);
    row.updated_at = nowIso();
    const { data, error } = await supabaseClient.from("family_members").update(row).eq("id", id).select().single();
    throwIfError(error);
    return mapRow(data, FAMILY_PAIRS);
  }

  async function deleteFamilyMember(id) {
    const { error } = await supabaseClient.from("family_members").delete().eq("id", id);
    throwIfError(error);
  }

  async function reorderFamilyMembers(draggedId, targetId) {
    const list = await getFamilyMembers();
    const fromIdx = list.findIndex(m => m.id === draggedId);
    const toIdx = list.findIndex(m => m.id === targetId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    await Promise.all(list.map((m, i) => supabaseClient.from("family_members").update({ sort_order: i }).eq("id", m.id)));
  }

  async function ensureDefaultMember() {
    const members = await getFamilyMembers();
    if (members.length) return members;
    const created = await addFamilyMember({ relation: "본인", nickname: "" });
    return [created];
  }

  // ---- visits ----

  const VISIT_PAIRS = [
    ["id", "id"], ["member_id", "memberId"], ["date", "date"], ["time", "time"],
    ["hospital", "hospital"], ["department", "department"], ["doctor", "doctor"],
    ["next_visit_date", "nextVisitDate"], ["diagnosis_memo", "diagnosisMemo"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];

  async function getVisits() {
    const { data, error } = await supabaseClient.from("visits").select("*");
    if (error) { console.error(error); return []; }
    return (data || []).map(row => mapRow(row, VISIT_PAIRS));
  }

  async function addVisit(visit) {
    const row = toRow(visit, VISIT_PAIRS);
    delete row.id;
    const { data, error } = await supabaseClient.from("visits").insert(row).select().single();
    throwIfError(error);
    return mapRow(data, VISIT_PAIRS);
  }

  async function updateVisit(id, patch) {
    const row = toRow(patch, VISIT_PAIRS);
    delete row.id;
    row.updated_at = nowIso();
    const { data, error } = await supabaseClient.from("visits").update(row).eq("id", id).select().single();
    throwIfError(error);
    return mapRow(data, VISIT_PAIRS);
  }

  async function deleteVisit(id) {
    const { error } = await supabaseClient.from("visits").delete().eq("id", id);
    throwIfError(error);
  }

  // ---- symptoms (one row per member+date) ----

  const SYMPTOM_PAIRS = [
    ["id", "id"], ["member_id", "memberId"], ["date", "date"], ["has_symptom", "hasSymptom"],
    ["tags", "tags"], ["pain_level", "painLevel"], ["temperature", "temperature"], ["action", "action"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];

  async function getSymptoms() {
    const { data, error } = await supabaseClient.from("symptoms").select("*");
    if (error) { console.error(error); return []; }
    return (data || []).map(row => mapRow(row, SYMPTOM_PAIRS));
  }

  async function getSymptom(date, memberId) {
    const { data, error } = await supabaseClient
      .from("symptoms").select("*").eq("date", date).eq("member_id", memberId).maybeSingle();
    if (error || !data) return null;
    return mapRow(data, SYMPTOM_PAIRS);
  }

  async function saveSymptom(date, memberId, patch) {
    const row = toRow(patch, SYMPTOM_PAIRS);
    delete row.id;
    row.date = date;
    row.member_id = memberId;
    row.updated_at = nowIso();
    const { data, error } = await supabaseClient
      .from("symptoms").upsert(row, { onConflict: "member_id,date" }).select().single();
    throwIfError(error);
    return mapRow(data, SYMPTOM_PAIRS);
  }

  // ---- life logs (one jsonb blob per member+date, schema is too free-form for fixed columns) ----

  const DEFAULT_LIFELOG = {
    meals: [], exerciseType: "", exerciseCustomLabel: "", exerciseIntensity: "", exerciseHours: null, exerciseMinutes: null,
    sleepHours: null, waterMl: null,
    alcohol: false, alcoholEntries: [], alcoholFood: "", alcoholPosition: 0,
    caffeineType: "", caffeineCustomLabel: "", caffeineCups: null, isPeriodDay: false, memo: ""
  };

  function mapLifeLog(row) {
    return {
      id: row.id, memberId: row.member_id, date: row.date,
      ...DEFAULT_LIFELOG, ...(row.data || {}),
      createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  async function getLifeLogs() {
    const { data, error } = await supabaseClient.from("life_logs").select("*");
    if (error) { console.error(error); return []; }
    return (data || []).map(mapLifeLog);
  }

  async function getLifeLog(date, memberId) {
    const { data, error } = await supabaseClient
      .from("life_logs").select("*").eq("date", date).eq("member_id", memberId).maybeSingle();
    if (error || !data) return null;
    return mapLifeLog(data);
  }

  async function saveLifeLog(date, memberId, patch) {
    const existing = await getLifeLog(date, memberId);
    const merged = { ...(existing || DEFAULT_LIFELOG), ...patch };
    delete merged.id; delete merged.memberId; delete merged.date; delete merged.createdAt; delete merged.updatedAt;
    const row = { member_id: memberId, date, data: merged, updated_at: nowIso() };
    const { data: result, error } = await supabaseClient
      .from("life_logs").upsert(row, { onConflict: "member_id,date" }).select().single();
    throwIfError(error);
    return mapLifeLog(result);
  }

  // ---- period settings (one row per member) ----

  const PERIOD_SETTINGS_PAIRS = [
    ["id", "id"], ["member_id", "memberId"], ["start_date", "startDate"],
    ["period_length", "periodLength"], ["cycle_length", "cycleLength"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];

  async function getPeriodSettings(memberId) {
    const { data, error } = await supabaseClient
      .from("period_settings").select("*").eq("member_id", memberId).maybeSingle();
    if (error || !data) return null;
    return mapRow(data, PERIOD_SETTINGS_PAIRS);
  }

  async function savePeriodSettings(memberId, patch) {
    const row = toRow(patch, PERIOD_SETTINGS_PAIRS);
    delete row.id;
    row.member_id = memberId;
    row.updated_at = nowIso();
    const { data, error } = await supabaseClient
      .from("period_settings").upsert(row, { onConflict: "member_id" }).select().single();
    throwIfError(error);
    return mapRow(data, PERIOD_SETTINGS_PAIRS);
  }

  // ---- period entries (actual recorded period-start days) ----

  async function getPeriodEntries(memberId) {
    const { data, error } = await supabaseClient.from("period_entries").select("*").eq("member_id", memberId);
    if (error) { console.error(error); return []; }
    return (data || []).map(row => ({ id: row.id, memberId: row.member_id, date: row.date, createdAt: row.created_at }));
  }

  async function recordPeriodEntry(memberId, date) {
    if (!date) return;
    const { error } = await supabaseClient
      .from("period_entries").upsert({ member_id: memberId, date }, { onConflict: "member_id,date" });
    throwIfError(error);
  }

  async function deletePeriodEntry(memberId, date) {
    if (!date) return;
    const { error } = await supabaseClient.from("period_entries").delete().eq("member_id", memberId).eq("date", date);
    throwIfError(error);
  }

  // ---- simple member-scoped lists (conditions / medications / supplements / checkups) ----

  function makeSupaList(table, pairs) {
    async function getAll(memberId) {
      const { data, error } = await supabaseClient
        .from(table).select("*").eq("member_id", memberId).order("created_at", { ascending: true });
      if (error) { console.error(error); return []; }
      return (data || []).map(row => mapRow(row, pairs));
    }
    async function add(memberId, item) {
      const row = toRow(item, pairs);
      delete row.id;
      row.member_id = memberId;
      const { data, error } = await supabaseClient.from(table).insert(row).select().single();
      throwIfError(error);
      return mapRow(data, pairs);
    }
    async function update(id, patch) {
      const row = toRow(patch, pairs);
      delete row.id;
      if (pairs.some(([dbKey]) => dbKey === "updated_at")) row.updated_at = nowIso();
      const { data, error } = await supabaseClient.from(table).update(row).eq("id", id).select().single();
      throwIfError(error);
      return mapRow(data, pairs);
    }
    async function remove(id) {
      const { error } = await supabaseClient.from(table).delete().eq("id", id);
      throwIfError(error);
    }
    return { getAll, add, update, remove };
  }

  const CONDITION_PAIRS = [["id", "id"], ["member_id", "memberId"], ["name", "name"], ["memo", "memo"], ["created_at", "createdAt"]];
  const MEDICATION_PAIRS = [["id", "id"], ["member_id", "memberId"], ["name", "name"], ["dosage", "dosage"], ["frequency", "frequency"], ["memo", "memo"], ["created_at", "createdAt"]];
  const SUPPLEMENT_PAIRS = MEDICATION_PAIRS;
  const CHECKUP_PAIRS = [
    ["id", "id"], ["member_id", "memberId"], ["type", "type"], ["category", "category"], ["name", "name"],
    ["date", "date"], ["status", "status"], ["result_memo", "resultMemo"], ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];

  const conditionsStore = makeSupaList("conditions", CONDITION_PAIRS);
  const medicationsStore = makeSupaList("medications", MEDICATION_PAIRS);
  const supplementsStore = makeSupaList("supplements", SUPPLEMENT_PAIRS);
  const checkupsStore = makeSupaList("checkups", CHECKUP_PAIRS);

  // ---- prescriptions (+ nested prescription_items) ----

  const PRESCRIPTION_PAIRS = [
    ["id", "id"], ["member_id", "memberId"], ["visit_id", "visitId"], ["start_date", "startDate"],
    ["end_date", "endDate"], ["caution_memo", "cautionMemo"], ["created_at", "createdAt"], ["updated_at", "updatedAt"]
  ];
  const ITEM_PAIRS = [["id", "id"], ["drug_name", "drugName"], ["dose", "dose"], ["frequency", "frequency"], ["note", "note"]];

  function mapPrescription(row) {
    const base = mapRow(row, PRESCRIPTION_PAIRS);
    base.items = (row.prescription_items || []).map(it => mapRow(it, ITEM_PAIRS));
    return base;
  }

  async function getPrescriptionById(id) {
    const { data, error } = await supabaseClient.from("prescriptions").select("*, prescription_items(*)").eq("id", id).single();
    throwIfError(error);
    return mapPrescription(data);
  }

  async function getPrescriptions(memberId) {
    const { data, error } = await supabaseClient
      .from("prescriptions").select("*, prescription_items(*)").eq("member_id", memberId)
      .order("start_date", { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(mapPrescription);
  }

  async function writePrescriptionItems(prescriptionId, items) {
    const valid = (items || []).filter(it => it.drugName && it.drugName.trim());
    if (!valid.length) return;
    const rows = valid.map(it => {
      const row = toRow(it, ITEM_PAIRS);
      delete row.id;
      row.prescription_id = prescriptionId;
      return row;
    });
    const { error } = await supabaseClient.from("prescription_items").insert(rows);
    throwIfError(error);
  }

  async function addPrescription(memberId, item) {
    const row = toRow(item, PRESCRIPTION_PAIRS);
    delete row.id;
    row.member_id = memberId;
    const { data, error } = await supabaseClient.from("prescriptions").insert(row).select().single();
    throwIfError(error);
    await writePrescriptionItems(data.id, item.items);
    return getPrescriptionById(data.id);
  }

  async function updatePrescription(id, patch) {
    const row = toRow(patch, PRESCRIPTION_PAIRS);
    delete row.id;
    row.updated_at = nowIso();
    const { error } = await supabaseClient.from("prescriptions").update(row).eq("id", id);
    throwIfError(error);
    if (patch.items) {
      const { error: delErr } = await supabaseClient.from("prescription_items").delete().eq("prescription_id", id);
      throwIfError(delErr);
      await writePrescriptionItems(id, patch.items);
    }
    return getPrescriptionById(id);
  }

  async function deletePrescription(id) {
    const { error } = await supabaseClient.from("prescriptions").delete().eq("id", id);
    throwIfError(error);
  }

  // ---- one-time migration of legacy localStorage data (pre-Supabase) into the user's account ----

  function readLegacy(key) {
    try {
      const raw = localStorage.getItem(`healthDiary.${key}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async function migrateLegacyDataIfNeeded() {
    if (localStorage.getItem("healthDiary.migrated") === "1") return;
    localStorage.setItem("healthDiary.migrated", "1");

    const oldMembers = readLegacy("familyMembers");
    if (!oldMembers.length) return;

    try {
      const existing = await getFamilyMembers();
      const reusable = existing.filter(m => !m.name && !m.nickname && !m.birthDate && !m.bloodType);
      const idMap = {};

      for (const om of oldMembers) {
        const payload = {
          name: om.name || "", relation: om.relation || "", nickname: om.nickname || "",
          gender: om.gender ?? null, birthDate: om.birthDate ?? null, bloodType: om.bloodType ?? null,
          heightCm: om.heightCm ?? null, weightKg: om.weightKg ?? null
        };
        const target = reusable.shift();
        idMap[om.id] = target ? (await updateFamilyMember(target.id, payload)).id : (await addFamilyMember(payload)).id;
      }

      const visitIdMap = {};
      for (const v of readLegacy("visits")) {
        const nm = idMap[v.memberId];
        if (!nm) continue;
        const created = await addVisit({
          memberId: nm, date: v.date, time: v.time || "", hospital: v.hospital || "",
          department: v.department || "", doctor: v.doctor || "",
          nextVisitDate: v.nextVisitDate || null, diagnosisMemo: v.diagnosisMemo || ""
        });
        visitIdMap[v.id] = created.id;
      }

      for (const s of readLegacy("symptoms")) {
        const nm = idMap[s.memberId];
        if (!nm) continue;
        await saveSymptom(s.date, nm, {
          hasSymptom: s.hasSymptom, tags: s.tags || [], painLevel: s.painLevel ?? null,
          temperature: s.temperature ?? null, action: s.action || ""
        });
      }

      for (const l of readLegacy("lifeLogs")) {
        const nm = idMap[l.memberId];
        if (!nm) continue;
        const { id, memberId, date, createdAt, updatedAt, ...rest } = l;
        await saveLifeLog(l.date, nm, rest);
      }

      for (const p of readLegacy("periodSettings")) {
        const nm = idMap[p.memberId];
        if (!nm) continue;
        await savePeriodSettings(nm, { startDate: p.startDate, periodLength: p.periodLength, cycleLength: p.cycleLength });
      }

      for (const e of readLegacy("periodEntries")) {
        const nm = idMap[e.memberId];
        if (!nm) continue;
        await recordPeriodEntry(nm, e.date);
      }

      for (const c of readLegacy("conditions")) {
        const nm = idMap[c.memberId];
        if (!nm) continue;
        await conditionsStore.add(nm, { name: c.name, memo: c.memo || "" });
      }

      for (const m of readLegacy("medications")) {
        const nm = idMap[m.memberId];
        if (!nm) continue;
        await medicationsStore.add(nm, { name: m.name, dosage: m.dosage || "", frequency: m.frequency || "", memo: m.memo || "" });
      }

      for (const s of readLegacy("supplements")) {
        const nm = idMap[s.memberId];
        if (!nm) continue;
        await supplementsStore.add(nm, { name: s.name, dosage: s.dosage || "", frequency: s.frequency || "", memo: s.memo || "" });
      }

      for (const c of readLegacy("checkups")) {
        const nm = idMap[c.memberId];
        if (!nm) continue;
        await checkupsStore.add(nm, {
          type: c.type, category: c.category || "", name: c.name, date: c.date || null,
          status: c.status || "", resultMemo: c.resultMemo || ""
        });
      }

      for (const p of readLegacy("prescriptions")) {
        const nm = idMap[p.memberId];
        if (!nm) continue;
        await addPrescription(nm, {
          visitId: p.visitId ? (visitIdMap[p.visitId] || null) : null,
          startDate: p.startDate, endDate: p.endDate || null, cautionMemo: p.cautionMemo || "",
          items: (p.items || []).map(it => ({ drugName: it.drugName, dose: it.dose || "", frequency: it.frequency || "", note: it.note || "" }))
        });
      }

      console.log("[migration] legacy local data moved to Supabase.");
    } catch (err) {
      console.error("[migration] failed:", err);
    }
  }

  return {
    toDateKey, escapeHtml, uid,
    getVisits, addVisit, updateVisit, deleteVisit,
    getSymptoms, getSymptom, saveSymptom,
    getLifeLogs, getLifeLog, saveLifeLog,
    getPeriodSettings, savePeriodSettings,
    getPeriodEntries,
    recordPeriodEntry,
    deletePeriodEntry,
    getFamilyMembers, getFamilyMember, addFamilyMember, updateFamilyMember, deleteFamilyMember, reorderFamilyMembers,
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
    getPrescriptions, addPrescription, updatePrescription, deletePrescription,
    getCheckups: checkupsStore.getAll,
    addCheckup: checkupsStore.add,
    updateCheckup: checkupsStore.update,
    deleteCheckup: checkupsStore.remove,
    ensureDefaultMember,
    migrateLegacyDataIfNeeded
  };
})();
