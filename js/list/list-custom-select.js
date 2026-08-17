// 客製化的單選下拉選單（分級／評分／評語狀態），取代原生 <select>（無法跨瀏覽器
// 客製化下拉清單本身的樣式）。實際的篩選值仍寫在對應的隱藏欄位
// （#levelFilter/#ratingFilter/#commentFilter），list-data.js 的 applyFilters()
// 讀的就是這幾個欄位的 value，資料邏輯不需要跟著改。
import { applyFilters } from "./list-data.js";

const SELECT_IDS = ["levelFilter", "ratingFilter", "commentFilter"];

function setupCustomSelect(id) {
  const wrap = document.getElementById(id + "Wrap");
  const toggleBtn = document.getElementById(id + "Toggle");
  const dropdown = document.getElementById(id + "Dropdown");
  const hiddenInput = document.getElementById(id);
  if (!wrap || !toggleBtn || !dropdown || !hiddenInput) return null;

  const label = toggleBtn.querySelector(".custom-select-label");
  const options = [...dropdown.querySelectorAll(".custom-select-option")];

  function refresh() {
    const value = hiddenInput.value;
    const active = options.find((o) => o.dataset.value === value);
    if (active) label.textContent = active.textContent.trim();
    toggleBtn.classList.toggle("has-active-filter", value !== "all");
    options.forEach((o) =>
      o.classList.toggle("selected", o.dataset.value === value),
    );
  }

  function open() {
    dropdown.classList.remove("hidden");
  }
  function close() {
    dropdown.classList.add("hidden");
  }

  // 不能呼叫 e.stopPropagation()：這個 click 事件還要繼續冒泡到 document，
  // 讓「別的下拉選單」用 closest(#idWrap) 判斷出這是外部點擊而把自己收起來。
  // 判斷「是不是點在自己裡面」已經靠 closest() 處理了，不需要靠阻止冒泡來避免自己誤關。
  toggleBtn.addEventListener("click", () => {
    if (dropdown.classList.contains("hidden")) {
      open();
    } else {
      close();
    }
  });

  toggleBtn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  dropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".custom-select-option");
    if (!opt) return;
    hiddenInput.value = opt.dataset.value;
    refresh();
    close();
    applyFilters();
  });

  document.addEventListener("click", (e) => {
    if (
      !dropdown.classList.contains("hidden") &&
      !e.target.closest(`#${id}Wrap`)
    ) {
      close();
    }
  });

  refresh();
  return refresh;
}

const refreshers = SELECT_IDS.map(setupCustomSelect).filter(Boolean);

// resetAllFilters() 直接改 hidden input 的 value，改完後仍會呼叫 applyFilters()，
// 所以由 list-data.js 在 applyFilters() 裡呼叫這個函式，讓按鈕顯示的文字/亮燈
// 狀態能跟著同步，不用讓 list-data.js 自己去讀懂客製化下拉選單的 DOM 結構。
export function refreshCustomSelects() {
  refreshers.forEach((fn) => fn());
}
