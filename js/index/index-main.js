// index.html 進入點：串起各模組（副作用匯入負責掛上 window.* 綁定＋事件監聽），
// 處理「從待購清單升級」的 URL 參數帶入，並觸發首次資料讀取。
import { fetchAndRefreshStatus } from "./index-status.js";
import "./index-title-search.js";
import "./index-form.js";
import "./index-tags.js";

fetchAndRefreshStatus(false);

// 若從 wishlist.html 的「升級到書庫」按鈕跳轉而來，自動帶入欄位
(function prefillFromWishlist() {
  const p = new URLSearchParams(window.location.search);
  if (!p.get("prefill")) return;
  if (p.get("title")) document.getElementById("title").value = p.get("title");
  if (p.get("jpTitle"))
    document.getElementById("jpTitle").value = p.get("jpTitle");
  if (p.get("author"))
    document.getElementById("author").value = p.get("author");
  if (p.get("ebookUrl"))
    document.getElementById("ebookUrl").value = p.get("ebookUrl");
  if (p.get("chilUrl"))
    document.getElementById("chilUrl").value = p.get("chilUrl");
  if (p.get("coverUrl"))
    document.getElementById("coverUrl").value = p.get("coverUrl");
  if (p.get("title")) {
    const msg = document.getElementById("message");
    msg.innerHTML = "✅ 已從待購清單帶入書籍資料，請補填評分與評語";
    msg.className = "success show";
    msg.classList.remove("hidden");
  }
})();
