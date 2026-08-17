import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  initializeFirestore, // 👈 新增這行
  persistentLocalCache, // 👈 新增這行
  persistentMultipleTabManager, // 👈 新增這行
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
(() => {
  // 1. 替換成你的 Firebase 專案設定
  const firebaseConfig = {
    apiKey: "AIzaSyDYNUHEE4FXWWmSBhyr3spE7EKgFSYLUAE",
    authDomain: "reno-2026.firebaseapp.com",
    projectId: "reno-2026",
    storageBucket: "reno-2026.firebasestorage.app",
    messagingSenderId: "289622588903",
    appId: "1:289622588903:web:5beaba7ccd461371c6d142",
    measurementId: "G-NXKCCX64TZ",
  };

  // 2. 初始化 Firebase 與 Firestore
  const app = initializeApp(firebaseConfig);

  // 3. 🔥 啟用 Firestore 持久化快取 (取代原本的 const db = getFirestore(app);)
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const BOOKS_CACHE_KEY = "allBooksCache";
  const BOOKS_CACHE_TS_KEY = "allBooksCacheTs";

  // ── 快取管理功能 (保留原有邏輯) ──
  function getCachedArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  function setCachedData(key, timestampKey, data) {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(timestampKey, String(Date.now()));
  }

  function getBooksCache() {
    return {
      data: getCachedArray(BOOKS_CACHE_KEY),
      cachedAt: Number(localStorage.getItem(BOOKS_CACHE_TS_KEY)) || 0,
    };
  }

  function setBooksCache(data) {
    setCachedData(BOOKS_CACHE_KEY, BOOKS_CACHE_TS_KEY, data);
  }

  // 讓 Promise 在指定時間內沒有結果就明確失敗，避免 Firestore 連線卡住時 UI 永遠轉圈。
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `${label} 逾時（${(ms / 1000).toFixed(0)} 秒無回應，請檢查網路連線、防火牆或廣告攔截套件是否擋住 firestore.googleapis.com）`,
          ),
        );
      }, ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function runFetchAction(action, params) {
    // 每筆資料都附上 Firestore 文件自己的 id（一定是純字串）。
    // 舊資料手動遷移過來的 timestamp 欄位型別/格式可能跟新資料不一致（字串 vs
    // Firestore Timestamp 物件），用 id 而不是 timestamp 欄位去鎖定特定文件，
    // 才不會受那個欄位的型別影響。
    if (action === "read") {
      const snap = await getDocs(collection(db, "books"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (action === "readTags") {
      const snap = await getDocs(collection(db, "tags"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (action === "readWishlist") {
      const snap = await getDocs(collection(db, "wishlist"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (action === "fetchCover") {
      // 注意：前端無法跨域爬蟲 (CORS限制)，這裡先做阻斷防呆。
      // 未來建議將爬蟲功能寫在 Firebase Cloud Functions 或保留一支純抓圖的 GAS
      console.warn("純前端無法直接爬取外部網頁，請透過 Cloud Functions 處理");
      return { coverUrl: "" };
    }

    if (action === "fetchMeta") {
      // 同上：ちるちる 書籍資料的自動帶入需要伺服器端爬蟲，純前端暫不支援。
      console.warn("純前端無法直接爬取外部網頁，請透過 Cloud Functions 處理");
      return {};
    }

    throw new Error("未知的讀取動作：" + action);
  }

  // ── 將原本的 GAS GET 請求轉換為 Firestore 查詢 ──
  async function fetchJson(action, params = {}, options = {}) {
    const { timeoutMs = 15000, retries = 0, retryDelayMs = 1000 } = options;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await withTimeout(
          runFetchAction(action, params),
          timeoutMs,
          `讀取「${action}」`,
        );
      } catch (error) {
        lastError = error;
        console.error(
          `fetchJson (${action}) 第 ${attempt + 1} 次嘗試失敗:`,
          error,
        );
        if (attempt < retries) await sleep(retryDelayMs);
      }
    }
    throw lastError;
  }

  // ── 將原本的 GAS POST 表單轉換為 Firestore 寫入 ──
  async function postForm(formData) {
    const action = formData.get("action");
    const dataObj = Object.fromEntries(formData.entries());

    try {
      switch (action) {
        // [書庫] 更新書籍資訊
        // 對齊原本 GAS 邏輯：共用欄位（書名/作者/標籤...）依 oldTitle 同步更新「所有同名列」，
        // 個人評分/評語只更新 docId（Firestore 文件 id）對應的那一列——用 id 而不是
        // timestamp 欄位鎖定，避免舊資料 timestamp 型別不一致造成更新對不到文件。
        case "update": {
          const oldTitle = String(dataObj.oldTitle || "").trim();
          const docId = String(dataObj.docId || "").trim();

          const sharedFields = {};
          [
            "title",
            "jpTitle",
            "author",
            "level",
            "tags",
            "ebookUrl",
            "chilUrl",
            "twStatus",
            "jpStatus",
          ].forEach((key) => {
            if (dataObj[key] !== undefined) sharedFields[key] = dataObj[key];
          });

          if (oldTitle && Object.keys(sharedFields).length) {
            const shareQ = query(
              collection(db, "books"),
              where("title", "==", oldTitle),
            );
            const shareSnap = await getDocs(shareQ);
            await Promise.all(
              shareSnap.docs.map((d) => updateDoc(d.ref, sharedFields)),
            );
          }

          const personalFields = {};
          if (dataObj.rating !== undefined)
            personalFields.rating = dataObj.rating;
          if (dataObj.comment !== undefined)
            personalFields.comment = dataObj.comment;

          if (docId && Object.keys(personalFields).length) {
            await updateDoc(doc(db, "books", docId), personalFields);
          }
          break;
        }

        // [書庫] 僅更新封面 (查詢條件：書名)
        case "updateCoverOnly": {
          const q = query(
            collection(db, "books"),
            where("title", "==", dataObj.title),
          );
          const snap = await getDocs(q);
          await Promise.all(
            snap.docs.map((d) =>
              updateDoc(d.ref, { coverUrl: dataObj.coverUrl }),
            ),
          );
          break;
        }

        // [書庫] 新增書籍 / 新增評論（文件 ID 直接用 timestamp，
        // 跟舊資料「文件 ID＝新增時間」的結構對齊，也跟 update/delete 用 timestamp
        // 當唯一識別碼的邏輯一致，方便日後直接用 doc() 定位而不用查詢）
        case "processForm": {
          const payload = { ...dataObj };
          delete payload.action;
          if (!payload.timestamp) payload.timestamp = String(Date.now());
          await setDoc(doc(db, "books", payload.timestamp), payload);
          break;
        }

        // [書庫] 刪除單筆評論（docId 對應的那一列；如果是這本書唯一的一列，
        // 等於整本書從 Books collection 移除，由前端在刪除前先跟使用者確認）
        case "deleteReview": {
          const docId = String(dataObj.docId || "").trim();
          if (docId) await deleteDoc(doc(db, "books", docId));
          break;
        }

        // [標籤] 新增或更新標籤（文件 ID 直接用標籤名稱，與既有資料結構一致，
        // 也避免用 query 判斷是否存在時，因為漏比對造成同名標籤被建立成兩筆文件）
        //
        // 改名／合併：oldName 存在且跟 tagName（新名稱）不同時，表示使用者在編輯表單
        // 把標籤名稱本身改掉了。因為標籤文件 ID 就是名稱，單純 setDoc 只會多產生一筆
        // 新標籤，不會把舊名稱從任何書的 tags 欄位換掉，也不會刪掉舊的標籤定義——
        // 這裡額外處理：把 books collection 裡所有引用到 oldName 的列，tags 欄位換成
        // 新名稱（如果新名稱剛好是既有標籤，等於把兩個標籤合併成一個），再刪掉舊標籤。
        // tags 欄位是逗號分隔字串不是陣列，Firestore 沒辦法直接查詢「包含某個值」，
        // 所以整個 books collection 讀出來在前端比對，量體對兩人共用的個人書庫來說沒問題。
        case "upsertTag": {
          const newName = String(dataObj.tagName || "").trim();
          const oldName = String(dataObj.oldName || "").trim();
          const definition = dataObj.definition ?? "";

          await setDoc(
            doc(db, "tags", newName),
            { name: newName, definition },
            { merge: true },
          );

          if (oldName && oldName !== newName) {
            const booksSnap = await getDocs(collection(db, "books"));
            const bookUpdates = [];
            booksSnap.docs.forEach((d) => {
              const parts = String(d.data().tags || "")
                .split(/[ ,、]+/)
                .map((t) => t.trim())
                .filter(Boolean);
              if (!parts.includes(oldName)) return;
              const replaced = parts.map((t) =>
                t === oldName ? newName : t,
              );
              const deduped = [...new Set(replaced)];
              bookUpdates.push(updateDoc(d.ref, { tags: deduped.join(", ") }));
            });
            await Promise.all(bookUpdates);

            await deleteDoc(doc(db, "tags", oldName));
          }
          break;
        }

        // [標籤] 刪除標籤
        case "deleteTag": {
          await deleteDoc(doc(db, "tags", dataObj.tagName));
          break;
        }

        // [待購] 新增待購（文件 ID 同樣直接用 timestamp，理由同上）
        case "addWishlist": {
          const payload = { ...dataObj };
          delete payload.action;
          if (!payload.timestamp) payload.timestamp = String(Date.now());
          await setDoc(doc(db, "wishlist", payload.timestamp), payload);
          break;
        }

        // [待購] 更新待購
        // 對齊原本 GAS 邏輯：書籍基本資訊（title/jpTitle/author/ebookUrl/chilUrl）、
        // status、coverUrl 都是書籍屬性，依書名同步更新所有同名列；notes/purchased
        // 是個人屬性，只更新 docId 對應的那一列（用 Firestore 文件 id 而不是
        // timestamp 欄位鎖定，理由同書庫的 update）。兩者互不排斥。
        // title 本身也可能被改掉（編輯書籍資訊時），所以查詢共用欄位要用 oldTitle
        // （沒有 oldTitle 時退回用 title 本身查，相容原本只更新 status/coverUrl 的呼叫）。
        case "updateWishlist": {
          // 1. 處理共用欄位（書籍基本資訊、狀態、封面）：依 oldTitle 找出所有同名列一起更新
          const lookupTitle = String(
            dataObj.oldTitle || dataObj.title || "",
          ).trim();
          if (lookupTitle) {
            const sharedFields = {};
            [
              "title",
              "jpTitle",
              "author",
              "ebookUrl",
              "chilUrl",
              "status",
              "coverUrl",
            ].forEach((key) => {
              if (dataObj[key] !== undefined) sharedFields[key] = dataObj[key];
            });

            // 只要有任何一個共用欄位需要更新，就去尋找並寫入
            if (Object.keys(sharedFields).length > 0) {
              const titleQ = query(
                collection(db, "wishlist"),
                where("title", "==", lookupTitle),
              );
              const titleSnap = await getDocs(titleQ);
              await Promise.all(
                titleSnap.docs.map((d) => updateDoc(d.ref, sharedFields)),
              );
            }
          }

          // 2. 處理個人欄位 (備註、已購入)：只更新 docId 對應的那一列
          const docId = String(dataObj.docId || "").trim();
          if (docId) {
            const personalFields = {};
            if (dataObj.purchased !== undefined)
              personalFields.purchased = dataObj.purchased;
            if (dataObj.notes !== undefined)
              personalFields.notes = dataObj.notes;

            if (Object.keys(personalFields).length > 0) {
              await updateDoc(doc(db, "wishlist", docId), personalFields);
            }
          }
          break;
        }

        // [待購] 刪除待購
        case "deleteWishlist": {
          await deleteDoc(
            doc(db, "wishlist", String(dataObj.docId || "").trim()),
          );
          break;
        }

        default:
          throw new Error("未知的寫入動作：" + action);
      }
    } catch (error) {
      console.error(`postForm (${action}) 錯誤:`, error);
      throw error;
    }
  }

  // ── 備份還原 (backup.html 專用) ──
  // 只會「補回」備份檔案裡有的資料，不會刪除或清空任何現有資料，
  // 用文件本身的 id 當作 Firestore 文件 ID 寫回去（merge:true，不會誤刪其他欄位）。
  async function restoreBackup(payload, onProgress) {
    const groups = [
      {
        name: "books",
        items: Array.isArray(payload.books) ? payload.books : [],
      },
      { name: "tags", items: Array.isArray(payload.tags) ? payload.tags : [] },
      {
        name: "wishlist",
        items: Array.isArray(payload.wishlist) ? payload.wishlist : [],
      },
    ];

    const summary = {};
    for (const { name, items } of groups) {
      const validItems = items.filter((item) => item && item.id);
      onProgress?.(`正在還原 ${name}（共 ${validItems.length} 筆）...`);
      await Promise.all(
        validItems.map((item) => {
          const { id, ...fields } = item;
          return setDoc(doc(db, name, id), fields, { merge: true });
        }),
      );
      summary[name] = validItems.length;
    }
    return summary;
  }

  // ── 其他輔助與載入函數 (保持與 HTML 的相容性) ──
  async function loadBooks({ refresh = false } = {}) {
    const cached = getBooksCache();
    if (cached.data && !refresh) {
      return { data: cached.data, source: "cache", cachedAt: cached.cachedAt };
    }

    const data = await fetchJson("read");
    setBooksCache(data);
    return { data, source: "network", cachedAt: Date.now() };
  }

  async function waitForCollection({
    action,
    matches,
    attempts = 8,
    delayMs = 1500,
  }) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const data = await fetchJson(action);
      if (matches(data)) return data;
      if (attempt < attempts - 1) await sleep(delayMs);
    }
    throw new Error("Firestore 尚未確認寫入結果，請稍後重新整理確認");
  }

  async function syncCollection({
    action,
    cacheKey,
    cacheTimestampKey,
    cacheTtl = 3 * 60 * 1000,
    refresh = false,
    onCached,
    onFresh,
  }) {
    const cachedData = getCachedArray(cacheKey);
    const cachedAt = Number(localStorage.getItem(cacheTimestampKey)) || 0;
    const isFresh = cachedData && Date.now() - cachedAt < cacheTtl;

    if (cachedData) onCached?.(cachedData);
    if (isFresh && !refresh) {
      return { data: cachedData, source: "cache", isFresh: true };
    }

    const freshData = await fetchJson(action);
    setCachedData(cacheKey, cacheTimestampKey, freshData);
    onFresh?.(freshData, cachedData);
    return { data: freshData, source: "network", isFresh: false };
  }

  // 將介面綁定到全域變數 BookArchive
  window.BookArchive = {
    BOOKS_CACHE_KEY,
    BOOKS_CACHE_TS_KEY,
    fetchJson,
    getCachedArray,
    setCachedData,
    getBooksCache,
    setBooksCache,
    loadBooks,
    postForm,
    waitForCollection,
    syncCollection,
    restoreBackup,
  };
})();
