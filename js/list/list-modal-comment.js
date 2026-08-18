// 「新增評論」Modal：讓同一本書追加另一位評論者的評分／評語。
import { getAllBooks, setAllBooks, buildMergedBooks, applyFilters } from "./list-data.js";
import { showSyncToast, friendlyErrorMessage } from "./list-toast.js";

// 開啟 Modal
function openAddCommentModal(ts) {
  const bookData = getAllBooks().find((b) => String(b.timestamp) === String(ts));

  if (!bookData) {
    console.error("❌ 找不到資料！請檢查 allBooks 陣列中是否有這個 TS");
    showSyncToast("❌ 系統錯誤：找不到書籍資訊", "error");
    return;
  }

  // 安全填值工具：如果找不到 ID，就不會報錯
  const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val || "";
    } else {
      console.warn(`找不到 ID: ${id}，請檢查 HTML 是否有此隱藏欄位`);
    }
  };

  // 填入資料
  safeSetVal("addCommentTargetTitle", bookData.title);
  safeSetVal("addCommentJpTitle", bookData.jpTitle);
  safeSetVal("addCommentAuthor", bookData.author);
  safeSetVal("addCommentLevel", bookData.level);
  safeSetVal("addCommentTags", bookData.tags);
  safeSetVal("addCommentEbookUrl", bookData.ebookUrl);
  safeSetVal("addCommentChilUrl", bookData.chilUrl);
  safeSetVal("addCommentCoverUrl", bookData.coverUrl);
  safeSetVal("addCommentTwStatus", bookData.twStatus);
  safeSetVal("addCommentJpStatus", bookData.jpStatus);

  // 顯示 Modal
  document.getElementById("addCommentModalTitle").innerText =
    `✍️ 為《${bookData.title}》新增新評論`;
  document.getElementById("addCommentModal").classList.remove("hidden");
  document.getElementById("addCommentRating").dispatchEvent(new Event("input"));
}
window.openAddCommentModal = openAddCommentModal;

// 關閉 Modal
function closeAddCommentModal() {
  document.getElementById("addCommentModal").classList.add("hidden");
  document.getElementById("addCommentForm").reset();
  document
    .querySelectorAll(".rev-select-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("addCommentReviewer").value = "";
  document.getElementById("dupReviewWarning").style.display = "none";
}
window.closeAddCommentModal = closeAddCommentModal;

// 點背景關閉／Esc 關閉：跟下拉選單「點外部關閉」是同一套使用者習慣，
// 也對齊 #confirmDeleteModal／#editModal 已經有的行為。
document.getElementById("addCommentModal").addEventListener("click", (e) => {
  if (e.target.id === "addCommentModal") closeAddCommentModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("addCommentModal");
  if (!modal.classList.contains("hidden")) closeAddCommentModal();
});

// 評論者選擇切換
function setAddReviewer(name, btn) {
  document.getElementById("addCommentReviewer").value = name;
  document
    .querySelectorAll(".rev-select-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  // 重複評論偵測
  const title = document.getElementById("addCommentTargetTitle").value;
  const warning = document.getElementById("dupReviewWarning");
  const msg = document.getElementById("dupReviewMsg");
  const alreadyReviewed = getAllBooks().some(
    (b) =>
      String(b.title).trim() === String(title).trim() &&
      String(b.reviewer).trim() === name,
  );
  if (alreadyReviewed) {
    msg.textContent = `${name} 已評過這本書，確定要新增第二筆嗎？`;
    warning.style.display = "block";
  } else {
    warning.style.display = "none";
  }
}
window.setAddReviewer = setAddReviewer;

// 處理表單送出
document.getElementById("addCommentForm").onsubmit = async function (e) {
  e.preventDefault();

  const reviewer = document.getElementById("addCommentReviewer").value;
  if (!reviewer) {
    showSyncToast("❌ 請先選擇評論者", "error");
    return;
  }

  const btn = document.getElementById("addCommentSaveBtn");
  btn.disabled = true;
  btn.innerText = "儲存中...";

  const formData = new FormData(this);
  formData.append("action", "processForm");

  try {
    await BookArchive.postForm(formData);
    showSyncToast("⏳ 評論已送出，正在確認同步結果...", "info");

    // 1. 建立正規化函式：統一換行符號為 \n，並去除前後多餘空白
    const normalize = (str) => str.replace(/\r\n/g, "\n").trim();

    const expectedTitle = normalize(String(formData.get("title") || ""));
    const expectedReviewer = normalize(String(formData.get("reviewer") || ""));
    const expectedComment = normalize(String(formData.get("comment") || ""));

    const confirmedBooks = await BookArchive.waitForCollection({
      action: "read",
      attempts: 8, // 2. 增加嘗試次數：從 5 次改為 8 次
      delayMs: 2000, // 3. 增加延遲時間：從 1.5 秒改為 2 秒 (共 16 秒緩衝)
      matches: (books) =>
        books.some(
          (book) =>
            // 4. 對回傳的資料也進行相同的正規化比對
            normalize(String(book.title || "")) === expectedTitle &&
            normalize(String(book.reviewer || "")) === expectedReviewer &&
            normalize(String(book.comment || "")) === expectedComment,
        ),
      onAttempt: (attempt, attempts) => {
        btn.innerText = `確認中... (${attempt}/${attempts})`;
      },
    });

    setAllBooks(confirmedBooks);
    BookArchive.setCachedData("allBooksCache", "allBooksCacheTs", confirmedBooks);
    buildMergedBooks();
    applyFilters();
    closeAddCommentModal();
    showSyncToast("✅ 評論已確認建立", "success");
  } catch (err) {
    console.error("儲存失敗:", err);
    showSyncToast("❌ 儲存失敗：" + friendlyErrorMessage(err), "error");
  } finally {
    btn.disabled = false;
    btn.innerText = "確認送出";
  }
};

document
  .getElementById("addCommentRating")
  .addEventListener("input", function () {
    const val = parseFloat(this.value);
    const ratingInput = this;

    // 先清除所有顏色類別
    ratingInput.classList.remove("rating-low", "rating-mid", "rating-high");

    // 根據分數套用類別 (邏輯同 Index)
    if (val < 5.5) {
      ratingInput.classList.add("rating-low");
    } else if (val <= 7) {
      ratingInput.classList.add("rating-mid");
    } else {
      ratingInput.classList.add("rating-high");
    }
  });
