// 資料引擎：抓取／合併／篩選／排序書庫資料，以及搜尋列的標籤條件狀態。
// 其他檔案（list-search.js、list-modal-edit.js、list-modal-comment.js）
// 都只透過這裡匯出的函式讀寫書庫資料，不直接互相依賴。
import { renderBooks } from "./list-render.js";
import { showSyncToast, friendlyErrorMessage } from "./list-toast.js";
import { refreshCustomSelects } from "./list-custom-select.js";

let allBooks = [];
let mergedBooks = [];
let isSyncing = false;
let currentReviewer = "all";
let currentSortType = "updated"; // 預設依最近更新
// 各排序方式的預設方向：date/updated/rating 是新到舊／高到低，author/title 是筆畫少到多。
const SORT_DEFAULT_DIR = {
  date: "desc",
  updated: "desc",
  rating: "desc",
  author: "asc",
  title: "asc",
};
let currentSortDir = SORT_DEFAULT_DIR[currentSortType];
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

// 資料刷新時間：跟 index.html 的「🕒 資料時間」badge 是同一套邏輯，
// 顯示在 #resultCount 那一行的 #dataTimeLabel，只在真的抓到資料（快取或網路）
// 時更新，跟每次篩選都會重畫的書籍數量分開處理。
function updateDataTimeLabel(cachedAt) {
  const el = document.getElementById("dataTimeLabel");
  if (!el) return;
  if (!cachedAt) {
    el.textContent = "";
    return;
  }
  const d = new Date(cachedAt);
  const timeStr = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  el.textContent = `· 🕒 資料時間 ${timeStr}`;
}

// 模擬進度條：Firestore 的 getDocs() 是一次性拿到全部資料，SDK 沒有暴露
// 「目前抓到幾 %」這種中間進度事件，沒辦法做出真正反映實際進度的進度條。
// 這裡用業界常見的「假進度」手法：每隔 150ms 往「離 90% 還差多少」走一小步，
// 越接近 90% 增量越小、跑越慢，永遠不會自己到 100%；實際資料回來時才主動
// 呼叫 hideLoadingOverlay() 把它拉到 100%，停留一下再蓋住，讓使用者看得到
// 跑滿的瞬間。
let loadingProgressTimer = null;

function showLoadingOverlay() {
  const loadingEl = document.getElementById("loading");
  const bar = document.getElementById("loadingProgressBar");
  const text = document.getElementById("loadingProgressText");
  if (!loadingEl) return;
  loadingEl.style.display = "flex";
  if (!bar) return;

  let progress = 0;
  bar.style.transform = "scaleX(0)";
  if (text) text.textContent = "0%";
  clearInterval(loadingProgressTimer);
  loadingProgressTimer = setInterval(() => {
    progress += (90 - progress) * 0.1;
    bar.style.transform = `scaleX(${progress / 100})`;
    if (text) text.textContent = `${Math.round(progress)}%`;
  }, 150);
}

function hideLoadingOverlay() {
  const loadingEl = document.getElementById("loading");
  const bar = document.getElementById("loadingProgressBar");
  const text = document.getElementById("loadingProgressText");
  clearInterval(loadingProgressTimer);
  if (bar) bar.style.transform = "scaleX(1)";
  if (text) text.textContent = "100%";
  if (!loadingEl) return;
  setTimeout(() => {
    loadingEl.style.display = "none";
  }, 200);
}

/**
 * 抓取資料函數
 * @param {boolean} isManual - 是否為手動按鈕觸發 (預設為 false)
 */
export async function fetchData(isManual = false) {
  const refreshBtn = document.getElementById("refreshBtn");
  const cached = BookArchive.getBooksCache();
  const cachedData = cached.data;

  if (isSyncing) {
    if (isManual) showSyncToast("⚠️ 資料仍在同步中，請稍候", "info");
    return;
  }
  isSyncing = true;

  if (!isManual && !cachedData) showLoadingOverlay();

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
      updateDataTimeLabel(cached.cachedAt);
      hideLoadingOverlay();
    }

    if (isManual || !cachedData) {
      const result = await BookArchive.loadBooks({ refresh: true });
      const previousDataString = JSON.stringify(cachedData || []);
      const newDataString = JSON.stringify(result.data);

      allBooks = result.data;
      // 將新資料存入快取 (視你的 BookArchive 實作而定，通常 loadBooks 會順便存)

      buildMergedBooks();
      applyFilters();
      updateDataTimeLabel(result.cachedAt);

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
      hideLoadingOverlay();
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
          : `❌ 同步失敗：${friendlyErrorMessage(error)}`,
      "error",
    );
  } finally {
    isSyncing = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = "🔄 更新書庫";
      refreshBtn.style.opacity = "1";
    }
    hideLoadingOverlay();
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
  refreshCustomSelects();

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

  // 4. 排序邏輯：先算「由小到大／筆畫少到多」的差值，currentSortDir 是 desc 時再反轉，
  // 這樣每種排序方式的預設方向（見 SORT_DEFAULT_DIR）跟切換方向後的邏輯可以共用同一套算法。
  filtered.sort((a, b) => {
    let diff = 0;
    if (currentSortType === "rating") diff = a.avgRating - b.avgRating;
    else if (currentSortType === "author")
      diff = String(a.author).localeCompare(String(b.author), "zh-Hant");
    else if (currentSortType === "title")
      diff = String(a.title).localeCompare(String(b.title), "zh-Hant");
    else if (currentSortType === "updated")
      diff = a.latestTimestamp - b.latestTimestamp;
    else if (currentSortType === "date")
      diff = toMillis(a.timestamp) - toMillis(b.timestamp);
    return currentSortDir === "asc" ? diff : -diff;
  });

  renderBooks(filtered);
}
window.applyFilters = applyFilters;

const SORT_FIELD_LABELS = {
  date: "📅 最新",
  updated: "🕐 近期更新",
  rating: "⭐ 評分",
  author: "🖋️ 作者",
  title: "📜 書名",
};

// 更新排序下拉選單的按鈕文字、選項亮燈狀態，以及方向反轉按鈕的箭頭（▲ 由小到大／▼ 由大到小）。
function updateSortSelectUI() {
  const toggleLabel = document.querySelector(
    "#sortFieldToggle .custom-select-label",
  );
  if (toggleLabel) toggleLabel.textContent = SORT_FIELD_LABELS[currentSortType] || "";

  document
    .querySelectorAll("#sortFieldDropdown .custom-select-option")
    .forEach((opt) => {
      const isActive = opt.dataset.sort === currentSortType;
      opt.classList.toggle("selected", isActive);
      opt.setAttribute("aria-selected", String(isActive));
    });

  const dirBtn = document.getElementById("sortDirToggle");
  if (dirBtn) {
    const isAsc = currentSortDir === "asc";
    dirBtn.textContent = isAsc ? "▲" : "▼";
    dirBtn.setAttribute(
      "aria-label",
      isAsc ? "目前由小到大，點擊改成由大到小" : "目前由大到小，點擊改成由小到大",
    );
  }
}

// 統一排序入口：點同一種排序方式會反轉方向，切到別的排序方式則改用該排序的預設方向。
export function sortData(type) {
  if (type === currentSortType) {
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSortType = type;
    currentSortDir = SORT_DEFAULT_DIR[type] || "desc";
  }
  updateSortSelectUI();
  applyFilters();
}
window.sortData = sortData;

// 排序欄位下拉選單的開關；跟 list-custom-select.js 的另外三個下拉選單不同，
// 這裡選項點擊要呼叫 sortData()（同一個欄位再點一次會反轉方向），不是單純寫入
// 隱藏欄位，所以另外寫一份。方向反轉額外有一顆獨立按鈕，不用開下拉選單就能
// 一鍵反轉，行為對齊改版前「再點一次同一顆排序 chip 會反轉方向」的操作方式。
function setupSortSelect() {
  const wrap = document.getElementById("sortFieldWrap");
  const toggleBtn = document.getElementById("sortFieldToggle");
  const dropdown = document.getElementById("sortFieldDropdown");
  const dirBtn = document.getElementById("sortDirToggle");
  if (!wrap || !toggleBtn || !dropdown || !dirBtn) return;

  function open() {
    dropdown.classList.remove("hidden");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function close() {
    dropdown.classList.add("hidden");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  // 不能呼叫 e.stopPropagation()：這個 click 事件還要繼續冒泡到 document，
  // 讓「別的下拉選單」用 closest() 判斷出這是外部點擊而把自己收起來。
  toggleBtn.addEventListener("click", () => {
    if (dropdown.classList.contains("hidden")) open();
    else close();
  });

  toggleBtn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  dropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".custom-select-option");
    if (!opt) return;
    sortData(opt.dataset.sort);
    close();
  });

  dirBtn.addEventListener("click", () => sortData(currentSortType));

  document.addEventListener("click", (e) => {
    if (!dropdown.classList.contains("hidden") && !e.target.closest("#sortFieldWrap")) {
      close();
    }
  });
}
setupSortSelect();

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
  currentSortDir = SORT_DEFAULT_DIR[currentSortType];
  updateSortSelectUI();

  applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.resetAllFilters = resetAllFilters;

const sInput = document.getElementById("searchInput");
const cBtn = document.getElementById("clearSearch");
const activeTagFilters = document.getElementById("activeTagFilters");

// applyFilters() 會整個重畫 #bookGrid，每個按鍵都觸發太浪費，所以加 200ms 防抖；
// 清除按鈕的顯示/隱藏很便宜，維持即時反應，不用等防抖。list-search.js 另外掛了
// 一個 input 監聽器處理自動完成建議清單，那個維持即時、不受這裡影響。
let searchDebounceTimer = null;
sInput.addEventListener("input", () => {
  cBtn.style.display = sInput.value ? "block" : "none";
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyFilters, 200);
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

// 頁面載入時先畫一次排序下拉選單與方向按鈕，對齊 HTML 預設啟用的「近期更新」。
updateSortSelectUI();
