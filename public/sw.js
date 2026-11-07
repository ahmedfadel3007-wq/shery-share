// Shery Share - Service Worker
// نسخة الكاش - غيّرها لو عدّلت ملفات static أساسية عشان تجبر تحديث فوري
const CACHE_VERSION = "shery-v2";
const STATIC_CACHE = `shery-static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // يفعّل النسخة الجديدة فورًا من غير ما ينتظر قفل كل التابات
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // يستولي على التابات المفتوحة فورًا بالنسخة الجديدة
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // أي صفحة ديناميكية (تصفح/دخول/API) تروح للشبكة مباشرة دايمًا، من غير كاش
  // عشان قوائم الملفات تفضل حديثة ومحدثة
  if (
    event.request.mode === "navigate" ||
    url.pathname.startsWith("/upload") ||
    url.pathname.startsWith("/download") ||
    url.pathname.startsWith("/browse") ||
    url.pathname.startsWith("/share") ||
    url.pathname.startsWith("/delete") ||
    url.pathname.startsWith("/mkdir") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    url.pathname.startsWith("/logout")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // الملفات الثابتة (css/js/أيقونات): الشبكة أولًا عشان أي تعديل جديد يبان فورًا،
  // ولو مفيش نت يرجع للنسخة المخزنة (كاش) عشان البرنامج يفضل شغال أوفلاين
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
