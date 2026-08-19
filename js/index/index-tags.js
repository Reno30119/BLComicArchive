// 標籤雲（分類快速加入）與標籤輸入框的自動完成。
import { escapeHtmlAttr, escapeJsString } from "./index-escape.js";

let allTags = []; // 儲存從 Firestore 抓回來的標籤定義

// 定義分類標籤雲
const categorizedTags = {
  作品性質: ["有續作", "續作", "系列作"],
  角色身分: [
    "DK",
    "大學生",
    "竹馬",
    "床伴",
    "隱藏面貌",
    "年齡差",
    "年下攻",
    "室友",
    "男公關",
  ],
  情境設定: [
    "校園戀愛",
    "職場",
    "演藝圈",
    "樂團",
    "同居",
    "黑道",
    "風俗",
    "棒球",
  ],
  故事特質: ["暗戀", "雙向暗戀", "歡喜冤家", "重逢", "搞笑", "誤會"],
};

async function initTagFeatures() {
  try {
    allTags = await BookArchive.fetchJson("readTags");

    // 渲染標籤雲：現在改用 manualCloudTags
    renderTagCloud();
  } catch (e) {
    console.error("載入標籤失敗", e);
    // 即使讀取失敗，標籤雲還是可以渲染自訂標籤
    renderTagCloud();
  }
}

// 渲染分類標籤雲
function renderTagCloud() {
  const cloud = document.getElementById("tagCloud");
  if (!cloud) return;

  // 明度比主色盤（--accent 等）高一階：這幾色只用在標籤雲的分類點／色塊背景，
  // 直接沿用 --accent 原色調在小色塊上會偏灰暗，調亮後分類辨識度更清楚。
  const categoryColors = {
    作品性質: "#8799be",
    角色身分: "#cba8a5",
    情境設定: "#b99a6e",
    故事特質: "#79a879",
  };

  let html = "";
  for (const [category, tags] of Object.entries(categorizedTags)) {
    const color = categoryColors[category] || "#95a5a6"; // 若沒對應到則用灰色

    html += `
  <div class="tag-group" style="--cat-color: ${color}">
    <div class="tag-group-title">${category}</div>
    <div class="tag-group-items">
      ${tags
        .map(
          (tagName) => `
        <button type="button" class="cloud-item"
              style="background-color: ${color}28;"
              onclick="addTagFromUI('${tagName}')">
          + ${tagName}
        </button>
      `,
        )
        .join("")}
    </div>
  </div>
`;
  }
  cloud.innerHTML = html;

  // 摺疊按鈕邏輯
  const toggleBtn = document.getElementById("toggleCloudBtn");
  toggleBtn.onclick = function () {
    const isExpanded = cloud.classList.toggle("expanded");
    this.innerText = isExpanded ? "收起標籤列表 ▲" : "展開標籤列表 ▼";
  };
}

const tagInput = document.getElementById("tags");
const customList = document.getElementById("customTagList");

tagInput.addEventListener("input", function () {
  const fullVal = this.value;
  const parts = fullVal.split(/[ ,、]+/); // 分割現有標籤
  const currentQuery = parts[parts.length - 1].trim().toLowerCase();

  if (currentQuery === "") {
    customList.style.display = "none";
    customList.removeAttribute("data-active-index");
    tagInput.setAttribute("aria-expanded", "false");
    return;
  }

  const matches = allTags.filter((t) =>
    t.name.toLowerCase().includes(currentQuery),
  );

  if (matches.length > 0) {
    customList.innerHTML = matches
      .map((t) => {
        const isSeries = t.type === "series";
        const cls = isSeries ? "tag-item tag-item-series" : "tag-item";
        const namePrefix = isSeries ? "🧩 " : "";
        return `
  <button type="button" class="${cls}" role="option" aria-selected="false" data-tag-name="${escapeHtmlAttr(t.name)}" onclick="addTagFromUI('${escapeJsString(t.name)}')">
    <strong>${namePrefix}${t.name}</strong>
    <span class="tag-desc">${t.definition || ""}</span>
  </button>
`;
      })
      .join("");
    customList.style.display = "block";
    tagInput.setAttribute("aria-expanded", "true");
  } else {
    customList.style.display = "none";
    tagInput.setAttribute("aria-expanded", "false");
  }
  customList.removeAttribute("data-active-index");
});

tagInput.addEventListener("keydown", (event) => {
  const items = customList.querySelectorAll(".tag-item");
  const isVisible = customList.style.display !== "none" && items.length > 0;
  if (!isVisible) return;

  const activeIndex = Number(customList.dataset.activeIndex);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateTagRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex + 1 : 0,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateTagRecommendationHighlight(
      Number.isInteger(activeIndex) ? activeIndex - 1 : items.length - 1,
    );
  } else if (event.key === "Enter") {
    if (Number.isInteger(activeIndex) && activeIndex >= 0) {
      event.preventDefault();
      const tagName = items[activeIndex].dataset.tagName;
      if (tagName) addTagFromUI(tagName);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    customList.style.display = "none";
    customList.removeAttribute("data-active-index");
    tagInput.setAttribute("aria-expanded", "false");
  }
});

function updateTagRecommendationHighlight(index) {
  const items = customList.querySelectorAll(".tag-item");
  if (!items.length) return;
  const safeIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const isActive = itemIndex === safeIndex;
    item.classList.toggle("keyboard-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  customList.setAttribute("data-active-index", String(safeIndex));
  items[safeIndex].scrollIntoView({ block: "nearest" });
}

// 點選後自動收起搜尋清單，讓標籤雲重新露出來
function addTagFromUI(tagName) {
  const tagInput = document.getElementById("tags");
  let parts = tagInput.value.split(/[ ,、]+/);

  const existingTags = parts.map((p) => p.trim());
  if (!existingTags.includes(tagName)) {
    parts[parts.length - 1] = tagName;
    tagInput.value = parts.filter((p) => p !== "").join(", ") + ", ";
  }

  document.getElementById("customTagList").style.display = "none";
  document.getElementById("customTagList").removeAttribute("data-active-index");
  tagInput.setAttribute("aria-expanded", "false");
  tagInput.focus();
}
window.addTagFromUI = addTagFromUI;

// 點擊外部關閉搜尋推薦
document.addEventListener("click", (e) => {
  if (e.target !== tagInput) {
    customList.style.display = "none";
    tagInput.setAttribute("aria-expanded", "false");
  }
});

initTagFeatures();
