// 書卡上的動作：升級到書庫、刪除待購紀錄。
import {
  getAllItems,
  setAllItems,
  confirmWishlistWrite,
  fetchWishlist,
} from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";

// ── 升級到書庫 ──
async function upgradeToArchive(
  docId,
  title,
  jpTitle,
  author,
  ebookUrl,
  chilUrl,
  coverUrl,
) {
  if (!confirm(`將《${title}》升級到書庫，並標記此待購項目為已購入？`)) return;

  // 確認已購入標記寫入後，才帶資料前往新增書庫頁。
  const fd = new FormData();
  fd.append("action", "updateWishlist");
  fd.append("docId", docId);
  fd.append("purchased", "purchased");
  try {
    showToast("⏳ 正在確認已購入狀態...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite((items) =>
      items.some(
        (item) =>
          String(item.id) === String(docId) &&
          item.purchased === "purchased",
      ),
    );
  } catch (error) {
    showToast("⚠️ 尚未確認已購入狀態，請先重新同步後再試", "error");
    return;
  }

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
window.upgradeToArchive = upgradeToArchive;

// ── 刪除 ──
async function deleteEntry(docId) {
  if (!confirm("確定要刪除這筆待購紀錄嗎？")) return;

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
    showToast("⚠️ 尚未確認刪除結果，請稍後重新同步確認", "error");
    await fetchWishlist(true);
  }
}
window.deleteEntry = deleteEntry;
