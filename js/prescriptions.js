const Prescriptions = (() => {
  let formMode = null; // null | "add" | { edit: id }
  let draftItems = [];
  let ocrBusy = false;
  let ocrRawText = "";

  function init() {
    document.getElementById("addRxBtn").addEventListener("click", () => {
      formMode = "add";
      draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];
      ocrRawText = "";
      ocrBusy = false;
      render();
    });
    document.getElementById("rxList").addEventListener("click", onListClick);
    document.getElementById("rxList").addEventListener("change", onListChange);
    document.getElementById("rxFilterClear").addEventListener("click", () => {
      AppState.rxFilterMonth = null;
      render();
    });
  }

  async function refresh() {
    if (typeof window.refreshAll === "function") await window.refreshAll();
    else await render();
  }

  function findVisit(visits, id) {
    return visits.find(v => v.id === id) || null;
  }

  function formatDateFull(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  function formatMonthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return `${y}년 ${m}월`;
  }

  async function render() {
    const listEl = document.getElementById("rxList");
    if (!listEl) return;

    const [allRaw, visits] = await Promise.all([Storage.getPrescriptions(AppState.memberId), Storage.getVisits()]);
    const all = allRaw
      .slice()
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    const memberVisits = visits.filter(v => v.memberId === AppState.memberId);
    const selectedDateKey = Storage.toDateKey(AppState.selectedDate);
    const isDailyView = window.recordViewMode === "daily";
    const filtered = AppState.rxFilterMonth
      ? all.filter(p => (p.startDate || "").startsWith(AppState.rxFilterMonth))
      : isDailyView
        ? all.filter(p => p.startDate && selectedDateKey >= p.startDate && selectedDateKey <= (p.endDate || p.startDate))
        : all;

    document.getElementById("rxCount").textContent = `${all.length}건`;

    const filterChip = document.getElementById("rxFilterChip");
    if (AppState.rxFilterMonth) {
      filterChip.style.display = "flex";
      document.getElementById("rxFilterLabel").textContent = `${formatMonthLabel(AppState.rxFilterMonth)} 기록만 보는 중`;
    } else {
      filterChip.style.display = "none";
    }

    const editingRecord = formMode && typeof formMode === "object" ? all.find(p => p.id === formMode.edit) : null;
    const formHtml = formMode ? renderForm(editingRecord, memberVisits) : "";
    const itemsHtml = filtered
      .filter(p => !(formMode && typeof formMode === "object" && formMode.edit === p.id))
      .map(p => renderCard(p, visits))
      .join("");

    if (!formHtml && filtered.length === 0) {
      const emptyMsg = AppState.rxFilterMonth ? "이 달에 처방전 기록이 없습니다."
        : isDailyView ? "이 날짜에 복용 중인 처방전이 없습니다."
        : "아직 처방전 기록이 없습니다.";
      listEl.innerHTML = `<div class="empty-state"><p>${emptyMsg}</p></div>`;
    } else {
      listEl.innerHTML = formHtml + itemsHtml;
    }
  }

  function renderCard(p, visits) {
    const visit = p.visitId ? findVisit(visits, p.visitId) : null;
    const items = p.items || [];
    return `
      <div class="card card-accent-purple rx-card">
        <div class="card-head">
          <div class="card-head-left">
            <span class="card-title">처방전</span>
            <span class="card-subtitle">${formatDateFull(p.startDate)} – ${formatDateFull(p.endDate).slice(5)}${visit ? ` · ${Storage.escapeHtml(visit.hospital || "")}` : ""}</span>
          </div>
          <span style="display:flex; gap:10px;">
            <span class="card-link" data-action="edit" data-id="${p.id}">수정</span>
            <span class="card-link danger" data-action="delete" data-id="${p.id}">삭제</span>
          </span>
        </div>
        <div class="rx-table">
          <div class="rx-row head"><span>약 이름</span><span>용량</span><span>복용</span><span>비고</span></div>
          ${items.map((it, i) => `
            <div class="rx-row${i === items.length - 1 ? " last" : ""}">
              <span>${Storage.escapeHtml(it.drugName || "")}</span>
              <span class="rx-dose">${Storage.escapeHtml(it.dose || "")}</span>
              <span class="rx-freq">${Storage.escapeHtml(it.frequency || "")}</span>
              <span class="rx-note">${Storage.escapeHtml(it.note || "")}</span>
            </div>`).join("")}
        </div>
        ${p.cautionMemo ? `
        <div class="rx-memo-row">
          <span class="memo-label">주의 메모</span>
          <span class="memo-box">${Storage.escapeHtml(p.cautionMemo)}</span>
        </div>` : ""}
      </div>`;
  }

  function renderForm(existing, memberVisits) {
    const p = existing || { visitId: "", startDate: Storage.toDateKey(AppState.selectedDate), endDate: "", cautionMemo: "" };
    if (existing) draftItems = (existing.items && existing.items.length ? existing.items : [{ drugName: "", dose: "", frequency: "", note: "" }]);
    else if (!draftItems.length) draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];

    const visits = memberVisits.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return `
      <div class="card card-accent-purple rx-card" data-editing-id="${existing ? existing.id : ""}">
        <div class="card-head">
          <div class="card-head-left"><span class="card-title">${existing ? "처방전 수정" : "처방전 등록"}</span></div>
        </div>
        <div class="visit-grid">
          <div class="field"><span class="field-label">시작일</span><input class="field-box" type="date" data-field="startDate" value="${p.startDate || ""}"></div>
          <div class="field"><span class="field-label">종료일</span><input class="field-box" type="date" data-field="endDate" value="${p.endDate || ""}"></div>
          <div class="field">
            <span class="field-label">연결된 병원 방문</span>
            <select class="field-box" data-field="visitId">
              <option value="">선택 안 함</option>
              ${visits.map(v => `<option value="${v.id}"${p.visitId === v.id ? " selected" : ""}>${formatDateFull(v.date)} · ${Storage.escapeHtml(v.hospital || "")}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-actions" style="justify-content:flex-start;">
          <button type="button" class="btn" data-action="scanPhoto" ${ocrBusy ? "disabled" : ""}>
            ${ocrBusy ? "인식 중..." : "📷 약봉투 사진으로 인식"}
          </button>
          <input type="file" id="rxPhotoInput" accept="image/*" style="display:none;">
        </div>
        ${ocrRawText ? `
        <div class="memo-row">
          <span class="memo-label">인식된 텍스트</span>
          <textarea class="memo-box" id="rxOcrText" rows="4">${Storage.escapeHtml(ocrRawText)}</textarea>
        </div>` : ""}
        <div class="rx-table" id="rxItemsEditor">
          <div class="rx-row head"><span>약 이름</span><span>용량</span><span>복용</span><span>비고</span></div>
          ${draftItems.map((it, i) => `
            <div class="rx-row">
              <input class="field-box" type="text" data-item-field="drugName" data-index="${i}" value="${Storage.escapeHtml(it.drugName || "")}" placeholder="약 이름">
              <input class="field-box" type="text" data-item-field="dose" data-index="${i}" value="${Storage.escapeHtml(it.dose || "")}" placeholder="250mg">
              <input class="field-box" type="text" data-item-field="frequency" data-index="${i}" value="${Storage.escapeHtml(it.frequency || "")}" placeholder="1일 3회">
              <span style="display:flex; gap:6px;">
                <input class="field-box" type="text" data-item-field="note" data-index="${i}" value="${Storage.escapeHtml(it.note || "")}" placeholder="비고" style="flex:1;">
                <button type="button" class="btn" data-action="removeItem" data-index="${i}" title="삭제">✕</button>
              </span>
            </div>`).join("")}
        </div>
        <button type="button" class="btn" data-action="addItem">+ 약 추가</button>
        <div class="memo-row">
          <span class="memo-label">주의 메모</span>
          <textarea class="memo-box" data-field="cautionMemo" placeholder="중복 성분, 복용 시 주의사항 등">${Storage.escapeHtml(p.cautionMemo || "")}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-action="cancel">취소</button>
          <button type="button" class="btn btn-primary" data-action="save">저장</button>
        </div>
      </div>`;
  }

  function onListChange(e) {
    if (e.target.id === "rxPhotoInput") {
      onPhotoSelected(e.target);
      return;
    }
    if (e.target.id === "rxOcrText") {
      ocrRawText = e.target.value;
      return;
    }
    const el = e.target.closest("[data-item-field]");
    if (!el) return;
    const idx = Number(el.dataset.index);
    draftItems[idx] = { ...draftItems[idx], [el.dataset.itemField]: el.value };
  }

  // Keeps only lines that look like an actual drug line (contain Hangul), pulls the
  // longest Korean run out as the name, and the first dosage-looking number as the dose.
  // Drops pure barcode/code noise lines that have no Korean text at all.
  function extractDrugLines(text) {
    const doseRe = /\d+(\.\d+)?\s?(mg|mcg|g|ml|정|캡슐|포|환)/i;
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const hangulRuns = line.match(/[가-힣]+(?:\s+[가-힣]+)*/g) || [];
        const name = hangulRuns.sort((a, b) => b.length - a.length)[0];
        if (!name || name.trim().length < 2) return null;
        const doseMatch = line.match(doseRe);
        return { drugName: name.trim(), dose: doseMatch ? doseMatch[0].trim() : "", frequency: "", note: "" };
      })
      .filter(Boolean);
  }

  // Grayscale + Otsu binarize + upscale so small/low-contrast prescription-bag print
  // has a better chance with Tesseract (which is far more sensitive to image quality
  // than cloud OCR). Returns a canvas ready to feed to the recognizer.
  function preprocessForOcr(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(3, Math.max(1, 1800 / Math.max(img.width, img.height)));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const px = imageData.data;
          const pixelCount = px.length / 4;
          const gray = new Uint8ClampedArray(pixelCount);
          const hist = new Array(256).fill(0);
          for (let i = 0, j = 0; i < px.length; i += 4, j++) {
            const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
            gray[j] = g;
            hist[g]++;
          }

          // Otsu's method: pick the threshold that best splits light/dark pixels.
          let sum = 0;
          for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0, wB = 0, varMax = 0, threshold = 128;
          for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = pixelCount - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const varBetween = wB * wF * (mB - mF) * (mB - mF);
            if (varBetween > varMax) { varMax = varBetween; threshold = t; }
          }

          for (let i = 0, j = 0; i < px.length; i += 4, j++) {
            const v = gray[j] > threshold ? 255 : 0;
            px[i] = px[i + 1] = px[i + 2] = v;
          }
          ctx.putImageData(imageData, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 열 수 없습니다.")); };
      img.src = url;
    });
  }

  async function onPhotoSelected(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const cardEl = inputEl.closest(".card");
    syncDraftFromDom(cardEl);

    ocrBusy = true;
    render();
    try {
      // TEMP: recognized fully in-browser with Tesseract.js (no server setup needed).
      // Swap for the ocr-prescription Supabase Edge Function once it's deployed for better accuracy.
      const canvas = await preprocessForOcr(file);
      const worker = await Tesseract.createWorker("kor+eng");
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const text = data.text || "";
      ocrRawText = text;

      const scannedItems = extractDrugLines(text);
      if (scannedItems.length) {
        const hasRealDraft = draftItems.some(it => it.drugName && it.drugName.trim());
        draftItems = hasRealDraft ? draftItems.concat(scannedItems) : scannedItems;
      } else {
        window.alert("사진에서 글자를 인식하지 못했습니다. 더 밝은 곳에서 다시 찍어보세요.");
      }
    } catch (err) {
      window.alert("인식에 실패했습니다: " + (err && err.message ? err.message : err));
    } finally {
      ocrBusy = false;
      render();
    }
  }

  function syncDraftFromDom(cardEl) {
    if (!cardEl) return;
    cardEl.querySelectorAll("#rxItemsEditor [data-item-field]").forEach(el => {
      const idx = Number(el.dataset.index);
      if (!draftItems[idx]) draftItems[idx] = { drugName: "", dose: "", frequency: "", note: "" };
      draftItems[idx][el.dataset.itemField] = el.value;
    });
  }

  async function onListClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "scanPhoto") {
      const cardEl = actionEl.closest(".card");
      syncDraftFromDom(cardEl);
      cardEl.querySelector("#rxPhotoInput").click();
    } else if (action === "edit") {
      formMode = { edit: actionEl.dataset.id };
      ocrRawText = "";
      ocrBusy = false;
      render();
    } else if (action === "delete") {
      if (window.confirm("이 처방전 기록을 삭제할까요?")) {
        await Storage.deletePrescription(actionEl.dataset.id);
        await refresh();
      }
    } else if (action === "cancel") {
      formMode = null;
      ocrRawText = "";
      ocrBusy = false;
      render();
    } else if (action === "addItem") {
      syncDraftFromDom(actionEl.closest(".card"));
      draftItems.push({ drugName: "", dose: "", frequency: "", note: "" });
      render();
    } else if (action === "removeItem") {
      syncDraftFromDom(actionEl.closest(".card"));
      draftItems.splice(Number(actionEl.dataset.index), 1);
      if (!draftItems.length) draftItems.push({ drugName: "", dose: "", frequency: "", note: "" });
      render();
    } else if (action === "save") {
      const cardEl = actionEl.closest(".card");
      syncDraftFromDom(cardEl);
      const data = {};
      cardEl.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.value; });
      if (!data.startDate) {
        window.alert("시작일은 필수입니다.");
        return;
      }
      data.visitId = data.visitId || null;
      data.endDate = data.endDate || null;
      data.items = draftItems.filter(it => it.drugName && it.drugName.trim());

      const editingId = cardEl.dataset.editingId;
      if (editingId) await Storage.updatePrescription(editingId, data);
      else await Storage.addPrescription(AppState.memberId, data);

      formMode = null;
      draftItems = [];
      ocrRawText = "";
      ocrBusy = false;
      await refresh();
    }
  }

  function openAddForm() {
    formMode = "add";
    draftItems = [{ drugName: "", dose: "", frequency: "", note: "" }];
    ocrRawText = "";
    ocrBusy = false;
    render();
  }

  return { render, init, openAddForm };
})();
