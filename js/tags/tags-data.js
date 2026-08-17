// 資料引擎：抓取／保存標籤定義清單，以及依 localStorage 書庫快取計算標籤使用次數。
// tags-render.js／tags-form.js 都只透過這裡匯出的函式讀寫標籤資料。
import { renderTagList } from "./tags-render.js";

const CACHE_KEY = "allBooksCache";

let allTags = [];

export function getAllTags() {
  return allTags;
}

export function setAllTags(tags) {
  allTags = tags;
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
  document.getElementById("tagCountSubtitle").textContent =
    `共 ${allTags.length} 個標籤定義`;
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
    allTags.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant"),
    );
    updateTagCountSubtitle();
    renderTagList(allTags, allTags.length);
  } catch (err) {
    console.error("載入標籤失敗:", err);
    listDiv.innerHTML = `<p class="tag-list-empty" style="color:#be123c">❌ 載入失敗：${String(err.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
  }
}
