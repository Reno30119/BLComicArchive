// wishlist.html 進入點：串起各模組（副作用匯入負責掛上 window.* 綁定與事件監聽），
// 並觸發首次待購清單讀取。
import { fetchWishlist } from "./wishlist-data.js";
import "./wishlist-render.js";
import "./wishlist-search.js";
import "./wishlist-modal-add.js";
import "./wishlist-modal-edit.js";
import "./wishlist-modal-bookinfo.js";
import "./wishlist-actions.js";

// Esc 關閉目前開啟的 Modal——跟自訂下拉選單「點外部關閉」是同一套使用者習慣，
// list.html 已經是這樣做。五個 Modal（新增／書籍資訊／備註／狀態／刪除升級確認）
// 共用同一個監聽器，不用每個 Modal 各自重複寫一次；各自的點背景關閉邏輯仍留在
// 各自的檔案裡（跟開關 Modal 本身的邏輯放在一起比較好找）。
const WL_MODAL_CLOSERS = {
  addModal: () => window.closeAddModal(),
  bookInfoModal: () => window.closeBookInfoModal(),
  editModal: () => window.closeEditModal(),
  statusModal: () => window.closeStatusModal(),
  wlConfirmModal: () => window.closeWlConfirmModal(),
};

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const [id, close] of Object.entries(WL_MODAL_CLOSERS)) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("hidden")) {
      close();
      return;
    }
  }
});

fetchWishlist();
