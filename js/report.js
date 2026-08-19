const Report = (() => {
  let period = "month"; // "month" | "year"

  function init() {
    document.getElementById("reportPeriodToggle").addEventListener("click", e => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      period = btn.dataset.period;
      render();
    });
  }

  function daysOverlap(startA, endA, startB, endB) {
    const s = startA > startB ? startA : startB;
    const e = endA < endB ? endA : endB;
    const diff = Math.round((e - s) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  }

  function computeSummary(memberId, year, month) {
    const rangeStart = month === null ? new Date(year, 0, 1) : new Date(year, month, 1);
    const rangeEnd = month === null ? new Date(year, 11, 31) : new Date(year, month + 1, 0);

    const visits = Storage.getVisits().filter(v => v.memberId === memberId && v.date);
    const symptoms = Storage.getSymptoms().filter(s => s.memberId === memberId);
    const prescriptions = Storage.getPrescriptions(memberId);
    const checkups = Storage.getCheckups(memberId);

    const inRange = dateKey => {
      if (!dateKey) return false;
      const d = new Date(dateKey);
      return d >= rangeStart && d <= rangeEnd;
    };

    const visitCount = visits.filter(v => inRange(v.date)).length;

    const prescriptionDays = prescriptions.reduce((sum, p) => {
      if (!p.startDate) return sum;
      const start = new Date(p.startDate);
      const end = p.endDate ? new Date(p.endDate) : start;
      return sum + daysOverlap(start, end, rangeStart, rangeEnd);
    }, 0);

    const symptomDays = symptoms.filter(s => s.hasSymptom && inRange(s.date)).length;
    const checkupCount = checkups.filter(c => inRange(c.date)).length;

    return { visitCount, prescriptionDays, symptomDays, checkupCount };
  }

  function computeDeptBreakdown(memberId, year) {
    const visits = Storage.getVisits().filter(v =>
      v.memberId === memberId && v.date && v.date.startsWith(`${year}-`) && v.department);
    const counts = {};
    visits.forEach(v => { counts[v.department] = (counts[v.department] || 0) + 1; });
    const rows = Object.entries(counts).map(([name, count]) => ({ name, count }));
    rows.sort((a, b) => b.count - a.count);
    const max = rows.length ? rows[0].count : 0;
    return rows.map(r => ({ ...r, pct: max ? Math.round((r.count / max) * 100) : 0 }));
  }

  const DEPT_COLORS = ["#2C6BA8", "#3E8FA8", "#7E6BB0", "#C08A5E", "#5B9E7E"];

  function render() {
    const el = document.getElementById("reportBody");
    if (!el) return;

    const today = new Date();
    const memberId = AppState.memberId;
    const summary = period === "month"
      ? computeSummary(memberId, today.getFullYear(), today.getMonth())
      : computeSummary(memberId, today.getFullYear(), null);
    const deptRows = computeDeptBreakdown(memberId, today.getFullYear());
    const periodLabel = period === "month" ? `${today.getMonth() + 1}월` : `${today.getFullYear()}년`;

    document.querySelectorAll("#reportPeriodToggle button").forEach(b => {
      b.classList.toggle("active", b.dataset.period === period);
    });

    el.innerHTML = `
      <div class="report-summary">
        <div class="monthly-summary-head"><span class="title">${Storage.escapeHtml(periodLabel)} 누계</span></div>
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-label">병원 방문</span><span class="stat-value">${summary.visitCount}<span class="stat-unit">회</span></span></div>
          <div class="stat-card"><span class="stat-label">처방 일수</span><span class="stat-value">${summary.prescriptionDays}<span class="stat-unit">일</span></span></div>
          <div class="stat-card"><span class="stat-label">증상 기록</span><span class="stat-value">${summary.symptomDays}<span class="stat-unit">일</span></span></div>
          <div class="stat-card"><span class="stat-label">접종 · 검진</span><span class="stat-value">${summary.checkupCount}<span class="stat-unit">건</span></span></div>
        </div>
      </div>
      <div class="dept-breakdown report-dept">
        <div class="dept-title">진료과별 · ${today.getFullYear()}년</div>
        <div class="dept-list">
          ${deptRows.length ? deptRows.map((r, i) => `
            <div class="dept-row">
              <span class="dept-name">${Storage.escapeHtml(r.name)}</span>
              <span class="dept-bar"><span class="dept-bar-fill" style="width:${r.pct}%; background:${DEPT_COLORS[i % DEPT_COLORS.length]};"></span></span>
              <span class="dept-count">${r.count}</span>
            </div>`).join("") : `<div class="symptom-hint">올해 병원 방문 기록이 없습니다.</div>`}
        </div>
      </div>`;
  }

  return { render, init, computeSummary, computeDeptBreakdown };
})();
