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

  const countEl = document.getElementById("resultCount");
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

    const coverHTML =
      book.coverUrl && book.coverUrl !== ""
        ? `<img src="${book.coverUrl}" alt="封面" loading="lazy"
          data-title="${(book.title || "").replace(/"/g, "&quot;")}"
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
          ? `<span class="tag-badge" onclick="quickSearch('${tag.replace(/'/g, "\\'")}', 'tag')">#${tag}</span>`
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
          <button class="small-edit-btn" onclick="openCommentModal('${r.timestamp}')">✎</button>
          <button class="small-delete-btn" onclick="deleteReview('${r.id || ""}', '${book.title.replace(/'/g, "\\'")}', '${r.reviewer.replace(/'/g, "\\'")}')">🗑</button>
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
            👤 <span class="author-link" onclick="quickSearch('${book.author.replace(/'/g, "\\'")}')">${book.author}</span>
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
  let urlToFetch =
    bwUrl && bwUrl !== "" && bwUrl !== "undefined" ? bwUrl : null;
  if (!urlToFetch) {
    urlToFetch =
      chilUrl && chilUrl !== "" && chilUrl !== "undefined" ? chilUrl : null;
  }

  if (!urlToFetch) {
    showSyncToast("❌ 缺少 BookWalker 或 ちるちる 網址，請先編輯書籍資訊", "error");
    return;
  }

  const btn = event.target;
  const coverContainer = btn.closest(".book-cover-side");
  const originalContent = coverContainer.innerHTML;
  coverContainer.innerHTML = "<span>⌛ 抓取中...</span>";

  try {
    // 改用 BookArchive 的 fetchJson
    const data = await BookArchive.fetchJson("fetchCover", {
      url: urlToFetch,
    });

    if (data && data.coverUrl) {
      coverContainer.innerHTML = `<img src="${data.coverUrl}" alt="封面">`;

      // 同步更新回 Firebase
      const formData = new FormData();
      formData.append("title", title);
      formData.append("coverUrl", data.coverUrl);
      formData.append("action", "updateCoverOnly");

      // 改用 BookArchive 的 postForm
      await BookArchive.postForm(formData);
      showSyncToast("✅ 封面抓取成功", "success");
    } else {
      coverContainer.innerHTML = originalContent;
      // 提醒使用者前端無法直接爬蟲
      showSyncToast(
        "❌ 抓取失敗：前端受限於 CORS 無法直接爬蟲，請檢查 Cloud Functions",
        "error",
      );
    }
  } catch (e) {
    coverContainer.innerHTML = originalContent;
    console.error("抓取錯誤:", e);
    showSyncToast("❌ 連線錯誤或抓取逾時，請檢查網路或後端狀態", "error");
  }
}
window.reFetchCover = reFetchCover;
