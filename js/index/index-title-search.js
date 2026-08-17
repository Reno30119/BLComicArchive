// 書名輸入框：重複書名偵測、自動完成推薦、帶入既有書籍的共用資訊。
import { getAllBooks } from "./index-status.js";
import { showToast } from "./index-toast.js";
import { updateCoverPreview } from "./index-cover-preview.js";

// 異體字對照表，讓書名比對更寬鬆
const variantMap = {
  秘: "祕",
  台: "臺",
  里: "裡",
  搜: "蒐",
  呪: "咒",
  迴: "回",
  猫: "貓",
  峰: "峯",
  嶋: "島",
};

function normalizeText(str) {
  if (!str) return "";
  let normalized = str.trim().toLowerCase();
  for (let key in variantMap) {
    normalized = normalized.split(key).join(variantMap[key]);
  }
  return normalized;
}

const titleInput = document.getElementById("title");
const feedback = document.getElementById("searchFeedback");
const duplicateBookCard = document.getElementById("duplicateBookCard");
const duplicateBookDetails = document.getElementById("duplicateBookDetails");
const duplicateAutofillBtn = document.getElementById("duplicateAutofillBtn");
const titleRecList = document.getElementById("titleRecommendationList");
let searchTimeout;

titleInput.addEventListener("input", function () {
  const inputVal = this.value.trim();
  clearTimeout(searchTimeout);

  if (!inputVal) {
    feedback.innerHTML = "";
    feedback.className = "search-feedback";
    titleRecList.style.display = "none";
    dismissDuplicateCard();
    return;
  }

  // 3. 顯示搜尋中
  feedback.innerHTML = "🔍 正在搜尋書庫...";
  feedback.className = "search-feedback active status-searching";

  const normalizedInput = normalizeText(inputVal);
  const allBooks = getAllBooks();

  // --- A. 下拉推薦邏輯 (模糊搜尋) ---
  // 找出書名包含關鍵字的所有書籍（不重複書名）
  const matches = [...new Set(allBooks.map((b) => b.title))]
    .filter((t) => normalizeText(t).includes(normalizedInput))
    .slice(0, 5); // 只顯示前 5 筆

  if (matches.length > 0) {
    titleRecList.innerHTML = matches
      .map((t) => {
        const book = allBooks.find((b) => b.title === t);
        return `
  <div class="tag-item" data-title="${t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" onclick="selectTitleFromRec('${t.replace(/'/g, "\\'")}')">
    <div style="display:flex; justify-content:space-between;">
      <strong>${t}</strong>
      <span style="color:#a5b1c2; font-size:0.85rem;">${book.author || ""}</span>
    </div>
  </div>`;
      })
      .join("");
    titleRecList.style.display = "block"; // 顯示
  } else {
    titleRecList.style.display = "none"; // 沒資料就隱藏
  }

  titleRecList.removeAttribute("data-active-index");

  // --- B. 重複檢查邏輯 (完全符合) ---
  const existingBook = allBooks.find(
    (b) => normalizeText(String(b.title)) === normalizedInput,
  );

  if (existingBook) {
    feedback.innerHTML = "⚠️ 書庫內已有此書";
    feedback.className = "search-feedback active status-found";
    showDuplicateCard(existingBook);
  } else {
    feedback.innerHTML = "✨ 書庫內尚未有此書";
    feedback.className = "search-feedback active status-new";
    dismissDuplicateCard();
  }
});

function showDuplicateCard(book) {
  const allBooks = getAllBooks();
  const reviewers = [
    ...new Set(
      allBooks
        .filter(
          (item) =>
            normalizeText(String(item.title)) === normalizeText(book.title),
        )
        .map((item) => item.reviewer)
        .filter(Boolean),
    ),
  ];
  const ratings = allBooks
    .filter(
      (item) =>
        normalizeText(String(item.title)) === normalizeText(book.title),
    )
    .map((item) => Number(item.rating))
    .filter((rating) => Number.isFinite(rating));
  const average = ratings.length
    ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
    : "尚無評分";
  const reviewerText = reviewers.length ? reviewers.join("、") : "尚無評論者";

  duplicateBookDetails.textContent = `《${book.title}》｜${book.author || "作者未填"}｜${reviewerText} 已評論｜平均 ${average}`;
  duplicateAutofillBtn.onclick = () => autoFillForm(book);
  duplicateBookCard.classList.remove("hidden");
}

function dismissDuplicateCard() {
  duplicateBookCard.classList.add("hidden");
}
window.dismissDuplicateCard = dismissDuplicateCard;

function updateTitleRecommendationHighlight(index) {
  const items = titleRecList.querySelectorAll(".tag-item");
  if (!items.length) {
    titleRecList.removeAttribute("data-active-index");
    return;
  }

  const safeIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const isActive = itemIndex === safeIndex;
    item.classList.toggle("keyboard-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  titleRecList.setAttribute("data-active-index", String(safeIndex));
  items[safeIndex].scrollIntoView({ block: "nearest" });
}

function chooseTitleRecommendation(index) {
  const item = titleRecList.querySelectorAll(".tag-item")[index];
  if (!item) return;
  const title = item.dataset.title;
  if (title) selectTitleFromRec(title);
}

// 推薦清單開啟時可使用上下方向鍵，Enter 確認選項，Escape 關閉清單。
titleInput.addEventListener("keydown", (event) => {
  const items = titleRecList.querySelectorAll(".tag-item");
  const isVisible = titleRecList.style.display !== "none" && items.length > 0;
  if (!isVisible) return;

  const activeIndex = Number(titleRecList.dataset.activeIndex);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateTitleRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex + 1 : 0,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateTitleRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex - 1 : items.length - 1,
    );
  } else if (event.key === "Enter") {
    if (Number.isInteger(activeIndex) && activeIndex >= 0) {
      event.preventDefault();
      chooseTitleRecommendation(activeIndex);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    titleRecList.style.display = "none";
    titleRecList.removeAttribute("data-active-index");
  }
});

// 處理點選推薦項目的函式
function selectTitleFromRec(title) {
  titleInput.value = title;
  titleRecList.style.display = "none";
  titleRecList.removeAttribute("data-active-index");

  // 找出該書的完整資料並帶入
  const fullBook = getAllBooks().find((b) => b.title === title);
  if (fullBook) {
    autoFillForm(fullBook);
  }
}
window.selectTitleFromRec = selectTitleFromRec;

// 點擊頁面其他地方時關閉清單
document.addEventListener("click", (e) => {
  if (e.target !== titleInput) titleRecList.style.display = "none";
});

// 封裝自動填入邏輯
function autoFillForm(book) {
  const titleField = document.getElementById("title");
  resetSearchFeedback();

  // 1. 強制填入中文書名
  titleField.value = book.title || "";

  dismissDuplicateCard();

  document.getElementById("jpTitle").value = book.jpTitle || "";
  document.getElementById("author").value = book.author || "";
  const bookLevel = book.level || "正常";
  document.getElementById("level").value = bookLevel;
  document.querySelectorAll(".level-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.level === bookLevel);
  });
  document.getElementById("twStatus").value = book.twStatus || "";
  document.getElementById("jpStatus").value = book.jpStatus || "";
  document.getElementById("ebookUrl").value = book.ebookUrl || "";
  document.getElementById("chilUrl").value = book.chilUrl || "";
  document.getElementById("tags").value = book.tags || "";

  // 換書時一律覆寫封面欄位（即使新書沒有封面），避免預覽誤留上一本書的圖。
  document.getElementById("coverUrl").value = book.coverUrl || "";
  updateCoverPreview();
  showToast("✅ 資料已從待購清單帶入", "success");
}

// 專門用來隱藏搜尋回饋與重設狀態的函式
export function resetSearchFeedback() {
  const feedback = document.getElementById("searchFeedback");
  if (feedback) {
    feedback.innerHTML = "";
    feedback.className = "search-feedback"; // 移除 active 類別使其隱藏
  }
  dismissDuplicateCard();
}
