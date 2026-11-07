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
// مستخدمين
// ---------------------------------------------------------------------------
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}
function userRoot(username) {
  const p = path.join(STORAGE_DIR, username);
  const received = path.join(p, "Received");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  if (!fs.existsSync(received)) fs.mkdirSync(received, { recursive: true });
  return p;
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
  images: { label: "صور", color: "#c084fc", exts: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg", "tiff"] },
  videos: { label: "فيديوهات", color: "#f472b6", exts: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "3gp", "flv"] },
  audio: { label: "أغاني وصوتيات", color: "#60a5fa", exts: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "wma"] },
  files: { label: "ملفات وبرامج", color: "#34d399", exts: [] }, // أي حاجة تانية
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
    label: rule.label,
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
    return res.render("register", { error: "لازم تكتب اسم مستخدم وباسورد" });
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return res.render("register", { error: "اسم المستخدم يُسمح فيه بحروف إنجليزية وأرقام و _ بس" });
  }
  if (password !== confirm) {
    return res.render("register", { error: "الباسورد والتأكيد غير متطابقين" });
  }
  if (password.length < 4) {
    return res.render("register", { error: "الباسورد لازم يكون 4 حروف على الأقل" });
  }

  const users = loadUsers();
  if (users[username]) {
    return res.render("register", { error: "اسم المستخدم ده محجوز، اختار اسم تاني" });
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

  res.render("login", { error: "اسم المستخدم أو الباسورد غلط", registered: false });
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
    return res.status(400).send("مسار غير مسموح");
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return res.status(404).send("غير موجود");
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
  let receivedCount = 0;
  if (fs.existsSync(receivedDir)) {
    receivedCount = fs.readdirSync(receivedDir).filter((f) =>
      fs.statSync(path.join(receivedDir, f)).isFile()
    ).length;
  }

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
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB لكل ملف
});

app.post("/upload", requireLogin, upload.array("files"), (req, res) => {
  const subpath = req.body.subpath || "";
  const count = (req.files || []).length;
  flash(req, count ? "success" : "error", count ? `تم رفع ${count} ملف بنجاح` : "لم يتم رفع أي ملف");
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
    flash(req, "error", "اكتب اسم مجلد صحيح");
    return res.redirect("/browse/" + subpath);
  }

  try {
    const newDir = safeJoin(root, subpath, folderName);
    if (fs.existsSync(newDir)) {
      flash(req, "error", "فيه مجلد بنفس الاسم أصلاً");
    } else {
      fs.mkdirSync(newDir, { recursive: true });
      flash(req, "success", "تم إنشاء المجلد");
    }
  } catch (e) {
    flash(req, "error", "حصل خطأ");
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
    flash(req, "success", "تم الحذف");
  } catch (e) {
    flash(req, "error", "حصل خطأ أثناء الحذف");
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
      return res.status(404).send("غير موجود");
    }
    res.download(fullTarget);
  } catch (e) {
    res.status(400).send("مسار غير مسموح");
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
    flash(req, "error", "المستخدم المرسل إليه غير موجود");
    return res.redirect("/browse/" + subpath);
  }
  if (recipient === sender) {
    flash(req, "error", "مينفعش تبعت لنفسك");
    return res.redirect("/browse/" + subpath);
  }

  try {
    const srcFull = safeJoin(root, targetFile);
    if (!fs.existsSync(srcFull) || !fs.statSync(srcFull).isFile()) {
      flash(req, "error", "الملف غير موجود");
      return res.redirect("/browse/" + subpath);
    }

    const recipientRoot = userRoot(recipient);
    const receivedDir = path.join(recipientRoot, "Received");
    if (!fs.existsSync(receivedDir)) fs.mkdirSync(receivedDir, { recursive: true });

    const filename = path.basename(srcFull);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destFilename = `${sender}_${timestamp}_${filename}`;
    const destFull = path.join(receivedDir, destFilename);

    fs.copyFileSync(srcFull, destFull);
    flash(req, "success", `تم إرسال الملف إلى ${recipient} بنجاح`);
  } catch (e) {
    flash(req, "error", "حصل خطأ أثناء الإرسال");
  }

  res.redirect("/browse/" + subpath);
});

// ---------------------------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🌩️  Shery Share شغالة على البورت ${PORT}`);
  console.log(`   افتح من نفس الجهاز: http://localhost:${PORT}`);
  console.log(`   افتح من جهاز تاني على نفس الشبكة: http://<local-ip>:${PORT}`);
  console.log("   للوصول من الإنترنت، راجع ملف README.md\n");
});
