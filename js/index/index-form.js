// 新增書籍表單：評分/分級/評論者按鈕、封面自動抓取、標籤格式化、送出寫入 Firestore。
import { showToast } from "./index-toast.js";
import { resetSearchFeedback } from "./index-title-search.js";
import { fetchAndRefreshStatus } from "./index-status.js";
import { getAllBooks } from "./index-status.js";

// 取得評分輸入框
const ratingInput = document.getElementById("rating");

// 定義顏色切換函數
function updateRatingColor(value) {
  const val = parseFloat(value);
  ratingInput.classList.remove("rating-low", "rating-mid", "rating-high");

  if (val < 5.5) {
    ratingInput.classList.add("rating-low");
  } else if (val <= 7) {
    ratingInput.classList.add("rating-mid");
  } else {
    ratingInput.classList.add("rating-high");
  }
}

// 顯示訊息的共用函數
function showMessage(text, type) {
  const msg = document.getElementById("message");
  msg.innerHTML = text;
  msg.className = `${type} show`;
  msg.classList.remove("hidden");
  setTimeout(() => msg.classList.add("hidden"), 2000);
}

// 1. 從 BookWalker 網址自動產生封面
function autoFetchBwCover() {
  const bwUrl = document.getElementById("ebookUrl").value.trim();
  if (!bwUrl) return;

  const coverInput = document.getElementById("coverUrl");

  // 使用正規表達式擷取網址中的數字 ID，例如 297805
  const match = bwUrl.match(/product\/(\d+)/);
  if (match && match[1]) {
    const id = match[1];
    // 套用 BookWalker 的封面網址規則
    const coverUrl = `https://taiwan-image.bookwalker.com.tw/product/${id}/${id}_1.jpg`;

    // BookWalker 封面優先，無條件覆蓋
    coverInput.value = coverUrl;
    showMessage("✅ BookWalker 封面已帶入！", "success");
  } else {
    console.error("無法解析 BookWalker 網址 ID");
  }
}

// 2. 從 ちるちる (CHIRUCHIRU) 網址自動產生封面
function autoFetchChilCover() {
  const chilUrl = document.getElementById("chilUrl").value.trim();
  if (!chilUrl) return;

  const coverInput = document.getElementById("coverUrl");

  // 使用正規表達式擷取網址中的數字 ID，例如 144944
  const match = chilUrl.match(/goods_id\/(\d+)/);
  if (match && match[1]) {
    const id = match[1];

    // 觀察規則發現，ちるちる 的圖片 ID 必須補足 8 位數，前面補 0 (例如 144944 變成 00144944)
    const paddedId = String(id).padStart(8, "0");
    // 套用ちるちる的封面網址規則
    const coverUrl = `https://img.chil-chil.net/goods_img/XL/${paddedId}_XL.jpg`;

    // 只有在封面欄位是空的時候才填入 (保留 BookWalker 優先的邏輯)
    if (!coverInput.value.trim()) {
      coverInput.value = coverUrl;
      showMessage("✅ ちるちる 封面已帶入！", "success");
    }
  } else {
    console.error("無法解析 ちるちる 網址 ID");
  }
}

// 綁定事件監聽器 (因為不再需要 await 等待 API，移除 async)
document
  .getElementById("ebookUrl")
  .addEventListener("change", autoFetchBwCover);
document
  .getElementById("chilUrl")
  .addEventListener("change", autoFetchChilCover);

// (保留你原有的 Rating 監聽器)
if (ratingInput) {
  ratingInput.addEventListener("input", (e) => {
    updateRatingColor(e.target.value);
  });
}

const tagsInput = document.getElementById("tags");

tagsInput.addEventListener("input", function () {
  let val = this.value;

  // 將「空白」或「全形頓號」即時替換為半形逗號
  if (val.includes(" ") || val.includes("、")) {
    this.value = val.replace(/[ 、]+/g, ",");
  }

  // 防止出現連續逗號
  this.value = this.value.replace(/,+/g, ",");
});

updateRatingColor(ratingInput.value);

const form = document.getElementById("bookForm");
const btn = document.getElementById("submitBtn");
const msg = document.getElementById("message");

const revButtons = document.querySelectorAll(".rev-btn");
const reviewerInput = document.getElementById("reviewer");

revButtons.forEach((button) => {
  button.addEventListener("click", () => {
    revButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    reviewerInput.value = button.getAttribute("data-name");
  });
});

// 分級按鈕
const levelBtns = document.querySelectorAll(".level-btn");
const levelInput = document.getElementById("level");

levelBtns.forEach((button) => {
  button.addEventListener("click", () => {
    levelBtns.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    levelInput.value = button.getAttribute("data-level");
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!reviewerInput.value) {
    showToast("❌ 請先選擇評論者", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "正在抓取封面並寫入...";
  msg.className = "info show";
  msg.classList.remove("hidden");

  // 1. 先抓取並整理標籤（去除多餘空格、重複、及結尾逗號）
  const tagsInputField = document.getElementById("tags");
  const cleanTags = tagsInputField.value
    .trim()
    .replace(/[ ,、]+$/, "")
    .split(/[ ,、]+/)
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .join(", ");

  tagsInputField.value = cleanTags;
  // 4. 準備傳送資料
  const formData = new FormData(form);
  formData.set("tags", cleanTags); // 強制覆蓋，確保標籤雲點選的也有進來
  formData.set("action", "processForm"); // 告訴 BookArchive.postForm 這是新增書籍/評論

  // 5. 如果你後面需要用到 data 物件
  const data = Object.fromEntries(formData.entries());

  try {
    // 1. 自動抓取封面邏輯：優先用 ebookUrl (BookWalker)，沒有就用 chilUrl (ちるちる)
    const targetUrl = data.ebookUrl || data.chilUrl;

    // 如果目前隱藏欄位還沒有封面網址，且有任何一個網址存在，就執行抓取
    if (!data.coverUrl && targetUrl) {
      try {
        const coverJson = await BookArchive.fetchJson("fetchCover", {
          url: targetUrl,
        });

        if (coverJson.coverUrl) {
          // 重要：將抓到的網址「寫入」要送出的 formData 中
          formData.set("coverUrl", coverJson.coverUrl);
        }
      } catch (err) {
        console.error("封面自動抓取失敗，將僅上傳現有資料", err);
      }
    }

    // 改用 Firestore 後，postForm 會直接拋出寫入錯誤，await 成功即代表已寫入。
    await BookArchive.postForm(formData);
    msg.innerHTML = "✅ 書籍已寫入書庫！";
    msg.className = "success show";

    form.reset();
    resetSearchFeedback();

    updateRatingColor(5.0);
    revButtons.forEach((b) => b.classList.remove("active"));
    reviewerInput.value = "";
    levelBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.level === "正常"),
    );
    levelInput.value = "正常";
    btn.disabled = false;
    btn.innerHTML = "確認送出資料";

    window.scrollTo({ top: 0, behavior: "smooth" });

    // 🔥 替換成：直接將剛剛送出的資料假裝塞進本地 allBooks 陣列，並更新數字
    const localBooks = getAllBooks();
    localBooks.push({
      title: data.title,
      reviewer: data.reviewer,
      rating: data.rating,
    });
    // 觸發重新計算徽章（這裡不發送網路請求，純粹更新畫面文字）
    const dbCountBadge = document.getElementById("dbCountBadge");
    if (dbCountBadge) {
      // 利用 Set 去除重複書名計算總書數
      const uniqueCount = new Set(localBooks.map((b) => b.title)).size;
      dbCountBadge.innerHTML = `📖 已暫存：${uniqueCount} 本 (共 ${localBooks.length} 筆評論)`;
      dbCountBadge.className = "status-badge connected";
    }

    setTimeout(() => {
      msg.classList.remove("show");
      msg.classList.add("hidden");
      msg.style.display = "none";
    }, 3000);
  } catch (error) {
    console.error("送出請求時發生錯誤:", error);
    msg.innerHTML = "❌ 寫入失敗：" + error.message;
    msg.className = "error show";
    btn.disabled = false;
    btn.innerHTML = "確認送出資料";
  }
});

function clearFullForm() {
  const form = document.getElementById("bookForm");
  form.reset();
  document.getElementById("coverUrl").value = "";
  document.getElementById("reviewer").value = "";
  document
    .querySelectorAll(".rev-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".level-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.level === "正常"));
  document.getElementById("level").value = "正常";
  updateRatingColor(5.0);
  showToast("🗑️ 表單已清空", "info");
}
window.clearFullForm = clearFullForm;
