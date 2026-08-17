// 深色模式切換：預設跟隨系統（prefers-color-scheme），使用者手動點擊導覽列上的
// 切換鈕後，改成明確覆蓋並存進 localStorage，之後每次載入都以這個明確設定為準，
// 不再跟著系統走，除非之後又手動切換回去。
//
// 頁面 <head> 裡還有一小段內嵌 script（每個 HTML 檔案都有一份），在 CSS 套用前
// 就同步讀 localStorage 並把 data-theme 屬性寫到 <html> 上，避免「先閃一下錯的
// 主題色再變回來」；這支檔案負責的是切換鈕（滑動式開關）本身的互動與把手滑動。
const STORAGE_KEY = "theme";
const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getStoredTheme() {
  const t = localStorage.getItem(STORAGE_KEY);
  return t === "light" || t === "dark" ? t : null;
}

function getEffectiveTheme() {
  return getStoredTheme() || (darkMediaQuery.matches ? "dark" : "light");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // 開關的滑動狀態純粹靠這個 class 驅動（CSS 見 .theme-toggle-switch.is-dark），
  // 兩端的 ☀️/🌙 圖示本身不隨狀態改變，只有把手（.theme-toggle-knob）跟軌道底色會變。
  document.querySelectorAll(".theme-toggle-switch").forEach((btn) => {
    btn.classList.toggle("is-dark", theme === "dark");
    btn.setAttribute(
      "aria-label",
      theme === "dark" ? "切換成淺色模式" : "切換成深色模式",
    );
  });
}

function toggleTheme() {
  const next = getEffectiveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
}
window.toggleTheme = toggleTheme;

applyTheme(getEffectiveTheme());

// 按鈕本身沒有寫 onclick，這裡統一綁定點擊事件。
document.querySelectorAll(".theme-toggle-switch").forEach((btn) => {
  btn.addEventListener("click", toggleTheme);
});

// 使用者還沒手動設定過偏好時，系統主題切換要即時跟著變
darkMediaQuery.addEventListener("change", () => {
  if (!getStoredTheme()) applyTheme(getEffectiveTheme());
});
