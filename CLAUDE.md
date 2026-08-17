# BLComicArchive — 專案說明

## 專案概述
BL 漫畫書庫管理系統。用於記錄、查詢、評分 BL 漫畫。
評論者：Reno、茶壺。

## 架構

```
靜態前端 (HTML/CSS/JS，無 build 工具)
    │
    └─► Firebase Firestore（books / tags / wishlist collection）
```

- 前端直接用 Firebase Web SDK（v10，透過 CDN `import`）跟 Firestore 溝通，**沒有中間伺服器／Cloud Functions**
- 所有頁面都不直接呼叫 Firestore SDK，而是透過 `js/app.js` 封裝出的 `window.BookArchive` 這一層（`fetchJson`/`postForm`/`loadBooks`/`waitForCollection`/`restoreBackup` 等）
- 前端快取使用 `localStorage`：書庫 key 為 `allBooksCache`，待購清單 key 為 `wishlistCache`。快取只用來讓畫面先有內容可看（避免空白閃爍），**`index.html`／`list.html` 進入頁面時一定會向 Firestore 重新讀取一次最新資料**，不會只依賴快取
- 專案是從舊版 Google Apps Script (GAS) + Google Sheets 架構遷移過來的；`legacy/GAS.txt` 保留舊版後端原始碼供對照，已不再部署使用。部分舊資料是手動從 Sheets 匯出 JSON 遷移進 Firestore 的，因此**同一個欄位在新舊資料列可能格式不同**（見下方「時間戳格式相容性」）

## 檔案結構

六個入口頁面（`index.html`／`list.html`／`wishlist.html`／`tags.html`／`backup.html`／`generate-icon.html`）留在根目錄（純靜態網站，HTML 之間用相對路徑 `href="xxx.html"` 互相連結，搬進子資料夾會打斷這些連結，所以不動）；CSS／JS／靜態資源依用途分資料夾放。

```
BLComicArchive-main/
├─ index.html          新增書籍表單頁，邏輯已拆到 js/index/，本檔只剩 HTML 結構
├─ list.html            書單查詢頁（含篩選、排序、編輯、刪除評論），邏輯已拆到 js/list/，本檔只剩 HTML 結構
├─ wishlist.html         待購清單頁，邏輯已拆到 js/wishlist/，本檔只剩 HTML 結構
├─ tags.html             標籤管理頁，邏輯已拆到 js/tags/，本檔只剩 HTML 結構
├─ backup.html           資料備份頁：匯出 books/tags/wishlist 成 JSON、從 JSON 還原（只補回遺漏資料）
├─ css/
│  ├─ style.css          index.html、tags.html、backup.html 共用的基礎樣式（:root 設計變數、版面）
│  ├─ list-style.css     list.html、wishlist.html 共用的基礎樣式（:root 設計變數、版面）
│  ├─ tags-style.css     tags.html 專用樣式，疊加在 style.css 之上
│  └─ wishlist-style.css wishlist.html 專用樣式，疊加在 list-style.css 之上
├─ js/
│  ├─ app.js             Firestore 資料層，封裝成 window.BookArchive
│  │                      （fetchJson/postForm/loadBooks/waitForCollection/restoreBackup 等），
│  │                      所有頁面都靠這層跟 Firestore 溝通
│  ├─ backup.js           backup.html 專用：匯出三個 collection 成 JSON 下載；
│  │                      讀取使用者選的 JSON 檔，呼叫 BookArchive.restoreBackup 還原
│  ├─ theme-toggle.js     深色模式切換鈕的互動邏輯（五個主要頁面共用同一份），見下方
│  │                      「深色模式」章節說明
│  ├─ index/              index.html 專用模組（皆為 ES module，靠 import/export 溝通）
│  │  ├─ index-main.js        進入點：匯入下面模組、處理「從待購清單升級」URL 參數帶入、
│  │  │                        觸發首次 fetchAndRefreshStatus
│  │  ├─ index-status.js      頁首書庫狀態列：讀取資料、顯示目前幾本書/幾筆評論
│  │  ├─ index-title-search.js 書名輸入框：重複書名偵測、自動完成推薦、帶入既有書籍資訊
│  │  ├─ index-form.js        表單本體：評分/分級/評論者按鈕、封面自動抓取、送出寫入 Firestore
│  │  ├─ index-tags.js        標籤雲＋標籤輸入框自動完成
│  │  ├─ index-cover-preview.js 封面預覽：依 #coverUrl 目前的值顯示圖片，分「載入中／推算成功／
│  │  │                        載入失敗」三種狀態並附文字說明（例如提醒封面是用網址商品編號
│  │  │                        推算的，不是真的抓取頁面內容）；coverUrl 只會被程式設值（使用者
│  │  │                        看不到這個隱藏欄位），所以由 index-form.js／index-title-search.js／
│  │  │                        index-main.js 在設值後主動呼叫 updateCoverPreview()，不是靠監聽
│  │  │                        input 事件
│  │  └─ index-toast.js       底部提示訊息（showToast）
│  ├─ list/               list.html 專用模組（皆為 ES module，靠 import/export 溝通）
│  │  ├─ list-main.js         進入點：匯入下面模組（副作用匯入負責掛 window.* 綁定＋事件監聽）、
│  │  │                        處理 ?tag= URL 參數、觸發首次 fetchData
│  │  ├─ list-data.js         資料引擎：抓取／合併／篩選／排序書庫資料、標籤篩選條件狀態、
│  │  │                        toMillis() 時間戳轉換、首次載入（無快取）時全螢幕 loading
│  │  │                        遮罩的模擬進度條（showLoadingOverlay/hideLoadingOverlay，
│  │  │                        見下方說明）；其他 list-*.js 只透過這裡匯出的函式讀寫
│  │  │                        資料，避免互相依賴
│  │  ├─ list-render.js       書卡渲染（renderBooks）與封面抓取補救（reFetchCover）
│  │  ├─ list-search.js       搜尋框自動完成建議、書名/標籤快速搜尋
│  │  ├─ list-modal-edit.js   「編輯書籍資訊／編輯評語／刪除評論」，含標籤自動完成
│  │  ├─ list-modal-comment.js 「新增評論」Modal
│  │  ├─ list-tag-filter.js   獨立標籤篩選器（篩選面板「標籤」列）：下拉多選書庫裡實際
│  │  │                        用過的標籤（AND 篩選，跟搜尋框共用 list-data.js 的
│  │  │                        selectedSearchTags 狀態）；用 MutationObserver 監看
│  │  │                        #activeTagFilters 的重繪來同步徽章數字，不用跟搜尋框/
│  │  │                        書卡標籤 chip/?tag= 參數等其他改動來源互相呼叫
│  │  ├─ list-custom-select.js 分級／評分／評語狀態這三個篩選改成客製化下拉選單
│  │  │                        （原生 <select> 的下拉清單本身無法跨瀏覽器套用自訂樣式）；
│  │  │                        實際篩選值仍寫在對應的隱藏欄位（#levelFilter 等），
│  │  │                        list-data.js 的 applyFilters() 讀的還是這幾個欄位的
│  │  │                        value，不用改資料邏輯，只在 applyFilters() 裡呼叫這裡
│  │  │                        匯出的 refreshCustomSelects() 同步按鈕顯示文字/亮燈狀態
│  │  └─ list-toast.js        底部提示訊息（showSyncToast）
│  ├─ wishlist/           wishlist.html 專用模組（皆為 ES module，靠 import/export 溝通）
│  │  ├─ wishlist-main.js     進入點：匯入下面模組（副作用匯入負責掛 window.* 綁定＋事件監聽），
│  │  │                        觸發首次 fetchWishlist
│  │  ├─ wishlist-data.js     資料引擎：抓取／保存待購清單、篩選＋排序狀態（含篩選 chip／
│  │  │                        狀態下拉選單的事件綁定）、共用工具（STATUS_CONFIG、toMillis、
│  │  │                        escH/escQ、deriveCoverUrl）、手動刷新按鈕（#wlRefreshBtn）
│  │  │                        與資料時間標籤（#dataTimeLabel）；其他 wishlist-*.js 只透過
│  │  │                        這裡匯出的函式讀寫資料
│  │  ├─ wishlist-render.js   書卡渲染（renderWishlist：篩選＋合併＋排序＋畫 HTML，篩選條件
│  │  │                        含即時讀取 #searchInput 的搜尋字串）與封面抓取補救
│  │  │                        （reFetchWishlistCover）
│  │  ├─ wishlist-search.js   搜尋框自動完成建議（書名/作者）、鍵盤操作；搜尋字串本身不進
│  │  │                        wishlist-data.js 的篩選狀態，直接由 wishlist-render.js 即時
│  │  │                        讀取 #searchInput 的值，這裡只負責觸發重繪與建議清單
│  │  ├─ wishlist-cover-preview.js 「＋ 新增待購書籍」Modal 的封面預覽：依 #addCoverUrl
│  │  │                        目前的值顯示圖片，分「載入中／推算成功／載入失敗」三種狀態；
│  │  │                        跟 index.html 的 index-cover-preview.js 是同一套邏輯，只是
│  │  │                        換了一組元素 id，由 wishlist-modal-add.js 在設值後呼叫
│  │  ├─ wishlist-modal-add.js  「＋ 新增待購書籍」Modal，含書名重複偵測、封面自動帶入
│  │  ├─ wishlist-modal-edit.js 「編輯備註」與「編輯書籍狀態」兩個小型 Modal
│  │  ├─ wishlist-modal-bookinfo.js 「⚙️ 編輯書籍資訊」Modal：改書名/日文書名/作者/
│  │  │                        購買連結，依 oldTitle 同步更新所有同名列，連結有改動
│  │  │                        時順便用 deriveCoverUrl() 重新推算封面
│  │  ├─ wishlist-actions.js  書卡上的動作：升級到書庫、刪除待購紀錄
│  │  └─ wishlist-toast.js    底部提示訊息（showToast）
│  └─ tags/               tags.html 專用模組（皆為 ES module，靠 import/export 溝通）
│     ├─ tags-main.js         進入點：匯入 tags-form.js（副作用匯入負責掛事件監聽），
│     │                        觸發首次 loadTags
│     ├─ tags-data.js         資料引擎：抓取／保存標籤定義清單、依 localStorage 書庫快取
│     │                        計算標籤使用次數；tags-render.js／tags-form.js 只透過這裡
│     │                        匯出的函式讀寫資料
│     ├─ tags-render.js       標籤清單渲染（renderTagList，純畫 HTML，不綁事件）
│     └─ tags-form.js         新增／編輯／刪除標籤表單邏輯、標籤清單的點擊互動（用事件
│                              委派掛在容器上）、搜尋框篩選
├─ assets/
│  ├─ manifest.json      PWA 設定（主畫面捷徑用；start_url 用 "../list.html" 指回根目錄）
│  └─ apple-touch-icon.png  iOS 主畫面圖示（需先執行 generate-icon.html 產生）
├─ legacy/
│  └─ GAS.txt            舊版 Google Apps Script 原始碼（遷移前的後端邏輯，保留供對照，已不再部署使用）
└─ generate-icon.html    一次性工具：在瀏覽器開啟後下載 apple-touch-icon.png
```

> `style.css`／`list-style.css` 這兩個基礎檔案各自定義了相同的一份 `:root` 設計變數，修改設計變數時需同步更新這兩個檔案；`tags-style.css`／`wishlist-style.css` 只是疊加在其上的頁面專用樣式，靠 `var(--xxx)` 引用變數，不重複定義 `:root`。
> `js/index/`、`js/list/`、`js/wishlist/`、`js/tags/` 底下的模組彼此用相對路徑 `import`，一起搬動即可，不受根目錄結構影響。
> `wishlist.html`、`tags.html` 的 `<script type="module">` 一定要保留 `type="module"`——如果改回普通 `<script>`，會在 `app.js`（`type="module"`，延後到文件解析完才執行）跑完之前就先同步執行，導致呼叫 `BookArchive.*` 時噴 `BookArchive is not defined`（之前 `tags.html` 就是踩到這個）。

## Firestore 資料結構

三個 collection：`books`、`tags`、`wishlist`。欄位名稱沿用舊版 Google Sheets 的命名，但**文件 ID 的產生方式是這次遷移／重構後才統一的規則**：

| collection | 文件 ID | 說明 |
|---|---|---|
| `books` | `timestamp` 欄位的值 | 新資料由 `app.js` 用 `setDoc(doc(db,"books",timestamp), payload)` 寫入，ID 直接等於 `timestamp`。舊資料手動遷移時 ID 是 `Date.toString()` 格式字串，跟新資料的純數字字串格式不同，但都遵循「ID＝timestamp」 |
| `tags` | `name` 欄位的值 | `upsertTag`/`deleteTag` 直接用標籤名稱當文件 ID（`setDoc(doc(db,"tags",tagName), ..., {merge:true})`），不會有同名標籤被建立成兩筆文件的問題 |
| `wishlist` | `timestamp` 欄位的值 | 同 `books`，新資料 ID＝`timestamp` |

**重要：不要用 `timestamp` 欄位的值去做「查詢比對」來鎖定特定一筆資料**（例如 `where("timestamp","==",x)`），因為舊資料這個欄位可能是字串、也可能是 Firestore 原生 Timestamp 型別，格式不保證一致，直接比對容易找不到目標列而讓更新/刪除悄悄失敗。正確做法是所有讀取（`read`/`readTags`/`readWishlist`）都會在每筆資料上附加 Firestore 文件自己的 `id`（`{ id: d.id, ...d.data() }`），前端拿到資料後**一律用 `id` 去 `doc(db, collection, id)` 直接定位**要更新或刪除的那一筆。`list.html` 的 editForm 有隱藏欄位 `docId` 就是做這件事；`wishlist.html` 的編輯/刪除/升級也都是傳 `entry.id`。

### books 欄位

| 欄位 | 說明 |
|------|------|
| timestamp | 建立時間（新資料為 epoch 毫秒字串），同時也是文件 ID |
| title | 中文書名 |
| jpTitle | 日文書名 |
| author | 作者 |
| level | 分級（肉多／正常／肉少／清水） |
| reviewer | 評論者（Reno／茶壺） |
| rating | 評分（0–10，step 0.5） |
| tags | 標籤，以逗號分隔 |
| ebookUrl | BookWalker 網址 |
| chilUrl | ちるちる 網址 |
| comment | 評語內容 |
| coverUrl | 封面圖片 URL |
| twStatus | 台灣連載狀態 |
| jpStatus | 日本連載狀態 |

> 同一本書可以有多筆資料列（多位評論者，各自是獨立的 Firestore 文件），前端以書名為 key 合併後顯示。`title`／`jpTitle`／`author`／`level`／`tags`／`ebookUrl`／`chilUrl`／`twStatus`／`jpStatus` 是「書籍共用欄位」，編輯書籍基本資訊時會依 `title` 同步更新所有同名列；`rating`／`comment` 是「個人欄位」，只更新 `docId` 對應的那一列。

### tags 欄位

| 欄位 | 說明 |
|------|------|
| name | 標籤名稱，同時也是文件 ID |
| definition | 標籤定義 |

### wishlist 欄位

| 欄位 | 說明 |
|------|------|
| timestamp | 建立時間，同時也是文件 ID |
| title | 中文書名，書籍共用屬性 |
| jpTitle | 日文書名，書籍共用屬性 |
| author | 作者，書籍共用屬性 |
| reviewer | 評論者（Reno／茶壺） |
| status | 購買狀態（jp_physical／jp_ebook／tw_physical／tw_ebook），書籍共用屬性 |
| notes | 備註（個人可見），個人屬性，只更新 `docId` 對應的那一列 |
| ebookUrl | BookWalker 網址，書籍共用屬性 |
| chilUrl | ちるちる 網址，書籍共用屬性 |
| coverUrl | 封面圖片 URL，書籍共用屬性 |
| purchased | 已購入標記（值為 `"purchased"` 或空字串），個人屬性 |

> title／jpTitle／author／ebookUrl／chilUrl／status／coverUrl 這幾個書籍共用屬性，
> 編輯時都是依 `oldTitle`（改名前的書名）同步更新所有同名列，寫法對齊 `books` 的
> `update` action；notes／purchased 是個人屬性，只更新 `docId` 對應的那一列。

## app.js（BookArchive）重要說明

- `fetchJson(action, params, options)`：讀取類操作，內建逾時保護（預設 15 秒，`options.timeoutMs` 可調）與重試（`options.retries`，預設 0）。逾時或連線失敗會拋出明確錯誤訊息，不會讓 UI 卡在「讀取中」不動
- `doGet` 對應的 action：`read`、`readTags`、`readWishlist`（都會附加文件 `id`）、`fetchCover`、`fetchMeta`
- `fetchCover`／`fetchMeta`：**目前是佔位邏輯**，因為純前端瀏覽器無法跨域爬蟲，永遠回傳空結果。要真的抓封面/書籍資料需要另外做 Firebase Cloud Functions 或保留一支純抓圖用的 GAS
- `postForm(formData)` 對應的 action：`processForm`（新增書籍/評論）、`update`（修改書籍，`docId` 定位個人欄位、`oldTitle` 定位共用欄位）、`updateCoverOnly`（只更新封面）、`deleteReview`（刪除單筆評論／書籍列）、`upsertTag`（新增/更新標籤定義；額外帶 `oldName` 時會觸發改名／合併，見「tags.html 功能說明」）、`deleteTag`、`addWishlist`、`updateWishlist`（`docId` 定位個人欄位、`oldTitle`〔沒有則退回 `title`〕定位共用欄位）、`deleteWishlist`
- `waitForCollection({action, matches, attempts, delayMs})`：寫入後輪詢確認資料真的反映到 Firestore 才回報成功，避免「以為成功但其實沒寫進去」
- `restoreBackup(payload, onProgress)`：`backup.html` 專用，把備份 JSON 裡的每筆資料用 `id` 當文件 ID 寫回去（`setDoc(..., {merge:true})`），**只會新增/補回，不會刪除任何現有資料**
- 欄位更新使用 `!== undefined` 判斷，確保空字串也能清空欄位

### 時間戳格式相容性

`timestamp` 欄位在新舊資料的格式不一致：新資料是 `String(Date.now())`（純數字字串），舊資料手動遷移時可能是 `Date.toString()` 字串、也可能是 Firestore 原生 Timestamp 型別（尤其從 localStorage 快取讀回來時，Timestamp 物件會被 `JSON.stringify` 拆成 `{seconds, nanoseconds}` 純資料物件，失去 `.toMillis()` 方法）。

- **需要排序/比大小時**：用 `js/list/list-data.js` 裡的 `toMillis(ts)` 轉成毫秒數再比較（`new Date("純數字字串")` 在瀏覽器裡不保證能正確解析，直接用會導致 `NaN`）。`list.html` 的「📅 最新」「🕐 近期更新」排序、`wishlist.html` 的新增日期排序都是這樣處理的
- **需要鎖定特定一筆資料時**：一律用 Firestore 文件 `id`，不要比對 `timestamp` 欄位的值（見上方「Firestore 資料結構」）

## 已知限制與注意事項

1. **`fetchCover`／`fetchMeta` 是佔位邏輯**：純前端無法跨域爬蟲，抓封面／ちるちる 自動帶入目前都會失敗，需要 Cloud Functions 才能真正實作
2. **書名為唯一識別**：修改書名時，以 `oldTitle` 比對所有同名列並批次更新共用欄位
3. **標籤格式**：前端會自動把空格和「、」轉成半形逗號，儲存格式為 `tag1, tag2, tag3`
4. **異體字對照**：`index.html`／`js/index/index-title-search.js` 有 `variantMap` 做書名標準化，搜尋/重複偵測時會統一轉換
5. **iOS 圖示**：`apple-touch-icon.png` 需先用瀏覽器開啟 `generate-icon.html` 產生並放到 `assets/` 資料夾
6. **備份還原是「只補回」不是「完全替換」**：`backup.html` 的還原功能不會刪除任何現有資料，也不會讓 Firestore 變得跟備份當下完全一樣（備份之後才新增的資料不會被清掉）。如果需要「完全恢復成某個時間點」的還原方式，目前沒有做，需要另外處理
7. **Firestore Security Rules**：目前架構下瀏覽器直接讀寫 Firestore，存取控制完全依賴 Firebase Console 的 Security Rules，務必確認沒有開放成任何人可讀寫
8. **`list.html` 首次載入的進度條是模擬的，不是真實進度**：Firestore 的 `getDocs()` 一次性拿到全部資料，SDK 沒有暴露中間進度事件，技術上做不出真正反映實際傳輸進度的進度條。`js/list/list-data.js` 的 `showLoadingOverlay()` 用計時器讓進度條漸近跑到 90%（越接近終點增量越小），實際資料回來時 `hideLoadingOverlay()` 才把它拉到 100% 再蓋住。之後如果要改這段邏輯，記得這個 90% 上限和跑動速度都是刻意調出來的觀感，不是根據任何真實數據

## 評論者設定

若要新增評論者，需同時修改：
- `index.html`：評論者按鈕 HTML
- `list.html`：篩選面板的評論者按鈕
- `wishlist.html`：篩選面板的評論者按鈕、新增 Modal 的評論者按鈕

## 導覽列（五個頁面共用）

- HTML 結構固定：`<a class="nav-item"><span class="nav-icon">emoji</span><span class="nav-label">文字</span></a>`，兩個 `<span>` 是為了手機版能分開排版
- 桌面版：頂部橫排 pill 按鈕（`position: sticky; top: 0;`），`justify-content: flex-start`（不是 `center`）
- 手機版（`max-width: 600px`）：改成固定貼底的分頁列（`position: fixed; bottom: 0;`），icon 在上、文字在下，並用 `env(safe-area-inset-bottom)` 避開 iPhone 手勢列。`body` 會加上對應的 `padding-bottom` 避免內容被蓋住
- **「資料備份」桌面版只顯示 emoji、手機版整個隱藏**：`<a>` 額外加 `nav-item-icon-only` class、拿掉 `.nav-label` span，改用 `title` 屬性顯示 hover 提示文字。桌面版這個 class 設定 `margin-left: auto`，把它（以及它後面緊接著的深色模式切換鈕）一起推到列的最右邊，前面四個導覽項目維持在左邊——不用額外包一層 div 分左右兩組，純靠 flex 的 auto margin 達成。手機版分頁列直接 `display: none` 把它藏起來，讓其他四個分頁項目（仍是 `flex: 1`）分到更多空間；深色模式切換鈕不是 `.nav-item`，不受影響，照樣顯示在最右邊。手機版想用資料備份功能的話，目前只能從桌面版或直接輸入網址進入
- 目前唯一用到 `.nav-item-icon-only` 的就是「資料備份」，這個 class 現在同時承擔「只留 emoji」跟「手機版隱藏」兩種語意；之後如果要新增別的 icon-only 導覽項目、但不想在手機版被一起藏起來，要另外拆一個 class，不能直接沿用
- 深色模式切換鈕（`.theme-toggle-wrap`）固定接在導覽項目最後面，靠上面那條 `margin-left: auto` 規則順便被推到最右邊，本身不需要另外設定

## Toast 提示訊息機制（三頁共用同一套邏輯）

`list.html`（`#sync-toast`）、`wishlist.html`（`#wl-toast`）、`index.html`（`#idx-toast`）都採用同一套模式：
- 元素本身有 inline style 設定基準位置與**隱藏狀態**：`bottom: 20px; transform: translateX(-50%) translateY(100px);`
- JS 只切換 `toast-success`／`toast-info`／`toast-error`（顏色）與 `show`（顯示/隱藏）這幾個 class，不直接改 inline style
- CSS 用 `.xxx-toast.show { transform: translateX(-50%) translateY(0) !important; }` 覆蓋成顯示狀態
- 手機版另外用 `.xxx-toast.show { transform: translateX(-50%) translateY(-64px) !important; }` 讓顯示時的位置再往上跳，避開底部導覽列

> **不要直接改 `bottom` 屬性來閃避底部導覽列**——隱藏狀態的 `translateY(100px)` 位移量是配合 `bottom: 20px` 算出來的，改了 `bottom` 會讓隱藏時的位置沒有真的移出畫面外，導致 toast 卡在畫面邊緣被切一半、一直看得到（這是實際踩過的坑）。要調整顯示位置，只能改 `.show` 這個 class 的 `transform` 值。

## tags.html 功能說明

- **標籤名稱 chip**：點擊後跳轉到 `list.html?tag=標籤名稱`，自動篩選含此標籤的書
- **新增時重複偵測**：輸入標籤名稱時即時比對，若已存在顯示黃色警告並自動帶入現有定義
- **使用次數**：從 `localStorage` 快取計算，顯示在標籤名稱旁（需先在 list.html 載入過資料）
- **新增/更新/刪除**：都是直接用標籤名稱當 Firestore 文件 ID 操作，即時生效，不需要額外部署步驟
- **重新命名／合併**：點「編輯」後把標籤名稱欄位本身改掉再存檔，會觸發改名／合併流程
  （`tags-form.js` 用隱藏欄位 `#tagOldName` 記住編輯前的名稱，送出時額外帶 `oldName`）：
  - 改成一個全新的名稱 → 重新命名，`books` collection 裡所有引用到舊名稱的列，`tags`
    欄位會同步換成新名稱，舊標籤文件刪除
  - 改成一個「已存在」的標籤名稱 → 合併，舊標籤底下的書籍併入既有標籤（存檔前會跳
    `confirm()` 二次確認），合併後的定義以表單當時填的內容為準，舊標籤文件刪除
  - 因為標籤文件 ID 就是名稱本身，如果沒有這個機制，單純改名稱欄位存檔只會多產生一筆
    新標籤文件，不會清掉舊的、也不會同步任何書籍的 `tags` 欄位（曾經是實際踩過的坑）

## list.html 排序選項

| 選項 | 排序邏輯 |
|------|---------|
| 📅 最新 | 書籍第一筆資料的 timestamp（經 `toMillis()` 轉換） |
| 🕐 近期更新 | 該書所有評論中最新的 timestamp（經 `toMillis()` 轉換） |
| ⭐ 評分 | 平均分數由高到低 |
| 🖋️ 作者 | 作者名筆畫排序 |
| 📜 書名 | 書名筆畫排序 |

## list.html URL 參數

- `list.html?tag=標籤名稱`：頁面載入時自動套用該標籤的精確篩選（由 tags.html 點擊標籤觸發）

## list.html 評論管理

- 每則評語右上角有兩個按鈕：✎ 編輯、🗑 刪除
- 刪除是直接刪掉該筆評論對應的 Firestore 文件（`docId` 定位），刪除前會跳確認視窗
- **如果要刪除的是這本書目前唯一的一筆評論**，會額外警告「整本書會一併從書庫移除」，因為書籍基本資訊跟評論共用同一份文件，沒有其他評論者的列可以承載書籍資訊時，刪掉就等於整本書消失

## wishlist.html 功能說明

待購清單是獨立於書庫的功能，資料存放在 Firestore 的 `wishlist` collection。

- **搜尋**：依書名或作者搜尋，輸入時有自動完成建議清單（書名/作者），跟篩選條件是 AND 關係；搜尋字串直接由 `wishlist-render.js` 即時讀取 `#searchInput` 的值，不放進 `wishlist-data.js` 的篩選狀態
- **篩選**：可依評論者（全部／Reno／茶壺）和購買狀態（全部／僅日版僅實體／僅日版電子版／有台版僅實體／有台版電子版，客製化下拉選單）篩選；預設隱藏已購入，點「已購入」chip 可切換顯示
- **排序**：只有「新增日期」一種維度，同一顆按鈕點擊即可反轉方向（▼ 新到舊，預設／▲ 舊到新），取該書所有評論者當中最早加入待購的時間點
- **書名合併**：同書名的待購項目在 UI 合併為一張書卡，顯示「共同心願」徽章（兩人都有待購時）
- **書籍共用屬性 vs 個人屬性**：`title`／`jpTitle`／`author`／`ebookUrl`／`chilUrl`／`status`／`coverUrl` 以（改名前的）書名同步更新所有同名列；`notes` 和 `purchased` 以 `docId`（Firestore 文件 id）定位個人那筆
- **編輯書籍資訊**：書卡標題旁的「⚙️」可修改書名／日文書名／作者／購買連結，依 `oldTitle` 同步更新所有同名列，連結有改動時會重新推算封面
- **新增時重複偵測**：輸入書名時即時比對現有待購，提示自己已有或對方也有
- **ちるちる 自動帶入**：目前 `fetchMeta` 是佔位邏輯（見「已知限制」），這個自動帶入功能實際上不會抓到資料
- **升級到書庫**：點「📚 升級」按鈕後，該筆待購標記為 `purchased`，並跳轉到 `index.html` 並帶入書名、日文書名、作者、連結、封面等資料（URL 參數 `prefill=1`）
- **樂觀更新**：新增、編輯、刪除操作先更新畫面，再發送 Firestore 寫入，並用 `waitForCollection` 輪詢確認寫入成功
- **手動刷新／資料時間**：「🔄 更新書庫」按鈕（`#wlRefreshBtn`）強制略過 3 分鐘快取重新讀取；「共 N 本書籍」那行旁邊的 `#dataTimeLabel` 顯示上次資料時間（`HH:MM`），跟 `index.html`／`list.html` 的「🕒 資料時間」是同一套邏輯

## index.html URL 參數（升級待購用）

- `index.html?prefill=1&title=...&jpTitle=...&author=...&ebookUrl=...&chilUrl=...&coverUrl=...`：由 wishlist.html 的「升級到書庫」跳轉時帶入，自動填入表單欄位

## backup.html 功能說明

- **匯出**：向 Firestore 重新讀取一次最新的 `books`／`tags`／`wishlist`（不用快取），打包成一個 JSON 檔案（含 `exportedAt` 匯出時間戳與每筆資料的 `id`）下載到本機
- **還原**：選擇之前匯出的 JSON 檔案後會先顯示預覽（匯出時間、各 collection 筆數），確認後呼叫 `BookArchive.restoreBackup`。**只會補回備份裡有、但目前 Firestore 沒有的資料**（`setDoc(..., {merge:true})`），不會刪除或覆蓋任何現有內容，也不會做到「完全恢復成備份當下的樣子」
- 匯出的 JSON 檔案包含完整書庫與待購清單資料，需自行妥善保存、不要外流

## 設計系統

### 主色盤（水彩風格參考）
```css
--accent:       #5f77a8;  /* 藍灰，主色 */
--accent-light: #eaeff6;  /* 淡藍灰，背景輕色調 */
--accent-hover: #4a6090;  /* 深藍灰，hover 狀態 */
```

### 分級顏色（前端 + Firestore 共用語義）
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

## 深色模式

五個主要頁面（`index.html`／`list.html`／`wishlist.html`／`tags.html`／`backup.html`）都支援深色模式，預設跟隨系統（`prefers-color-scheme`），使用者可以用導覽列右側的滑動式開關（`.theme-toggle-switch`，兩端各有 ☀️/🌙 靜態圖示裝飾，中間把手 `.theme-toggle-knob` 依狀態滑動）手動覆蓋，選擇會存進 `localStorage`（key: `theme`，值 `"light"`／`"dark"`）並優先於系統偏好，直到再次手動切換。`generate-icon.html` 是一次性工具、沒有主導覽列，不支援深色模式。

### 判斷優先順序（CSS 選擇器）
1. `:root[data-theme="dark"]`（使用者手動選深色）── 優先權最高
2. `@media (prefers-color-scheme: dark)` 且 `:root` 沒有 `[data-theme="light"]`（跟隨系統，使用者沒手動選淺色蓋掉）
3. 其餘情況（系統淺色，或使用者手動選淺色）── 沿用預設的淺色 `:root` 變數

`css/style.css`／`css/list-style.css` 這兩個基礎檔案各自定義了完整的一份深色版 `:root` 變數（`--bg`/`--surface`/`--border`/`--border-light`/`--text-primary`/`--text-secondary`/`--text-muted`/`--accent`/`--accent-light`/`--accent-hover`/`--shadow-sm`/`--shadow`），寫法是上面三段判斷邏輯各自的 CSS 區塊，兩個檔案內容一致（跟淺色版變數一樣是「兩個基礎檔案各自維護一份」的既有慣例）。

### FOUC（畫面閃爍）防範
每個有導覽列的 HTML 檔案的 `<head>` 裡，在 `<meta charset>` 後面都有一小段內嵌、非 module 的 `<script>`（五個頁面各自一份，不是外部檔案），在任何 CSS 套用前就同步讀 `localStorage` 並把 `data-theme` 屬性寫到 `<html>` 上。這是必要的：如果只靠 `js/theme-toggle.js`（`type="module"`，會延後到文件解析完才執行），使用者手動選的深色/淺色如果剛好跟系統偏好相反，畫面會先用系統偏好的顏色畫一次、再跳成使用者手動選的顏色，造成閃爍。`js/theme-toggle.js` 負責的是開關本身的點擊互動（監聽 `.theme-toggle-switch` 的 click，切換 `.is-dark` class 讓把手滑動）、以及使用者還沒手動設定過時即時跟著系統主題變化。切換鈕本身沒有寫 `onclick`，點擊事件是這支 script 統一綁定的，不是 inline attribute。

### 語義色的深色版本
除了上面那組通用變數，站內還有不少直接寫死色碼的語義色（例如成功/失敗提示框、待購狀態 chip、分級按鈕的 hover/active 顏色、重複書籍提示卡等），這些淺色系底色原封不動搬到深色背景上會太刺眼。四個 CSS 檔案（`style.css`／`list-style.css`／`wishlist-style.css`／`tags-style.css`）跟 `backup.html` 的內嵌 `<style>`，都各自在檔案尾端加了一段「深色模式微調」，用同一組 `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .xxx {...} }` ＋ `:root[data-theme="dark"] .xxx {...}` 的寫法，把這些語義色換成低飽和度的深色版本、文字調亮確保對比度。新增這類寫死色碼的元件時，記得比照這個模式補一份深色版本，不然深色模式下會出現一塊刺眼的淺色方塊。

### 已改成用變數、不再寫死顏色的地方
`wishlist-style.css` 原本有幾處直接寫 `background: white` 或 `background: #f8f9fb`（`.wl-chip`／`.show-purchased-chip`／`.modal-box`／`.mf-group input/textarea/select`／`.rev-select-btn`／`.status-select-btn`／`.re-fetch-btn`／`.wl-cover`），已經全部改成 `var(--surface)`／`var(--bg)`，不需要另外寫深色覆蓋規則就會自動跟著主題切換。之後新增樣式時，優先用設計變數而不是寫死 `white`／`#fff` 這類顏色，可以少寫很多深色模式的覆蓋規則。
