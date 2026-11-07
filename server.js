/**
 * Shery Share - برنامج تخزين ونقل ملفات شخصي متعدد المستخدمين
 * - كل مستخدم له حساب وتخزين خاص به، مقسّم تلقائيًا بالنوع (صور/فيديو/صوت/ملفات)
 * - كل مستخدم يقدر يبعت/يشارك ملف لمستخدم تاني مسجل في نفس السيرفر
 * - إعادة توجيه الملفات لأي تطبيق تاني عبر قائمة مشاركة النظام (AirDrop/بلوتوث/واتساب)
 * - PWA قابل للتثبيت على الشاشة الرئيسية بأيقونة Shery وتحديث تلقائي
 * - يشتغل محليًا، وممكن توصله من أي جهاز عبر الإنترنت (راجع README.md)
 */

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const BASE_DIR = __dirname;
// DATA_DIR: المكان اللي بيتخزن فيه كل حاجة دائمة (حسابات + ملفات المستخدمين).
// لو شغّال على استضافة سحابية (Suga) لازم تحطه يشاور على الـ volume الدائم (مثلاً /data)
// عشان البيانات متتمسحش كل ما يحصل تحديث جديد للكود.
const DATA_DIR = process.env.DATA_DIR || BASE_DIR;
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PORT = process.env.CLOUD_PORT || 8080;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}", "utf-8");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(BASE_DIR, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(BASE_DIR, "public")));
app.use(
  session({
    secret: process.env.CLOUD_SECRET_KEY || "change-this-secret-key-please",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // أسبوع
  })
);

// ---------------------------------------------------------------------------
// اللغة (عربي / إنجليزي)
// ---------------------------------------------------------------------------
const STRINGS = {
  ar: {
    app_name: "Shery Share",
    login_title: "تسجيل الدخول",
    register_title: "إنشاء حساب جديد",
    username_label: "اسم المستخدم",
    username_hint: "اسم المستخدم (حروف إنجليزية وأرقام و _ بس)",
    password_label: "الباسورد",
    confirm_password_label: "تأكيد الباسورد",
    login_btn: "دخول",
    register_btn: "إنشاء الحساب",
    no_account: "معاك حساب جديد؟",
    register_now: "سجّل دلوقتي",
    have_account: "معاك حساب أصلاً؟",
    login_now: "سجّل دخولك",
    registered_success: "تم إنشاء الحساب بنجاح، سجّل دخولك دلوقتي",
    login_error: "اسم المستخدم أو الباسورد غلط",
    err_need_fields: "لازم تكتب اسم مستخدم وباسورد",
    err_username_chars: "اسم المستخدم يُسمح فيه بحروف إنجليزية وأرقام و _ بس",
    err_password_mismatch: "الباسورد والتأكيد غير متطابقين",
    err_password_short: "الباسورد لازم يكون 4 حروف على الأقل",
    err_username_taken: "اسم المستخدم ده محجوز، اختار اسم تاني",

    nav_send: "إرسال",
    nav_received: "الوارد",
    nav_chat: "رسائل",
    nav_logout: "خروج",
    home: "الرئيسية",
    upload_btn: "رفع ملفات",
    new_folder_btn: "مجلد جديد",
    empty_folder: "المجلد فاضي",
    download_title: "حفظ/تنزيل",
    forward_title: "إعادة توجيه لأي تطبيق (AirDrop/بلوتوث/واتساب)",
    share_title: "مشاركة لمستخدم على السيرفر",
    delete_title: "حذف",
    confirm_delete: "متأكد تحذف",

    mkdir_modal_title: "إنشاء مجلد جديد",
    folder_name_placeholder: "اسم المجلد",
    cancel_btn: "إلغاء",
    create_btn: "إنشاء",
    share_modal_title: "مشاركة ملف",
    send_to_label: "ابعت لمستخدم:",
    send_btn: "إرسال",

    storage_title: "مساحة التخزين",
    storage_user_label: "المستخدم:",
    storage_total_label: "إجمالي استخدامك:",
    disk_space_label: "مساحة القرص على الجهاز:",
    remaining_label: "متبقي",
    of_total_label: "من إجمالي",

    cat_images: "صور",
    cat_videos: "فيديوهات",
    cat_audio: "أغاني وصوتيات",
    cat_files: "ملفات وبرامج",

    radar_title: "📡 بحث عن أجهزة على الشبكة",
    radar_sub: "دوس على أي جهاز ظاهر عشان تبعت له ملف — وهتاخد تأكيد قبل الإرسال",
    radar_empty: "لسه مفيش أجهزة ظاهرة على الرادار 📡<br>لازم شخص تاني يعمل حساب على نفس السيرفر الأول عشان يظهر هنا.",
    radar_confirm_title: "📡 تم اكتشاف جهاز",
    radar_confirm_q: "هل تريد الإرسال إلى",
    radar_search_btn: "🔍 ابدأ البحث",
    radar_searching: "جاري البحث عن أجهزة قريبة...",
    radar_found_one: "✅ تم العثور على جهاز واحد",
    radar_found_many: "✅ تم العثور على {n} أجهزة",
    radar_found_none: "⚠️ لم يتم العثور على أي جهاز",
    push_voice_body: "🎤 رسالة صوتية",
    push_file_received_body: "📥 بعتلك ملف جديد",
    notif_enable_btn: "🔔 تفعيل الإشعارات",
    notif_enabled_msg: "✅ الإشعارات شغالة",
    notif_denied_msg: "⚠️ لازم تسمح بالإشعارات من إعدادات المتصفح",
    notif_unsupported_msg: "المتصفح ده مش بيدعم الإشعارات",
    choose_files: "اختار الملف أو الملفات",
    confirm_send_btn: "✅ موافق - إرسال",
    back_btn: "رجوع",

    chat_title: "الرسائل",
    chat_empty: "مفيش حد مسجل تقدر تتكلم معاه لسه",
    chat_placeholder: "اكتب رسالة...",
    chat_send_btn: "إرسال",
    chat_no_messages: "مفيش رسائل لسه، ابدأ المحادثة!",

    upload_success: "تم رفع {count} ملف بنجاح",
    upload_none: "لم يتم رفع أي ملف",
    mkdir_name_required: "اكتب اسم مجلد صحيح",
    mkdir_exists: "فيه مجلد بنفس الاسم أصلاً",
    mkdir_success: "تم إنشاء المجلد",
    generic_error: "حصل خطأ",
    delete_success: "تم الحذف",
    delete_error: "حصل خطأ أثناء الحذف",
    not_found: "غير موجود",
    path_not_allowed: "مسار غير مسموح",
    recipient_not_found: "المستخدم المرسل إليه غير موجود",
    no_self_send: "مينفعش تبعت لنفسك",
    file_not_found: "الملف غير موجود",
    share_success: "تم إرسال الملف إلى {recipient} بنجاح",
    share_error: "حصل خطأ أثناء الإرسال",
    device_not_found: "الجهاز/المستخدم ده غير موجود",
    send_direct_success: "تم إرسال {count} ملف إلى {recipient} بنجاح ✅",
    send_direct_none: "لم يتم اختيار أي ملف",
  },
  en: {
    app_name: "Shery Share",
    login_title: "Log In",
    register_title: "Create New Account",
    username_label: "Username",
    username_hint: "Username (English letters, numbers, and _ only)",
    password_label: "Password",
    confirm_password_label: "Confirm Password",
    login_btn: "Log In",
    register_btn: "Create Account",
    no_account: "Don't have an account?",
    register_now: "Register now",
    have_account: "Already have an account?",
    login_now: "Log in",
    registered_success: "Account created successfully, log in now",
    login_error: "Incorrect username or password",
    err_need_fields: "Please enter a username and password",
    err_username_chars: "Username can only contain English letters, numbers, and _",
    err_password_mismatch: "Password and confirmation don't match",
    err_password_short: "Password must be at least 4 characters",
    err_username_taken: "This username is already taken, pick another one",

    nav_send: "Send",
    nav_received: "Received",
    nav_chat: "Messages",
    nav_logout: "Logout",
    home: "Home",
    upload_btn: "Upload files",
    new_folder_btn: "New folder",
    empty_folder: "This folder is empty",
    download_title: "Save/Download",
    forward_title: "Forward to any app (AirDrop/Bluetooth/WhatsApp)",
    share_title: "Share with a user on the server",
    delete_title: "Delete",
    confirm_delete: "Are you sure you want to delete",

    mkdir_modal_title: "Create New Folder",
    folder_name_placeholder: "Folder name",
    cancel_btn: "Cancel",
    create_btn: "Create",
    share_modal_title: "Share File",
    send_to_label: "Send to user:",
    send_btn: "Send",

    storage_title: "Storage",
    storage_user_label: "User:",
    storage_total_label: "Total usage:",
    disk_space_label: "Device disk space:",
    remaining_label: "Remaining",
    of_total_label: "of total",

    cat_images: "Photos",
    cat_videos: "Videos",
    cat_audio: "Music & Audio",
    cat_files: "Files & Apps",

    radar_title: "📡 Scanning for devices on the network",
    radar_sub: "Tap any device that appears to send it a file — you'll confirm before sending",
    radar_empty: "No devices on the radar yet 📡<br>Another person needs to create an account on the same server first to show up here.",
    radar_confirm_title: "📡 Device discovered",
    radar_confirm_q: "Do you want to send to",
    radar_search_btn: "🔍 Start Search",
    radar_searching: "Searching for nearby devices...",
    radar_found_one: "✅ Found 1 device",
    radar_found_many: "✅ Found {n} devices",
    radar_found_none: "⚠️ No devices found",
    push_voice_body: "🎤 Voice message",
    push_file_received_body: "📥 Sent you a new file",
    notif_enable_btn: "🔔 Enable Notifications",
    notif_enabled_msg: "✅ Notifications are on",
    notif_denied_msg: "⚠️ Please allow notifications from your browser settings",
    notif_unsupported_msg: "This browser doesn't support notifications",
    choose_files: "Choose file(s)",
    confirm_send_btn: "✅ OK - Send",
    back_btn: "Back",

    chat_title: "Messages",
    chat_empty: "No one registered to chat with yet",
    chat_placeholder: "Type a message...",
    chat_send_btn: "Send",
    chat_no_messages: "No messages yet, start the conversation!",

    upload_success: "{count} file(s) uploaded successfully",
    upload_none: "No files were uploaded",
    mkdir_name_required: "Please enter a valid folder name",
    mkdir_exists: "A folder with that name already exists",
    mkdir_success: "Folder created",
    generic_error: "Something went wrong",
    delete_success: "Deleted",
    delete_error: "An error occurred while deleting",
    not_found: "Not found",
    path_not_allowed: "Path not allowed",
    recipient_not_found: "Recipient user not found",
    no_self_send: "You can't send to yourself",
    file_not_found: "File not found",
    share_success: "File sent to {recipient} successfully",
    share_error: "An error occurred while sending",
    device_not_found: "This device/user was not found",
    send_direct_success: "{count} file(s) sent to {recipient} successfully ✅",
    send_direct_none: "No files were selected",
  },
};

function tf(lang, key, vars) {
  const dict = STRINGS[lang] || STRINGS.ar;
  let s = dict[key] || STRINGS.ar[key] || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replace(new RegExp(`{${k}}`, "g"), v);
    });
  }
  return s;
}

app.use((req, res, next) => {
  if (!req.session.lang) req.session.lang = "ar";
  res.locals.lang = req.session.lang;
  res.locals.dir = req.session.lang === "ar" ? "rtl" : "ltr";
  res.locals.t = (key, vars) => tf(res.locals.lang, key, vars);
  next();
});

app.get("/set-lang/:code", (req, res) => {
  req.session.lang = req.params.code === "en" ? "en" : "ar";
  res.redirect(req.get("Referer") || "/");
});

// ---------------------------------------------------------------------------
// مستخدمين
// ---------------------------------------------------------------------------
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}
// أسماء المجلدات الفرعية جوه "الوارد" بحسب نوع الملف (ثابتة بالإنجليزي عشان متتغيرش مع تبديل اللغة)
const RECEIVED_SUBFOLDERS = { images: "Photos", videos: "Videos", audio: "Audio", files: "Files" };

function userRoot(username) {
  const p = path.join(STORAGE_DIR, username);
  const received = path.join(p, "Received");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  if (!fs.existsSync(received)) fs.mkdirSync(received, { recursive: true });
  Object.values(RECEIVED_SUBFOLDERS).forEach((folder) => {
    const sub = path.join(received, folder);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
  });
  return p;
}

// بيرجع مجلد "الوارد" الفرعي المناسب لنوع الملف ده (وبيعمله لو لسه مش موجود)
function receivedSubdirFor(recipientRoot, filename) {
  const cat = categoryOf(filename);
  const folder = RECEIVED_SUBFOLDERS[cat] || RECEIVED_SUBFOLDERS.files;
  const dir = path.join(recipientRoot, "Received", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// بيعد كل الملفات جوه مجلد ونص الفرعي بتاعه (مش بس الملفات اللي ع مستوى واحد)
function countFilesRecursive(dir) {
  let count = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(full);
    } else if (entry.isFile()) {
      count++;
    }
  }
  return count;
}

// يمنع الخروج من مجلد المستخدم (path traversal)
function safeJoin(base, ...segments) {
  const finalPath = path.join(base, ...segments);
  const resolved = path.resolve(finalPath);
  const resolvedBase = path.resolve(base);
  if (!resolved.startsWith(resolvedBase)) {
    const err = new Error("مسار غير مسموح");
    err.status = 400;
    throw err;
  }
  return resolved;
}

function humanSize(num) {
  const units = ["بايت", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return i === 0 ? `${Math.round(num)} ${units[i]}` : `${num.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// تصنيف الملفات بالنوع + حساب المساحة
// ---------------------------------------------------------------------------
const CATEGORY_RULES = {
  images: { labelKey: "cat_images", color: "#c084fc", exts: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg", "tiff"] },
  videos: { labelKey: "cat_videos", color: "#f472b6", exts: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "3gp", "flv"] },
  audio: { labelKey: "cat_audio", color: "#60a5fa", exts: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "wma"] },
  files: { labelKey: "cat_files", color: "#34d399", exts: [] }, // أي حاجة تانية
};

function categoryOf(filename) {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  for (const [key, rule] of Object.entries(CATEGORY_RULES)) {
    if (rule.exts.includes(ext)) return key;
  }
  return "files";
}

function walkAndCategorize(rootPath) {
  const totals = { images: 0, videos: 0, audio: 0, files: 0 };

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const size = fs.statSync(full).size;
          totals[categoryOf(entry.name)] += size;
        } catch (e) {
          /* تجاهل أي ملف اختفى وقت القراءة */
        }
      }
    }
  }

  walk(rootPath);
  return totals;
}

function getDiskSpace(targetPath) {
  try {
    const stats = fs.statfsSync(targetPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    return { total, free, used: total - free };
  } catch (e) {
    // fallback في حالة عدم توفر statfs (نظام قديم)
    return { total: 0, free: 0, used: 0 };
  }
}

function getStorageStats(username) {
  const root = userRoot(username);
  const breakdown = walkAndCategorize(root);
  const usedByUser = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const disk = getDiskSpace(root);

  const categories = Object.entries(CATEGORY_RULES).map(([key, rule]) => ({
    key,
    labelKey: rule.labelKey,
    color: rule.color,
    bytes: breakdown[key],
    percentOfUsed: usedByUser > 0 ? (breakdown[key] / usedByUser) * 100 : 0,
  }));

  return {
    categories,
    usedByUser,
    disk,
  };
}

function requireLogin(req, res, next) {
  if (!req.session.username) {
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
}

// ---------------------------------------------------------------------------
// تسجيل / دخول / خروج
// ---------------------------------------------------------------------------
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirm = req.body.confirm || "";

  if (!username || !password) {
    return res.render("register", { error: res.locals.t("err_need_fields") });
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return res.render("register", { error: res.locals.t("err_username_chars") });
  }
  if (password !== confirm) {
    return res.render("register", { error: res.locals.t("err_password_mismatch") });
  }
  if (password.length < 4) {
    return res.render("register", { error: res.locals.t("err_password_short") });
  }

  const users = loadUsers();
  if (users[username]) {
    return res.render("register", { error: res.locals.t("err_username_taken") });
  }

  users[username] = {
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString(),
  };
  saveUsers(users);
  userRoot(username);

  res.redirect("/login?registered=1");
});

app.get("/login", (req, res) => {
  res.render("login", { error: null, registered: req.query.registered === "1" });
});

app.post("/login", (req, res) => {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";

  const users = loadUsers();
  const user = users[username];

  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.username = username;
    const next = req.query.next || "/browse/";
    return res.redirect(next);
  }

  res.render("login", { error: res.locals.t("login_error"), registered: false });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/", (req, res) => {
  res.redirect(req.session.username ? "/browse/" : "/login");
});

// ---------------------------------------------------------------------------
// تصفح الملفات
// ---------------------------------------------------------------------------
const CATEGORY_ICONS = { images: "🖼️", videos: "🎬", audio: "🎵", files: "📄" };

function listDir(fullPath, relPath) {
  const names = fs.readdirSync(fullPath);
  const items = names.map((name) => {
    const itemFull = path.join(fullPath, name);
    const stat = fs.statSync(itemFull);
    const isDir = stat.isDirectory();
    return {
      name,
      is_dir: isDir,
      size: isDir ? 0 : stat.size,
      rel_path: path.posix.join(relPath, name),
      icon: isDir ? "📁" : CATEGORY_ICONS[categoryOf(name)],
    };
  });
  items.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

app.get("/browse/:subpath(*)", requireLogin, (req, res) => {
  const username = req.session.username;
  const root = userRoot(username);
  const subpath = req.params.subpath || "";

  let fullPath;
  try {
    fullPath = safeJoin(root, subpath);
  } catch (e) {
    return res.status(400).send(res.locals.t("path_not_allowed"));
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return res.status(404).send(res.locals.t("not_found"));
  }

  const items = listDir(fullPath, subpath);

  const parts = subpath.split("/").filter(Boolean);
  let accum = "";
  const breadcrumbs = parts.map((p) => {
    accum = accum ? `${accum}/${p}` : p;
    return { name: p, path: accum };
  });

  const users = loadUsers();
  const otherUsers = Object.keys(users).filter((u) => u !== username);

  const receivedDir = path.join(root, "Received");
  const receivedCount = countFilesRecursive(receivedDir);

  const storageStats = getStorageStats(username);

  res.render("browse", {
    items,
    currentPath: subpath,
    breadcrumbs,
    username,
    otherUsers,
    receivedCount,
    humanSize,
    storageStats,
    messages: req.session.flash || [],
  });
  req.session.flash = [];
});

function flash(req, type, text) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({ type, text });
}

// ---------------------------------------------------------------------------
// رفع الملفات
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const username = req.session.username;
      const root = userRoot(username);
      const subpath = req.body.subpath || req.query.subpath || "";
      try {
        const dest = safeJoin(root, subpath);
        cb(null, dest);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      // تنظيف اسم الملف
      const safe = file.originalname.replace(/[/\\]/g, "_");
      cb(null, safe);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB لكل ملف
});

app.post("/upload", requireLogin, upload.array("files"), (req, res) => {
  const subpath = req.body.subpath || "";
  const count = (req.files || []).length;
  flash(
    req,
    count ? "success" : "error",
    count ? res.locals.t("upload_success", { count }) : res.locals.t("upload_none")
  );
  res.redirect("/browse/" + subpath);
});

// ---------------------------------------------------------------------------
// إنشاء مجلد
// ---------------------------------------------------------------------------
app.post("/mkdir", requireLogin, (req, res) => {
  const username = req.session.username;
  const root = userRoot(username);
  const subpath = req.body.subpath || "";
  const folderName = (req.body.folder_name || "").trim().replace(/[/\\]/g, "_");

  if (!folderName) {
    flash(req, "error", res.locals.t("mkdir_name_required"));
    return res.redirect("/browse/" + subpath);
  }

  try {
    const newDir = safeJoin(root, subpath, folderName);
    if (fs.existsSync(newDir)) {
      flash(req, "error", res.locals.t("mkdir_exists"));
    } else {
      fs.mkdirSync(newDir, { recursive: true });
      flash(req, "success", res.locals.t("mkdir_success"));
    }
  } catch (e) {
    flash(req, "error", res.locals.t("generic_error"));
  }

  res.redirect("/browse/" + subpath);
});

// ---------------------------------------------------------------------------
// حذف
// ---------------------------------------------------------------------------
app.post("/delete", requireLogin, (req, res) => {
  const username = req.session.username;
  const root = userRoot(username);
  const target = req.body.target || "";
  const subpath = req.body.subpath || "";

  try {
    const fullTarget = safeJoin(root, target);
    const stat = fs.statSync(fullTarget);
    if (stat.isDirectory()) {
      fs.rmSync(fullTarget, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullTarget);
    }
    flash(req, "success", res.locals.t("delete_success"));
  } catch (e) {
    flash(req, "error", res.locals.t("delete_error"));
  }

  res.redirect("/browse/" + subpath);
});

// ---------------------------------------------------------------------------
// تنزيل
// ---------------------------------------------------------------------------
app.get("/download/:target(*)", requireLogin, (req, res) => {
  const username = req.session.username;
  const root = userRoot(username);

  try {
    const fullTarget = safeJoin(root, req.params.target);
    if (!fs.existsSync(fullTarget) || !fs.statSync(fullTarget).isFile()) {
      return res.status(404).send(res.locals.t("not_found"));
    }
    res.download(fullTarget);
  } catch (e) {
    res.status(400).send(res.locals.t("path_not_allowed"));
  }
});

// ---------------------------------------------------------------------------
// مشاركة/إرسال ملف لمستخدم تاني
// ---------------------------------------------------------------------------
app.post("/share", requireLogin, (req, res) => {
  const sender = req.session.username;
  const root = userRoot(sender);
  const subpath = req.body.subpath || "";
  const targetFile = req.body.target_file || "";
  const recipient = (req.body.recipient || "").trim().toLowerCase();

  const users = loadUsers();

  if (!users[recipient]) {
    flash(req, "error", res.locals.t("recipient_not_found"));
    return res.redirect("/browse/" + subpath);
  }
  if (recipient === sender) {
    flash(req, "error", res.locals.t("no_self_send"));
    return res.redirect("/browse/" + subpath);
  }

  try {
    const srcFull = safeJoin(root, targetFile);
    if (!fs.existsSync(srcFull) || !fs.statSync(srcFull).isFile()) {
      flash(req, "error", res.locals.t("file_not_found"));
      return res.redirect("/browse/" + subpath);
    }

    const recipientRoot = userRoot(recipient);
    const filename = path.basename(srcFull);
    const destDir = receivedSubdirFor(recipientRoot, filename);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destFilename = `${sender}_${timestamp}_${filename}`;
    const destFull = path.join(destDir, destFilename);

    fs.copyFileSync(srcFull, destFull);
    flash(req, "success", res.locals.t("share_success", { recipient }));
  } catch (e) {
    flash(req, "error", res.locals.t("share_error"));
  }

  res.redirect("/browse/" + subpath);
});

// ---------------------------------------------------------------------------
// رادار الإرسال: اختيار جهاز/مستخدم على نفس السيرفر وبعت له ملف على طول
// ---------------------------------------------------------------------------
app.get("/send", requireLogin, (req, res) => {
  const username = req.session.username;
  const users = loadUsers();
  const otherUsers = Object.keys(users).filter((u) => u !== username);

  res.render("send", {
    username,
    otherUsers,
    messages: req.session.flash || [],
  });
  req.session.flash = [];
});

const sendUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const sender = req.session.username;
      const recipient = (req.body.recipient || "").trim().toLowerCase();
      const users = loadUsers();

      if (!recipient || !users[recipient]) {
        return cb(new Error(tf(req.session.lang, "device_not_found")));
      }
      if (recipient === sender) {
        return cb(new Error(tf(req.session.lang, "no_self_send")));
      }

      const recipientRoot = userRoot(recipient);
      const destDir = receivedSubdirFor(recipientRoot, file.originalname);
      cb(null, destDir);
    },
    filename: (req, file, cb) => {
      const sender = req.session.username;
      const safe = file.originalname.replace(/[/\\]/g, "_");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      cb(null, `${sender}_${timestamp}_${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB لكل ملف
});

app.post(
  "/send-direct",
  requireLogin,
  (req, res, next) => {
    sendUpload.array("files")(req, res, (err) => {
      if (err) {
        flash(req, "error", err.message || res.locals.t("share_error"));
        return res.redirect("/send");
      }
      next();
    });
  },
  (req, res) => {
    const recipient = (req.body.recipient || "").trim().toLowerCase();
    const count = (req.files || []).length;
    flash(
      req,
      count ? "success" : "error",
      count ? res.locals.t("send_direct_success", { count, recipient }) : res.locals.t("send_direct_none")
    );
    if (count) {
      sendPushToUser(recipient, {
        title: req.session.username,
        body: res.locals.t("push_file_received_body"),
        url: "/browse/Received",
      });
    }
    res.redirect("/send");
  }
);

// ---------------------------------------------------------------------------
// الشات بين المستخدمين
// ---------------------------------------------------------------------------
const CHATS_FILE = path.join(DATA_DIR, "chats.json");
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, "{}", "utf-8");

function loadChats() {
  try {
    return JSON.parse(fs.readFileSync(CHATS_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}
function saveChats(chats) {
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2), "utf-8");
}
function chatKey(a, b) {
  return [a, b].sort().join("::");
}

// مجلد تخزين الرسائل الصوتية (فويس نوت)
const CHAT_AUDIO_DIR = path.join(DATA_DIR, "chat_audio");
if (!fs.existsSync(CHAT_AUDIO_DIR)) fs.mkdirSync(CHAT_AUDIO_DIR, { recursive: true });

const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CHAT_AUDIO_DIR),
    filename: (req, file, cb) => {
      const sender = req.session.username;
      const stamp = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      cb(null, `${sender}_${stamp}.webm`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB كفاية لرسالة صوتية
});

// بث الملف الصوتي (محتاج تسجيل دخول بس)
app.get("/chat-audio/:filename", requireLogin, (req, res) => {
  const full = path.join(CHAT_AUDIO_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(full)) return res.status(404).send(res.locals.t("not_found"));
  res.sendFile(full);
});

app.get("/chat", requireLogin, (req, res) => {
  const username = req.session.username;
  const users = loadUsers();
  const chats = loadChats();
  const otherUsers = Object.keys(users)
    .filter((u) => u !== username)
    .map((u) => {
      const key = chatKey(username, u);
      const msgs = chats[key] || [];
      const last = msgs[msgs.length - 1];
      return { username: u, lastText: last ? last.text : "", lastTime: last ? last.time : 0 };
    })
    .sort((a, b) => b.lastTime - a.lastTime);

  res.render("chat-list", { username, otherUsers });
});

app.get("/chat/:other", requireLogin, (req, res) => {
  const username = req.session.username;
  const other = (req.params.other || "").trim().toLowerCase();
  const users = loadUsers();

  if (!users[other] || other === username) {
    return res.redirect("/chat");
  }

  res.render("chat", { username, other });
});

app.get("/chat/:other/data", requireLogin, (req, res) => {
  const username = req.session.username;
  const other = (req.params.other || "").trim().toLowerCase();
  const users = loadUsers();

  if (!users[other] || other === username) {
    return res.json({ messages: [] });
  }

  const chats = loadChats();
  const messages = chats[chatKey(username, other)] || [];
  res.json({ messages });
});

app.post("/chat/:other/send", requireLogin, (req, res) => {
  const username = req.session.username;
  const other = (req.params.other || "").trim().toLowerCase();
  const users = loadUsers();
  // ستيكر (إيموجي كبير بيتبعت على طول زي واتساب) أو رسالة نصية عادية
  const sticker = (req.body.sticker || "").trim().slice(0, 8);
  const text = (req.body.text || "").trim().slice(0, 2000);
  const isSticker = !!sticker;

  if (!users[other] || other === username || (!isSticker && !text)) {
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ ok: false });
    }
    return res.redirect("/chat/" + other);
  }

  const chats = loadChats();
  const key = chatKey(username, other);
  if (!chats[key]) chats[key] = [];
  if (isSticker) {
    chats[key].push({ from: username, type: "sticker", text: sticker, time: Date.now() });
  } else {
    chats[key].push({ from: username, type: "text", text, time: Date.now() });
  }
  saveChats(chats);

  sendPushToUser(other, {
    title: username,
    body: isSticker ? sticker : text,
    url: "/chat/" + username,
  });

  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res.json({ ok: true });
  }
  res.redirect("/chat/" + other);
});

// رسالة صوتية (فويس نوت)
app.post("/chat/:other/send-voice", requireLogin, voiceUpload.single("audio"), (req, res) => {
  const username = req.session.username;
  const other = (req.params.other || "").trim().toLowerCase();
  const users = loadUsers();

  if (!users[other] || other === username || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.json({ ok: false });
  }

  const chats = loadChats();
  const key = chatKey(username, other);
  if (!chats[key]) chats[key] = [];
  chats[key].push({ from: username, type: "voice", audioFile: req.file.filename, time: Date.now() });
  saveChats(chats);

  sendPushToUser(other, {
    title: username,
    body: res.locals.t("push_voice_body"),
    url: "/chat/" + username,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// إشعارات الدفع (Web Push) — عشان توصل رسالة للمستخدم حتى لو البرنامج مقفول
// ---------------------------------------------------------------------------
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BJVhHkWmL0yizcckrzjO9f0Mje0oYt47u-iQEiOO1OSJcEQNYYItQkv9Cl6bXAxlfym2VbX7KqCuTGiC1h9YeMI";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "LQEq1kCMxUJ_M4PDdbV843w702yyb4Wp8Pd6UEK7tqc";

webpush.setVapidDetails("mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const PUSH_FILE = path.join(DATA_DIR, "push_subs.json");
if (!fs.existsSync(PUSH_FILE)) fs.writeFileSync(PUSH_FILE, "{}", "utf-8");

function loadPushSubs() {
  try {
    return JSON.parse(fs.readFileSync(PUSH_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}
function savePushSubs(subs) {
  fs.writeFileSync(PUSH_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

app.get("/push-vapid-key", requireLogin, (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

app.post("/push-subscribe", requireLogin, (req, res) => {
  const username = req.session.username;
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ ok: false });

  const subs = loadPushSubs();
  if (!subs[username]) subs[username] = [];
  // امنع تكرار نفس الاشتراك (لو اتسجل أكتر من مرة من نفس المتصفح)
  subs[username] = subs[username].filter((s) => s.endpoint !== sub.endpoint);
  subs[username].push(sub);
  savePushSubs(subs);

  res.json({ ok: true });
});

app.post("/push-unsubscribe", requireLogin, (req, res) => {
  const username = req.session.username;
  const endpoint = (req.body && req.body.endpoint) || "";
  const subs = loadPushSubs();
  if (subs[username]) {
    subs[username] = subs[username].filter((s) => s.endpoint !== endpoint);
    savePushSubs(subs);
  }
  res.json({ ok: true });
});

// يبعت إشعار لكل الأجهزة المسجلة لمستخدم معين (ومن غير ما يوقف الطلب الأساسي لو فشل)
function sendPushToUser(username, payload) {
  const subs = loadPushSubs();
  const userSubs = subs[username] || [];
  if (userSubs.length === 0) return;

  let changed = false;
  userSubs.forEach((sub) => {
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        subs[username] = (subs[username] || []).filter((s) => s.endpoint !== sub.endpoint);
        changed = true;
        savePushSubs(subs);
      } else {
        console.warn("تعذر إرسال إشعار:", err && err.message);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🌩️  Shery Share شغالة على البورت ${PORT}`);
  console.log(`   افتح من نفس الجهاز: http://localhost:${PORT}`);
  console.log(`   افتح من جهاز تاني على نفس الشبكة: http://<local-ip>:${PORT}`);
  console.log("   للوصول من الإنترنت، راجع ملف README.md\n");
});
