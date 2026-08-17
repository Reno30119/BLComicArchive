// 封面預覽：依 #coverUrl 欄位目前的值即時顯示圖片，並用文字說明目前狀態
// （載入中／推算成功／載入失敗）。coverUrl 是隱藏欄位，值只會被其他模組
// 用程式設定（不是使用者直接輸入），所以由那些模組在設值後主動呼叫
// updateCoverPreview()，而不是監聽 input/change 事件。
const coverInput = document.getElementById("coverUrl");
const previewWrap = document.getElementById("coverPreviewWrap");
const previewImg = document.getElementById("coverPreviewImg");
const previewPlaceholder = document.getElementById("coverPreviewPlaceholder");
const previewHint = document.getElementById("coverPreviewHint");

function setPlaceholder(icon, text) {
  previewImg.style.display = "none";
  previewPlaceholder.style.display = "flex";
  previewPlaceholder.innerHTML = `<span class="icon">${icon}</span><span>${text}</span>`;
}

export function updateCoverPreview() {
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
