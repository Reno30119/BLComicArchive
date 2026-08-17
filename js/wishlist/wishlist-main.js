// wishlist.html 進入點：串起各模組（副作用匯入負責掛上 window.* 綁定與事件監聽），
// 並觸發首次待購清單讀取。
import { fetchWishlist } from "./wishlist-data.js";
import "./wishlist-render.js";
import "./wishlist-search.js";
import "./wishlist-modal-add.js";
import "./wishlist-modal-edit.js";
import "./wishlist-modal-bookinfo.js";
import "./wishlist-actions.js";

fetchWishlist();
