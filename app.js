const $ = s => document.querySelector(s);
let currentUrl = "", currentBlobUrl = "", historyItems = [];
const HISTORY_KEY = "nova-browser-download-history-v1";

function setPage(id) {
  document.querySelectorAll(".side-link").forEach(b => b.classList.toggle("active", b.dataset.page === id));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === id));
  $("#pageTitle").textContent = ({home:"الرئيسية",downloads:"التنزيلات",settings:"الإعدادات"})[id];
  $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show");
}
document.querySelectorAll(".side-link").forEach(b => b.onclick = () => setPage(b.dataset.page));
$("#menuBtn").onclick = () => { $("#sidebar").classList.toggle("open"); $("#scrim").classList.toggle("show"); };
$("#scrim").onclick = () => { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); };

function setEngineState() {
  $("#serverState").innerHTML = '<i style="background:#6f9656"></i> وضع المتصفح';
  $("#settingsState").textContent = "لا يحتاج خادماً";
  $("#message").textContent = "أدخل رابط ملف فيديو أو صوت مباشر بصيغة MP4 أو WEBM أو MP3.";
}
function validHttpUrl(value) {
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u : null; }
  catch { return null; }
}
function isDirectMedia(url) {
  return /\.(mp4|m4v|webm|mp3|m4a|ogg|ogv|wav)(?:$|[?#])/i.test(url);
}
function fileNameFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "nova-media");
    return name.replace(/[\\/:*?"<>|]/g, "_") || "nova-media";
  } catch { return "nova-media"; }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
$("#pasteBtn").onclick = async () => {
  try { $("#urlInput").value = await navigator.clipboard.readText(); }
  catch { $("#message").textContent = "تعذر اللصق التلقائي؛ الصق الرابط يدوياً في الخانة."; }
};
$("#inspectBtn").onclick = () => {
  currentUrl = $("#urlInput").value.trim();
  const u = validHttpUrl(currentUrl);
  $("#downloadBtn").disabled = true;
  $("#videoInfo").classList.add("hidden");
  if (!u) { $("#message").textContent = "أدخل رابطاً صحيحاً يبدأ بـ https:// أو http://."; return; }
  if (!isDirectMedia(currentUrl)) {
    $("#message").textContent = "هذا رابط صفحة مشاهدة وليس رابط ملف مباشر. وضع المتصفح لا يستطيع استخراج الفيديو من YouTube أو صفحات المشاهدة؛ جرّب رابط ملف MP4 أو WEBM أو MP3 مباشر.";
    return;
  }
  const name = fileNameFromUrl(currentUrl);
  $("#videoInfo").innerHTML = "<b>" + esc(name) + "</b><div>ملف وسائط مباشر • سيتم جلبه من المصدر إلى جهازك إذا كان المصدر يسمح بذلك.</div>";
  $("#videoInfo").classList.remove("hidden");
  $("#downloadBtn").disabled = false;
  $("#message").textContent = "الرابط يبدو كملف وسائط مباشر. اضغط بدء التنزيل.";
};
function addHistory(item) {
  historyItems.unshift(item);
  historyItems = historyItems.slice(0, 30);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems)); } catch {}
  renderHistory();
}
function renderHistory() {
  $("#jobs").innerHTML = historyItems.length ? historyItems.map((x, i) =>
    `<article class="item"><div class="itemhead"><b>${esc(x.name)}</b><span class="kind">${esc(x.status)}</span></div><div class="url">${esc(x.url)}</div><div class="status">${esc(x.date)}</div></article>`
  ).join("") : '<div class="empty">لا توجد تنزيلات حتى الآن.</div>';
}
try { historyItems = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { historyItems = []; }
renderHistory();

$("#downloadBtn").onclick = async () => {
  const url = currentUrl;
  if (!url) return;
  $("#downloadBtn").disabled = true;
  $("#progressWrap").classList.remove("hidden");
  $("#progressBar").style.width = "0%";
  $("#progressText").textContent = "جارٍ الاتصال بالمصدر...";
  $("#message").textContent = "قد يمنع المصدر التنزيل المباشر بسبب إعدادات الحماية أو CORS.";
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("المصدر أعاد حالة HTTP " + response.status);
    const total = Number(response.headers.get("content-length") || 0);
    const reader = response.body?.getReader();
    let blob;
    if (reader) {
      const chunks = []; let loaded = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        if (total) {
          const pct = Math.min(99, Math.round(loaded / total * 100));
          $("#progressBar").style.width = pct + "%";
          $("#progressText").textContent = pct + "%";
        } else {
          $("#progressText").textContent = (loaded / 1048576).toFixed(1) + " MB";
        }
      }
      blob = new Blob(chunks, {type: response.headers.get("content-type") || "application/octet-stream"});
    } else {
      blob = await response.blob();
    }
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);
    const name = fileNameFromUrl(url);
    const a = document.createElement("a");
    a.href = currentBlobUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    $("#progressBar").style.width = "100%"; $("#progressText").textContent = "اكتمل";
    $("#message").textContent = "تم تجهيز الملف وبدء حفظه على جهازك.";
    addHistory({name, url, status:"اكتمل", date:new Date().toLocaleString("ar")});
    setTimeout(() => { if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = ""; } }, 60000);
  } catch (err) {
    $("#message").textContent = "تعذر جلب الملف داخل المتصفح. غالباً المصدر يمنع الوصول من مواقع أخرى (CORS) أو أن الرابط ليس ملفاً مباشراً. جرّب فتح الرابط مباشرة ثم استخدم خيار حفظ الفيديو من المتصفح إن كان متاحاً.";
    addHistory({name:fileNameFromUrl(url), url, status:"تعذر التنزيل", date:new Date().toLocaleString("ar")});
  } finally {
    $("#downloadBtn").disabled = false;
    renderHistory();
  }
};
$("#clearHistoryBtn").onclick = () => {
  historyItems = [];
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  renderHistory();
};
setEngineState();
