// list.html 專用的頁面底部提示訊息（成功/資訊/錯誤）。
let syncToastTimer = null;

export function showSyncToast(message, type = "success") {
  const toastEl = document.getElementById("sync-toast");
  if (!toastEl) return;

  // 1. 先移除所有可能的顏色類別
  toastEl.classList.remove("toast-success", "toast-info", "toast-error");

  // 2. 根據傳入的 type 加入對應顏色
  toastEl.classList.add(`toast-${type}`);

  // 3. 設定文字並顯示
  toastEl.innerText = message;
  toastEl.classList.add("show");

  // 避免短時間內連續訊息讓舊計時器提早關閉新提示
  if (syncToastTimer) clearTimeout(syncToastTimer);
  syncToastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
    syncToastTimer = null;
  }, 3000);
}
