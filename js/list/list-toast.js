// list.html 專用的頁面底部提示訊息（成功/資訊/錯誤）。
let syncToastTimer = null;

// Firestore／網路錯誤代碼對照成中文說明，不要直接把 err.message 塞進使用者
// 看得到的 toast——Firebase SDK 的原始錯誤字串（例如 "permission-denied"、
// "Failed to fetch"）不是寫給 Reno／茶壺看的。原始技術訊息留給呼叫端自己
// console.error。waitForCollection() 自己拋出的逾時訊息已經是中文，直接
// 沿用、不重複翻譯。
const FIRESTORE_CODE_MESSAGES = {
  "permission-denied": "沒有權限執行這個操作，請確認登入狀態或聯絡管理員",
  unavailable: "暫時連不上 Firestore，請稍後再試",
  "deadline-exceeded": "連線逾時，請稍後再試",
  unauthenticated: "尚未登入或登入已過期，請重新整理頁面",
  "not-found": "找不到這筆資料，可能已被刪除",
  cancelled: "操作被中斷，請重新嘗試",
};

export function friendlyErrorMessage(err) {
  if (!err) return "發生未知錯誤，請稍後再試";
  if (err.message === "Firestore 尚未確認寫入結果，請稍後重新整理確認") {
    return err.message;
  }
  if (err.code && FIRESTORE_CODE_MESSAGES[err.code]) {
    return FIRESTORE_CODE_MESSAGES[err.code];
  }
  if (err.name === "AbortError") return "連線逾時，請稍後再試";
  if (err instanceof TypeError) return "網路連線異常，請檢查網路連線後再試";
  return "操作失敗，請稍後再試或重新整理頁面確認結果";
}

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
