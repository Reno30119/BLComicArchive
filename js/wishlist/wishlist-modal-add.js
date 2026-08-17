// 「＋ 新增待購書籍」Modal：書名重複偵測、ちるちる/BookWalker 封面自動帶入、送出新增。
import {
  getAllItems,
  STATUS_CONFIG,
  confirmWishlistWrite,
  fetchWishlist,
  deriveCoverUrl,
} from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";
import { updateAddCoverPreview } from "./wishlist-cover-preview.js";

let addReviewer = "";
let addStatus = "";

function openAddModal() {
  addReviewer = "";
  addStatus = "";
  document.getElementById("addModal").classList.remove("hidden");
  document.getElementById("addChilUrl").value = "";
  document.getElementById("addEbookUrl").value = "";
  document.getElementById("addTitle").value = "";
  document.getElementById("addJpTitle").value = "";
  document.getElementById("addAuthor").value = "";
  document.getElementById("addCoverUrl").value = "";
  updateAddCoverPreview();
  document.getElementById("addNotes").value = "";
  document.getElementById("addReviewer").value = "";
  document.getElementById("addStatus").value = "";
  document.getElementById("addFetchHint").textContent = "";
  document.getElementById("addTitleHint").textContent = "";
  document.getElementById("addTitleHint").style.color = "";
  document
    .querySelectorAll(".rev-select-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll("#addModal .status-select-btn")
    .forEach((b) => (b.className = "status-select-btn"));
}
window.openAddModal = openAddModal;

function closeAddModal() {
  document.getElementById("addModal").classList.add("hidden");
}
window.closeAddModal = closeAddModal;

function setAddReviewer(name, btn) {
  addReviewer = name;
  document.getElementById("addReviewer").value = name;
  document
    .querySelectorAll(".rev-select-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  checkTitleDuplicate(); // 選完評論者重新判斷
}
window.setAddReviewer = setAddReviewer;

function setStatus(btn) {
  const s = btn.dataset.status;
  addStatus = s;
  document.getElementById("addStatus").value = s;
  document.querySelectorAll("#addModal .status-select-btn").forEach((b) => {
    b.className = "status-select-btn";
  });
  btn.classList.add("active-" + s);

  // 選「尚未有日版電子書」或「日文版待購」時，若中文書名空白且日文書名有值，自動帶入
  if (s === "jp_physical" || s === "jp_ebook") {
    const titleEl = document.getElementById("addTitle");
    const jpTitleEl = document.getElementById("addJpTitle");
    if (!titleEl.value.trim() && jpTitleEl.value.trim()) {
      titleEl.value = jpTitleEl.value.trim();
      checkTitleDuplicate();
    }
  }
}
window.setStatus = setStatus;

// 新增書名重複偵測（書名輸入、選評論者時都觸發）
function checkTitleDuplicate() {
  const hint = document.getElementById("addTitleHint");
  const inputTitle = document
    .getElementById("addTitle")
    .value.trim()
    .toLowerCase();
  if (!inputTitle) {
    hint.textContent = "";
    return;
  }

  const matches = getAllItems().filter(
    (i) =>
      i.purchased !== "purchased" &&
      i.title.trim().toLowerCase() === inputTitle,
  );

  if (matches.length === 0) {
    hint.textContent = "";
    return;
  }

  if (addReviewer) {
    const mine = matches.find((i) => i.reviewer === addReviewer);
    const theirs = matches.find((i) => i.reviewer !== addReviewer);
    if (mine) {
      const sc = STATUS_CONFIG[mine.status] || {};
      hint.textContent = `⚠️ 你已有這本書（${sc.label || mine.status}）`;
      hint.style.color = "#d97706";
    } else if (theirs) {
      hint.textContent = `♡ 對方也有這本書，新增後會顯示「共同心願」`;
      hint.style.color = "#c0392b";
    }
  } else {
    // 還沒選評論者時，顯示所有已有的人
    const names = [...new Set(matches.map((i) => i.reviewer))].join("、");
    hint.textContent = `📋 ${names} 的待購清單已有這本書`;
    hint.style.color = "#6b7280";
  }
}

document
  .getElementById("addTitle")
  .addEventListener("input", checkTitleDuplicate);

async function fillWishlistCover(url, showHint = false) {
  if (!url) return "";

  const hint = document.getElementById("addFetchHint");
  if (showHint) {
    hint.textContent = "正在解析封面...";
    hint.className = "fetch-hint loading";
  }

  const finalCoverUrl = deriveCoverUrl(url);

  // 根據解析結果更新畫面與隱藏欄位
  if (finalCoverUrl) {
    document.getElementById("addCoverUrl").value = finalCoverUrl;
    updateAddCoverPreview();
    if (showHint) {
      hint.textContent = "✅ 已成功帶入封面";
      hint.className = "fetch-hint success";
    }
    return finalCoverUrl;
  } else {
    if (showHint) {
      hint.textContent = "⚠️ 無法解析此網址的封面格式";
      hint.className = "fetch-hint";
      hint.style.color = "#d97706";
    }
    return "";
  }
}

// ちるちる 只補封面，不再抓取書名與作者。
document.getElementById("addChilUrl").addEventListener("change", function () {
  return fillWishlistCover(this.value.trim(), true);
});

// BookWalker 封面
document.getElementById("addEbookUrl").addEventListener("change", function () {
  return fillWishlistCover(this.value.trim(), false);
});

async function submitAdd() {
  const title = document.getElementById("addTitle").value.trim();
  const reviewer = document.getElementById("addReviewer").value;
  const status = document.getElementById("addStatus").value;
  if (!title) {
    showToast("❌ 請填入中文書名", "error");
    return;
  }
  if (!reviewer) {
    showToast("❌ 請選擇評論者", "error");
    return;
  }
  if (!status) {
    showToast("❌ 請選擇狀態", "error");
    return;
  }

  const ebookUrl = document.getElementById("addEbookUrl").value.trim();
  const chilUrl = document.getElementById("addChilUrl").value.trim();
  let coverUrl = document.getElementById("addCoverUrl").value.trim();

  // 不依賴 change 事件是否已完成；按下新增時再確保封面已算出。
  if (!coverUrl) {
    coverUrl = await fillWishlistCover(ebookUrl || chilUrl, false);
  }

  const newItem = {
    timestamp: String(Date.now()),
    title,
    jpTitle: document.getElementById("addJpTitle").value.trim(),
    author: document.getElementById("addAuthor").value.trim(),
    reviewer,
    status,
    notes: document.getElementById("addNotes").value.trim(),
    ebookUrl,
    chilUrl,
    coverUrl,
    purchased: "",
  };

  // 樂觀更新：先把新項目加到畫面，不等後端回應
  getAllItems().push(newItem);
  renderWishlist();
  closeAddModal();
  showToast("✅ 已加入待購清單", "success");

  const fd = new FormData();
  fd.append("action", "addWishlist");
  fd.append("title", newItem.title);
  fd.append("jpTitle", newItem.jpTitle);
  fd.append("author", newItem.author);
  fd.append("reviewer", newItem.reviewer);
  fd.append("status", newItem.status);
  fd.append("notes", newItem.notes);
  fd.append("ebookUrl", newItem.ebookUrl);
  fd.append("chilUrl", newItem.chilUrl);
  fd.append("coverUrl", newItem.coverUrl);

  try {
    showToast("⏳ 已送出，正在確認儲存...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite((items) =>
      items.some(
        (item) =>
          item.title === newItem.title &&
          item.reviewer === newItem.reviewer &&
          item.status === newItem.status &&
          item.notes === newItem.notes,
      ),
    );
    showToast("✅ 已確認加入待購清單", "success");
  } catch (e) {
    showToast("⚠️ 尚未確認新增結果，請稍後重新同步確認", "error");
    await fetchWishlist(true);
  }
}
window.submitAdd = submitAdd;
