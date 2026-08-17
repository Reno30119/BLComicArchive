// list.html 進入點：串起各模組（副作用匯入負責掛上 window.* 綁定與事件監聽），
// 並處理 ?tag= 這種頁面啟動時的初始狀態。
import { fetchData, setSearchTags } from "./list-data.js";
import "./list-render.js";
import "./list-search.js";
import "./list-modal-edit.js";
import "./list-modal-comment.js";
import "./list-tag-filter.js";
import "./list-custom-select.js";

const tagParam = new URLSearchParams(window.location.search).get("tag");
if (tagParam) {
  setSearchTags([tagParam]);
}

// 直接呼叫抓取資料
fetchData(false);
