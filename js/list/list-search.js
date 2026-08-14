// 搜尋框的自動完成建議清單（書名／作者／標籤），以及書名/標籤點擊快速搜尋。
import {
  getAllBooks,
  getSelectedSearchTags,
  setSearchTags,
  addSearchTag,
  applyFilters,
  renderActiveTagFilters,
} from "./list-data.js";

// 點擊文字自動填入搜尋框
function quickSearch(text, type = "normal") {
  const searchInput = document.getElementById("searchInput");

  if (type === "tag") {
    addSearchTag(text);
  } else {
    searchInput.value = text;
    // 手動觸發 input 事件讓搜尋邏輯執行
    searchInput.dispatchEvent(new Event("input"));
  }

  // 捲動到頂部方便查看
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.quickSearch = quickSearch;

const searchInput = document.getElementById("searchInput");
const searchRecList = document.getElementById("searchRecommendationList");

function updateSearchRecommendationHighlight(index) {
  const items = searchRecList.querySelectorAll(".tag-item");
  if (!items.length) {
    searchRecList.removeAttribute("data-active-index");
    return;
  }

  const safeIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const isActive = itemIndex === safeIndex;
    item.classList.toggle("keyboard-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  searchRecList.setAttribute("data-active-index", String(safeIndex));
  items[safeIndex].scrollIntoView({ block: "nearest" });
}

function chooseSearchRecommendation(index) {
  const item = searchRecList.querySelectorAll(".tag-item")[index];
  if (!item) return;
  selectSearchRec(item.dataset.value, item.dataset.type);
}

searchInput.addEventListener("input", function () {
  const val = this.value.trim().toLowerCase();

  if (!val) {
    searchRecList.style.display = "none";
    searchRecList.removeAttribute("data-active-index");
    return;
  }

  let suggestions = [];

  getAllBooks().forEach((book) => {
    const title = (book.title || "").toString();
    const author = (book.author || "").toString();
    const tags = (book.tags || "").toString();

    // 1. 書名匹配
    if (title.toLowerCase().includes(val)) {
      suggestions.push({
        text: title,
        sub: author,
        icon: "📖",
        type: "normal",
      });
    }
    // 2. 作者匹配
    if (author && author.toLowerCase().includes(val)) {
      suggestions.push({
        text: author,
        sub: "【作者】",
        icon: "👤",
        type: "normal",
      });
    }
    // 3. 標籤匹配 (關鍵：標記為 tag 類型)
    if (tags && tags.toLowerCase().includes(val)) {
      const tagArr = tags.split(/[ ,、]+/);
      tagArr.forEach((t) => {
        if (t.trim().toLowerCase().includes(val)) {
          suggestions.push({
            text: t.trim(),
            sub: "【標籤】",
            icon: "🏷️",
            type: "tag",
          });
        }
      });
    }
  });

  // 去重
  const uniqueMatches = Array.from(
    new Map(suggestions.map((s) => [s.text, s])).values(),
  ).slice(0, 10);

  if (uniqueMatches.length > 0) {
    searchRecList.innerHTML = uniqueMatches
      .map(
        (item) => `
      <div class="tag-item" data-value="${item.text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" data-type="${item.type}" onclick="selectSearchRec('${item.text.replace(/'/g, "\\'")}', '${item.type}')">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${item.icon} ${item.text}</span>
          <span class="rec-author">${item.sub}</span>
        </div>
      </div>
    `,
      )
      .join("");
    searchRecList.style.display = "block";
    searchRecList.removeAttribute("data-active-index");
  } else {
    searchRecList.style.display = "none";
    searchRecList.removeAttribute("data-active-index");
  }
});

// 推薦清單開啟時可使用上下方向鍵，Enter 確認選項，Escape 關閉清單。
searchInput.addEventListener("keydown", (event) => {
  const items = searchRecList.querySelectorAll(".tag-item");
  const isVisible = searchRecList.style.display !== "none" && items.length > 0;
  if (!isVisible) return;

  const activeIndex = Number(searchRecList.dataset.activeIndex);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateSearchRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex + 1 : 0,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateSearchRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex - 1 : items.length - 1,
    );
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (Number.isInteger(activeIndex) && activeIndex >= 0) {
      chooseSearchRecommendation(activeIndex);
    } else {
      addSearchTag(searchInput.value);
      searchRecList.style.display = "none";
      searchRecList.removeAttribute("data-active-index");
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    searchRecList.style.display = "none";
    searchRecList.removeAttribute("data-active-index");
  }
});

function selectSearchRec(text, type) {
  const searchInput = document.getElementById("searchInput");
  const searchRecList = document.getElementById("searchRecommendationList");
  const clearBtn = document.getElementById("clearSearch");

  // 如果類型是 tag，自動在前面加個 # 符號，變成標籤專用搜尋模式
  if (type === "tag") {
    const selectedTags = getSelectedSearchTags();
    if (!selectedTags.includes(text)) selectedTags.push(text);
    setSearchTags(selectedTags);
    // 選擇推薦標籤後，移除原本輸入的關鍵字，避免殘留在搜尋框。
    searchInput.value = "";
  } else {
    searchInput.value = text;
    renderActiveTagFilters();
  }

  if (clearBtn) clearBtn.style.display = "block";
  if (searchRecList) {
    searchRecList.style.display = "none";
    searchRecList.removeAttribute("data-active-index");
  }

  applyFilters();

  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.selectSearchRec = selectSearchRec;

// 點擊空白處關閉
document.addEventListener("click", (e) => {
  if (e.target !== searchInput) searchRecList.style.display = "none";
});
