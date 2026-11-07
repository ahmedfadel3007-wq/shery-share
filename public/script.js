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

// يحدّث شكل زرار/مفتاح الإشعارات (أون/أوف) حسب حالة الاشتراك الحالية
function setNotifSwitchState(isOn) {
  const btn = document.getElementById("notifToggleBtn");
  const sw = document.getElementById("notifSwitch");
  const label = btn ? btn.querySelector(".drawer-nav-label") : null;

  if (btn) btn.classList.toggle("notif-on", isOn);
  if (sw) sw.classList.toggle("on", isOn);
  if (label) {
    label.textContent = window.NOTIF_STRINGS
      ? (isOn ? window.NOTIF_STRINGS.enabled : window.NOTIF_STRINGS.enableLabel)
      : (isOn ? "Notifications on" : "Enable notifications");
  }
}

// بيتنادي لما الصفحة تفتح، يشيك هل المستخدم مشترك فعليًا في الإشعارات ولا لأ
// ويظبط شكل المفتاح على حسب كدة من غير أي أكشن من المستخدم
function updateNotifBtnLabel(reg) {
  const btn = document.getElementById("notifToggleBtn");
  if (!btn || !("Notification" in window)) return;
  reg.pushManager.getSubscription().then((sub) => {
    const isOn = !!sub && Notification.permission === "granted";
    setNotifSwitchState(isOn);
  });
}

// الدالة اللي بتتنادى من زرار المفتاح في الشريط الجانبي (onclick="toggleNotifications()")
// بتفحص الحالة الحالية: لو الإشعارات شغالة تقفلها، ولو مقفولة تشغلها
async function toggleNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert(window.NOTIF_STRINGS ? window.NOTIF_STRINGS.unsupported : "Not supported");
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existingSub = await reg.pushManager.getSubscription();
    const currentlyOn = !!existingSub && Notification.permission === "granted";

    if (currentlyOn) {
      await disableNotifications(reg, existingSub);
    } else {
      await enableNotifications(reg);
    }
  } catch (err) {
    console.warn("فشل تبديل حالة الإشعارات:", err);
  }
}

async function enableNotifications(reg) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert(window.NOTIF_STRINGS ? window.NOTIF_STRINGS.denied : "Permission denied");
      setNotifSwitchState(false);
      return;
    }

    if (!reg) reg = await navigator.serviceWorker.ready;
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

    setNotifSwitchState(true);
  } catch (err) {
    console.warn("فشل تفعيل الإشعارات:", err);
    setNotifSwitchState(false);
  }
}

async function disableNotifications(reg, sub) {
  try {
    if (!reg) reg = await navigator.serviceWorker.ready;
    if (!sub) sub = await reg.pushManager.getSubscription();

    if (sub) {
      await fetch("/push-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      await sub.unsubscribe();
    }

    setNotifSwitchState(false);
  } catch (err) {
    console.warn("فشل إلغاء تفعيل الإشعارات:", err);
  }
}

// ---------------------------------------------------------------------------
// إخفاء رسائل التنبيه (نجاح/خطأ زي "تم إرسال الملف بنجاح") تلقائيًا بعد ثانية
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".msg").forEach((el) => {
    setTimeout(() => {
      el.classList.add("msg-hide");
      setTimeout(() => el.remove(), 450);
    }, 1000);
  });
});
