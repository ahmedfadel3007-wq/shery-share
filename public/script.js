// إعادة توجيه ملف لأي تطبيق تاني عن طريق قائمة المشاركة الأصلية بتاعة النظام
// (دي القائمة اللي فيها AirDrop/بلوتوث/واتساب... إلخ، بتفتح تلقائي حسب نظام الجهاز)
async function forwardFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
    } else if (navigator.share) {
      // بعض الأجهزة بتدعم المشاركة بس من غير ملفات؛ نرجع لتنزيل عادي
      window.location.href = url;
    } else {
      alert("المتصفح ده مش بيدعم إعادة التوجيه المباشرة، هيتم تنزيل الملف بدلًا من ذلك");
      window.location.href = url;
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("فشلت المشاركة:", err);
      window.location.href = url;
    }
  }
}

function openShare(relPath, name) {
  document.getElementById("shareTargetFile").value = relPath;
  document.getElementById("shareFileName").textContent = "الملف: " + name;
  document.getElementById("shareModal").classList.add("open");
}

// إغلاق المودال بالضغط برا الصندوق
window.addEventListener("click", (e) => {
  document.querySelectorAll(".modal").forEach((modal) => {
    if (e.target === modal) modal.classList.remove("open");
  });
});

// تسجيل Service Worker (PWA): تثبيت على الشاشة + تحديث تلقائي
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // لما يتوفر إصدار جديد، نفعّله فورًا من غير ما نسأل المستخدم
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            console.log("Shery Share: تم تحديث البرنامج لآخر نسخة");
          }
        });
      });
      updateNotifBtnLabel(reg);
    }).catch((err) => console.warn("Service worker registration failed:", err));
  });
}

// ---------------------------------------------------------------------------
// إشعارات الدفع (Push Notifications) — تنبيه المستخدم برسالة/ملف جديد حتى لو
// البرنامج مقفول أو الموبايل في جيبه
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function updateNotifBtnLabel(reg) {
  const btn = document.getElementById("notifToggleBtn");
  if (!btn || !("Notification" in window)) return;
  reg.pushManager.getSubscription().then((sub) => {
    if (sub && Notification.permission === "granted") {
      btn.classList.add("notif-on");
    }
  });
}

async function enableNotifications() {
  const btn = document.getElementById("notifToggleBtn");
  const label = btn ? btn.querySelector(".drawer-nav-label") || btn : null;

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert(window.NOTIF_STRINGS ? window.NOTIF_STRINGS.unsupported : "Not supported");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert(window.NOTIF_STRINGS ? window.NOTIF_STRINGS.denied : "Permission denied");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyRes = await fetch("/push-vapid-key");
      const { key } = await keyRes.json();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    await fetch("/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    if (btn) btn.classList.add("notif-on");
    if (label) label.textContent = window.NOTIF_STRINGS ? window.NOTIF_STRINGS.enabled : "Notifications on";
  } catch (err) {
    console.warn("فشل تفعيل الإشعارات:", err);
  }
}
