const CACHE_NAME = "pwa-reader-cache-v4";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);

    // addAllは1個失敗すると全部失敗するので、1件ずつ入れる
    for(const url of ASSETS){
      try{
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if(res.ok){
          await cache.put(req, res.clone());
        }else{
          // 404など
          console.warn("[SW] precache skipped:", url, res.status);
        }
      }catch(err){
        // ネットワーク不調など
        console.warn("[SW] precache failed:", url, err);
      }
    }

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  const url = new URL(req.url);

  if(req.method !== "GET") return;

  const isHTML =
    req.mode === "navigate" ||
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".html");

  const isBookJson = url.pathname.endsWith("/book.json") || url.pathname.endsWith("book.json");

  // HTMLは network-first
  if(isHTML){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        return (await caches.match(req)) || (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  // book.json は network-first（更新されやすいので）
  if(isBookJson){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        return (await caches.match(req)) || new Response("{}", { headers: { "Content-Type": "application/json" }});
      }
    })());
    return;
  }

  // その他は cache-first
  event.respondWith((async ()=>{
    const cached = await caches.match(req);
    if(cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  })());
});