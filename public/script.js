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
    }).catch((err) => console.warn("Service worker registration failed:", err));
  });
}
