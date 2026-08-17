// tags.html 進入點：串起各模組（副作用匯入負責掛上事件監聽），並觸發首次標籤讀取。
import { loadTags } from "./tags-data.js";
import "./tags-form.js";

loadTags();
