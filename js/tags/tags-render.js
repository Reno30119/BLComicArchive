// 標籤清單渲染：把標籤資料畫成 #tagList 裡的列表項目（不處理點擊事件，
// 點擊/編輯/刪除的互動邏輯由 tags-form.js 用事件委派的方式統一處理）。
import { getTagUsageCounts } from "./tags-data.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 折疊狀態記憶：renderTagList() 每次搜尋/存檔/刪除都會整個重畫 #tagList，
// <details> 元素本身也跟著被換掉，內建的 open 狀態當然也會不見。這裡用模組
// 層級變數記住使用者上次手動折疊/展開的結果，重繪時讀出來套用，並在重繪後
// 對新畫出來的 <details> 重新掛一次 toggle 監聽器（舊的元素被整個換掉，監聽器
// 不會留著）。
let seriesSectionOpen = true;
let contentSectionOpen = true;

export function renderTagList(data, totalCount) {
  const listDiv = document.getElementById("tagList");
  const listTitle = document.getElementById("listTitle");

  if (data.length === 0) {
    listDiv.innerHTML = `<p class="tag-list-empty">找不到符合的標籤</p>`;
    listTitle.textContent =
      totalCount > 0 ? `標籤清單（符合 0 / ${totalCount}）` : "標籤清單";
    return;
  }

  const isFiltered = data.length < totalCount;
  listTitle.textContent = isFiltered
    ? `標籤清單（符合 ${data.length} / ${totalCount}）`
    : `標籤清單（共 ${data.length} 個）`;

  const counts = getTagUsageCounts();

  function renderItem(t) {
    const cnt = counts[t.name] || 0;
    const cntText =
      cnt > 0 ? `<span class="tag-count">${cnt} 本</span>` : "";
    const defHtml = t.definition
      ? escapeHtml(t.definition)
      : `<span class="tag-def-empty">未定義</span>`;
    const type = t.type === "series" ? "series" : "content";
    const nameCls = type === "series" ? "tag-name tag-name-series" : "tag-name";
    return `
        <div class="tag-list-item">
          <div class="tag-info">
            <div class="tag-name-row">
              <button type="button" class="${nameCls}" data-tag="${escapeAttr(t.name)}" title="點擊查看此標籤的所有書籍">${escapeHtml(t.name)}</button>
              ${cntText}
            </div>
            <div class="tag-def">${defHtml}</div>
          </div>
          <div class="tag-actions">
            <button class="tag-edit-btn"
              data-name="${escapeAttr(t.name)}"
              data-def="${escapeAttr(t.definition || "")}"
              data-type="${type}">編輯</button>
            <button class="tag-del-btn"
              data-name="${escapeAttr(t.name)}">刪除</button>
          </div>
        </div>`;
  }

  // 系列標籤跟內容標籤分區顯示，用原生 <details>/<summary> 讓每一區可以折疊，
  // 不用另外寫開合的 JS 邏輯跟鍵盤/aria 處理，瀏覽器本來就會處理好。沒有任何
  // 系列標籤時就只會出現「內容標籤」一區；舊資料（沒有 type 欄位）一律當內容
  // 標籤處理，不用遷移。開合狀態沿用 seriesSectionOpen／contentSectionOpen，
  // 不會每次重繪都被打回展開。
  const seriesTags = data.filter((t) => t.type === "series");
  const contentTags = data.filter((t) => t.type !== "series");

  let html = "";
  if (seriesTags.length) {
    html += `
      <details class="tag-section" id="tagSeriesSection"${seriesSectionOpen ? " open" : ""}>
        <summary class="tag-section-heading">🧩 系列標籤（${seriesTags.length}）</summary>
        ${seriesTags.map(renderItem).join("")}
      </details>`;
  }
  if (contentTags.length) {
    html += `
      <details class="tag-section" id="tagContentSection"${contentSectionOpen ? " open" : ""}>
        <summary class="tag-section-heading">🏷️ 內容標籤（${contentTags.length}）</summary>
        ${contentTags.map(renderItem).join("")}
      </details>`;
  }
  listDiv.innerHTML = html;

  const seriesEl = document.getElementById("tagSeriesSection");
  if (seriesEl) {
    seriesEl.addEventListener("toggle", () => {
      seriesSectionOpen = seriesEl.open;
    });
  }
  const contentEl = document.getElementById("tagContentSection");
  if (contentEl) {
    contentEl.addEventListener("toggle", () => {
      contentSectionOpen = contentEl.open;
    });
  }
}
