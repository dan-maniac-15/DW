/* PWA Reader: JSON book, chapter paging, TOC, font/line-height, theme, bookmarks, last position, search, offline cache, vertical toggle */

const STORAGE_KEY = "pwaReaderSettings.v1";
const BOOKMARK_KEY = "pwaReaderBookmarks.v1";
const POS_KEY = "pwaReaderLastPos.v1";

const BOOK_URL = "./book.json?v=20260130-2";

const els = {
  drawer: document.getElementById("drawer"),
  btnMenu: document.getElementById("btnMenu"),
  btnClose: document.getElementById("btnClose"),
  btnTheme: document.getElementById("btnTheme"),
  btnWritingMode: document.getElementById("btnWritingMode"),
  btnBookmark: document.getElementById("btnBookmark"),

  fontMinus: document.getElementById("fontMinus"),
  fontPlus: document.getElementById("fontPlus"),
  fontValue: document.getElementById("fontValue"),

  lhMinus: document.getElementById("lhMinus"),
  lhPlus: document.getElementById("lhPlus"),
  lhValue: document.getElementById("lhValue"),

  toc: document.getElementById("toc"),
  content: document.getElementById("content"),
  main: document.getElementById("main"),

  bookmarks: document.getElementById("bookmarks"),
  clearBookmarks: document.getElementById("clearBookmarks"),

  searchInput: document.getElementById("searchInput"),
  searchStatus: document.getElementById("searchStatus"),
  searchResults: document.getElementById("searchResults"),

  offlineHint: document.getElementById("offlineHint"),
  btnUpdateCache: document.getElementById("btnUpdateCache"),

  toast: document.getElementById("toast"),
  title: document.querySelector(".title"),

  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
};

function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> els.toast.classList.remove("show"), 1400);
}

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{ return fallback; }
}
function saveJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

const defaultSettings = {
  theme: "dark",
  writing: "horizontal",
  fontSize: 18,
  lineHeight: 1.85,
};
let settings = loadJSON(STORAGE_KEY, defaultSettings);

function isVertical(){
  return document.documentElement.dataset.writing === "vertical";
}

function applySettings(){
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.writing = settings.writing;

  document.documentElement.style.setProperty("--fontSize", `${settings.fontSize}px`);
  document.documentElement.style.setProperty("--lineHeight", `${settings.lineHeight}`);

  els.fontValue.textContent = `${settings.fontSize}px`;
  els.lhValue.textContent = `${settings.lineHeight.toFixed(2)}`;
  els.btnWritingMode.textContent = settings.writing === "vertical" ? "横" : "縦";
}

// Drawer
function openDrawer(){
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}
els.btnMenu?.addEventListener("click", openDrawer);
els.btnClose?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeDrawer();
});

// Settings buttons
els.btnTheme?.addEventListener("click", ()=>{
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  saveJSON(STORAGE_KEY, settings);
  applySettings();
});

els.btnWritingMode?.addEventListener("click", ()=>{
  settings.writing = settings.writing === "horizontal" ? "vertical" : "horizontal";
  saveJSON(STORAGE_KEY, settings);
  applySettings();

  // 表示モード切替後に、現在章の先頭へ（縦書きなら横スク先頭）
  if(isVertical()){
    els.content.scrollLeft = 0;
  }else{
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  saveLastPosition();
});

els.fontMinus?.addEventListener("click", ()=>{
  settings.fontSize = clamp(settings.fontSize - 1, 14, 28);
  saveJSON(STORAGE_KEY, settings);
  applySettings();
});
els.fontPlus?.addEventListener("click", ()=>{
  settings.fontSize = clamp(settings.fontSize + 1, 14, 28);
  saveJSON(STORAGE_KEY, settings);
  applySettings();
});
els.lhMinus?.addEventListener("click", ()=>{
  settings.lineHeight = clamp(Number((settings.lineHeight - 0.05).toFixed(2)), 1.3, 2.4);
  saveJSON(STORAGE_KEY, settings);
  applySettings();
});
els.lhPlus?.addEventListener("click", ()=>{
  settings.lineHeight = clamp(Number((settings.lineHeight + 0.05).toFixed(2)), 1.3, 2.4);
  saveJSON(STORAGE_KEY, settings);
  applySettings();
});

// ---- Book / State ----
let bookmarks = loadJSON(BOOKMARK_KEY, []);
let BOOK = [];
let BOOK_META = { title: "Reader" };
let currentIndex = 0;
let PARTS = null;
let BOOK_ORDER = [];

// ---- Bookmarks ----
function renderBookmarks(){
  els.bookmarks.innerHTML = "";
  if(bookmarks.length === 0){
    els.bookmarks.innerHTML = `<div class="hint">しおりはまだありません。</div>`;
    return;
  }

  for(const bm of bookmarks){
    const row = document.createElement("div");
    row.className = "bm";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = bm.chapterTitle;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = new Date(bm.createdAt).toLocaleString();
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");

    const go = document.createElement("button");
    go.className = "btn";
    go.textContent = "移動";
    go.addEventListener("click", ()=>{
      closeDrawer();
      openChapterById(bm.chapterId, { restorePos: false });
      setTimeout(()=>{
        if(isVertical()){
          els.content.scrollLeft = bm.posX || 0;
        }else{
          window.scrollTo({ top: bm.posY || 0, behavior: "smooth" });
        }
      }, 60);
    });

    const del = document.createElement("button");
    del.className = "btn";
    del.textContent = "削除";
    del.addEventListener("click", ()=>{
      bookmarks = bookmarks.filter(x=> x.id !== bm.id);
      saveJSON(BOOKMARK_KEY, bookmarks);
      renderBookmarks();
    });

    right.appendChild(go);
    right.appendChild(del);

    row.appendChild(left);
    row.appendChild(right);
    els.bookmarks.appendChild(row);
  }
}

function getCurrentChapterId(){
  return BOOK[currentIndex]?.id || "intro";
}

function addBookmark(){
  const chapterId = getCurrentChapterId();
  const chapter = BOOK.find(b=> b.id === chapterId);

  const item = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    chapterId,
    chapterTitle: chapter?.title || chapterId,
    posY: isVertical() ? 0 : window.scrollY,
    posX: isVertical() ? els.content.scrollLeft : 0,
    createdAt: new Date().toISOString(),
  };

  bookmarks.unshift(item);
  bookmarks = bookmarks.slice(0, 50);
  saveJSON(BOOKMARK_KEY, bookmarks);
  renderBookmarks();
  toast("しおりを追加しました");
}

els.btnBookmark?.addEventListener("click", addBookmark);
els.clearBookmarks?.addEventListener("click", ()=>{
  bookmarks = [];
  saveJSON(BOOKMARK_KEY, bookmarks);
  renderBookmarks();
  toast("しおりを削除しました");
});

// ---- Last read position ----
function saveLastPosition(){
  const data = {
    chapterId: getCurrentChapterId(),
    savedAt: Date.now(),
    posY: isVertical() ? 0 : window.scrollY,
    posX: isVertical() ? els.content.scrollLeft : 0,
  };
  saveJSON(POS_KEY, data);
}

function restoreLastPositionForCurrentChapter(){
  const data = loadJSON(POS_KEY, null);
  if(!data) return;
  if(data.chapterId !== getCurrentChapterId()) return;

  setTimeout(()=>{
    if(isVertical()){
      els.content.scrollLeft = data.posX || 0;
    }else{
      window.scrollTo({ top: data.posY || 0, behavior: "instant" });
    }
  }, 60);
}

// 横書きスクロール保存
let posSaveTimer = null;
window.addEventListener("scroll", ()=>{
  if(isVertical()) return; // 縦書き時はscrollYではなくscrollLeftを見る
  clearTimeout(posSaveTimer);
  posSaveTimer = setTimeout(saveLastPosition, 250);
}, {passive:true});

// 縦書き横スクロール保存
els.content?.addEventListener("scroll", ()=>{
  if(!isVertical()) return;
  clearTimeout(posSaveTimer);
  posSaveTimer = setTimeout(saveLastPosition, 200);
}, {passive:true});

// ---- Render helpers ----
function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function renderBook(){
  document.title = BOOK_META.title || "Reader";
  if(els.title) els.title.textContent = BOOK_META.title || "Reader";

  // TOC
  els.toc.innerHTML = "";

  // parts があれば「部見出し付きTOC」、なければ従来どおり
  if(Array.isArray(PARTS) && PARTS.length){
    const byId = new Map(BOOK.map(ch => [ch.id, ch]));

    PARTS.forEach((part)=>{
      // 部見出し
      const h = document.createElement("div");
      h.className = "tocPart";
      h.textContent = part.title || "";
      els.toc.appendChild(h);

      // 部に属する章
      (part.chapterIds || []).forEach((cid)=>{
        const ch = byId.get(cid);
        if(!ch) return;

        const idx = BOOK.findIndex(x => x.id === cid);

        const a = document.createElement("a");
        a.href = `#${ch.id}`;
        a.dataset.id = ch.id;
        a.innerHTML = `${escapeHtml(ch.title)}${ch.subtitle ? `<small>${escapeHtml(ch.subtitle)}</small>` : ""}`;
        a.addEventListener("click", (e)=>{
          e.preventDefault();
          closeDrawer();
          openChapterByIndex(idx, { restorePos: true });
        });
        els.toc.appendChild(a);
      });

      // 部の間隔
      const spacer = document.createElement("div");
      spacer.style.height = "10px";
      els.toc.appendChild(spacer);
    });

  }else{
    // 従来どおり（章だけ）
    BOOK.forEach((ch, idx)=>{
      const a = document.createElement("a");
      a.href = `#${ch.id}`;
      a.dataset.id = ch.id;
      a.innerHTML = `${escapeHtml(ch.title)}${ch.subtitle ? `<small>${escapeHtml(ch.subtitle)}</small>` : ""}`;
      a.addEventListener("click", (e)=>{
        e.preventDefault();
        closeDrawer();
        openChapterByIndex(idx, { restorePos: true });
      });
      els.toc.appendChild(a);
    });
  }

  // hash
  const idFromHash = (location.hash || "").replace("#", "");
  const idxFromHash = BOOK.findIndex(c => c.id === idFromHash);
  openChapterByIndex(idxFromHash >= 0 ? idxFromHash : 0, { restorePos: true });
}


function renderChapter(index){
  const ch = BOOK[index];
  if(!ch) return;

  els.content.innerHTML = "";

  const sec = document.createElement("section");
  sec.id = ch.id;
  sec.dataset.chapterId = ch.id;

  const h2 = document.createElement("h2");
  h2.textContent = ch.title;
  sec.appendChild(h2);

  if(ch.subtitle){
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = ch.subtitle;
    sec.appendChild(p);
  }

  (ch.blocks || []).forEach((b)=>{
    const p = document.createElement("p");
    p.textContent = b;
    sec.appendChild(p);
  });

  els.content.appendChild(sec);

  // 先頭へ（縦書きなら横スク位置）
  if(isVertical()){
    els.content.scrollLeft = 0;
  }else{
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // prev/next
  if(els.btnPrev) els.btnPrev.disabled = index <= 0;
  if(els.btnNext) els.btnNext.disabled = index >= BOOK.length - 1;

  // hash更新
  history.replaceState(null, "", `#${ch.id}`);
}

function openChapterByIndex(index, opts = {}){
  currentIndex = clamp(index, 0, BOOK.length - 1);
  renderChapter(currentIndex);

  if(opts.restorePos){
    restoreLastPositionForCurrentChapter();
  }else{
    saveLastPosition();
  }
}

function openChapterById(id, opts = {}){
  const idx = BOOK.findIndex(c => c.id === id);
  openChapterByIndex(idx >= 0 ? idx : 0, opts);
}

els.btnPrev?.addEventListener("click", ()=> openChapterByIndex(currentIndex - 1, { restorePos: true }));
els.btnNext?.addEventListener("click", ()=> openChapterByIndex(currentIndex + 1, { restorePos: true }));

window.addEventListener("hashchange", ()=>{
  const id = (location.hash || "").replace("#", "");
  if(id) openChapterById(id, { restorePos: true });
});

// ---- Search ----
function highlightSnippet(text, q){
  const idx = text.indexOf(q);
  if(idx < 0) return escapeHtml(text.slice(0, 140)) + (text.length > 140 ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  const pre = escapeHtml(text.slice(start, idx));
  const hit = escapeHtml(text.slice(idx, idx + q.length));
  const post = escapeHtml(text.slice(idx + q.length, end));
  return `${start>0?"…":""}${pre}<mark>${hit}</mark>${post}${end<text.length?"…":""}`;
}

function search(q){
  els.searchResults.innerHTML = "";
  els.searchStatus.textContent = "";
  if(!q || q.trim().length < 1) return;

  const results = [];
  for(const ch of BOOK){
    const joined = (ch.blocks || []).join("\n");
    let from = 0;
    while(true){
      const idx = joined.indexOf(q, from);
      if(idx < 0) break;
      results.push({
        chapterId: ch.id,
        chapterTitle: ch.title,
        snippet: joined.slice(Math.max(0, idx-80), Math.min(joined.length, idx+80)),
      });
      from = idx + q.length;
      if(results.length >= 30) break;
    }
    if(results.length >= 30) break;
  }

  els.searchStatus.textContent = results.length ? `結果：${results.length}件` : "該当なし";

  for(const r of results){
    const div = document.createElement("div");
    div.className = "res";
    div.innerHTML = `<div><b>${escapeHtml(r.chapterTitle)}</b></div><div>${highlightSnippet(r.snippet, q)}</div>`;
    div.addEventListener("click", ()=>{
      closeDrawer();
      openChapterById(r.chapterId, { restorePos: false });
      if(isVertical()){
        els.content.scrollLeft = 0;
      }else{
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      saveLastPosition();
    });
    els.searchResults.appendChild(div);
  }
}

els.searchInput?.addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){
    search(els.searchInput.value.trim());
  }
});

// ---- Offline SW ----
async function registerSW(){
  if(!("serviceWorker" in navigator)) {
    els.offlineHint.textContent = "このブラウザはオフライン機能に未対応です。";
    return;
  }
  try{
    const reg = await navigator.serviceWorker.register("./sw.js");
    els.offlineHint.textContent = navigator.onLine
      ? "オフライン対応：有効（初回読み込み後に利用可能）"
      : "オフライン対応：現在オフラインです";
    els.btnUpdateCache?.addEventListener("click", ()=>{
      if(reg.waiting){
        reg.waiting.postMessage({type:"SKIP_WAITING"});
        toast("更新を適用します…");
      }else{
        toast("更新を確認しました");
        reg.update();
      }
    });
  }catch(err){
    els.offlineHint.textContent = "オフライン対応：登録に失敗しました。";
    console.error(err);
  }
}
window.addEventListener("online", ()=> els.offlineHint.textContent = "オンラインです（オフライン対応：有効）");
window.addEventListener("offline", ()=> els.offlineHint.textContent = "オフラインです（キャッシュがあれば閲覧可能）");

async function loadBook(){
  try{
    const res = await fetch(BOOK_URL, { cache: "no-store" });
    if(!res.ok) throw new Error(`Failed to load book.json: ${res.status}`);
    const json = await res.json();

    BOOK_META = { title: json.title || "Reader" };
    BOOK = Array.isArray(json.chapters) ? json.chapters : [];
    PARTS = Array.isArray(json.parts) ? json.parts : null;

    if(BOOK.length === 0) toast("book.jsonに章がありません");

    // ✅ 表示順をparts優先で確定
    if(PARTS && PARTS.length){
      const byId = new Map(BOOK.map(ch => [ch.id, ch]));
      const ordered = [];
      for(const p of PARTS){
        for(const id of (p.chapterIds || [])){
          const ch = byId.get(id);
          if(ch) ordered.push(ch);
        }
      }
      // partsに含まれない章があった場合は最後に足す（保険）
      const orderedIds = new Set(ordered.map(ch => ch.id));
      for(const ch of BOOK){
        if(!orderedIds.has(ch.id)) ordered.push(ch);
      }
      BOOK = ordered;
    }

  }catch(err){
    console.error(err);
    toast("book.jsonの読み込みに失敗しました");
    BOOK_META = { title: "Reader" };
    BOOK = [{
      id:"intro",
      title:"はじめに",
      subtitle:"",
      blocks:["book.jsonを読み込めませんでした。配置とJSON形式を確認してください。"]
    }];
    PARTS = null;
  }
}


// 縦書き時：マウスホイールで横スクロール（PC向け）
els.content?.addEventListener("wheel", (e)=>{
  if(document.documentElement.dataset.writing !== "vertical") return;
  // 縦ホイールを横移動に変換
  if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
    e.preventDefault();
    els.content.scrollLeft += e.deltaY;
  }
}, { passive:false });

// ---- Init ----
(async function init(){
  applySettings();
  renderBookmarks();

  await loadBook();
  renderBook();

  registerSW();

// ===== 読み上げ機能 =====

const btnRead = document.getElementById("btnRead");
const btnStop = document.getElementById("btnStop");

btnRead.onclick = () => {
  const text = document.getElementById("content").innerText;

  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = "ja-JP";
  uttr.rate = 1; // 読み上げ速度

  speechSynthesis.speak(uttr);
};

btnStop.onclick = () => {
  speechSynthesis.cancel();
};
  
})();
