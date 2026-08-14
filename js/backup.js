// backup.html：
// 1. 匯出：把 books / tags / wishlist 三個 collection 讀出來，包成一個 JSON 檔案下載。
// 2. 還原：讀取先前匯出的 JSON，只「補回」備份裡有、但目前 Firestore 沒有的資料
//    （BookArchive.restoreBackup 內部用 merge:true，不會刪除或覆蓋其他內容）。
function pad(n) {
  return String(n).padStart(2, "0");
}

function buildFilename() {
  const now = new Date();
  return `書庫備份_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `backup-status show ${type}`;
}

async function exportBackup() {
  const btn = document.getElementById("exportBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ 正在讀取最新資料...";

  try {
    const [books, tags, wishlist] = await Promise.all([
      BookArchive.fetchJson("read", {}, { timeoutMs: 30000, retries: 1 }),
      BookArchive.fetchJson("readTags", {}, { timeoutMs: 30000, retries: 1 }),
      BookArchive.fetchJson("readWishlist", {}, { timeoutMs: 30000, retries: 1 }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      books,
      tags,
      wishlist,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = buildFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showStatus(
      "backupStatus",
      `✅ 已匯出：${books.length} 筆書籍資料（含所有評論者）、${tags.length} 個標籤定義、${wishlist.length} 筆待購紀錄`,
      "success",
    );
  } catch (error) {
    console.error("匯出備份失敗:", error);
    showStatus("backupStatus", `❌ 匯出失敗：${error.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById("exportBtn").addEventListener("click", exportBackup);

// ── 還原 ──
const restoreFileInput = document.getElementById("restoreFile");
const restoreBtn = document.getElementById("restoreBtn");
let pendingBackup = null;

restoreFileInput.addEventListener("change", async () => {
  const file = restoreFileInput.files[0];
  pendingBackup = null;
  restoreBtn.disabled = true;

  if (!file) {
    document.getElementById("restorePreview").className = "backup-status";
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (
      !Array.isArray(parsed.books) ||
      !Array.isArray(parsed.tags) ||
      !Array.isArray(parsed.wishlist)
    ) {
      throw new Error("檔案格式不正確（缺少 books/tags/wishlist），請確認是這個頁面匯出的備份檔");
    }

    pendingBackup = parsed;
    const exportedAt = parsed.exportedAt
      ? new Date(parsed.exportedAt).toLocaleString("zh-TW")
      : "未知時間";
    showStatus(
      "restorePreview",
      `📄 這份備份匯出於：${exportedAt}\n書籍資料 ${parsed.books.length} 筆、標籤 ${parsed.tags.length} 個、待購 ${parsed.wishlist.length} 筆。\n按下方按鈕會把裡面「目前 Firestore 沒有」的資料補回去。`,
      "info",
    );
    restoreBtn.disabled = false;
  } catch (error) {
    console.error("讀取備份檔案失敗:", error);
    showStatus("restorePreview", `❌ 無法讀取這個檔案：${error.message}`, "error");
  }
});

restoreBtn.addEventListener("click", async () => {
  if (!pendingBackup) return;

  const confirmed = confirm(
    "確定要把這份備份的資料還原（補回）到 Firestore 嗎？\n\n" +
      "這個動作只會新增/補回遺漏的資料，不會刪除任何現有內容，" +
      "但仍建議先按上面的「匯出備份」保留目前最新狀態再繼續。",
  );
  if (!confirmed) return;

  const originalText = restoreBtn.textContent;
  restoreBtn.disabled = true;
  restoreFileInput.disabled = true;

  try {
    const summary = await BookArchive.restoreBackup(pendingBackup, (msg) => {
      restoreBtn.textContent = `⏳ ${msg}`;
    });
    showStatus(
      "restorePreview",
      `✅ 已還原：書籍資料 ${summary.books} 筆、標籤 ${summary.tags} 個、待購 ${summary.wishlist} 筆。建議重新整理其他頁面確認資料是否正確。`,
      "success",
    );
    pendingBackup = null;
    restoreFileInput.value = "";
  } catch (error) {
    console.error("還原失敗:", error);
    showStatus("restorePreview", `❌ 還原失敗：${error.message}`, "error");
  } finally {
    restoreBtn.disabled = !pendingBackup;
    restoreFileInput.disabled = false;
    restoreBtn.textContent = originalText;
  }
});
