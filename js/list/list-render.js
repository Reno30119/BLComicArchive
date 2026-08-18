// 書卡渲染：把 mergedBooks 陣列畫成 #bookGrid 裡的卡片，以及封面抓取的補救流程。
import { showSyncToast } from "./list-toast.js";

// 顏色邏輯：與新增時一致
function getScoreColor(val) {
  const s = parseFloat(val);
  if (s < 5.5) return "text-green";
  if (s <= 7) return "text-blue";
  return "text-red";
}

function getLevelColor(level) {
  const mapping = {
    肉多: "red",
    正常: "blue",
    肉少: "orange",
    清水: "green",
  };
  return mapping[level] || "green";
}

export function renderBooks(data) {
  const grid = document.getElementById("bookGrid");
  if (!grid) return;

  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  const filteredData = data.filter(
    (item) => item.title && String(item.title).trim() !== "",
  );

  // 注意：只能寫 #resultCountText，不能直接寫 #resultCount 的 textContent——
  // #resultCount 底下還有 #dataTimeLabel（顯示資料刷新時間），整個覆蓋會把它一起清掉。
  const countEl = document.getElementById("resultCountText");
  if (countEl) {
    countEl.textContent =
      filteredData.length > 0
        ? `共 ${filteredData.length} 本書籍`
        : "無符合條件的書籍";
  }

  filteredData.forEach((book) => {
    const row = document.createElement("div");
    row.className = "book-list-item";
    row.dataset.level = book.level || "";

    const avgRating = parseFloat(book.avgRating || 0).toFixed(1);
    const ratingVal = parseFloat(avgRating);
    row.dataset.ratingTier =
      ratingVal < 5.5 ? "low" : ratingVal <= 7 ? "mid" : "high";

    const titleAttr = (book.title || "").replace(/"/g, "&quot;");

    const coverHTML =
      book.coverUrl && book.coverUrl !== ""
        ? `<img src="${book.coverUrl}" alt="${titleAttr} 封面" loading="lazy"
          data-title="${titleAttr}"
          data-bw="${(book.ebookUrl || "").replace(/"/g, "&quot;")}"
          data-chil="${(book.chilUrl || "").replace(/"/g, "&quot;")}"
          onerror="handleCoverError(this)">`
        : `<div class="no-cover">
           <span>無封面</span>
           <button onclick="reFetchCover('${book.title.replace(/'/g, "\\'")}', '${book.ebookUrl || ""}', '${book.chilUrl || ""}', event)">🔍 抓取</button>
         </div>`;

    const tagsHTML = (book.tags ? String(book.tags).split(",") : [])
      .map((t) => {
        const tag = t.trim();
        return tag
          ? `<button type="button" class="tag-badge" onclick="quickSearch('${tag.replace(/'/g, "\\'")}', 'tag')">#${tag}</button>`
          : "";
      })
      .join("");

    const reviewsHTML = (book.reviews || [])
      .map(
        (r) => `
        <div class="mini-review">
          <span class="rev-name">${r.reviewer}</span>
          <span class="rev-sep">|</span>
          <span class="rev-score ${getScoreColor(r.rating)}">⭐ ${r.rating}</span>
          <span class="rev-comment">${r.comment}</span>
          <button class="small-edit-btn" onclick="openCommentModal('${r.timestamp}')" aria-label="編輯${r.reviewer}對《${titleAttr}》的評語">✎</button>
          <button class="small-delete-btn" onclick="deleteReview('${r.id || ""}', '${book.title.replace(/'/g, "\\'")}', '${r.reviewer.replace(/'/g, "\\'")}')" aria-label="刪除${r.reviewer}對《${titleAttr}》的這則評論">🗑</button>
        </div>
      `,
      )
      .join("");

    row.innerHTML = `
      <div class="item-main">
        <div class="book-cover-side">${coverHTML}</div>
        <div class="item-info">
          <div class="title-row">
            <span class="badge ${getLevelColor(book.level)}">${book.level}</span>
            <h3 class="title">${book.title}</h3>
            <span class="avg-score ${getScoreColor(avgRating)}">${avgRating}</span>
            <button class="edit-book-btn" onclick="openBookInfoModal('${book.reviews[0]?.timestamp || ""}')" title="編輯書籍基本資訊">⚙️</button>
          </div>
          <p class="author">
            👤 <button type="button" class="author-link" onclick="quickSearch('${(book.author || "").replace(/'/g, "\\'")}')">${book.author || ""}</button>
            <span class="jp-title">${book.jpTitle || ""}</span>
          </p>
          <div class="status-row">
            <span class="status-badge-tw">🇹🇼 台：${book.twStatus || "-"}</span>
            <span class="status-badge-jp">🇯🇵 日：${book.jpStatus || "-"}</span>
          </div>
          <div class="tags">${tagsHTML}</div>
          <div class="item-links">
            ${book.ebookUrl ? `<a href="${book.ebookUrl}" target="_blank" class="link-icon ebook">📖 BookWalker</a>` : ""}
            ${book.chilUrl ? `<a href="${book.chilUrl}" target="_blank" class="link-icon chil">🍒 ちるちる</a>` : ""}
            <div class="add-review-action-area">
              <button class="add-review-btn mobile-up-btn" onclick="openAddCommentModal('${book.reviews[0]?.timestamp || ""}')">📝 新增評論</button>
            </div>
          </div>
          <div class="item-reviews">${reviewsHTML}</div>
        </div>
      </div>`;

    fragment.appendChild(row);
  });

  grid.appendChild(fragment);
}

function handleCoverError(img) {
  const title = img.dataset.title || "";
  const bw = img.dataset.bw || "";
  const chil = img.dataset.chil || "";
  img.parentElement.innerHTML = `<div class="no-cover"><span>無封面</span><button onclick="reFetchCover('${title.replace(/'/g, "\\'")}', '${bw.replace(/'/g, "\\'")}', '${chil.replace(/'/g, "\\'")}', event)">🔍 抓取</button></div>`;
}
window.handleCoverError = handleCoverError;

// 1. 抓取封面的補救功能 (已轉接至 Firebase 架構)
async function reFetchCover(title, bwUrl, chilUrl, event) {
  let finalCoverUrl = null;

  // 1. 優先嘗試解析 BookWalker 網址
  if (bwUrl && bwUrl !== "" && bwUrl !== "undefined") {
    const match = bwUrl.match(/product\/(\d+)/);
    if (match && match[1]) {
      const id = match[1];
      finalCoverUrl = `https://taiwan-image.bookwalker.com.tw/product/${id}/${id}_1.jpg`;
    }
  }

  // 2. 如果沒有 BookWalker，則嘗試解析 ちるちる 網址
  if (!finalCoverUrl && chilUrl && chilUrl !== "" && chilUrl !== "undefined") {
    const match = chilUrl.match(/goods_id\/(\d+)/);
    if (match && match[1]) {
      const paddedId = String(match[1]).padStart(8, "0");
      finalCoverUrl = `https://img.chil-chil.net/goods_img/XL/${paddedId}_XL.jpg`;
    }
  }

  // 3. 判斷是否有成功解析出封面網址
  if (!finalCoverUrl) {
    showSyncToast("❌ 缺少有效的網址，或網址格式無法解析封面", "error");
    return;
  }

  const btn = event.target;
  const coverContainer = btn.closest(".book-cover-side");
  const originalContent = coverContainer.innerHTML;
  coverContainer.innerHTML = "<span>⌛ 儲存中...</span>";

  try {
    // 先把前端算出來的圖片網址直接顯示在畫面上，提升使用者體驗
    const titleAttr = (title || "").replace(/"/g, "&quot;");
    coverContainer.innerHTML = `<img src="${finalCoverUrl}" alt="${titleAttr} 封面">`;

    // 同步更新回 Firebase
    const formData = new FormData();
    formData.append("title", title);
    formData.append("coverUrl", finalCoverUrl);
    formData.append("action", "updateCoverOnly");

    await BookArchive.postForm(formData);
    showSyncToast("✅ 封面抓取與更新成功", "success");
  } catch (e) {
    // 若寫入失敗，則還原畫面
    coverContainer.innerHTML = originalContent;
    console.error("更新錯誤:", e);
    showSyncToast("❌ 寫入資料庫失敗，請檢查網路連線", "error");
  }
}
window.reFetchCover = reFetchCover;
