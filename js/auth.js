(async function requireAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  const avatar = document.querySelector(".avatar-badge");
  if (!avatar) return;
  avatar.style.cursor = "pointer";
  avatar.title = "로그아웃";
  avatar.addEventListener("click", async () => {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
});
