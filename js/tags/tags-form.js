// 新增／編輯／刪除標籤定義的表單邏輯，標籤清單的點擊互動（跳轉/編輯/刪除，
// 用事件委派掛在 #tagList 上，避免每次重繪都要重新綁定），以及搜尋框篩選。
import {
  getAllTags,
  setAllTags,
  getTagUsageCounts,
  updateTagCountSubtitle,
  getSortState,
  setSortField,
  resortTags,
} from "./tags-data.js";
import { renderTagList } from "./tags-render.js";
import { friendlyErrorMessage } from "../error-messages.js";

function showStatus(msg, type = "success") {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.className = type;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 3000);
}

// 標籤類型（系列／內容）切換，比照 index.html 評論者/分級按鈕同一套 active
// class + 隱藏欄位的寫法。
const typeButtons = document.querySelectorAll(".tag-type-btn");
const tagTypeInput = document.getElementById("tagType");

// 使用者有沒有手動點過類型按鈕——標籤名稱輸入框的即時比對（下面 input 監聽器）
// 會在名稱撞到既有標籤時，自動帶入該標籤目前的類型方便確認，但那個判斷是
// 「每次打字都重跑」；如果不記住使用者已經手動選過，打完系列標籤名稱後只要
// 再多按一下鍵盤（哪怕沒真的改到字），就會被悄悄蓋回舊類型，使用者不會發現。
let typeManuallySet = false;

function setTagType(type, { manual = false } = {}) {
  const safeType = type === "series" ? "series" : "content";
  tagTypeInput.value = safeType;
  typeButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.type === safeType),
  );
  if (manual) typeManuallySet = true;
}

typeButtons.forEach((button) => {
  button.addEventListener("click", () =>
    setTagType(button.dataset.type, { manual: true }),
  );
});

function editTag(name, def, type) {
  document.getElementById("tagOldName").value = name;
  document.getElementById("tagName").value = name;
  document.getElementById("tagDefinition").value = def;
  typeManuallySet = false;
  setTagType(type);
  document.getElementById("saveTagBtn").textContent = "更新標籤";
  document.getElementById("formTitle").textContent = "編輯標籤定義";
  document.getElementById("cancelEditBtn").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetTagForm() {
  document.getElementById("tagOldName").value = "";
  document.getElementById("tagName").value = "";
  document.getElementById("tagDefinition").value = "";
  typeManuallySet = false;
  setTagType("content");
  document.getElementById("saveTagBtn").textContent = "新增標籤";
  document.getElementById("formTitle").textContent = "新增標籤定義";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("statusMsg").style.display = "none";
  document.getElementById("tagNameHint").style.display = "none";
}

// ── 刪除／合併確認 Modal（比照 list.html 的 #confirmDeleteModal，不用瀏覽器
// 原生 confirm()）。刪除跟合併共用同一個 Modal，用 pendingTagConfirm.kind
// 分辨目前要執行哪一種操作。 ──

let pendingTagConfirm = null;

function openTagConfirmModal({ title, message, confirmLabel }) {
  document.getElementById("tagConfirmTitle").textContent = title;
  document.getElementById("tagConfirmMessage").textContent = message;
  const confirmBtn = document.getElementById("tagConfirmBtn");
  confirmBtn.textContent = confirmLabel;
  confirmBtn.disabled = false;
  document.getElementById("tagConfirmModal").classList.remove("hidden");
}

function closeTagConfirmModal() {
  pendingTagConfirm = null;
  document.getElementById("tagConfirmModal").classList.add("hidden");
}
window.closeTagConfirmModal = closeTagConfirmModal;

async function executeTagConfirmAction() {
  if (!pendingTagConfirm) return;
  if (pendingTagConfirm.kind === "delete") {
    await performDelete(pendingTagConfirm.name);
  } else if (pendingTagConfirm.kind === "merge") {
    await performSave(pendingTagConfirm.saveParams);
  }
}
window.executeTagConfirmAction = executeTagConfirmAction;

document.getElementById("tagConfirmModal").addEventListener("click", (e) => {
  if (e.target.id === "tagConfirmModal") closeTagConfirmModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("tagConfirmModal");
  if (!modal.classList.contains("hidden")) closeTagConfirmModal();
});

// ── 儲存（新增／更新／改名／合併共用同一段實際寫入邏輯）──

async function performSave({ name, def, type, oldName, isRename, mergingIntoExisting, btn }) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = mergingIntoExisting ? "合併中..." : "處理中...";

  try {
    showStatus("⏳ 已送出，正在確認儲存...");
    const formData = new FormData();
    formData.append("action", "upsertTag");
    formData.append("tagName", name);
    formData.append("definition", def);
    formData.append("type", type);
    if (isRename) formData.append("oldName", oldName);
    await BookArchive.postForm(formData);
    const confirmedTags = await BookArchive.waitForCollection({
      action: "readTags",
      matches: (tags) => {
        const newTagSaved = tags.some(
          (tag) =>
            tag.name === name &&
            String(tag.definition || "") === def &&
            tag.type === type,
        );
        if (!isRename) return newTagSaved;
        // 改名／合併還要確認舊標籤文件真的被刪掉了，才算完全處理完
        return newTagSaved && !tags.some((tag) => tag.name === oldName);
      },
      onAttempt: (attempt, attempts) => {
        btn.textContent = `${mergingIntoExisting ? "合併中" : "確認中"}... (${attempt}/${attempts})`;
      },
    });
    setAllTags(confirmedTags);
    updateTagCountSubtitle();
    renderTagList(getAllTags(), getAllTags().length);
    resetTagForm();
    closeTagConfirmModal();
    showStatus(
      mergingIntoExisting
        ? `✅ 已將「${oldName}」合併進「${name}」`
        : isRename
          ? `✅ 已重新命名為「${name}」，所有書籍已同步更新`
          : "✅ 標籤已確認儲存",
    );
  } catch (err) {
    console.error("儲存標籤失敗:", err);
    showStatus("⚠️ 尚未確認儲存結果：" + friendlyErrorMessage(err), "error");
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

document
  .getElementById("saveTagBtn")
  .addEventListener("click", async function () {
    const name = document.getElementById("tagName").value.trim();
    const def = document.getElementById("tagDefinition").value.trim();
    const oldName = document.getElementById("tagOldName").value.trim();
    const type = tagTypeInput.value === "series" ? "series" : "content";
    if (!name) {
      showStatus("請輸入標籤名稱", "error");
      return;
    }

    // 編輯模式下把名稱本身改掉了：可能是單純改名，也可能改成另一個既有標籤（合併）。
    const isRename = Boolean(oldName) && oldName !== name;
    const mergingIntoExisting =
      isRename && getAllTags().some((t) => t.name === name);

    const baseParams = { name, def, type, oldName, isRename, mergingIntoExisting };

    if (mergingIntoExisting) {
      const counts = getTagUsageCounts();
      const cnt = counts[oldName] || 0;
      const cntText = cnt > 0 ? `「${oldName}」目前有 ${cnt} 本書使用，` : "";
      pendingTagConfirm = {
        kind: "merge",
        saveParams: {
          ...baseParams,
          btn: document.getElementById("tagConfirmBtn"),
        },
      };
      openTagConfirmModal({
        title: "🔀 合併標籤",
        message: `「${name}」已經是既有標籤。${cntText}儲存後會併入「${name}」並刪除「${oldName}」，確定要合併嗎？`,
        confirmLabel: "🔀 確定合併",
      });
      return;
    }

    await performSave({ ...baseParams, btn: this });
  });

// ── 取消 ──

document
  .getElementById("cancelEditBtn")
  .addEventListener("click", resetTagForm);

// ── 刪除 ──

async function performDelete(name) {
  const btn = document.getElementById("tagConfirmBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "刪除中...";

  try {
    const formData = new FormData();
    formData.append("action", "deleteTag");
    formData.append("tagName", name);
    await BookArchive.postForm(formData);
    showStatus("⏳ 已送出，正在確認刪除...");
    const confirmedTags = await BookArchive.waitForCollection({
      action: "readTags",
      matches: (tags) => !tags.some((tag) => tag.name === name),
      onAttempt: (attempt, attempts) => {
        btn.textContent = `刪除中... (${attempt}/${attempts})`;
      },
    });
    setAllTags(confirmedTags);
    renderTagList(getAllTags(), getAllTags().length);
    updateTagCountSubtitle();
    closeTagConfirmModal();
    showStatus(`✅「${name}」已確認刪除`);
  } catch (err) {
    console.error("刪除標籤失敗:", err);
    showStatus("⚠️ 尚未確認刪除結果：" + friendlyErrorMessage(err), "error");
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

function deleteTag(name) {
  const counts = getTagUsageCounts();
  const cnt = counts[name] || 0;
  const cntText = cnt > 0 ? `，會同步從這 ${cnt} 本書移除這個標籤` : "";
  pendingTagConfirm = { kind: "delete", name };
  openTagConfirmModal({
    title: "🗑 刪除標籤",
    message: `確定要刪除標籤「${name}」嗎？${cntText}`,
    confirmLabel: "🗑 確定刪除",
  });
}

// ── 標籤清單點擊（跳轉／編輯／刪除），用事件委派掛在容器上 ──

document.getElementById("tagList").addEventListener("click", (e) => {
  const nameEl = e.target.closest(".tag-name");
  if (nameEl) {
    window.location.href = `list.html?tag=${encodeURIComponent(nameEl.dataset.tag)}`;
    return;
  }
  const editBtn = e.target.closest(".tag-edit-btn");
  if (editBtn) {
    editTag(editBtn.dataset.name, editBtn.dataset.def, editBtn.dataset.type);
    return;
  }
  const delBtn = e.target.closest(".tag-del-btn");
  if (delBtn) {
    deleteTag(delBtn.dataset.name);
  }
});

// ── 標籤名稱即時比對 ──

document.getElementById("tagName").addEventListener("input", function () {
  const val = this.value.trim();
  const hint = document.getElementById("tagNameHint");
  const oldName = document.getElementById("tagOldName").value.trim();
  if (!val) {
    hint.style.display = "none";
    return;
  }

  const existing = getAllTags().find((t) => t.name === val);

  // 編輯模式下把名稱改成別的值：提示這會是「改名」還是「合併進既有標籤」，
  // 這兩種都會實際影響所有引用到這個標籤的書籍，跟單純編輯定義的風險不一樣。
  if (oldName && val !== oldName) {
    if (existing) {
      const counts = getTagUsageCounts();
      const cnt = counts[oldName] || 0;
      const cntText = cnt > 0 ? `「${oldName}」目前有 ${cnt} 本書使用，` : "";
      hint.textContent = `⚠️ 「${val}」已存在，${cntText}儲存後會併入「${val}」並刪除「${oldName}」`;
      hint.className = "hint-exists";
      hint.style.display = "block";
      // 合併後定義／類型都以目標標籤為準，帶入既有值方便確認/修改，避免不小心
      // 把目標標籤原本的類型覆蓋掉；使用者已經手動選過類型的話就不要再覆寫。
      document.getElementById("tagDefinition").value =
        existing.definition || "";
      if (!typeManuallySet) setTagType(existing.type);
    } else {
      hint.textContent = `✏️ 儲存後會把「${oldName}」重新命名為「${val}」，所有書籍會一併更新`;
      hint.className = "hint-new";
      hint.style.display = "block";
    }
    return;
  }

  if (existing) {
    const counts = getTagUsageCounts();
    const cnt = counts[val] || 0;
    const cntText = cnt > 0 ? `，已被 ${cnt} 本書使用` : "";
    hint.textContent = `⚠️ 此標籤已存在${cntText}，儲存將會更新定義`;
    hint.className = "hint-exists";
    hint.style.display = "block";
    // 自動帶入現有定義／類型，方便確認或修改；使用者已經手動選過類型的話
    // 就不要再覆寫。
    document.getElementById("tagDefinition").value = existing.definition || "";
    if (!typeManuallySet) setTagType(existing.type);
  } else {
    hint.textContent = "✨ 新標籤";
    hint.className = "hint-new";
    hint.style.display = "block";
  }
});

// ── 搜尋 ──
// 抽成獨立函式是因為排序按鈕切換排序方式時，也要重新畫一次清單，但不能不管
// 使用者當下有沒有在搜尋框打字——不然切排序會把搜尋結果悄悄清空。

function applySearchAndRender() {
  const term = document.getElementById("tagSearchInput").value.toLowerCase().trim();
  if (!term) {
    renderTagList(getAllTags(), getAllTags().length);
    return;
  }
  const filtered = getAllTags().filter(
    (t) =>
      t.name.toLowerCase().includes(term) ||
      (t.definition && t.definition.toLowerCase().includes(term)),
  );
  renderTagList(filtered, getAllTags().length);
}

document
  .getElementById("tagSearchInput")
  .addEventListener("input", applySearchAndRender);

// ── 排序 ──

const sortButtons = document.querySelectorAll(".tag-sort-btn");

function updateSortButtonsUI() {
  const { field, dir } = getSortState();
  sortButtons.forEach((btn) => {
    const isActive = btn.dataset.sort === field;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
    btn.textContent = isActive
      ? `${btn.dataset.label} ${dir === "asc" ? "▲" : "▼"}`
      : btn.dataset.label;
  });
}

sortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setSortField(btn.dataset.sort);
    resortTags();
    updateSortButtonsUI();
    applySearchAndRender();
  });
});

updateSortButtonsUI();
