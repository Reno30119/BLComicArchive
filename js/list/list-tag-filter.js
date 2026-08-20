// 獨立標籤篩選器：瀏覽書庫裡實際使用過的標籤並多選（AND 篩選，跟搜尋框共用
// list-data.js 的 selectedSearchTags 狀態）。跟搜尋框、書卡標籤 chip、?tag= URL
// 參數這幾個「也會改動已選標籤」的地方不互相呼叫，而是用 MutationObserver 監看
// #activeTagFilters 的重繪來同步徽章數字，避免耦合。
import { getAllBooks, getSelectedSearchTags, setSearchTags } from "./list-data.js";

const toggleBtn = document.getElementById("tagFilterToggleBtn");
const countBadge = document.getElementById("tagFilterCount");
const dropdown = document.getElementById("tagFilterDropdown");
const searchInput = document.getElementById("tagFilterSearch");
const listEl = document.getElementById("tagFilterList");
const activeTagFilters = document.getElementById("activeTagFilters");

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 統計書庫目前實際使用過的標籤；以書名去重，避免同一本書有多筆評論而重複計算。
function computeTagUniverse() {
  const perTitleTags = new Map();
  getAllBooks().forEach((book) => {
    const title = String(book.title || "").trim();
    if (!title || perTitleTags.has(title)) return;
    // book.tags 是已儲存的逗號分隔字串，不能用空白切割（標籤名稱本身可能含空白），
    // 理由同 list-data.js 的 applyFilters()。
    const tags = String(book.tags || "")
      .split(/[,、]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    perTitleTags.set(title, tags);
  });

  const counts = new Map();
  perTitleTags.forEach((tags) => {
    tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"),
    );
}

function renderList() {
  const term = searchInput.value.trim().toLowerCase();
  const universe = computeTagUniverse();
  const filtered = term
    ? universe.filter((t) => t.name.toLowerCase().includes(term))
    : universe;
  const selected = getSelectedSearchTags();

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="tag-filter-empty">找不到符合的標籤</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((t) => {
      const isSelected = selected.includes(t.name);
      return `
    <div class="tag-filter-item${isSelected ? " selected" : ""}" data-tag="${escAttr(t.name)}" role="option" aria-selected="${isSelected}">
      <span class="check">${isSelected ? "✓" : ""}</span>
      <span class="name">${escHtml(t.name)}</span>
      <span class="count">${t.count} 本</span>
    </div>`;
    })
    .join("");
}

function updateToggleBadge() {
  const count = getSelectedSearchTags().length;
  countBadge.textContent = String(count);
  countBadge.classList.toggle("hidden", count === 0);
  toggleBtn.classList.toggle("has-selection", count > 0);
}

function openDropdown() {
  dropdown.classList.remove("hidden");
  toggleBtn.setAttribute("aria-expanded", "true");
  searchInput.value = "";
  renderList();
  searchInput.focus();
}

function closeDropdown() {
  dropdown.classList.add("hidden");
  toggleBtn.setAttribute("aria-expanded", "false");
}

// 不能呼叫 e.stopPropagation()：這個 click 事件還要繼續冒泡到 document，
// 讓「別的下拉選單」（分級/評分/評語狀態的客製化下拉選單）用 closest() 判斷出
// 這是外部點擊而把自己收起來。
toggleBtn.addEventListener("click", () => {
  if (dropdown.classList.contains("hidden")) {
    openDropdown();
  } else {
    closeDropdown();
  }
});

searchInput.addEventListener("input", renderList);

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    closeDropdown();
  }
});

listEl.addEventListener("click", (e) => {
  const item = e.target.closest(".tag-filter-item");
  if (!item) return;
  const tag = item.dataset.tag;
  const selected = getSelectedSearchTags();
  if (selected.includes(tag)) {
    setSearchTags(selected.filter((t) => t !== tag));
  } else {
    setSearchTags([...selected, tag]);
  }
  renderList();
});

// 點擊選單外部關閉（跟其他 custom-tag-list 下拉選單的行為一致）。
document.addEventListener("click", (e) => {
  if (
    !dropdown.classList.contains("hidden") &&
    !e.target.closest(".tag-filter-picker")
  ) {
    closeDropdown();
  }
});

new MutationObserver(updateToggleBadge).observe(activeTagFilters, {
  childList: true,
});

updateToggleBadge();
