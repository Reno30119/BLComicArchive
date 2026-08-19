// 「⚙️ 編輯書籍資訊」Modal：修改書名／日文書名／作者／購買連結，這些都是書籍
// 共用屬性，依（改名前的）書名同步更新所有同名列，跟 list.html 編輯書籍基本資訊的
// oldTitle 用法一致。連結有改動時順便重新推算封面（BookWalker 優先，ちるちる 補充）。
import {
  getAllItems,
  confirmWishlistWrite,
  fetchWishlist,
  deriveCoverUrl,
} from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";
import { friendlyErrorMessage } from "../error-messages.js";

function openBookInfoModal(oldTitle, jpTitle, author, ebookUrl, chilUrl) {
  document.getElementById("bookInfoOldTitle").value = oldTitle;
  document.getElementById("bookInfoTitle").value = oldTitle;
  document.getElementById("bookInfoJpTitle").value = jpTitle || "";
  document.getElementById("bookInfoAuthor").value = author || "";
  document.getElementById("bookInfoEbookUrl").value = ebookUrl || "";
  document.getElementById("bookInfoChilUrl").value = chilUrl || "";
  document.getElementById("bookInfoModalTitle").textContent =
    `⚙️ 編輯書籍資訊 —「${oldTitle}」`;
  document.getElementById("bookInfoModal").classList.remove("hidden");
}
window.openBookInfoModal = openBookInfoModal;

function closeBookInfoModal() {
  document.getElementById("bookInfoModal").classList.add("hidden");
}
window.closeBookInfoModal = closeBookInfoModal;

// 點背景關閉：跟自訂下拉選單「點外部關閉」是同一套使用者習慣。
document.getElementById("bookInfoModal").addEventListener("click", (e) => {
  if (e.target.id === "bookInfoModal") closeBookInfoModal();
});

async function submitBookInfoEdit() {
  const oldTitle = document.getElementById("bookInfoOldTitle").value;
  const title = document.getElementById("bookInfoTitle").value.trim();
  const jpTitle = document.getElementById("bookInfoJpTitle").value.trim();
  const author = document.getElementById("bookInfoAuthor").value.trim();
  const ebookUrl = document.getElementById("bookInfoEbookUrl").value.trim();
  const chilUrl = document.getElementById("bookInfoChilUrl").value.trim();

  if (!title) {
    showToast("❌ 請填入中文書名", "error");
    return;
  }

  // 連結有改動時，順便照新增時同一套規則重新推算封面。
  const coverUrl = deriveCoverUrl(ebookUrl) || deriveCoverUrl(chilUrl) || "";

  // 樂觀更新：同（改名前）書名的所有項目都更新
  getAllItems().forEach((item) => {
    if (item.title.trim() === oldTitle.trim()) {
      item.title = title;
      item.jpTitle = jpTitle;
      item.author = author;
      item.ebookUrl = ebookUrl;
      item.chilUrl = chilUrl;
      if (coverUrl) item.coverUrl = coverUrl;
    }
  });
  renderWishlist();
  closeBookInfoModal();
  showToast("✅ 書籍資訊已更新", "success");

  const fd = new FormData();
  fd.append("action", "updateWishlist");
  fd.append("oldTitle", oldTitle);
  fd.append("title", title);
  fd.append("jpTitle", jpTitle);
  fd.append("author", author);
  fd.append("ebookUrl", ebookUrl);
  fd.append("chilUrl", chilUrl);
  if (coverUrl) fd.append("coverUrl", coverUrl);

  try {
    showToast("⏳ 已送出，正在確認更新...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite((items) =>
      items
        .filter((item) => item.title.trim() === title.trim())
        .every((item) => item.author === author && item.jpTitle === jpTitle),
    );
    showToast("✅ 書籍資訊已確認更新", "success");
  } catch (e) {
    showToast("⚠️ 尚未確認更新結果：" + friendlyErrorMessage(e), "error");
    await fetchWishlist(true);
  }
}
window.submitBookInfoEdit = submitBookInfoEdit;
