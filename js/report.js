const Report = (() => {
  let period = "month"; // "month" | "year"
  let activeDetail = null; // null | "visit" | "rx" | "symptom" | "checkup"

  function init() {
    document.getElementById("reportPeriodToggle").addEventListener("click", e => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      period = btn.dataset.period;
      activeDetail = null;
      render();
    });
    document.getElementById("reportBody").addEventListener("click", e => {
      const el = e.target.closest("[data-action='toggleDetail']");
      if (!el) return;
      activeDetail = activeDetail === el.dataset.stat ? null : el.dataset.stat;
      render();
    });
  }

  function daysOverlap(startA, endA, startB, endB) {
    const s = startA > startB ? startA : startB;
    const e = endA < endB ? endA : endB;
    const diff = Math.round((e - s) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  }

  function getRange(year, month) {
    const rangeStart = month === null ? new Date(year, 0, 1) : new Date(year, month, 1);
    const rangeEnd = month === null ? new Date(year, 11, 31) : new Date(year, month + 1, 0);
    return { rangeStart, rangeEnd };
  }

  function inRangeFn(rangeStart, rangeEnd) {
    return dateKey => {
      if (!dateKey) return false;
      const d = new Date(dateKey);
      return d >= rangeStart && d <= rangeEnd;
    };
  }

  async function computeSummary(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month);
    const inRange = inRangeFn(rangeStart, rangeEnd);

    const [visitsRaw, symptomsRaw, prescriptions, checkups] = await Promise.all([
      Storage.getVisits(), Storage.getSymptoms(), Storage.getPrescriptions(memberId), Storage.getCheckups(memberId)
    ]);
    const visits = visitsRaw.filter(v => v.memberId === memberId && v.date);
    const symptoms = symptomsRaw.filter(s => s.memberId === memberId);

    const visitCount = visits.filter(v => inRange(v.date)).length;
    const prescriptionCount = prescriptions.filter(p => inRange(p.startDate)).length;
    const symptomDays = symptoms.filter(s => s.hasSymptom && inRange(s.date)).length;
    const checkupCount = checkups.filter(c => inRange(c.date)).length;

    return { visitCount, prescriptionCount, symptomDays, checkupCount };
  }

  async function computeDeptBreakdown(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month == null ? null : month);
    const inRange = inRangeFn(rangeStart, rangeEnd);
    const visits = (await Storage.getVisits()).filter(v => v.memberId === memberId && v.department && inRange(v.date));
    const counts = {};
    visits.forEach(v => { counts[v.department] = (counts[v.department] || 0) + 1; });
    const rows = Object.entries(counts).map(([name, count]) => ({ name, count }));
    rows.sort((a, b) => b.count - a.count);
    const max = rows.length ? rows[0].count : 0;
    return rows.map(r => ({ ...r, pct: max ? Math.round((r.count / max) * 100) : 0 }));
  }

  async function computeVisitList(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month);
    const inRange = inRangeFn(rangeStart, rangeEnd);
    return (await Storage.getVisits())
      .filter(v => v.memberId === memberId && inRange(v.date))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(v => ({ date: v.date, hospital: v.hospital || "-", department: v.department || "" }));
  }

  async function computePrescriptionList(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month);
    const inRange = inRangeFn(rangeStart, rangeEnd);
    return (await Storage.getPrescriptions(memberId))
      .filter(p => inRange(p.startDate))
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))
      .map(p => ({
        date: p.startDate,
        drugNames: (p.items || []).map(it => it.drugName).filter(Boolean).join(", ") || "-"
      }));
  }

  async function computeSymptomBreakdown(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month);
    const inRange = inRangeFn(rangeStart, rangeEnd);
    const symptoms = (await Storage.getSymptoms()).filter(s => s.memberId === memberId && s.hasSymptom && inRange(s.date));
    const tagCounts = {};
    let painSum = 0;
    let painCount = 0;
    symptoms.forEach(s => {
      (s.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (s.painLevel != null) { painSum += s.painLevel; painCount += 1; }
    });
    const tagRows = Object.entries(tagCounts).map(([name, count]) => ({ name, count }));
    tagRows.sort((a, b) => b.count - a.count);
    const max = tagRows.length ? tagRows[0].count : 0;
    return {
      totalDays: symptoms.length,
      avgPain: painCount ? Math.round((painSum / painCount) * 10) / 10 : null,
      tagRows: tagRows.map(r => ({ ...r, pct: max ? Math.round((r.count / max) * 100) : 0 }))
    };
  }

  async function computeCheckupList(memberId, year, month) {
    const { rangeStart, rangeEnd } = getRange(year, month);
    const inRange = inRangeFn(rangeStart, rangeEnd);
    return (await Storage.getCheckups(memberId))
      .filter(c => inRange(c.date))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(c => ({
        name: c.name || "-",
        date: c.date,
        type: c.type === "vaccine" ? "예방접종" : "검진",
        category: c.category || ""
      }));
  }

  function formatMonthDay(dateKey) {
    if (!dateKey) return "-";
    const [, m, d] = dateKey.split("-").map(Number);
    return `${m}월 ${d}일`;
  }

  async function renderDeptDetail(memberId, year, month) {
    const [rows, visits] = await Promise.all([
      computeDeptBreakdown(memberId, year, month), computeVisitList(memberId, year, month)
    ]);
    return `
      <div class="report-detail">
        <div class="dept-title">진료과별 방문 횟수</div>
        ${rows.length ? `
        <div class="report-detail-list">
          ${rows.map(r => `<div class="report-detail-row symptom-row"><span class="symptom-pill">${Storage.escapeHtml(r.name)}</span><span class="report-detail-count">${r.count}회</span></div>`).join("")}
        </div>` : `<div class="symptom-hint">방문 기록이 없습니다.</div>`}
      </div>
      <div class="report-detail">
        <div class="dept-title">방문 날짜 · 병원</div>
        ${visits.length ? `
        <div class="report-detail-boxes">
          ${visits.map(v => `
            <div class="report-detail-box">
              <span class="report-detail-date">${Storage.escapeHtml(formatMonthDay(v.date))}</span>
              <span class="report-detail-text">${Storage.escapeHtml(v.hospital)}</span>
              ${v.department ? `<span class="report-detail-tag">${Storage.escapeHtml(v.department)}</span>` : ""}
            </div>`).join("")}
        </div>` : `<div class="symptom-hint">방문 기록이 없습니다.</div>`}
      </div>`;
  }

  async function renderRxDetail(memberId, year, month) {
    const rows = await computePrescriptionList(memberId, year, month);
    return `
      <div class="report-detail">
        <div class="dept-title">처방받은 날짜</div>
        ${rows.length ? `
        <div class="report-detail-list">
          ${rows.map(r => `<div class="report-detail-row"><span class="report-detail-date">${Storage.escapeHtml(formatMonthDay(r.date))}</span><span class="report-detail-text">${Storage.escapeHtml(r.drugNames)}</span></div>`).join("")}
        </div>` : `<div class="symptom-hint">처방 기록이 없습니다.</div>`}
      </div>`;
  }

  async function renderSymptomDetail(memberId, year, month) {
    const s = await computeSymptomBreakdown(memberId, year, month);
    return `
      <div class="report-detail">
        <div class="dept-title">증상 통계${s.avgPain != null ? ` · 평균 통증 ${s.avgPain}` : ""}</div>
        ${s.tagRows.length ? `
        <div class="report-detail-list">
          ${s.tagRows.map(r => `<div class="report-detail-row symptom-row"><span class="symptom-pill">${Storage.escapeHtml(r.name)}</span><span class="report-detail-count">${r.count}회</span></div>`).join("")}
        </div>` : `<div class="symptom-hint">증상 기록이 없습니다.</div>`}
      </div>`;
  }

  async function renderCheckupDetail(memberId, year, month) {
    const rows = await computeCheckupList(memberId, year, month);
    return `
      <div class="report-detail">
        <div class="dept-title">접종 · 검진 내역</div>
        ${rows.length ? `
        <div class="report-detail-list">
          ${rows.map(r => `<div class="report-detail-row"><span class="report-detail-date">${Storage.escapeHtml(formatMonthDay(r.date))}</span><span class="report-detail-text">${Storage.escapeHtml(r.name)} <span class="report-detail-tag">${Storage.escapeHtml(r.type)}</span></span></div>`).join("")}
        </div>` : `<div class="symptom-hint">접종·검진 기록이 없습니다.</div>`}
      </div>`;
  }

  async function renderDetail(memberId, year, month) {
    if (activeDetail === "visit") return renderDeptDetail(memberId, year, month);
    if (activeDetail === "rx") return renderRxDetail(memberId, year, month);
    if (activeDetail === "symptom") return renderSymptomDetail(memberId, year, month);
    if (activeDetail === "checkup") return renderCheckupDetail(memberId, year, month);
    return "";
  }

  async function buildNarrativeSummary(memberId, year, month, periodLabel) {
    const [summary, deptRows, symptomStats, checkups] = await Promise.all([
      computeSummary(memberId, year, month),
      computeDeptBreakdown(memberId, year, month),
      computeSymptomBreakdown(memberId, year, month),
      computeCheckupList(memberId, year, month)
    ]);
    const periodPhrase = month === null ? `${year}년 한 해 동안` : `${periodLabel} 한 달간`;

    const deptNames = deptRows.map(r => r.name);
    const deptText = deptNames.length ? `${deptNames.slice(0, 2).join(", ")} 등 ` : "";
    const visitSentence = summary.visitCount > 0
      ? `${periodPhrase} ${deptText}총 ${summary.visitCount}회 병원을 다녀왔으며, ${summary.prescriptionCount}회의 약을 처방받았습니다.`
      : `${periodPhrase}에는 병원 방문 기록이 없습니다.`;

    const topSymptoms = symptomStats.tagRows.slice(0, 3).map(r => r.name);
    const symptomSentence = topSymptoms.length
      ? `주로 ${topSymptoms.join(", ")} 증상을 겪었습니다.`
      : `기록된 증상은 없었습니다.`;

    const checkupSentence = checkups.length
      ? `이 기간에는 건강검진·접종 기록이 ${checkups.length}건 있습니다.`
      : `그리고 이 기간에는 건강검진 및 접종 기록은 없습니다.`;

    return [visitSentence, symptomSentence, checkupSentence];
  }

  async function render() {
    const el = document.getElementById("reportBody");
    if (!el) return;

    const memberId = AppState.memberId;
    const year = calendarState.year;
    const month = period === "month" ? calendarState.month : null;
    const periodLabel = period === "month" ? `${month + 1}월` : `${year}년`;
    const [summary, narrative, detailHtml] = await Promise.all([
      computeSummary(memberId, year, month),
      buildNarrativeSummary(memberId, year, month, periodLabel),
      renderDetail(memberId, year, month)
    ]);

    document.querySelectorAll("#reportPeriodToggle button").forEach(b => {
      b.classList.toggle("active", b.dataset.period === period);
    });

    el.innerHTML = `
      <div class="report-summary">
        <div class="monthly-summary-head"><span class="title">${Storage.escapeHtml(periodLabel)} 누계</span></div>
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-label">병원 방문</span><button type="button" class="stat-value${activeDetail === "visit" ? " active" : ""}" data-action="toggleDetail" data-stat="visit">${summary.visitCount}<span class="stat-unit">회</span></button></div>
          <div class="stat-card"><span class="stat-label">처방 횟수</span><button type="button" class="stat-value${activeDetail === "rx" ? " active" : ""}" data-action="toggleDetail" data-stat="rx">${summary.prescriptionCount}<span class="stat-unit">회</span></button></div>
          <div class="stat-card"><span class="stat-label">증상 기록</span><button type="button" class="stat-value${activeDetail === "symptom" ? " active" : ""}" data-action="toggleDetail" data-stat="symptom">${summary.symptomDays}<span class="stat-unit">일</span></button></div>
          <div class="stat-card"><span class="stat-label">접종 · 검진</span><button type="button" class="stat-value${activeDetail === "checkup" ? " active" : ""}" data-action="toggleDetail" data-stat="checkup">${summary.checkupCount}<span class="stat-unit">건</span></button></div>
        </div>
      </div>
      <div class="report-narrative">
        <div class="dept-title">이달의 건강</div>
        <div class="report-narrative-text">${narrative.map(line => `<p>${Storage.escapeHtml(line)}</p>`).join("")}</div>
      </div>
      ${detailHtml}`;
  }

  return { render, init, computeSummary, computeDeptBreakdown };
})();
