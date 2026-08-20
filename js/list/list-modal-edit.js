// 編輯 Modal：書籍基本資訊（齒輪）與個人評語（✎）共用同一個 #editModal，
// 依進入方式切換顯示欄位；也包含標籤輸入的自動完成。
import { getAllBooks, setAllBooks, buildMergedBooks, applyFilters } from "./list-data.js";
import { showSyncToast, friendlyErrorMessage } from "./list-toast.js";
import { escapeHtml, escapeJsAttr } from "../html-escape.js";

function openEditModal(ts) {
  // 找尋對應時間戳記的原始資料
  const book = getAllBooks().find((b) => String(b.timestamp) === String(ts));
  if (!book) return;

  // 將所有欄位填入表單，避免更新時漏掉資料
  document.getElementById("editTimestamp").value = book.timestamp || "";
  document.getElementById("editDocId").value = book.id || "";
  document.getElementById("editTitle").value = book.title || "";
  document.getElementById("editJpTitle").value = book.jpTitle || "";
  document.getElementById("editAuthor").value = book.author || "";
  document.getElementById("editLevel").value = book.level || "正常";
  document.getElementById("editRating").value = book.rating || 5;
  document.getElementById("editTags").value = book.tags || "";
  document.getElementById("editEbookUrl").value = book.ebookUrl || "";
  document.getElementById("editChilUrl").value = book.chilUrl || "";
  document.getElementById("editComment").value = book.comment || "";

  document.getElementById("editModal").classList.remove("hidden");
}
window.openEditModal = openEditModal;

function closeModal() {
  document.getElementById("editModal").classList.add("hidden");
  document.getElementById("editForm").reset();
}
window.closeModal = closeModal;

// 1. 點擊齒輪：編輯基本資訊
function openBookInfoModal(ts) {
  const book = getAllBooks().find((b) => String(b.timestamp) === String(ts));

  if (!book) {
    console.error("❌ 找不到資料！請檢查 allBooks 陣列中是否有這個 TS");
    return;
  }

  // --- 關鍵：恢復顯示所有基本欄位 ---
  document.getElementById("infoFieldsGroup").style.display = "block";
  document.getElementById("commentFieldsGroup").style.display = "none";

  // 恢復書名與其標籤的顯示
  const titleInput = document.getElementById("editTitle");
  const titleLabel = titleInput.previousElementSibling;
  titleInput.style.display = "block";
  if (titleLabel && titleLabel.tagName === "LABEL")
    titleLabel.style.display = "block";

  document.getElementById("modalTitle").innerText = "⚙️ 編輯書籍基本資訊";

  // 填充資料
  // 關鍵填充：確保所有格子在提交時都有原本的內容
  document.getElementById("oldTitle").value = book.title || "";
  document.getElementById("editTimestamp").value = book.timestamp || "";
  document.getElementById("editDocId").value = book.id || "";
  document.getElementById("editTitle").value = book.title || "";
  document.getElementById("editJpTitle").value = book.jpTitle || "";
  document.getElementById("editAuthor").value = book.author || "";
  document.getElementById("editLevel").value = book.level || "正常";
  document.getElementById("editTags").value = book.tags || "";
  // 💡 補上連載狀態的填充
  document.getElementById("editTwStatus").value = book.twStatus || "";
  document.getElementById("editJpStatus").value = book.jpStatus || "";

  document.getElementById("editEbookUrl").value = book.ebookUrl || "";
  document.getElementById("editChilUrl").value = book.chilUrl || "";

  // 即使在齒輪模式，也要填入分數和評語，防止 GAS 寫入空值
  document.getElementById("editRating").value = book.rating || 5;
  document.getElementById("editComment").value = book.comment || "";

  document.getElementById("editModal").classList.remove("hidden");
}
window.openBookInfoModal = openBookInfoModal;

function openCommentModal(ts) {
  const row = getAllBooks().find((b) => String(b.timestamp) === String(ts));

  if (!row) {
    console.error("❌ 找不到資料！請檢查 allBooks 陣列中是否有這個 TS");
    return;
  }

  // 1. 切換 UI 顯示：隱藏基本資訊，顯示評語區
  document.getElementById("infoFieldsGroup").style.display = "none";
  document.getElementById("commentFieldsGroup").style.display = "block";

  // 2. 隱藏書名輸入框與標籤 (維持評語模式的簡潔)
  const titleInput = document.getElementById("editTitle");
  const titleLabel = titleInput.previousElementSibling;
  titleInput.style.display = "none";
  if (titleLabel && titleLabel.tagName === "LABEL") {
    titleLabel.style.display = "none";
  }

  document.getElementById("modalTitle").innerText = "✍️ 編輯我的評語";

  // 3. 填充所有資料 (關鍵：即使隱藏也要填，GAS 才拿得到資料)
  document.getElementById("oldTitle").value = row.title || ""; // 同步更新書名的關鍵
  document.getElementById("editTimestamp").value = row.timestamp || "";
  document.getElementById("editDocId").value = row.id || "";
  document.getElementById("editTitle").value = row.title || ""; // 新書名暫時維持原狀
  document.getElementById("editJpTitle").value = row.jpTitle || "";
  document.getElementById("editAuthor").value = row.author || "";
  document.getElementById("editLevel").value = row.level || "正常";
  document.getElementById("editTags").value = row.tags || "";
  // --- 補上這兩行，確保編輯時狀態不會不見 ---
  document.getElementById("editTwStatus").value = row.twStatus || ""; // 填入台灣狀態
  document.getElementById("editJpStatus").value = row.jpStatus || ""; // 填入日本狀態

  document.getElementById("editEbookUrl").value = row.ebookUrl || ""; // 防止網址消失
  document.getElementById("editChilUrl").value = row.chilUrl || ""; // 防止網址消失

  // 即使在齒輪模式，也要填入分數和評語，防止 GAS 寫入空值
  document.getElementById("editRating").value = row.rating || 5;
  document.getElementById("editComment").value = row.comment || "";

  document.getElementById("editModal").classList.remove("hidden");
  document.getElementById("editRating").dispatchEvent(new Event("input"));
}
window.openCommentModal = openCommentModal;

// 刪除單一評論（單筆 Firestore 文件）。如果這是這本書唯一的一筆資料，
// 整本書也會一併從書庫消失，所以刪除前用 #confirmDeleteModal 明確提醒
// （不用瀏覽器原生 confirm()，維持跟其他 Modal 一致的視覺風格）。
let pendingDeleteReview = null;

function deleteReview(docId, title, reviewer) {
  if (!docId) {
    showSyncToast("❌ 找不到這筆評論的文件 id，請重新整理頁面後再試", "error");
    return;
  }
  const sameTitleCount = getAllBooks().filter(
    (b) => String(b.title).trim() === String(title).trim(),
  ).length;
  const isLastReview = sameTitleCount <= 1;

  pendingDeleteReview = { docId, title, reviewer };

  document.getElementById("confirmDeleteMessage").innerText =
    `確定要刪除《${title}》${reviewer ? `（${reviewer}）` : ""} 的這則評論嗎？`;

  const extraWarningEl = document.getElementById("confirmDeleteExtraWarning");
  if (isLastReview) {
    extraWarningEl.innerText =
      `⚠️ 這是《${title}》目前唯一的一筆資料，刪除後整本書會一併從書庫移除！`;
    extraWarningEl.classList.remove("hidden");
  } else {
    extraWarningEl.innerText = "";
    extraWarningEl.classList.add("hidden");
  }

  document.getElementById("confirmDeleteModal").classList.remove("hidden");
}
window.deleteReview = deleteReview;

function closeDeleteConfirmModal() {
  pendingDeleteReview = null;
  document.getElementById("confirmDeleteModal").classList.add("hidden");
}
window.closeDeleteConfirmModal = closeDeleteConfirmModal;

async function executeDeleteReview() {
  if (!pendingDeleteReview) return;
  const { docId } = pendingDeleteReview;
  const btn = document.getElementById("confirmDeleteBtn");
  btn.disabled = true;
  btn.innerText = "刪除中...";

  try {
    const formData = new FormData();
    formData.append("action", "deleteReview");
    formData.append("docId", docId);
    await BookArchive.postForm(formData);
    showSyncToast("⏳ 已送出，正在確認刪除...", "info");

    const confirmedBooks = await BookArchive.waitForCollection({
      action: "read",
      matches: (books) => !books.some((b) => String(b.id) === docId),
      onAttempt: (attempt, attempts) => {
        btn.innerText = `刪除中... (${attempt}/${attempts})`;
      },
    });

    setAllBooks(confirmedBooks);
    BookArchive.setCachedData("allBooksCache", "allBooksCacheTs", confirmedBooks);
    buildMergedBooks();
    applyFilters();
    showSyncToast("✅ 評論已確認刪除", "success");
    closeDeleteConfirmModal();
  } catch (err) {
    console.error("刪除評論失敗:", err);
    showSyncToast("❌ 刪除失敗：" + friendlyErrorMessage(err), "error");
  } finally {
    btn.disabled = false;
    btn.innerText = "🗑 確定刪除";
  }
}
window.executeDeleteReview = executeDeleteReview;

document.getElementById("confirmDeleteModal").addEventListener("click", (e) => {
  if (e.target.id === "confirmDeleteModal") closeDeleteConfirmModal();
});

// 點背景關閉：跟下拉選單「點外部關閉」是同一套使用者習慣，之前只有
// #confirmDeleteModal 有做，#editModal 補齊同一個行為。
document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target.id === "editModal") closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const confirmModal = document.getElementById("confirmDeleteModal");
  if (!confirmModal.classList.contains("hidden")) {
    closeDeleteConfirmModal();
    return;
  }
  const editModal = document.getElementById("editModal");
  if (!editModal.classList.contains("hidden")) closeModal();
});

document.getElementById("editForm").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const btn = e.target.querySelector(".save-btn");
  btn.innerText = "💾 更新中...";
  btn.disabled = true;

  try {
    await BookArchive.postForm(formData);
    showSyncToast("⏳ 資料已送出，正在確認同步結果...", "info");

    const targetDocId = String(formData.get("docId") || "");
    const confirmedBooks = await BookArchive.waitForCollection({
      action: "read",
      matches: (books) =>
        books.some((book) => {
          if (String(book.id) !== targetDocId) return false;
          return (
            String(book.title || "") === String(formData.get("title") || "") &&
            String(book.jpTitle || "") ===
              String(formData.get("jpTitle") || "") &&
            String(book.author || "") ===
              String(formData.get("author") || "") &&
            String(book.level || "") === String(formData.get("level") || "") &&
            String(book.tags || "") === String(formData.get("tags") || "") &&
            String(book.twStatus || "") ===
              String(formData.get("twStatus") || "") &&
            String(book.jpStatus || "") ===
              String(formData.get("jpStatus") || "") &&
            String(book.rating) === String(formData.get("rating") || "") &&
            String(book.comment || "") === String(formData.get("comment") || "")
          );
        }),
      onAttempt: (attempt, attempts) => {
        btn.innerText = `💾 確認中... (${attempt}/${attempts})`;
      },
    });

    setAllBooks(confirmedBooks);
    BookArchive.setCachedData("allBooksCache", "allBooksCacheTs", confirmedBooks);
    buildMergedBooks();
    applyFilters();
    showSyncToast("✅ 資料已確認更新", "success");
    closeModal();
  } catch (err) {
    console.error("更新書籍失敗:", err);
    showSyncToast("❌ 更新失敗：" + friendlyErrorMessage(err), "error");
  } finally {
    btn.innerText = "儲存修改";
    btn.disabled = false;
  }
};

// 為「編輯評語」的分數欄位綁定變色邏輯
document.getElementById("editRating").addEventListener("input", function () {
  const val = parseFloat(this.value);
  const ratingInput = this;

  // 清除舊類別
  ratingInput.classList.remove("rating-low", "rating-mid", "rating-high");

  // 套用新類別
  if (val < 5.5) {
    ratingInput.classList.add("rating-low");
  } else if (val <= 7) {
    ratingInput.classList.add("rating-mid");
  } else {
    ratingInput.classList.add("rating-high");
  }
});

document.getElementById("editTags").addEventListener("input", function () {
  let val = this.value;

  // 將「空白」或「全形頓號」即時替換為半形逗號
  if (val.includes(" ") || val.includes("、")) {
    this.value = val.replace(/[ 、]+/g, ",");
  }

  // 防止出現連續逗號
  this.value = this.value.replace(/,+/g, ",");
});

let allDefinedTags = []; // 用來存儲從 Tags 分頁抓來的資料

// 1. 初始化抓取標籤定義 (可以在 fetchData 內或 window.onload 執行)
async function fetchTagDefinitions() {
  try {
    allDefinedTags = await BookArchive.fetchJson("readTags");
  } catch (e) {
    console.error("載入標籤定義失敗", e);
  }
}

// 2. 監聽編輯框的輸入
const editTagInput = document.getElementById("editTags");
const customList = document.getElementById("customTagList");

editTagInput.addEventListener("input", function () {
  const fullVal = this.value;
  // 支援空白、逗號、頓號分割
  const parts = fullVal.split(/[ ,、]+/);
  const currentQuery = parts[parts.length - 1].trim().toLowerCase();

  if (currentQuery === "") {
    customList.style.display = "none";
    customList.removeAttribute("data-active-index");
    return;
  }

  const matches = allDefinedTags.filter((t) =>
    t.name.toLowerCase().includes(currentQuery),
  );

  if (matches.length > 0) {
    customList.innerHTML = matches
      .map((t) => {
        const nameAttr = escapeHtml(t.name);
        const nameJsAttr = escapeJsAttr(t.name);
        const defText = escapeHtml(t.definition || "");
        return `
<div class="tag-item" data-tag-name="${nameAttr}" onclick="applyTagToEdit('${nameJsAttr}')">
  <strong>${nameAttr}</strong>
  <span class="tag-desc">${defText}</span>
</div>
`;
      })
      .join("");
    customList.style.display = "block";
  } else {
    customList.style.display = "none";
  }
  customList.removeAttribute("data-active-index");
});

editTagInput.addEventListener("keydown", (event) => {
  const items = customList.querySelectorAll(".tag-item");
  const isVisible = customList.style.display !== "none" && items.length > 0;
  if (!isVisible) return;

  const activeIndex = Number(customList.dataset.activeIndex);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateEditTagRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex + 1 : 0,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateEditTagRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex - 1 : items.length - 1,
    );
  } else if (event.key === "Enter") {
    if (Number.isInteger(activeIndex) && activeIndex >= 0) {
      event.preventDefault();
      const tagName = items[activeIndex].dataset.tagName;
      if (tagName) applyTagToEdit(tagName);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    customList.style.display = "none";
    customList.removeAttribute("data-active-index");
  }
});

function updateEditTagRecommendationHighlight(index) {
  const items = customList.querySelectorAll(".tag-item");
  if (!items.length) return;
  const safeIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const isActive = itemIndex === safeIndex;
    item.classList.toggle("keyboard-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  customList.setAttribute("data-active-index", String(safeIndex));
  items[safeIndex].scrollIntoView({ block: "nearest" });
}

// 3. 點選推薦標籤後的動作
function applyTagToEdit(tagName) {
  let parts = editTagInput.value.split(/[ ,、]+/);
  parts[parts.length - 1] = tagName; // 替換最後一個詞

  // 統一格式為「標籤, 標籤」
  editTagInput.value =
    parts
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .join(", ") + ", ";

  customList.style.display = "none";
  customList.removeAttribute("data-active-index");
  editTagInput.focus();
}
window.applyTagToEdit = applyTagToEdit;

// 4. 點擊外部關閉選單
document.addEventListener("click", (e) => {
  if (e.target !== editTagInput) customList.style.display = "none";
});

// 5. 在頁面載入時執行初始化
window.addEventListener("DOMContentLoaded", fetchTagDefinitions);
