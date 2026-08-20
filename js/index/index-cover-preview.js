// 封面預覽：依 #coverUrl 欄位目前的值即時顯示圖片，並用文字說明目前狀態
// （載入中／推算成功／載入失敗）。coverUrl 是隱藏欄位，值只會被其他模組
// 用程式設定（不是使用者直接輸入），所以由那些模組在設值後主動呼叫
// updateCoverPreview()，而不是監聽 input/change 事件。
const coverInput = document.getElementById("coverUrl");
const titleInput = document.getElementById("title");
const previewWrap = document.getElementById("coverPreviewWrap");
const previewImg = document.getElementById("coverPreviewImg");
const previewPlaceholder = document.getElementById("coverPreviewPlaceholder");
const previewHint = document.getElementById("coverPreviewHint");

function setPlaceholder(icon, text) {
  previewImg.style.display = "none";
  previewPlaceholder.style.display = "flex";
  previewPlaceholder.innerHTML = `<span class="icon">${icon}</span><span>${text}</span>`;
}

// 把 img／placeholder／hint 內部狀態全部歸零，不是只隱藏外層容器——不然上一本書
// 殘留的舊圖片／舊的「找不到圖片」提示，會在下一次容器重新顯示的瞬間先閃一下，
// 才被新狀態蓋掉。
function resetPreviewState() {
  previewImg.removeAttribute("src");
  previewImg.style.display = "none";
  previewImg.alt = "封面預覽";
  previewPlaceholder.style.display = "none";
  previewPlaceholder.innerHTML = "";
  previewHint.textContent = "";
  previewHint.className = "cover-preview-hint";
}

export function updateCoverPreview() {
  const url = coverInput.value.trim();
  if (!url) {
    resetPreviewState();
    previewWrap.style.display = "none";
    return;
  }

  const title = titleInput.value.trim();
  previewImg.alt = title ? `《${title}》封面預覽` : "封面預覽";

  // 先把內容重置成 loading 狀態，容器才顯示出來——反過來做的話，容器打開的那一刻
  // 內容還是上一次呼叫留下的舊圖片／錯誤提示，會閃一下才被蓋掉。
  previewHint.textContent = "正在載入封面圖片…";
  previewHint.className = "cover-preview-hint";
  setPlaceholder("⌛", "載入中…");
  previewWrap.style.display = "flex";
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
