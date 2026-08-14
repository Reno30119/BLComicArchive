// 新增書籍表單：評分/分級/評論者按鈕、封面自動抓取、標籤格式化、送出寫入 Firestore。
import { showToast } from "./index-toast.js";
import { resetSearchFeedback } from "./index-title-search.js";
import { fetchAndRefreshStatus } from "./index-status.js";

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

// BookWalker 封面抓取（純字串推算，無需 HTTP 請求）
async function autoFetchCover() {
  const bwUrl = document.getElementById("ebookUrl").value.trim();
  if (!bwUrl) return;

  const coverInput = document.getElementById("coverUrl");
  const msg = document.getElementById("message");

  try {
    const data = await BookArchive.fetchJson("fetchCover", {
      url: bwUrl,
    });

    if (data.coverUrl) {
      // BookWalker 封面優先，無條件覆蓋（即使 ちるちる 已填入封面）
      coverInput.value = data.coverUrl;
      msg.innerHTML = "✅ BookWalker 封面已帶入！";
      msg.className = "success show";
      msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 2000);
    }
  } catch (err) {
    console.error("封面抓取失敗", err);
  }
}

// ちるちる 書籍資料自動帶入（書名、日文書名、作者、封面）
async function fetchMetaAndFill() {
  const chilUrl = document.getElementById("chilUrl").value.trim();
  if (!chilUrl) return;

  const msg = document.getElementById("message");
  msg.innerHTML = "🔍 正在從 ちるちる 抓取書籍資料...";
  msg.className = "info show";
  msg.classList.remove("hidden");

  try {
    const data = await BookArchive.fetchJson("fetchMeta", {
      url: chilUrl,
    });

    if (data.error) {
      msg.classList.add("hidden");
      return;
    }

    const filled = [];

    // 只在欄位是空的時候才填入，不覆蓋已手動輸入的內容
    const titleInput = document.getElementById("title");
    const jpTitleInput = document.getElementById("jpTitle");
    const authorInput = document.getElementById("author");
    const coverInput = document.getElementById("coverUrl");

    if (data.title && !titleInput.value.trim()) {
      titleInput.value = data.title;
      titleInput.dispatchEvent(new Event("input")); // 觸發重複書名檢查
      filled.push("書名");
    }
    if (data.jpTitle && !jpTitleInput.value.trim()) {
      jpTitleInput.value = data.jpTitle;
      filled.push("日文書名");
    }
    if (data.author && !authorInput.value.trim()) {
      authorInput.value = data.author;
      filled.push("作者");
    }
    // 封面：若尚未有 BookWalker 封面才填入（BookWalker 優先）
    if (data.coverUrl && !coverInput.value.trim()) {
      coverInput.value = data.coverUrl;
      filled.push("封面");
    }

    if (filled.length > 0) {
      msg.innerHTML = `✅ 已自動帶入：${filled.join("、")}（中文書名請手動填寫）`;
      msg.className = "success show";
    } else {
      msg.classList.add("hidden");
    }
    setTimeout(() => msg.classList.add("hidden"), 3000);
  } catch (err) {
    console.error("fetchMeta 失敗", err);
    msg.classList.add("hidden");
  }
}

// ebookUrl（BookWalker）→ 只抓封面，且優先覆蓋
// chilUrl（ちるちる）→ 抓書名、作者、日文書名、封面（封面為備用）
document.getElementById("ebookUrl").addEventListener("change", autoFetchCover);
document.getElementById("chilUrl").addEventListener("change", fetchMetaAndFill);
// 監聽輸入事件 (打字或按上下鈕都會觸發)
ratingInput.addEventListener("input", (e) => {
  updateRatingColor(e.target.value);
});

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

    // 寫入成功後重新讀取，讓上方「已有幾本書」的數字立即反映剛新增的這筆
    fetchAndRefreshStatus(true);

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
