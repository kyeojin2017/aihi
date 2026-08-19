const Auth = (() => {
  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }

  function signUp(email, password) {
    return supabaseClient.auth.signUp({ email, password });
  }

  function signIn(email, password) {
    return supabaseClient.auth.signInWithPassword({ email, password });
  }

  function signOut() {
    return supabaseClient.auth.signOut();
  }

  return { getSession, signUp, signIn, signOut };
})();

(function initAuthUI() {
  let mode = "signin";

  const overlay = document.getElementById("authOverlay");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const messageEl = document.getElementById("authMessage");
  const submitBtn = document.getElementById("authSubmit");
  const tabs = document.querySelectorAll(".auth-tab");

  function setMode(next) {
    mode = next;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.authTab === mode));
    submitBtn.textContent = mode === "signin" ? "로그인" : "회원가입";
    passwordInput.autocomplete = mode === "signin" ? "current-password" : "new-password";
    messageEl.textContent = "";
  }

  tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.authTab)));

  function showOverlay() {
    overlay.style.display = "flex";
  }

  function hideOverlay() {
    overlay.style.display = "none";
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    messageEl.textContent = "";
    submitBtn.disabled = true;
    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (mode === "signin") {
        const { error } = await Auth.signIn(email, password);
        if (error) throw error;
        hideOverlay();
        await window.initApp();
      } else {
        const { data, error } = await Auth.signUp(email, password);
        if (error) throw error;
        if (data.session) {
          hideOverlay();
          await window.initApp();
        } else {
          messageEl.textContent = "가입 확인 이메일을 보냈습니다. 메일함에서 인증 후 로그인해주세요.";
          setMode("signin");
        }
      }
    } catch (err) {
      messageEl.textContent = err.message || "오류가 발생했습니다.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!window.confirm("로그아웃할까요?")) return;
    await Auth.signOut();
    location.reload();
  });

  (async () => {
    const session = await Auth.getSession();
    if (session) {
      hideOverlay();
      await window.initApp();
    } else {
      showOverlay();
    }
  })();
})();
