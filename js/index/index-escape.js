// index-tags.js／index-title-search.js 共用的字串跳脫工具，避免使用者輸入的標籤
// 名稱／書名裡有 &、"、<、>、' 這幾個字元時，插進 innerHTML 樣板字串或 inline
// onclick 屬性時破壞 HTML 結構或提前結束字串。

// 插進 HTML 屬性值（例如 data-tag-name="..."）前先跑這個，& 一定要排第一個，
// 不然後面幾個 replace 產生的 &amp; 會被自己再跳脫一次。
export function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 插進 onclick="fn('...')" 這種單引號包住的 inline JS 字串前先跑這個，
// 避免使用者輸入裡的單引號提前結束字串、破壞後面的參數。
export function escapeJsString(str) {
  return String(str).replace(/'/g, "\\'");
}
