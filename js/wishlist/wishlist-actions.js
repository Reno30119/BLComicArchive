// 書卡上的動作：升級到書庫、刪除待購紀錄。
import {
  getAllItems,
  setAllItems,
  confirmWishlistWrite,
  fetchWishlist,
} from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";
import { friendlyErrorMessage } from "../error-messages.js";

// ── 刪除／升級確認 Modal（比照 list.html／tags.html 已經在用的模式，不用瀏覽器
// 原生 confirm()）。兩個操作共用同一個 Modal，用 pendingWlConfirm.kind 分辨
// 目前要執行哪一種。 ──

let pendingWlConfirm = null;

function openWlConfirmModal({ title, message, warning, confirmLabel }) {
  document.getElementById("wlConfirmTitle").textContent = title;
  document.getElementById("wlConfirmMessage").textContent = message;
  const warningEl = document.getElementById("wlConfirmWarning");
  if (warning) {
    warningEl.textContent = warning;
    warningEl.classList.remove("hidden");
  } else {
    warningEl.textContent = "";
    warningEl.classList.add("hidden");
  }
  const btn = document.getElementById("wlConfirmBtn");
  btn.textContent = confirmLabel;
  btn.disabled = false;
  document.getElementById("wlConfirmModal").classList.remove("hidden");
}

function closeWlConfirmModal() {
  pendingWlConfirm = null;
  document.getElementById("wlConfirmModal").classList.add("hidden");
}
window.closeWlConfirmModal = closeWlConfirmModal;

async function executeWlConfirmAction() {
  if (!pendingWlConfirm) return;
  if (pendingWlConfirm.kind === "delete") {
    await performDelete(pendingWlConfirm.docId);
  } else if (pendingWlConfirm.kind === "upgrade") {
    await performUpgrade(pendingWlConfirm.params);
  }
}
window.executeWlConfirmAction = executeWlConfirmAction;

document.getElementById("wlConfirmModal").addEventListener("click", (e) => {
  if (e.target.id === "wlConfirmModal") closeWlConfirmModal();
});

// ── 升級到書庫 ──
async function performUpgrade({
  docId,
  title,
  jpTitle,
  author,
  ebookUrl,
  chilUrl,
  coverUrl,
}) {
  const btn = document.getElementById("wlConfirmBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "確認中...";

  // 確認已購入標記寫入後，才帶資料前往新增書庫頁。
  const fd = new FormData();
  fd.append("action", "updateWishlist");
  fd.append("docId", docId);
  fd.append("purchased", "purchased");
  try {
    showToast("⏳ 正在確認已購入狀態...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite(
      (items) =>
        items.some(
          (item) =>
            String(item.id) === String(docId) &&
            item.purchased === "purchased",
        ),
      {
        onAttempt: (attempt, attempts) => {
          btn.textContent = `確認中... (${attempt}/${attempts})`;
        },
      },
    );
  } catch (error) {
    showToast(
      "⚠️ 尚未確認已購入狀態：" + friendlyErrorMessage(error),
      "error",
    );
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  closeWlConfirmModal();

  // 帶資料前往 index.html
  const params = new URLSearchParams({
    prefill: "1",
    title,
    jpTitle,
    author,
    ebookUrl,
    chilUrl,
    coverUrl,
  });
  window.location.href = "index.html?" + params.toString();
}

function upgradeToArchive(
  docId,
  title,
  jpTitle,
  author,
  ebookUrl,
  chilUrl,
  coverUrl,
) {
  pendingWlConfirm = {
    kind: "upgrade",
    params: { docId, title, jpTitle, author, ebookUrl, chilUrl, coverUrl },
  };
  openWlConfirmModal({
    title: "📚 升級到書庫",
    message: `將《${title}》升級到書庫，並標記此待購項目為已購入？確認後會離開待購清單，跳轉到新增書籍頁面。`,
    confirmLabel: "📚 確定升級",
  });
}
window.upgradeToArchive = upgradeToArchive;

// ── 刪除 ──
async function performDelete(docId) {
  // 跟升級不同：刪除延續原本就有的樂觀更新設計，確認後立刻關閉 Modal、更新畫面，
  // 不等 Firestore 回應，所以不需要在按鈕上顯示「刪除中...」進度文字（Modal
  // 已經消失，使用者看不到）。
  closeWlConfirmModal();

  // 樂觀更新
  setAllItems(getAllItems().filter((i) => i.id !== docId));
  renderWishlist();
  showToast("🗑️ 已刪除待購紀錄", "info");

  const fd = new FormData();
  fd.append("action", "deleteWishlist");
  fd.append("docId", docId);
  try {
    showToast("⏳ 已送出，正在確認刪除...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite(
      (items) => !items.some((item) => String(item.id) === String(docId)),
    );
    showToast("✅ 已確認刪除待購紀錄", "success");
  } catch (e) {
    showToast("⚠️ 尚未確認刪除結果：" + friendlyErrorMessage(e), "error");
    await fetchWishlist(true);
  }
}

// title/jpTitle/author/ebookUrl/chilUrl/status/coverUrl 都是書籍共用屬性，跟
// list.html 的書籍一樣，同一本書可能有多筆（每個評論者一筆）。如果要刪的是這本書
// 目前唯一一筆待購紀錄，等於連這些共用資料都會一併消失，不只是「我的備註」不見
// 而已，比照 list.html 的 deleteReview() 在確認視窗裡明確加紅字警告。
function deleteEntry(docId, title) {
  const sameTitleCount = title
    ? getAllItems().filter((i) => String(i.title).trim() === title.trim())
        .length
    : 0;
  const isLastEntry = sameTitleCount <= 1;

  pendingWlConfirm = { kind: "delete", docId };
  openWlConfirmModal({
    title: "🗑 刪除待購紀錄",
    message: title
      ? `確定要刪除《${title}》這筆待購紀錄嗎？`
      : "確定要刪除這筆待購紀錄嗎？",
    warning: isLastEntry
      ? `⚠️ 這是《${title}》目前唯一的一筆待購紀錄，刪除後書名／作者／連結／狀態等資料會一併消失！`
      : null,
    confirmLabel: "🗑 確定刪除",
  });
}
window.deleteEntry = deleteEntry;
