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

// استقبال إشعار دفع (Push) من السيرفر وعرضه حتى لو البرنامج مقفول
// الإشعار بيفضل ظاهر ثانية واحدة بس وبعدين بيقفل نفسه، عشان ميتراكمش في قائمة
// إشعارات النظام (الداش بورد/Action Center) جوه وبرة البرنامج على حد سواء
self.addEventListener("push", (event) => {
  let data = { title: "Shery Share", body: "عندك إشعار جديد", url: "/chat" };
  try {
    data = event.data.json();
  } catch (e) {
    // لو الداتا مش JSON، نستخدم القيم الافتراضية
  }

  const tag = "shery-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Shery Share", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        data: { url: data.url || "/chat" },
      });
      // نسيبه ظاهر ثانية واحدة بس
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const shown = await self.registration.getNotifications({ tag });
      shown.forEach((n) => n.close());
    })()
  );
});

// الضغط على الإشعار يفتح البرنامج على نفس المحادثة/الصفحة
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate ? client.navigate(targetUrl) : null;
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
