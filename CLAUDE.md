# BLComicArchive — 專案說明

## 專案概述
BL 漫畫書庫管理系統。用於記錄、查詢、評分 BL 漫畫。
評論者：Reno、茶壺。

## 架構

```
靜態前端 (HTML/CSS/JS)
    │
    └─► Google Apps Script (GAS) Web App
            │
            └─► Google Sheets (Books / Tags / Wishlist 工作表)
```

- 前端直接向 GAS URL 發送請求，**沒有中間伺服器**
- POST 請求必須使用 `mode: "no-cors"`（GAS 跨域限制），**無法讀取回應內容**，只能假設成功
- 前端快取使用 `localStorage`：書庫 key 為 `allBooksCache`，待購清單 key 為 `wishlistCache`

## 檔案結構

| 檔案 | 說明 |
|------|------|
| `index.html` | 新增書籍表單頁 |
| `list.html` | 書單查詢頁（含篩選、排序、編輯） |
| `wishlist.html` | 待購清單頁 |
| `tags.html` | 標籤管理頁 |
| `style.css` | index.html 的樣式 |
| `list-style.css` | list.html、wishlist.html 的樣式（共用） |
| `GAS.txt` | Google Apps Script 原始碼（需手動貼到 GAS 編輯器） |
| `manifest.json` | PWA 設定（主畫面捷徑用） |
| `generate-icon.html` | 一次性工具：在瀏覽器開啟後下載 `apple-touch-icon.png` |
| `apple-touch-icon.png` | iOS 主畫面圖示（需先執行 generate-icon.html 產生） |

> 兩個 CSS 檔案共用相同的 `:root` 設計變數，修改時需同步更新兩個檔案。

## 設計系統

### 主色盤（水彩風格參考）
```css
--accent:       #5f77a8;  /* 藍灰，主色 */
--accent-light: #eaeff6;  /* 淡藍灰，背景輕色調 */
--accent-hover: #4a6090;  /* 深藍灰，hover 狀態 */
```

### 分級顏色（前端 + GAS 共用語義）
| 分級 | 顏色 | Hex |
|------|------|-----|
| 肉多 | 紅 | `#e74c3c` |
| 正常 | 藍 | `#3498db` |
| 肉少 | 橘 | `#f39c12` |
| 清水 | 綠 | `#2ecc71` |

### 評分顏色（書卡左側色條 + 評分輸入框）
| 分數 | 顏色 |
|------|------|
| < 5.5 | 霧綠 `#6c7b6a` |
| 5.5 – 7.0 | 藍灰 `#5f77a8` |
| > 7.0 | 霧玫瑰 `#b5837e` |

### 字體
- `'Noto Sans TC'`，所有頁面統一

## Google Sheets 欄位對照（Books 工作表）

| 欄 | 欄位名 | 說明 |
|----|--------|------|
| A | timestamp | 建立時間，用作唯一識別碼 |
| B | title | 中文書名 |
| C | jpTitle | 日文書名 |
| D | author | 作者 |
| E | level | 分級（肉多／正常／肉少／清水） |
| F | reviewer | 評論者（Reno／茶壺） |
| G | rating | 評分（0–10，step 0.5） |
| H | tags | 標籤，以逗號分隔 |
| I | ebookUrl | BookWalker 網址 |
| J | chilUrl | ちるちる 網址 |
| K | comment | 評語內容 |
| L | coverUrl | 封面圖片 URL |
| M | twStatus | 台灣連載狀態 |
| N | jpStatus | 日本連載狀態 |

> 同一本書可以有多筆資料列（多位評論者），前端以書名為 key 合併後顯示。

## Google Sheets 欄位對照（Wishlist 工作表）

| 欄 | 欄位名 | 說明 |
|----|--------|------|
| A | timestamp | 建立時間，用作唯一識別碼 |
| B | title | 中文書名 |
| C | jpTitle | 日文書名 |
| D | author | 作者 |
| E | reviewer | 評論者（Reno／茶壺） |
| F | status | 購買狀態（jp_physical／jp_ebook／tw_physical／tw_ebook） |
| G | notes | 備註（個人可見） |
| H | ebookUrl | BookWalker 網址 |
| I | chilUrl | ちるちる 網址 |
| J | coverUrl | 封面圖片 URL |
| K | purchased | 已購入標記（值為 `"purchased"` 或空字串） |

> `status` 是書籍屬性（同書名的所有列一起更新）；`notes` 和 `purchased` 是個人屬性（以 timestamp 定位特定列）。

## GAS 重要說明

- 修改 GAS 程式碼後，必須「部署 → 管理部署 → 編輯 → 版本：新版本」才會生效，**URL 不會改變**
- `doGet` action：`read`、`readTags`、`fetchCover`、`fetchMeta`（從 ちるちる URL 抓取日文書名／作者／封面）、`readWishlist`
- `doPost` action：`processForm`（新增書籍）、`update`（修改書籍）、`updateCoverOnly`（只更新封面）、`upsertTag`（新增或更新標籤）、`deleteTag`（刪除標籤）、`addWishlist`（新增待購）、`updateWishlist`（更新待購狀態或備註）、`deleteWishlist`（刪除待購）
- 欄位更新使用 `!== undefined` 判斷，確保空字串也能清空欄位

## 已知限制與注意事項

1. **`no-cors` 模式**：POST 成功與否無法從前端確認，UI 預設顯示成功
2. **書名為唯一識別**：修改書名時，GAS 以 `oldTitle` 比對所有同名列並批次更新
3. **封面圖片**：從 BookWalker URL 或 ちるちる URL 推算圖片路徑，非爬蟲抓取
4. **標籤格式**：前端會自動把空格和「、」轉成半形逗號，儲存格式為 `tag1, tag2, tag3`
5. **異體字對照**：index.html 有 `variantMap` 做書名標準化，搜尋時會統一轉換
6. **iOS 圖示**：`apple-touch-icon.png` 需先用瀏覽器開啟 `generate-icon.html` 產生並放到同一資料夾

## 評論者設定

若要新增評論者，需同時修改：
- `index.html`：評論者按鈕 HTML
- `list.html`：篩選面板的評論者按鈕
- `wishlist.html`：篩選面板的評論者按鈕、新增 Modal 的評論者按鈕

## tags.html 功能說明

- **標籤名稱 chip**：點擊後跳轉到 `list.html?tag=標籤名稱`，自動篩選含此標籤的書
- **新增時重複偵測**：輸入標籤名稱時即時比對，若已存在顯示黃色警告並自動帶入現有定義
- **使用次數**：從 `localStorage` 快取計算，顯示在標籤名稱旁（需先在 list.html 載入過資料）
- **刪除標籤**：需要 GAS 部署新版本後才會生效

## list.html 排序選項

| 選項 | 排序邏輯 |
|------|---------|
| 📅 最新 | 書籍第一筆資料的 timestamp |
| 🕐 近期更新 | 該書所有評論中最新的 timestamp |
| ⭐ 評分 | 平均分數由高到低 |
| 🖋️ 作者 | 作者名筆畫排序 |
| 📜 書名 | 書名筆畫排序 |

## list.html URL 參數

- `list.html?tag=標籤名稱`：頁面載入時自動套用該標籤的精確篩選（由 tags.html 點擊標籤觸發）

## wishlist.html 功能說明

待購清單是獨立於書庫的功能，資料存放在 Google Sheets 的 **Wishlist 工作表**。

- **篩選**：可依評論者（全部／Reno／茶壺）和購買狀態（全部／僅日版僅實體／僅日版電子版／有台版僅實體／有台版電子版）篩選；預設隱藏已購入，點「已購入」chip 可切換顯示
- **書名合併**：同書名的待購項目在 UI 合併為一張書卡，顯示「共同心願」徽章（兩人都有待購時）
- **狀態為書籍屬性**：`status` 以書名同步更新所有同名列；`notes` 和 `purchased` 以 timestamp 更新個人那筆
- **新增時重複偵測**：輸入書名時即時比對現有待購，提示自己已有或對方也有
- **ちるちる 自動帶入**：在新增 Modal 貼入 ちるちる URL，GAS 的 `fetchMeta` action 會回傳日文書名、作者、封面；中文書名需手動填
- **升級到書庫**：點「📚 升級」按鈕後，該筆待購標記為 `purchased`，並跳轉到 `index.html` 並帶入書名、日文書名、作者、連結、封面等資料（URL 參數 `prefill=1`）
- **樂觀更新**：新增、編輯、刪除操作先更新畫面，再發送 GAS POST，3 秒後重新抓取確認

## index.html URL 參數（升級待購用）

- `index.html?prefill=1&title=...&jpTitle=...&author=...&ebookUrl=...&chilUrl=...&coverUrl=...`：由 wishlist.html 的「升級到書庫」跳轉時帶入，自動填入表單欄位
