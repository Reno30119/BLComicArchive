(() => {
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwqnfCjBq_BYZSWAOU6TnVj2O6YvFF2jan4dY0smm3waf9xP-wOLmz2_4B_L3MND7PK9A/exec";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const BOOKS_CACHE_KEY = "allBooksCache";
  const BOOKS_CACHE_TS_KEY = "allBooksCacheTs";

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

  async function fetchJson(action, params = {}, options = {}) {
    const {
      timeoutMs = 30000,
      retries = 1,
      refresh = false,
      expected = "array",
    } = options;
    const query = new URLSearchParams({
      action,
      ...Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
      ),
      t: String(Date.now()),
    });

    if (refresh) query.set("refresh", "1");

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${SCRIPT_URL}?${query}`, {
          signal: controller.signal,
          cache: "no-store",
          redirect: "follow",
        });
        if (!response.ok) {
          throw new Error(`網路回應錯誤 (${response.status})`);
        }

        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        if (expected === "array" && !Array.isArray(data)) {
          throw new Error("伺服器回傳的資料格式不正確");
        }
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < retries && error.name !== "AbortError") {
          await sleep(600 * (attempt + 1));
        } else {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  async function postForm(formData) {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: formData,
      mode: "no-cors",
    });
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

  async function loadBooks({ refresh = false } = {}) {
    const cached = getBooksCache();
    if (cached.data && !refresh) {
      return { data: cached.data, source: "cache", cachedAt: cached.cachedAt };
    }

    const data = await fetchJson(
      "read",
      refresh ? { refreshToken: Date.now() } : {},
      { refresh, cache: "no-store", timeoutMs: 30000, retries: 1 },
    );
    setBooksCache(data);
    return { data, source: "network", cachedAt: Date.now() };
  }

  async function waitForCollection({
    action,
    matches,
    attempts = 5,
    delayMs = 1500,
  }) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const data = await fetchJson(action, {}, { refresh: true, retries: 0 });
      if (matches(data)) return data;
      if (attempt < attempts - 1) await sleep(delayMs);
    }
    throw new Error("伺服器尚未確認寫入結果，請稍後重新同步確認");
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

    const freshData = await fetchJson(action, {}, { refresh });
    setCachedData(cacheKey, cacheTimestampKey, freshData);
    onFresh?.(freshData, cachedData);
    return { data: freshData, source: "network", isFresh: false };
  }

  window.BookArchive = {
    SCRIPT_URL,
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
  };
})();
