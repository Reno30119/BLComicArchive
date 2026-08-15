// 標籤雲（分類快速加入）與標籤輸入框的自動完成。
let allTags = []; // 儲存從 Firestore 抓回來的標籤定義

// 定義分類標籤雲
const categorizedTags = {
  作品性質: ["有續作", "續作", "系列作"],
  角色身分: [
    "DK",
    "大學生",
    "校園戀愛",
    "職場",
    "床伴",
    "隱藏面貌",
    "年齡差",
    "年下攻",
  ],
  故事特質: ["暗戀", "雙向暗戀", "歡喜冤家", "重逢", "同居"],
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

  const categoryColors = {
    作品性質: "#5f77a8",
    角色身分: "#b5837e",
    故事特質: "#5a8a5a",
  };

  let html = "";
  for (const [category, tags] of Object.entries(categorizedTags)) {
    const color = categoryColors[category] || "#95a5a6"; // 若沒對應到則用灰色

    html += `
  <div class="tag-group">
    <div class="tag-group-title" style="border-left-color: ${color}">${category}</div>
    <div class="tag-group-items">
      ${tags
        .map(
          (tagName) => `
        <span class="cloud-item"
              style="border-left: 4px solid ${color} !important; background-color: ${color}15;"
              onclick="addTagFromUI('${tagName}')">
          + ${tagName}
        </span>
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
    return;
  }

  const matches = allTags.filter((t) =>
    t.name.toLowerCase().includes(currentQuery),
  );

  if (matches.length > 0) {
    customList.innerHTML = matches
      .map(
        (t) => `
  <div class="tag-item" data-tag-name="${t.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" onclick="addTagFromUI('${t.name.replace(/'/g, "\\'")}')">
    <strong>${t.name}</strong>
    <span class="tag-desc">${t.definition || ""}</span>
  </div>
`,
      )
      .join("");
    customList.style.display = "block";
  } else {
    customList.style.display = "none";
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
  tagInput.focus();
}
window.addTagFromUI = addTagFromUI;

// 點擊外部關閉搜尋推薦
document.addEventListener("click", (e) => {
  if (e.target !== tagInput) customList.style.display = "none";
});

initTagFeatures();
