// 書卡渲染：把 allItems 依篩選/排序條件過濾、以書名合併後畫成 #wishlistGrid
// 裡的卡片，以及封面抓取的補救流程（reFetchWishlistCover / 破圖處理）。
import {
  getAllItems,
  getFilterState,
  STATUS_CONFIG,
  toMillis,
  escH,
  escQ,
  deriveCoverUrl,
} from "./wishlist-data.js";
import { showToast } from "./wishlist-toast.js";

export function renderWishlist() {
  const grid = document.getElementById("wishlistGrid");
  const allItems = getAllItems();
  const { currentReviewer, currentStatus, currentSort, showPurchased } =
    getFilterState();
  const searchTerm = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();

  // 過濾
  let filtered = allItems.filter((item) => {
    if (!showPurchased && item.purchased === "purchased") return false;
    if (currentReviewer !== "all" && item.reviewer !== currentReviewer)
      return false;
    if (currentStatus !== "all" && item.status !== currentStatus)
      return false;
    if (searchTerm) {
      const titleMatch = String(item.title || "")
        .toLowerCase()
        .includes(searchTerm);
      const authorMatch = String(item.author || "")
        .toLowerCase()
        .includes(searchTerm);
      if (!titleMatch && !authorMatch) return false;
    }
    return true;
  });

  // 以書名合併
  const grouped = {};
  filtered.forEach((item) => {
    const key = item.title.trim();
    if (!grouped[key]) grouped[key] = { ...item, entries: [] };
    grouped[key].entries.push(item);
  });

  const groups = Object.values(grouped).map((book) => {
    // 備註共用：從所有 entries 中取第一個非空的備註
    book.notes =
      book.entries.map((e) => e.notes).find((n) => n && n.trim()) || "";
    // 新增日期：取這本書所有評論者當中最早加入待購的那個時間點
    book.addedAt = Math.min(...book.entries.map((e) => toMillis(e.timestamp)));
    return book;
  });

  groups.sort((a, b) =>
    currentSort === "asc" ? a.addedAt - b.addedAt : b.addedAt - a.addedAt,
  );

  // 注意：只能寫 #resultCountText，不能直接寫 #resultCount 的 textContent——
  // #resultCount 底下還有 #dataTimeLabel（顯示資料刷新時間），整個覆蓋會把它一起清掉。
  const countEl = document.getElementById("resultCountText");
  countEl.textContent = groups.length > 0 ? `共 ${groups.length} 本書籍` : "";

  if (groups.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">📭 目前沒有符合條件的待購書籍</div>';
    return;
  }

  grid.innerHTML = groups
    .map((book) => {
      const isShared =
        book.entries.length >= 2 ||
        allItems.filter(
          (i) =>
            i.title.trim() === book.title.trim() &&
            i.purchased !== "purchased",
        ).length >= 2;

      const coverHTML = book.coverUrl
        ? `<img src="${book.coverUrl}" alt="封面" loading="lazy"
             data-title="${escH(book.title)}"
             data-bw="${escH(book.ebookUrl)}"
             data-chil="${escH(book.chilUrl)}"
             onerror="handleWishlistCoverError(this)">`
        : `<div style="text-align: center;">
             <div class="no-cover-text">無封面</div>
             <button class="re-fetch-btn" onclick="reFetchWishlistCover('${escQ(book.title)}', '${escQ(book.ebookUrl)}', '${escQ(book.chilUrl)}', event)">🔍 抓取</button>
           </div>`;

      // 狀態是書籍屬性，取第一筆 entry 的狀態代表整本書
      const bookStatus = book.status;
      const bsc = STATUS_CONFIG[bookStatus] || {};
      const statusRowHTML = `
      <div class="wl-status-row">
        <span class="status-chip ${bsc.cls || ""}">${bsc.label || bookStatus}</span>
        <button class="edit-status-btn" onclick="openStatusModal('${escQ(book.title)}', '${escQ(bookStatus)}')">✎ 狀態</button>
      </div>`;

      const entriesHTML = book.entries
        .map((entry) => {
          const entryNotes = entry.notes
            ? `<div class="entry-notes">${escH(entry.notes)}</div>`
            : "";
          const isPurchased = entry.purchased === "purchased";
          return `
        <div class="wl-entry">
          <div class="entry-top-row">
            <span class="wl-reviewer-name">${entry.reviewer}</span>
            ${isPurchased ? '<span style="font-size:0.72rem;color:#a1a1aa;">✅ 已購入</span>' : ""}
            <div class="entry-actions">
              <button class="entry-btn" onclick="openEditModal('${escQ(entry.id)}', '${escQ(entry.title)}', '${escQ(entry.notes)}')">✎ 備註</button>
              ${!isPurchased ? `<button class="entry-btn upgrade-btn" onclick="upgradeToArchive('${escQ(entry.id)}', '${escQ(entry.title)}', '${escQ(entry.jpTitle)}', '${escQ(entry.author)}', '${escQ(entry.ebookUrl)}', '${escQ(entry.chilUrl)}', '${escQ(entry.coverUrl)}')">📚 升級</button>` : ""}
              <button class="entry-btn delete-btn" onclick="deleteEntry('${escQ(entry.id)}')">🗑</button>
            </div>
          </div>
          ${entryNotes}
        </div>`;
        })
        .join("");

      const notesHTML = "";

      const linksHTML = [
        book.ebookUrl
          ? `<a href="${book.ebookUrl}" target="_blank" class="wl-link ebook">📖 BookWalker</a>`
          : "",
        book.chilUrl
          ? `<a href="${book.chilUrl}"  target="_blank" class="wl-link chil">🍒 ちるちる</a>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      return `
      <div class="wl-item${book.entries.every((e) => e.purchased === "purchased") ? " purchased" : ""}">
        <div class="wl-cover">${coverHTML}</div>
        <div class="wl-body">
          <div class="wl-title-row">
            <h3 class="wl-title">${escH(book.title)}</h3>
            ${isShared ? '<span class="shared-badge">♡ 共同心願</span>' : ""}
            <button class="edit-book-btn" onclick="openBookInfoModal('${escQ(book.title)}', '${escQ(book.jpTitle)}', '${escQ(book.author)}', '${escQ(book.ebookUrl)}', '${escQ(book.chilUrl)}')" title="編輯書籍資訊">⚙️</button>
          </div>
          <p class="wl-author">
            👤 ${escH(book.author || "")}${book.jpTitle ? `<span class="wl-jp-title">${escH(book.jpTitle)}</span>` : ""}
          </p>
          ${statusRowHTML}
          <div class="wl-entries">${entriesHTML}</div>
          ${notesHTML}
          ${linksHTML ? `<div class="wl-links">${linksHTML}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

// ── 重新抓取封面 ──
async function reFetchWishlistCover(title, bwUrl, chilUrl, event) {
  const normalize = (u) => (u && u !== "undefined" ? u : "");
  const finalCoverUrl =
    deriveCoverUrl(normalize(bwUrl)) || deriveCoverUrl(normalize(chilUrl));

  if (!finalCoverUrl) {
    showToast("❌ 缺少有效網址，請先編輯加入購買連結", "error");
    return;
  }

  const btn = event.target;
  const coverContainer = btn.closest(".wl-cover");
  const originalContent = coverContainer.innerHTML;
  coverContainer.innerHTML = `<div class="no-cover-text" style="margin-top:20px;">⌛ 儲存中...</div>`;

  try {
    // 樂觀更新本地陣列
    getAllItems().forEach((item) => {
      if (item.title.trim() === title.trim()) item.coverUrl = finalCoverUrl;
    });

    // 更新畫面
    coverContainer.innerHTML = `<img src="${finalCoverUrl}" alt="封面" loading="lazy" onerror="handleWishlistCoverError(this)">`;

    // 送出到後端更新
    const fd = new FormData();
    fd.append("action", "updateWishlist");
    fd.append("title", title);
    fd.append("coverUrl", finalCoverUrl);

    await BookArchive.postForm(fd);
    showToast("✅ 封面抓取與更新成功", "success");
  } catch (e) {
    coverContainer.innerHTML = originalContent;
    console.error("更新錯誤:", e);
    showToast("❌ 寫入資料庫失敗，請檢查網路連線", "error");
  }
}
window.reFetchWishlistCover = reFetchWishlistCover;

// 處理破圖，自動轉成無封面按鈕
function handleWishlistCoverError(img) {
  const title = img.dataset.title || "";
  const bw = img.dataset.bw || "";
  const chil = img.dataset.chil || "";
  const container = img.closest(".wl-cover");
  container.innerHTML = `<div style="text-align: center;">
     <div class="no-cover-text">無封面</div>
     <button class="re-fetch-btn" onclick="reFetchWishlistCover('${escQ(title)}', '${escQ(bw)}', '${escQ(chil)}', event)">🔍 抓取</button>
   </div>`;
}
window.handleWishlistCoverError = handleWishlistCoverError;
