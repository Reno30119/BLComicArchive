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

export function renderTagList(data, totalCount) {
  const listDiv = document.getElementById("tagList");
  const listTitle = document.getElementById("listTitle");

  if (data.length === 0) {
    listDiv.innerHTML = `<p class="tag-list-empty">找不到符合的標籤</p>`;
    listTitle.textContent = "標籤清單";
    return;
  }

  const isFiltered = data.length < totalCount;
  listTitle.textContent = isFiltered
    ? `標籤清單（符合 ${data.length} / ${totalCount}）`
    : `標籤清單（共 ${data.length} 個）`;

  const counts = getTagUsageCounts();
  listDiv.innerHTML = data
    .map((t) => {
      const cnt = counts[t.name] || 0;
      const cntText =
        cnt > 0 ? `<span class="tag-count">${cnt} 本</span>` : "";
      const defHtml = t.definition
        ? escapeHtml(t.definition)
        : `<span class="tag-def-empty">未定義</span>`;
      return `
        <div class="tag-list-item">
          <div class="tag-info">
            <div class="tag-name-row">
              <span class="tag-name" data-tag="${escapeAttr(t.name)}" title="點擊查看此標籤的所有書籍">${escapeHtml(t.name)}</span>
              ${cntText}
            </div>
            <div class="tag-def">${defHtml}</div>
          </div>
          <div class="tag-actions">
            <button class="tag-edit-btn"
              data-name="${escapeAttr(t.name)}"
              data-def="${escapeAttr(t.definition || "")}">編輯</button>
            <button class="tag-del-btn"
              data-name="${escapeAttr(t.name)}">刪除</button>
          </div>
        </div>`;
    })
    .join("");
}
