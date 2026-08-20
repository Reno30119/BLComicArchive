// 共用的 HTML 跳脫工具：任何從 Firestore 讀回來的欄位（書名／評語／標籤名稱等）
// 塞進 innerHTML 模板字串之前，一律要先過這裡的函式，否則欄位裡剛好含有
// <、>、&、"、' 這些字元時會被瀏覽器當成 HTML/JS 語法解析，而不是純文字顯示
// ——這個專案的 Firestore Security Rules 目前對所有人開放寫入，代表這不是
// 「使用者手滑打錯字」等級的邊角案例，而是任何人都能直接繞過表單、寫入惡意
// payload 的儲存型 XSS 風險，兩個函式都要當一般資料安全處理，不能省略。

// 給「HTML 文字節點」或「不會再被當成 JS 解析的雙引號屬性」用：
// 例如 <h3>${escapeHtml(book.title)}</h3> 或 alt="${escapeHtml(book.title)}"。
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 給「內嵌在雙引號 onclick="fn('DATA')" 屬性裡、DATA 又是單引號 JS 字串」的場合
// 用，例如 onclick="quickSearch('${escapeJsAttr(tag)}')"。兩層跳脫都要做，
// 順序不能反：先把 DATA 跳脫成合法的單引號 JS 字串內容（反斜線／單引號），
// 這步驟本身就可能重新產生 "、& 這些字元（例如原始資料含 "），所以最後還要
// 再跳脫一次讓外層雙引號 HTML 屬性也安全——但這裡故意不跳脫單引號，因為
// 單引號是 onclick 裡當作 JS 字串邊界用的語法本身，不是資料，跳脫掉反而會讓
// 函式呼叫整個壞掉（"'" 變成 "&#39;" 不是合法 JS 語法）。
export function escapeJsAttr(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
