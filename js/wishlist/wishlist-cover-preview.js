// 「＋ 新增待購書籍」Modal 的封面預覽：依 #addCoverUrl 欄位目前的值即時顯示圖片，
// 分「載入中／推算成功／載入失敗」三種狀態並附文字說明。跟 index.html 的
// index-cover-preview.js 是同一套邏輯，只是換了一組元素 id（add 開頭）。
// #addCoverUrl 只會被 wishlist-modal-add.js 用程式設值（使用者看不到這個隱藏
// 欄位），所以由它在設值後主動呼叫 updateAddCoverPreview()，不是靠監聽 input 事件。
const coverInput = document.getElementById("addCoverUrl");
const previewWrap = document.getElementById("addCoverPreviewWrap");
const previewImg = document.getElementById("addCoverPreviewImg");
const previewPlaceholder = document.getElementById(
  "addCoverPreviewPlaceholder",
);
const previewHint = document.getElementById("addCoverPreviewHint");

function setPlaceholder(icon, text) {
  previewImg.style.display = "none";
  previewPlaceholder.style.display = "flex";
  previewPlaceholder.innerHTML = `<span class="icon">${icon}</span><span>${text}</span>`;
}

export function updateAddCoverPreview() {
  const url = coverInput.value.trim();
  if (!url) {
    previewWrap.style.display = "none";
    previewImg.removeAttribute("src");
    return;
  }

  previewWrap.style.display = "flex";
  previewHint.textContent = "正在載入封面圖片…";
  previewHint.className = "cover-preview-hint";
  setPlaceholder("⌛", "載入中…");
  previewImg.src = url;
}

previewImg.addEventListener("load", () => {
  previewPlaceholder.style.display = "none";
  previewImg.style.display = "block";
  previewHint.textContent = "";
  previewHint.className = "cover-preview-hint";
});

previewImg.addEventListener("error", () => {
  setPlaceholder("🖼️", "找不到圖片");
  previewHint.textContent =
    "⚠️ 封面圖片載入失敗：網址中的商品編號可能有誤，或該書已下架／沒有提供封面圖。不影響送出，可以忽略此欄位。";
  previewHint.className = "cover-preview-hint error";
});
