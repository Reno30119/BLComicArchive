// 搜尋框：依書名／作者篩選待購清單，並提供輸入時的自動完成建議清單。
// 搜尋字串本身不放進 wishlist-data.js 的篩選狀態，直接由 wishlist-render.js
// 即時讀取 #searchInput 的值（跟 list.html 的搜尋處理方式一致），這裡只負責
// 輸入事件觸發重繪，以及自動完成清單的顯示/選取/鍵盤操作。
import { getAllItems } from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";

const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearSearch");
const recList = document.getElementById("searchRecommendationList");

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateRecommendations(val) {
  if (!val) {
    recList.style.display = "none";
    recList.removeAttribute("data-active-index");
    return;
  }

  const suggestions = [];
  getAllItems().forEach((item) => {
    const title = String(item.title || "");
    const author = String(item.author || "");
    if (title.toLowerCase().includes(val)) {
      suggestions.push({ text: title, sub: author, icon: "📖" });
    }
    if (author && author.toLowerCase().includes(val)) {
      suggestions.push({ text: author, sub: "【作者】", icon: "👤" });
    }
  });

  const uniqueMatches = Array.from(
    new Map(suggestions.map((s) => [s.text, s])).values(),
  ).slice(0, 10);

  if (uniqueMatches.length > 0) {
    recList.innerHTML = uniqueMatches
      .map(
        (item) => `
      <div class="tag-item" data-value="${escHtml(item.text)}" onclick="selectSearchRec('${item.text.replace(/'/g, "\\'")}')">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${item.icon} ${escHtml(item.text)}</span>
          <span class="rec-author">${escHtml(item.sub)}</span>
        </div>
      </div>
    `,
      )
      .join("");
    recList.style.display = "block";
  } else {
    recList.style.display = "none";
  }
  recList.removeAttribute("data-active-index");
}

searchInput.addEventListener("input", function () {
  clearBtn.style.display = this.value ? "block" : "none";
  renderWishlist();
  updateRecommendations(this.value.trim().toLowerCase());
});

function updateRecommendationHighlight(index) {
  const items = recList.querySelectorAll(".tag-item");
  if (!items.length) {
    recList.removeAttribute("data-active-index");
    return;
  }
  const safeIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const isActive = itemIndex === safeIndex;
    item.classList.toggle("keyboard-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  recList.setAttribute("data-active-index", String(safeIndex));
  items[safeIndex].scrollIntoView({ block: "nearest" });
}

// 推薦清單開啟時可使用上下方向鍵，Enter 確認選項，Escape 關閉清單。
searchInput.addEventListener("keydown", (event) => {
  const items = recList.querySelectorAll(".tag-item");
  const isVisible = recList.style.display !== "none" && items.length > 0;
  if (!isVisible) return;

  const activeIndex = Number(recList.dataset.activeIndex);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex + 1 : 0,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex - 1 : items.length - 1,
    );
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (Number.isInteger(activeIndex) && activeIndex >= 0) {
      const item = items[activeIndex];
      if (item) selectSearchRec(item.dataset.value);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    recList.style.display = "none";
    recList.removeAttribute("data-active-index");
  }
});

function selectSearchRec(text) {
  searchInput.value = text;
  clearBtn.style.display = "block";
  recList.style.display = "none";
  recList.removeAttribute("data-active-index");
  renderWishlist();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.selectSearchRec = selectSearchRec;

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.style.display = "none";
  recList.style.display = "none";
  renderWishlist();
  searchInput.focus();
});

// 點擊空白處關閉推薦清單
document.addEventListener("click", (e) => {
  if (e.target !== searchInput) recList.style.display = "none";
});
