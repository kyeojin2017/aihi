(() => {
  const form = document.getElementById("resetForm");
  const passwordInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("newPasswordConfirm");
  const submitBtn = document.getElementById("resetSubmitBtn");
  const messageBox = document.getElementById("authMessage");

  let sessionReady = false;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showMessage(text, type) {
    messageBox.innerHTML = text ? `<div class="auth-message ${type}">${escapeHtml(text)}</div>` : "";
  }

  function markInvalidLink() {
    if (sessionReady) return;
    form.style.display = "none";
    showMessage("유효하지 않거나 만료된 링크입니다. 로그인 화면에서 비밀번호 재설정을 다시 요청해주세요.", "error");
  }

  supabaseClient.auth.onAuthStateChange(event => {
    if (event === "PASSWORD_RECOVERY") sessionReady = true;
  });

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) sessionReady = true;
    setTimeout(() => { if (!sessionReady) markInvalidLink(); }, 1500);
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (passwordInput.value !== confirmInput.value) {
      showMessage("비밀번호가 일치하지 않습니다.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "변경 중…";
    showMessage("");

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: passwordInput.value });
      if (error) throw error;
      showMessage("비밀번호가 변경되었습니다. 잠시 후 이동합니다.", "notice");
      setTimeout(() => { window.location.href = "index.html"; }, 1200);
    } catch (err) {
      showMessage(err.message || "요청 처리 중 오류가 발생했습니다.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "비밀번호 변경";
    }
  });
})();
