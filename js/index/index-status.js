// 頁首的書庫狀態列：抓取資料、顯示目前共有幾本書/幾筆評論、幾點更新的。
import { showToast } from "./index-toast.js";

let allBooks = []; // 用來存放抓取回來的資料

export function getAllBooks() {
  return allBooks;
}

// 1. 確保異體字對照表存在（跟 index-title-search.js 共用同一份定義規則）
const variantMap = {
  秘: "祕",
  台: "臺",
  里: "裡",
  搜: "蒐",
  呪: "咒",
  迴: "回",
  猫: "貓",
  峰: "峯",
  嶋: "島",
};

function normalizeText(str) {
  if (!str) return "";
  let normalized = str.trim().toLowerCase();
  for (let key in variantMap) {
    normalized = normalized.split(key).join(variantMap[key]);
  }
  return normalized;
}

function updateBadges(source, cachedAt) {
  const dbCountBadge = document.getElementById("dbCountBadge");
  const dbTimeBadge = document.getElementById("dbTimeBadge");

  const uniqueTitles = new Set(
    allBooks
      .filter((book) => book && book.title)
      .map((book) => normalizeText(String(book.title))),
  );
  const updateTime = cachedAt ? new Date(cachedAt) : new Date();
  const timeStr = `${updateTime.getHours().toString().padStart(2, "0")}:${updateTime.getMinutes().toString().padStart(2, "0")}`;
  if (dbCountBadge) {
    const sourceText = source === "network" ? "已重新讀取" : "共用資料";
    dbCountBadge.innerHTML = `📖 ${sourceText}：${uniqueTitles.size} 本 (共 ${allBooks.length} 筆評論)`;
    dbCountBadge.className = "status-badge connected";
  }
  if (dbTimeBadge) dbTimeBadge.innerHTML = `🕒 資料時間：${timeStr}`;
}

// index 與 list 共用同一份 localStorage 快取；一進入頁面就一定會向 Firestore 重新整理一次
// （isManual 只影響是否顯示同步中的文字/toast，不影響是否真的發出請求）。
export async function fetchAndRefreshStatus(isManual = false) {
  const dbCountBadge = document.getElementById("dbCountBadge");
  const dbRefreshBtn = document.getElementById("dbRefreshBtn");

  if (dbRefreshBtn) {
    dbRefreshBtn.disabled = true;
    dbRefreshBtn.textContent = isManual ? "同步中..." : "載入中...";
  }

  try {
    // 🔥 新增：優先檢查快取。若非手動點擊且有快取，直接使用快取資料
    const cached = BookArchive.getBooksCache();
    if (!isManual && cached && cached.data) {
      allBooks = cached.data;
      updateBadges("cache", cached.cachedAt);
      if (dbRefreshBtn) {
        dbRefreshBtn.disabled = false;
        dbRefreshBtn.textContent = "🔄 重新讀取";
      }
      return; // 提早結束，不向 Firebase 發送請求
    }

    if (isManual && dbCountBadge) {
      dbCountBadge.innerHTML = "♻️ 正在重新讀取 Firestore...";
      dbCountBadge.className = "status-badge syncing";
    }

    // 只有手動按鈕或無快取時，才會執行到這行去向後端要資料
    const result = await BookArchive.loadBooks({ refresh: true });
    allBooks = result.data;
    updateBadges(result.source, result.cachedAt);
    if (isManual) showToast("✅ 書庫資料已重新讀取", "success");
  } catch (error) {
    const cached = BookArchive.getBooksCache();
    if (cached.data) {
      allBooks = cached.data;
      updateBadges("cache", cached.cachedAt);
    } else if (dbCountBadge) {
      dbCountBadge.innerHTML = "❌ 尚無共用資料，請按重新讀取";
      dbCountBadge.className = "status-badge error";
    }
    if (isManual) showToast("❌ 重新讀取失敗，保留目前資料", "error");
    console.error("資料讀取失敗:", error);
  } finally {
    if (dbRefreshBtn) {
      dbRefreshBtn.disabled = false;
      dbRefreshBtn.textContent = "🔄 重新讀取";
    }
  }
}

document
  .getElementById("dbRefreshBtn")
  .addEventListener("click", () => fetchAndRefreshStatus(true));
