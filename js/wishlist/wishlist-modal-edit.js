// 「✎ 編輯備註」Modal 與「✎ 編輯書籍狀態」Modal（皆為個人/書籍屬性的小型編輯彈窗）。
import {
  getAllItems,
  confirmWishlistWrite,
  fetchWishlist,
} from "./wishlist-data.js";
import { renderWishlist } from "./wishlist-render.js";
import { showToast } from "./wishlist-toast.js";

// ── 編輯備註 Modal ──
function openEditModal(docId, title, notes) {
  document.getElementById("editTimestamp").value = docId;
  document.getElementById("editTitle").value = title;
  document.getElementById("editNotes").value = notes || "";
  document.getElementById("editModalTitle").textContent =
    `✎ 備註 —「${title}」`;
  document.getElementById("editModal").classList.remove("hidden");
}
window.openEditModal = openEditModal;

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
}
window.closeEditModal = closeEditModal;

async function submitEdit() {
  const docId = document.getElementById("editTimestamp").value;
  const title = document.getElementById("editTitle").value;
  const notes = document.getElementById("editNotes").value.trim();

  // 樂觀更新（只更新自己那筆）
  getAllItems().forEach((item) => {
    if (item.id === docId) item.notes = notes;
  });
  renderWishlist();
  closeEditModal();
  showToast("✅ 備註已更新", "success");

  const fd = new FormData();
  fd.append("action", "updateWishlist");
  fd.append("docId", docId);
  fd.append("notes", notes);

  try {
    showToast("⏳ 已送出，正在確認更新...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite((items) =>
      items.some((item) => String(item.id) === docId && item.notes === notes),
    );
    showToast("✅ 備註已確認更新", "success");
  } catch (e) {
    showToast("⚠️ 尚未確認更新結果，請稍後重新同步確認", "error");
    await fetchWishlist(true);
  }
}
window.submitEdit = submitEdit;

// ── 編輯書籍狀態 Modal ──
function openStatusModal(title, currentStatus) {
  document.getElementById("statusModalBookTitle").value = title;
  document.getElementById("statusModalStatus").value = currentStatus;
  document.getElementById("statusModalTitle").textContent =
    `✎ 書籍狀態 —「${title}」`;
  document
    .querySelectorAll("#statusModal .status-select-btn")
    .forEach((b) => {
      b.className = "status-select-btn";
      if (b.dataset.status === currentStatus)
        b.classList.add("active-" + currentStatus);
    });
  document.getElementById("statusModal").classList.remove("hidden");
}
window.openStatusModal = openStatusModal;

function closeStatusModal() {
  document.getElementById("statusModal").classList.add("hidden");
}
window.closeStatusModal = closeStatusModal;

function setStatusModalStatus(btn) {
  const s = btn.dataset.status;
  document.getElementById("statusModalStatus").value = s;
  document.querySelectorAll("#statusModal .status-select-btn").forEach((b) => {
    b.className = "status-select-btn";
  });
  btn.classList.add("active-" + s);
}
window.setStatusModalStatus = setStatusModalStatus;

async function submitStatusEdit() {
  const title = document.getElementById("statusModalBookTitle").value;
  const status = document.getElementById("statusModalStatus").value;
  if (!status) {
    showToast("❌ 請選擇狀態", "error");
    return;
  }

  // 樂觀更新：同書名的所有項目都更新
  getAllItems().forEach((item) => {
    if (item.title.trim() === title.trim()) item.status = status;
  });
  renderWishlist();
  closeStatusModal();
  showToast("✅ 狀態已更新", "success");

  const fd = new FormData();
  fd.append("action", "updateWishlist");
  fd.append("title", title);
  fd.append("status", status);

  try {
    showToast("⏳ 已送出，正在確認更新...", "info");
    await BookArchive.postForm(fd);
    await confirmWishlistWrite((items) =>
      items
        .filter((item) => item.title.trim() === title.trim())
        .every((item) => item.status === status),
    );
    showToast("✅ 書籍狀態已確認更新", "success");
  } catch (e) {
    showToast("⚠️ 尚未確認更新結果，請稍後重新同步確認", "error");
    await fetchWishlist(true);
  }
}
window.submitStatusEdit = submitStatusEdit;
