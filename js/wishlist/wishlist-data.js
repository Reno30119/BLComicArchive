// 資料引擎：抓取／保存待購清單資料、篩選/排序狀態，以及共用工具函式
// （STATUS_CONFIG、toMillis、escH/escQ）。其他 wishlist-*.js 都只透過這裡
// 匯出的函式讀寫待購資料，避免互相依賴。
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";

export const STATUS_CONFIG = {
  jp_physical: { label: "僅日版，僅實體", cls: "status-jp_physical" },
  jp_ebook: { label: "僅日版，電子版", cls: "status-jp_ebook" },
  tw_physical: { label: "有台版，僅實體", cls: "status-tw_physical" },
  tw_ebook: { label: "有台版，電子版", cls: "status-tw_ebook" },
  purchased: { label: "✅ 已購入", cls: "status-purchased" },
};

let allItems = [];
let currentReviewer = "all";
let currentStatus = "all";
let currentSort = "desc"; // desc = 新增日期新到舊，asc = 舊到新
let showPurchased = false;

export function getAllItems() {
  return allItems;
}

export function setAllItems(items) {
  allItems = items;
}

export function getFilterState() {
  return { currentReviewer, currentStatus, currentSort, showPurchased };
}

// timestamp 可能是 app 自己新增時寫入的 epoch 毫秒字串（"1699999999999"），
// 也可能是手動遷移資料時留下的 Firestore Timestamp（物件，有 seconds/nanoseconds，
// 或帶 toMillis() 方法），這裡統一轉成好比較大小的毫秒數。
export function toMillis(ts) {
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

export function escH(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
export function escQ(s) {
  return String(s || "").replace(/'/g, "\\'");
}

// 從 BookWalker／ちるちる 網址推算封面圖網址（BookWalker 優先，ちるちる 補充），
// 純函式、不碰 DOM。wishlist-modal-add.js（新增時）、wishlist-modal-bookinfo.js
// （編輯書籍資訊時）、wishlist-render.js（封面抓取補救）都共用這一份，避免同一套
// regex 邏輯散落成好幾份副本。
export function deriveCoverUrl(url) {
  if (!url) return "";

  // 1. 優先嘗試解析 BookWalker 網址
  const bwMatch = url.match(/product\/(\d+)/);
  if (bwMatch && bwMatch[1]) {
    const id = bwMatch[1];
    return `https://taiwan-image.bookwalker.com.tw/product/${id}/${id}_1.jpg`;
  }

  // 2. 如果沒有 BookWalker，則嘗試解析 ちるちる 網址
  const chilMatch = url.match(/goods_id\/(\d+)/);
  if (chilMatch && chilMatch[1]) {
    const paddedId = String(chilMatch[1]).padStart(8, "0");
    return `https://img.chil-chil.net/goods_img/XL/${paddedId}_XL.jpg`;
  }

  return "";
}

// ── 篩選/排序 chip 綁定 ──

document.querySelectorAll(".wl-chip[data-reviewer]").forEach((btn) => {
  btn.addEventListener("click", function () {
    document
      .querySelectorAll(".wl-chip[data-reviewer]")
      .forEach((b) => b.classList.remove("active"));
    this.classList.add("active");
    currentReviewer = this.dataset.reviewer;
    renderWishlist();
  });
});

// 排序只有「新增日期」一種維度，比照 list.html 的做法：同一顆按鈕點擊反轉方向，
// 用箭頭（▼ 新到舊／▲ 舊到新）表示目前方向，不用兩顆各自代表一個方向的按鈕。
const sortToggleBtn = document.getElementById("sortToggleBtn");

function updateSortToggleAria() {
  const isDesc = currentSort === "desc";
  sortToggleBtn.setAttribute(
    "aria-label",
    isDesc ? "依新增日期，目前新到舊，點擊改成舊到新" : "依新增日期，目前舊到新，點擊改成新到舊",
  );
}

sortToggleBtn.addEventListener("click", () => {
  currentSort = currentSort === "desc" ? "asc" : "desc";
  sortToggleBtn.querySelector(".sort-dir-arrow").textContent =
    currentSort === "desc" ? "▼" : "▲";
  updateSortToggleAria();
  renderWishlist();
});
updateSortToggleAria();

// 狀態篩選：客製化下拉選單（原生 <select> 的下拉清單本身沒辦法套用自訂樣式），
// 沿用 list.html 那組 .custom-select-* 樣式（定義在 list-style.css，兩頁共用）
// 維持風格一致。只有一個下拉選單，不像 list.html 有三個，所以直接寫在這裡，
// 不另外拆檔案。
const statusFilterWrap = document.getElementById("statusFilterWrap");
const statusFilterToggle = document.getElementById("statusFilterToggle");
const statusFilterDropdown = document.getElementById("statusFilterDropdown");
const statusFilterLabel = statusFilterToggle.querySelector(
  ".custom-select-label",
);
const statusFilterOptions = [
  ...statusFilterDropdown.querySelectorAll(".custom-select-option"),
];

function refreshStatusFilterUI() {
  const active = statusFilterOptions.find(
    (o) => o.dataset.value === currentStatus,
  );
  if (active) statusFilterLabel.textContent = active.textContent.trim();
  statusFilterToggle.classList.toggle(
    "has-active-filter",
    currentStatus !== "all",
  );
  statusFilterOptions.forEach((o) => {
    const isActive = o.dataset.value === currentStatus;
    o.classList.toggle("selected", isActive);
    o.setAttribute("aria-selected", String(isActive));
  });
}

function openStatusFilterDropdown() {
  statusFilterDropdown.classList.remove("hidden");
  statusFilterToggle.setAttribute("aria-expanded", "true");
}
function closeStatusFilterDropdown() {
  statusFilterDropdown.classList.add("hidden");
  statusFilterToggle.setAttribute("aria-expanded", "false");
}

statusFilterToggle.addEventListener("click", () => {
  if (statusFilterDropdown.classList.contains("hidden")) {
    openStatusFilterDropdown();
  } else {
    closeStatusFilterDropdown();
  }
});

statusFilterToggle.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    closeStatusFilterDropdown();
  }
});

statusFilterDropdown.addEventListener("click", (e) => {
  const opt = e.target.closest(".custom-select-option");
  if (!opt) return;
  currentStatus = opt.dataset.value;
  refreshStatusFilterUI();
  closeStatusFilterDropdown();
  renderWishlist();
});

// 不能呼叫 e.stopPropagation()：這個 click 事件還要繼續冒泡到 document，
// 讓別的下拉選單用 closest() 判斷出這是外部點擊而把自己收起來（曾經因為呼叫過
// stopPropagation() 導致別的下拉選單點了也關不掉，這裡刻意不重蹈覆轍）。
document.addEventListener("click", (e) => {
  if (
    !statusFilterDropdown.classList.contains("hidden") &&
    !e.target.closest("#statusFilterWrap")
  ) {
    closeStatusFilterDropdown();
  }
});

refreshStatusFilterUI();

export function toggleShowPurchased(btn) {
  showPurchased = !showPurchased;
  btn.classList.toggle("active", showPurchased);
  renderWishlist();
}
window.toggleShowPurchased = toggleShowPurchased;

// ── 抓資料 ──
const WISHLIST_CACHE_KEY = "wishlistCache";
const WISHLIST_CACHE_TS_KEY = "wishlistCacheTs";
const WISHLIST_CACHE_TTL = 3 * 60 * 1000; // 3 分鐘

export async function confirmWishlistWrite(matches, { onAttempt } = {}) {
  const confirmedItems = await BookArchive.waitForCollection({
    action: "readWishlist",
    matches,
    onAttempt,
  });
  allItems = confirmedItems;
  BookArchive.setCachedData(
    WISHLIST_CACHE_KEY,
    WISHLIST_CACHE_TS_KEY,
    confirmedItems,
  );
  renderWishlist();
}

// 資料刷新時間：跟 index.html/list.html 的「🕒 資料時間」是同一套邏輯，
// 顯示在 #resultCount 那一行的 #dataTimeLabel。
function updateDataTimeLabel(cachedAt) {
  const el = document.getElementById("dataTimeLabel");
  if (!el) return;
  if (!cachedAt) {
    el.textContent = "";
    return;
  }
  const d = new Date(cachedAt);
  const dateStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
  const timeStr = `${dateStr} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  el.textContent = `· 🕒 資料時間 ${timeStr}`;
}

export async function fetchWishlist(isManual = false) {
  const refreshBtn = document.getElementById("wlRefreshBtn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = "🔄 同步中...";
    refreshBtn.style.opacity = "0.7";
  }

  try {
    // 1. 先從快取顯示，讓畫面立即有內容
    const cached = localStorage.getItem(WISHLIST_CACHE_KEY);
    const cachedTs = parseInt(
      localStorage.getItem(WISHLIST_CACHE_TS_KEY) || "0",
    );
    const isFresh = cached && Date.now() - cachedTs < WISHLIST_CACHE_TTL;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          allItems = parsed;
          renderWishlist();
          updateDataTimeLabel(cachedTs);
        }
      } catch {
        localStorage.removeItem(WISHLIST_CACHE_KEY);
        localStorage.removeItem(WISHLIST_CACHE_TS_KEY);
      }
    }

    // 快取新鮮且非手動更新，跳過背景同步
    if (isFresh && !isManual) return;

    // 2. 背景抓最新資料
    try {
      const newData = await BookArchive.fetchJson(
        "readWishlist",
        {},
        {
          refresh: isManual,
          timeoutMs: 30000,
          retries: 1,
        },
      );
      const newStr = JSON.stringify(newData);

      if (newStr !== cached) {
        allItems = newData;
        BookArchive.setCachedData(
          WISHLIST_CACHE_KEY,
          WISHLIST_CACHE_TS_KEY,
          newData,
        );
        renderWishlist();
        updateDataTimeLabel(Date.now());
        if (isManual) showToast("✅ 待購清單已更新", "success");
      } else {
        localStorage.setItem(WISHLIST_CACHE_TS_KEY, String(Date.now()));
        updateDataTimeLabel(Date.now());
        if (isManual) showToast("✨ 目前已是最新資料", "info");
      }
    } catch (e) {
      console.error("載入待購清單失敗", e);
      if (!cached) {
        document.getElementById("wishlistGrid").innerHTML =
          '<div class="empty-state">❌ 載入失敗，請重新整理</div>';
      }
      if (isManual) showToast("❌ 重新讀取失敗，保留目前資料", "error");
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = "🔄 更新書庫";
      refreshBtn.style.opacity = "1";
    }
  }
}
window.fetchWishlist = fetchWishlist;
