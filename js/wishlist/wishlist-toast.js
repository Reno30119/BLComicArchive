// wishlist.html 專用的頁面底部提示訊息（成功/資訊/錯誤）。
export function showToast(message, type = "success") {
  const el = document.getElementById("wl-toast");
  if (!el) return;
  el.classList.remove("toast-success", "toast-info", "toast-error");
  el.classList.add(`toast-${type}`);
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}
