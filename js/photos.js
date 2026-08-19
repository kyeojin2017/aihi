const Photos = (() => {
  let statusMessage = "";
  let statusIsError = false;
  let uploading = false;

  function init() {
    document.getElementById("photoUploadBtn").addEventListener("click", onUploadClick);
    document.getElementById("photoTabGrid").addEventListener("click", onGridClick);
  }

  function setStatus(text, isError) {
    statusMessage = text;
    statusIsError = !!isError;
    const el = document.getElementById("photoUploadStatus");
    if (el) {
      el.textContent = statusMessage;
      el.classList.toggle("error", statusIsError);
    }
  }

  async function onUploadClick() {
    const fileInput = document.getElementById("photoFileInput");
    const captionInput = document.getElementById("photoCaptionInput");
    const file = fileInput.files[0];
    if (!file) {
      setStatus("업로드할 사진을 선택해주세요.", true);
      return;
    }
    if (uploading) return;

    uploading = true;
    document.getElementById("photoUploadBtn").disabled = true;
    setStatus("업로드 중…", false);

    try {
      const { path } = await Storage.uploadPhoto(AppState.memberId, file);
      Storage.addPhotoMeta(AppState.memberId, {
        storagePath: path,
        caption: captionInput.value.trim(),
        date: Storage.toDateKey(AppState.selectedDate)
      });
      fileInput.value = "";
      captionInput.value = "";
      setStatus("업로드 완료.", false);
      await render();
    } catch (err) {
      setStatus(`업로드 실패: ${err.message || "알 수 없는 오류"} (Supabase Storage에 medical-photos 버킷이 아직 준비되지 않았을 수 있습니다.)`, true);
    } finally {
      uploading = false;
      document.getElementById("photoUploadBtn").disabled = false;
    }
  }

  async function onGridClick(e) {
    const delEl = e.target.closest("[data-action='delete']");
    if (!delEl) return;
    if (!window.confirm("이 사진을 삭제할까요?")) return;

    const id = delEl.dataset.id;
    const path = delEl.dataset.path;
    try {
      await Storage.deletePhotoFile(path);
    } catch (err) {
      // File may already be gone from Storage; still remove the local record.
    }
    Storage.deletePhotoMeta(id);
    await render();
  }

  function formatDateFull(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  async function render() {
    const grid = document.getElementById("photoTabGrid");
    if (!grid) return;

    const metas = Storage.getPhotoMetas(AppState.memberId)
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    document.getElementById("photoCount").textContent = `${metas.length}장`;

    if (metas.length === 0) {
      grid.innerHTML = `<div class="empty-state"><p>아직 등록된 사진이 없습니다.</p></div>`;
      return;
    }

    const tiles = await Promise.all(metas.map(async m => {
      let imgHtml;
      try {
        const url = await Storage.getPhotoUrl(m.storagePath);
        imgHtml = `<img src="${url}" alt="${Storage.escapeHtml(m.caption || "")}" loading="lazy">`;
      } catch (err) {
        imgHtml = `<div class="photo-tile-img broken">불러올 수 없음</div>`;
        return `
          <div class="photo-tile">
            <div class="photo-tile-img broken">불러올 수 없음</div>
            <div class="photo-tile-body">
              <span class="photo-tile-caption">${Storage.escapeHtml(m.caption || "")}</span>
              <span class="photo-tile-date">${formatDateFull(m.date)}</span>
              <span class="photo-tile-delete" data-action="delete" data-id="${m.id}" data-path="${Storage.escapeHtml(m.storagePath)}">삭제</span>
            </div>
          </div>`;
      }
      return `
        <div class="photo-tile">
          <div class="photo-tile-img">${imgHtml}</div>
          <div class="photo-tile-body">
            <span class="photo-tile-caption">${Storage.escapeHtml(m.caption || "")}</span>
            <span class="photo-tile-date">${formatDateFull(m.date)}</span>
            <span class="photo-tile-delete" data-action="delete" data-id="${m.id}" data-path="${Storage.escapeHtml(m.storagePath)}">삭제</span>
          </div>
        </div>`;
    }));

    grid.innerHTML = tiles.join("");
  }

  return { render, init };
})();
