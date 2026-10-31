const KEY='nova_downloader_links_v1';
let links=load();
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}}
function save(){localStorage.setItem(KEY,JSON.stringify(links))}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)}catch(e){return false}}
function render(){
 const recent=document.getElementById('recent'), all=document.getElementById('allItems');
 const empty='<div class="empty"><div class="empty-icon">⇩</div><b>لا توجد عناصر حتى الآن</b><span>أضف رابطاً ليظهر هنا</span></div>';
 const row=x=>`<div class="item"><div class="file-icon">▶</div><div class="item-info"><b>${x.format} · ${x.quality}</b><small>${escapeHtml(x.url)}</small></div><span class="tag">${escapeHtml(x.date)}</span><button class="remove" data-remove="${x.id}" title="حذف">×</button></div>`;
 recent.innerHTML=links.length?links.slice(0,3).map(row).join(''):empty;
 all.innerHTML=links.length?links.map(row).join(''):empty;
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{links=links.filter(x=>x.id!==b.dataset.remove);save();render();toast('تم حذف الرابط من القائمة')});
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.getElementById('add').onclick=()=>{
 const url=document.getElementById('url').value.trim();
 if(!safeUrl(url)){toast('يرجى إدخال رابط صحيح يبدأ بـ http أو https');return}
 links.unshift({id:Date.now().toString(),url,format:document.getElementById('format').value,quality:document.getElementById('quality').value,date:new Date().toLocaleDateString('ar')});
 save();document.getElementById('url').value='';render();
 if(document.getElementById('notify').checked)toast('تمت إضافة الرابط إلى القائمة');
};
document.getElementById('paste').onclick=async()=>{
 try{const t=await navigator.clipboard.readText();if(t){document.getElementById('url').value=t.trim();toast('تم لصق محتوى الحافظة')}else toast('الحافظة فارغة')}
 catch(e){toast('تعذّر الوصول للحافظة؛ اضغط مطولاً داخل الحقل واختر لصق')}
};
function tab(name){
 document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==name));
 document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
 document.getElementById('crumb').textContent=({home:'الرئيسية',downloads:'التحميلات',settings:'الإعدادات'})[name];
 document.getElementById('sidebar').classList.remove('open');
}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
document.getElementById('all').onclick=()=>tab('downloads');
document.getElementById('menu').onclick=()=>document.getElementById('sidebar').classList.toggle('open');
document.getElementById('clear').onclick=()=>{if(confirm('هل تريد مسح جميع الروابط المحفوظة؟')){links=[];save();render();toast('تم مسح القائمة')}};
render();
