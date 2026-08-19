(() => {
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const passwordField = document.getElementById("authPasswordField");
  const passwordInput = document.getElementById("authPassword");
  const confirmField = document.getElementById("authPasswordConfirmField");
  const confirmInput = document.getElementById("authPasswordConfirm");
  const forgotLink = document.getElementById("authForgotLink");
  const submitBtn = document.getElementById("authSubmitBtn");
  const messageBox = document.getElementById("authMessage");
  const hint = document.getElementById("authHint");
  const tabs = document.querySelectorAll(".auth-tab");

  let mode = "login";

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showMessage(text, type) {
    messageBox.innerHTML = text ? `<div class="auth-message ${type}">${escapeHtml(text)}</div>` : "";
  }

  function bindHintLink(id, handler) {
    const link = document.getElementById(id);
    if (link) link.addEventListener("click", e => { e.preventDefault(); handler(); });
  }

  function submitLabel() {
    if (mode === "signup") return "회원가입";
    if (mode === "forgot") return "재설정 링크 보내기";
    return "로그인";
  }

  function setMode(next) {
    mode = next;
    tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));

    passwordField.style.display = mode === "forgot" ? "none" : "flex";
    passwordInput.required = mode !== "forgot";
    passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";

    confirmField.style.display = mode === "signup" ? "flex" : "none";
    confirmInput.required = mode === "signup";

    forgotLink.style.display = mode === "login" ? "block" : "none";
    submitBtn.textContent = submitLabel();

    if (mode === "forgot") {
      hint.innerHTML = `<a href="#" id="authBackLink">로그인으로 돌아가기</a>`;
      bindHintLink("authBackLink", () => setMode("login"));
    } else if (mode === "signup") {
      hint.innerHTML = `이미 계정이 있으신가요? <a href="#" id="authSwitchLink">로그인</a>`;
      bindHintLink("authSwitchLink", () => setMode("login"));
    } else {
      hint.innerHTML = `계정이 없으신가요? <a href="#" id="authSwitchLink">회원가입</a>`;
      bindHintLink("authSwitchLink", () => setMode("signup"));
    }

    showMessage("");
  }

  tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  forgotLink.addEventListener("click", e => { e.preventDefault(); setMode("forgot"); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "signup" && password !== confirmInput.value) {
      showMessage("비밀번호가 일치하지 않습니다.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? "가입 처리 중…" : mode === "forgot" ? "전송 중…" : "로그인 중…";
    showMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          window.location.href = "index.html";
          return;
        }
        emailInput.value = email;
        setMode("login");
        showMessage("가입 확인 메일을 보냈습니다. 메일함을 확인한 뒤 로그인해주세요.", "notice");
      } else if (mode === "forgot") {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password.html`
        });
        if (error) throw error;
        showMessage("비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.", "notice");
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "index.html";
        return;
      }
    } catch (err) {
      showMessage(err.message || "요청 처리 중 오류가 발생했습니다.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel();
    }
  });

  setMode("login");

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = "index.html";
  });
})();
