// 新增／編輯／刪除標籤定義的表單邏輯，標籤清單的點擊互動（跳轉/編輯/刪除，
// 用事件委派掛在 #tagList 上，避免每次重繪都要重新綁定），以及搜尋框篩選。
import {
  getAllTags,
  setAllTags,
  getTagUsageCounts,
  updateTagCountSubtitle,
} from "./tags-data.js";
import { renderTagList } from "./tags-render.js";

function showStatus(msg, type = "success") {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.className = type;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 3000);
}

function editTag(name, def) {
  document.getElementById("tagOldName").value = name;
  document.getElementById("tagName").value = name;
  document.getElementById("tagDefinition").value = def;
  document.getElementById("saveTagBtn").textContent = "更新標籤";
  document.getElementById("formTitle").textContent = "編輯標籤定義";
  document.getElementById("cancelEditBtn").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetTagForm() {
  document.getElementById("tagOldName").value = "";
  document.getElementById("tagName").value = "";
  document.getElementById("tagDefinition").value = "";
  document.getElementById("saveTagBtn").textContent = "新增標籤";
  document.getElementById("formTitle").textContent = "新增標籤定義";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("statusMsg").style.display = "none";
  document.getElementById("tagNameHint").style.display = "none";
}

// ── 儲存 ──

document
  .getElementById("saveTagBtn")
  .addEventListener("click", async function () {
    const name = document.getElementById("tagName").value.trim();
    const def = document.getElementById("tagDefinition").value.trim();
    const oldName = document.getElementById("tagOldName").value.trim();
    if (!name) {
      showStatus("請輸入標籤名稱", "error");
      return;
    }

    // 編輯模式下把名稱本身改掉了：可能是單純改名，也可能改成另一個既有標籤（合併）。
    const isRename = Boolean(oldName) && oldName !== name;
    const mergingIntoExisting =
      isRename && getAllTags().some((t) => t.name === name);

    if (mergingIntoExisting) {
      const ok = confirm(
        `「${name}」已經是既有標籤。儲存後會把「${oldName}」底下所有書籍併入「${name}」，並刪除「${oldName}」，確定要合併嗎？`,
      );
      if (!ok) return;
    }

    const originalText = this.textContent;
    this.disabled = true;
    this.textContent = "處理中...";

    try {
      showStatus("⏳ 已送出，正在確認儲存...");
      const formData = new FormData();
      formData.append("action", "upsertTag");
      formData.append("tagName", name);
      formData.append("definition", def);
      if (isRename) formData.append("oldName", oldName);
      await BookArchive.postForm(formData);
      const confirmedTags = await BookArchive.waitForCollection({
        action: "readTags",
        matches: (tags) => {
          const newTagSaved = tags.some(
            (tag) => tag.name === name && String(tag.definition || "") === def,
          );
          if (!isRename) return newTagSaved;
          // 改名／合併還要確認舊標籤文件真的被刪掉了，才算完全處理完
          return newTagSaved && !tags.some((tag) => tag.name === oldName);
        },
      });
      setAllTags(confirmedTags);
      getAllTags().sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
      updateTagCountSubtitle();
      renderTagList(getAllTags(), getAllTags().length);
      resetTagForm();
      showStatus(
        mergingIntoExisting
          ? `✅ 已將「${oldName}」合併進「${name}」`
          : isRename
            ? `✅ 已重新命名為「${name}」，所有書籍已同步更新`
            : "✅ 標籤已確認儲存",
      );
    } catch {
      showStatus("⚠️ 尚未確認儲存結果，請稍後重新載入確認", "error");
      this.textContent = originalText;
    } finally {
      this.disabled = false;
    }
  });

// ── 取消 ──

document
  .getElementById("cancelEditBtn")
  .addEventListener("click", resetTagForm);

// ── 刪除 ──

async function deleteTag(name) {
  if (!confirm(`確定要刪除標籤「${name}」嗎？`)) return;

  try {
    showStatus("⏳ 已送出，正在確認刪除...");
    const formData = new FormData();
    formData.append("action", "deleteTag");
    formData.append("tagName", name);
    await BookArchive.postForm(formData);
    const confirmedTags = await BookArchive.waitForCollection({
      action: "readTags",
      matches: (tags) => !tags.some((tag) => tag.name === name),
    });
    setAllTags(confirmedTags);
    renderTagList(getAllTags(), getAllTags().length);
    updateTagCountSubtitle();
    showStatus(`✅「${name}」已確認刪除`);
  } catch {
    showStatus("⚠️ 尚未確認刪除結果，請稍後重新載入確認", "error");
  }
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
    editTag(editBtn.dataset.name, editBtn.dataset.def);
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
      // 合併後定義以目標標籤為準，帶入既有定義方便確認/修改
      document.getElementById("tagDefinition").value =
        existing.definition || "";
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
    // 自動帶入現有定義，方便確認或修改
    document.getElementById("tagDefinition").value = existing.definition || "";
  } else {
    hint.textContent = "✨ 新標籤";
    hint.className = "hint-new";
    hint.style.display = "block";
  }
});

// ── 搜尋 ──

document
  .getElementById("tagSearchInput")
  .addEventListener("input", function () {
    const term = this.value.toLowerCase().trim();
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
  });
