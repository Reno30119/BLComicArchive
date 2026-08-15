// 資料引擎：抓取／合併／篩選／排序書庫資料，以及搜尋列的標籤條件狀態。
// 其他檔案（list-search.js、list-modal-edit.js、list-modal-comment.js）
// 都只透過這裡匯出的函式讀寫書庫資料，不直接互相依賴。
import { renderBooks } from "./list-render.js";
import { showSyncToast } from "./list-toast.js";

let allBooks = [];
let mergedBooks = [];
let isSyncing = false;
let currentReviewer = "all";
let currentSortType = "updated"; // 預設依最近更新
let selectedSearchTags = [];

// timestamp 可能是新資料的 epoch 毫秒字串（"1745902273000"）、
// 舊資料手動遷移留下的 Date.toString() 字串（"Fri Apr 17 2026 23:11:13 GMT+0800..."），
// 或 Firestore 原生 Timestamp（物件，有 seconds/nanoseconds，或帶 toMillis()）。
// new Date("純數字字串") 在瀏覽器裡不保證能正確解析，所以統一用這個函式轉毫秒數再比較。
function toMillis(ts) {
  if (ts === null || ts === undefined || ts === "") return 0;
  if (typeof ts === "object") {
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
  }
  const num = Number(ts);
  if (!Number.isNaN(num)) return num;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getAllBooks() {
  return allBooks;
}

// 供 modal 送出成功後，把確認過的最新資料寫回這裡並重建畫面。
export function setAllBooks(data) {
  allBooks = data;
}

/**
 * 抓取資料函數
 * @param {boolean} isManual - 是否為手動按鈕觸發 (預設為 false)
 */
export async function fetchData(isManual = false) {
  const loadingEl = document.getElementById("loading");
  const refreshBtn = document.getElementById("refreshBtn");
  const cached = BookArchive.getBooksCache();
  const cachedData = cached.data;

  if (isSyncing) {
    if (isManual) showSyncToast("⚠️ 資料仍在同步中，請稍候", "info");
    return;
  }
  isSyncing = true;

  if (!isManual && !cachedData && loadingEl) loadingEl.style.display = "flex";

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = "🔄 同步中...";
    refreshBtn.style.opacity = "0.7";
  }

  try {
    if (cachedData && allBooks.length === 0) {
      allBooks = cachedData;
      buildMergedBooks();
      applyFilters();
      if (loadingEl) loadingEl.style.display = "none";
    }

    if (isManual || !cachedData) {
      const result = await BookArchive.loadBooks({ refresh: true });
      const previousDataString = JSON.stringify(cachedData || []);
      const newDataString = JSON.stringify(result.data);

      allBooks = result.data;
      // 將新資料存入快取 (視你的 BookArchive 實作而定，通常 loadBooks 會順便存)

      buildMergedBooks();
      applyFilters();

      if (isManual) {
        showSyncToast(
          newDataString === previousDataString
            ? "✨ 目前已是最新資料"
            : "✅ 資料已更新",
          newDataString === previousDataString ? "info" : "success",
        );
      }
    } else {
      // 非手動且有快取，直接略過向 Firebase 請求
      if (loadingEl) loadingEl.style.display = "none";
    }
  } catch (error) {
    const timedOut = error.name === "AbortError";
    console.error("更新失敗:", error);
    showSyncToast(
      cachedData
        ? timedOut
          ? "⚠️ 同步逾時，正在顯示共用資料"
          : "⚠️ 同步失敗，正在顯示共用資料"
        : timedOut
          ? "❌ 連線逾時，請稍後再試"
          : `❌ 同步失敗：${error.message}`,
      "error",
    );
  } finally {
    isSyncing = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = "🔄 更新數據";
      refreshBtn.style.opacity = "1";
    }
    if (loadingEl) loadingEl.style.display = "none";
  }
}
window.fetchData = fetchData;

// 2. 綁定按鈕點擊事件（評論者篩選）
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    // 切換按鈕樣式
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    this.classList.add("active");

    // 更新篩選狀態並重新渲染
    currentReviewer = this.getAttribute("data-reviewer");
    applyFilters();
  });
});

// 預計算合併書籍（資料更新時才呼叫，不在每次篩選時重算）
export function buildMergedBooks() {
  const validData = allBooks.filter(
    (item) => item.title && String(item.title).trim() !== "",
  );

  const merged = validData.reduce((acc, curr) => {
    const bookTitle = String(curr.title).trim();
    if (!acc[bookTitle]) {
      acc[bookTitle] = {
        ...curr,
        title: bookTitle,
        reviews: [],
        tags: curr.tags || "",
      };
    }
    acc[bookTitle].reviews.push({
      id: curr.id,
      reviewer: curr.reviewer || "匿名",
      rating: parseFloat(curr.rating) || 0,
      comment: curr.comment || "",
      timestamp: curr.timestamp,
    });
    return acc;
  }, {});

  mergedBooks = Object.values(merged).map((book) => {
    const totalRating = book.reviews.reduce((sum, r) => sum + r.rating, 0);
    book.avgRating = totalRating / book.reviews.length;
    book.latestTimestamp = Math.max(
      ...book.reviews.map((r) => toMillis(r.timestamp)),
    );
    book.reviews.sort((a, b) =>
      String(a.reviewer).localeCompare(String(b.reviewer), "zh-Hant"),
    );
    return book;
  });
}

// 核心過濾邏輯：直接對已合併的 mergedBooks 做篩選與排序
export function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const selectedSearchTagsForFilter = getSelectedSearchTags();

  const ratingThreshold = document.getElementById("ratingFilter").value;
  const levelThreshold = document.getElementById("levelFilter").value;
  const commentStatus = document.getElementById("commentFilter").value;

  // 執行過濾
  let filtered = mergedBooks.filter((book) => {
    // --- 【搜尋邏輯修正開始】 ---
    const query = searchTerm.trim();
    const selectedTags = selectedSearchTagsForFilter;
    const textQuery = query;
    const bookTagList = String(book.tags || "")
      .toLowerCase()
      .split(/[ ,、]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    const matchSelectedTags = selectedTags.every((tag) =>
      bookTagList.includes(tag.toLowerCase()),
    );

    let matchText = true;
    if (textQuery) {
      const matchTitle = book.title.toLowerCase().includes(textQuery);
      const matchJpTitle = (book.jpTitle || "")
        .toLowerCase()
        .includes(textQuery);
      const matchAuthor = (book.author || "").toLowerCase().includes(textQuery);
      const matchTags = bookTagList.some((tag) => tag.includes(textQuery));
      matchText = matchTitle || matchJpTitle || matchAuthor || matchTags;
    }

    // 多重標籤使用 AND；一般文字搜尋仍維持原本的模糊搜尋。
    const matchSearch = matchSelectedTags && matchText;
    // --- 【搜尋邏輯修正結束】 ---

    // B. 分數區間過濾
    let matchRating = true;
    const score = book.avgRating;
    if (ratingThreshold === "8") matchRating = score >= 8;
    else if (ratingThreshold === "6") matchRating = score >= 6 && score < 8;
    else if (ratingThreshold === "0") matchRating = score < 6;

    // C. 評論者篩選邏輯
    const matchReviewer =
      currentReviewer === "all" ||
      book.reviews.some((r) => r.reviewer === currentReviewer);

    // D. 分級過濾邏輯
    const matchLevel =
      levelThreshold === "all" || book.level === levelThreshold;

    // E. 找出已有有效評分，但評語仍為空白的評論。
    const matchCommentStatus =
      commentStatus === "all" ||
      book.reviews.some(
        (review) => review.rating > 0 && !String(review.comment || "").trim(),
      );

    return (
      matchSearch &&
      matchRating &&
      matchReviewer &&
      matchLevel &&
      matchCommentStatus
    );
  });

  // 4. 排序邏輯
  filtered.sort((a, b) => {
    if (currentSortType === "rating") return b.avgRating - a.avgRating;
    if (currentSortType === "author")
      return String(a.author).localeCompare(String(b.author), "zh-Hant");
    if (currentSortType === "title")
      return String(a.title).localeCompare(String(b.title), "zh-Hant");
    if (currentSortType === "updated")
      return b.latestTimestamp - a.latestTimestamp;
    if (currentSortType === "date")
      return toMillis(b.timestamp) - toMillis(a.timestamp);
    return 0;
  });

  renderBooks(filtered);
}
window.applyFilters = applyFilters;

// 統一排序入口
export function sortData(type) {
  currentSortType = type;
  document.querySelectorAll(".sort-chip").forEach((chip) => {
    chip.classList.toggle("active-chip", chip.dataset.sort === type);
  });
  applyFilters();
}
window.sortData = sortData;

export function resetAllFilters() {
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  searchInput.value = "";
  selectedSearchTags = [];
  if (clearBtn) clearBtn.style.display = "none";
  renderActiveTagFilters();

  document.getElementById("ratingFilter").value = "all";
  document.getElementById("commentFilter").value = "all";
  if (document.getElementById("levelFilter")) {
    document.getElementById("levelFilter").value = "all";
  }

  currentReviewer = "all";
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.getAttribute("data-reviewer") === "all") {
      btn.classList.add("active");
    }
  });

  currentSortType = "updated";
  document.querySelectorAll(".sort-chip").forEach((chip) => {
    chip.classList.toggle("active-chip", chip.dataset.sort === "updated");
  });

  applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.resetAllFilters = resetAllFilters;

const sInput = document.getElementById("searchInput");
const cBtn = document.getElementById("clearSearch");
const activeTagFilters = document.getElementById("activeTagFilters");

sInput.addEventListener("input", () => {
  cBtn.style.display = sInput.value ? "block" : "inline";
  if (!sInput.value) cBtn.style.display = "none";
  applyFilters();
});

cBtn.addEventListener("click", () => {
  sInput.value = "";
  selectedSearchTags = [];
  cBtn.style.display = "none";
  renderActiveTagFilters();
  sInput.focus();
  applyFilters();
});

export function getSelectedSearchTags() {
  return selectedSearchTags;
}

export function renderActiveTagFilters() {
  const tags = getSelectedSearchTags();
  if (!tags.length) {
    activeTagFilters.innerHTML = "";
    activeTagFilters.style.display = "none";
    return;
  }

  activeTagFilters.innerHTML = `
    <span class="active-tag-filter-label">標籤條件（全部符合）</span>
    ${tags.map((tag) => `<button type="button" class="active-tag-filter" data-tag="${tag.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}">#${tag}<span aria-hidden="true">×</span></button>`).join("")}
    <button type="button" class="clear-tag-filters">清除標籤</button>
  `;
  activeTagFilters.style.display = "flex";
}

export function setSearchTags(tags) {
  selectedSearchTags = [...new Set(tags.filter(Boolean))];
  cBtn.style.display =
    sInput.value || selectedSearchTags.length ? "block" : "none";
  renderActiveTagFilters();
  applyFilters();
}

export function addSearchTag(tag) {
  const normalizedTag = tag.replace(/^#/, "").trim();
  if (!normalizedTag) return;

  setSearchTags([...getSelectedSearchTags(), normalizedTag]);
  sInput.value = "";
  const searchRecList = document.getElementById("searchRecommendationList");
  searchRecList.style.display = "none";
  searchRecList.removeAttribute("data-active-index");
  sInput.focus();
}

activeTagFilters.addEventListener("click", (event) => {
  const tagButton = event.target.closest(".active-tag-filter");
  if (tagButton) {
    setSearchTags(
      getSelectedSearchTags().filter((tag) => tag !== tagButton.dataset.tag),
    );
    sInput.focus();
    return;
  }
  if (event.target.closest(".clear-tag-filters")) {
    setSearchTags([]);
    sInput.focus();
  }
});
