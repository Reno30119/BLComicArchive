// 資料引擎：抓取／保存標籤定義清單，以及依 localStorage 書庫快取計算標籤使用次數。
// tags-render.js／tags-form.js 都只透過這裡匯出的函式讀寫標籤資料。
import { renderTagList } from "./tags-render.js";

const CACHE_KEY = "allBooksCache";

let allTags = [];

export function getAllTags() {
  return allTags;
}

export function setAllTags(tags) {
  allTags = sortTags(tags);
}

// ── 排序 ──
// 依名稱（中文筆畫）或使用次數排序；兩個類型分區（系列／內容）各自維持這個
// 排序，不會打散分區。比照 list.html 排序 UI「同一個欄位再點一次會反轉方向」
// 的操作習慣。
let currentSortField = "name";
let currentSortDir = "asc";
const SORT_DEFAULT_DIR = { name: "asc", usage: "desc" };

export function getSortState() {
  return { field: currentSortField, dir: currentSortDir };
}

export function setSortField(field) {
  if (field === currentSortField) {
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSortField = field;
    currentSortDir = SORT_DEFAULT_DIR[field] || "asc";
  }
}

export function sortTags(tags) {
  const counts = getTagUsageCounts();
  return [...tags].sort((a, b) => {
    const diff =
      currentSortField === "usage"
        ? (counts[a.name] || 0) - (counts[b.name] || 0)
        : String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
    return currentSortDir === "asc" ? diff : -diff;
  });
}

// 依目前排序狀態重新排列 allTags 本身（不重新抓資料），供切換排序方式時呼叫。
export function resortTags() {
  allTags = sortTags(allTags);
}

// 使用次數計算依賴的書庫快取存不存在——不存在時 getTagUsageCounts() 會安靜地
// 全部回傳 0，跟「這個標籤真的沒人用」看起來一模一樣，容易誤導。
// updateTagCountSubtitle() 會用這個判斷決定要不要額外提示使用者。
export function hasBooksCache() {
  try {
    return Boolean(localStorage.getItem(CACHE_KEY));
  } catch {
    return false;
  }
}

export function getTagUsageCounts() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return {};
    const books = JSON.parse(cached);
    if (!Array.isArray(books)) return {};
    const counts = {};
    books.forEach((book) => {
      if (book.tags) {
        book.tags.split(",").forEach((tag) => {
          const t = tag.trim();
          if (t) counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    return counts;
  } catch {
    return {};
  }
}

export function updateTagCountSubtitle() {
  const seriesCount = allTags.filter((t) => t.type === "series").length;
  const contentCount = allTags.length - seriesCount;
  const el = document.getElementById("tagCountSubtitle");
  el.textContent =
    seriesCount > 0
      ? `共 ${allTags.length} 個標籤定義（🧩 ${seriesCount} 系列／🏷️ ${contentCount} 內容）`
      : `共 ${allTags.length} 個標籤定義`;
  if (!hasBooksCache()) {
    el.textContent += "・尚未讀取書庫資料，使用次數可能不準確";
  }
}

export async function loadTags() {
  const listDiv = document.getElementById("tagList");
  listDiv.innerHTML = `<p class="tag-list-empty">載入中...</p>`;
  try {
    allTags = await BookArchive.fetchJson(
      "readTags",
      {},
      {
        timeoutMs: 30000,
        retries: 1,
      },
    );
    allTags = sortTags(allTags);
    updateTagCountSubtitle();
    renderTagList(allTags, allTags.length);
  } catch (err) {
    console.error("載入標籤失敗:", err);
    listDiv.innerHTML = `<p class="tag-list-empty" style="color:#be123c">❌ 載入失敗：${String(err.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
  }
}
