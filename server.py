from flask import Flask, request, jsonify, send_from_directory
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
import uuid, time
import yt_dlp

ROOT=Path(__file__).resolve().parent
DOWNLOADS=ROOT/"downloads"; DOWNLOADS.mkdir(exist_ok=True)
app=Flask(__name__,static_folder=str(ROOT),static_url_path="")
pool=ThreadPoolExecutor(max_workers=2)
jobs={}; lock=Lock()

def valid_url(u): return isinstance(u,str) and len(u)<4096 and u.startswith(("https://","http://"))
def base_opts(): return {"quiet":True,"no_warnings":True,"noplaylist":True,"socket_timeout":25}

@app.get("/")
def home(): return send_from_directory(ROOT,"index.html")
@app.get("/api/health")
def health(): return jsonify(ok=True,engine="yt-dlp")
@app.post("/api/info")
def info():
    u=(request.get_json(silent=True) or {}).get("url","")
    if not valid_url(u): return jsonify(error="الرابط غير صالح."),400
    try:
        with yt_dlp.YoutubeDL({**base_opts(),"skip_download":True}) as y:
            d=y.extract_info(u,download=False)
        return jsonify(title=d.get("title"),extractor=d.get("extractor_key") or d.get("extractor"),duration=d.get("duration"))
    except Exception as e: return jsonify(error="تعذر تحليل الرابط: "+str(e)[:300]),422

def run_job(jid,u,fmt,q):
    def hook(d):
        with lock:
            j=jobs[jid]
            if d.get("status")=="downloading":
                total=d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                done=d.get("downloaded_bytes") or 0
                j.update(state="downloading",percent=round(done*100/total) if total else j.get("percent",0),message="جارٍ تنزيل الفيديو...")
            elif d.get("status")=="finished": j.update(percent=98,message="جارٍ تجهيز الملف...")
    try:
        h=int(q) if q in {"1080","720","480","360"} else None
        common={**base_opts(),"progress_hooks":[hook],"outtmpl":str(DOWNLOADS/"%(title).100s-%(id)s.%(ext)s")}
        if fmt=="mp3":
            opts={**common,"format":"bestaudio/best","postprocessors":[{"key":"FFmpegExtractAudio","preferredcodec":"mp3","preferredquality":"192"}]}
        elif fmt=="webm":
            f=f"bestvideo[ext=webm][height<={h}]+bestaudio[ext=webm]/best[ext=webm]" if h else "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]"
            opts={**common,"format":f,"merge_output_format":"webm"}
        else:
            f=f"bestvideo[height<={h}]+bestaudio/best[height<={h}]" if h else "bestvideo+bestaudio/best"
            opts={**common,"format":f,"merge_output_format":"mp4"}
        with yt_dlp.YoutubeDL(opts) as y:
            d=y.extract_info(u,download=True); file=y.prepare_filename(d)
        p=Path(file)
        if fmt=="mp3": p=p.with_suffix(".mp3")
        elif fmt=="mp4": p=p.with_suffix(".mp4")
        elif fmt=="webm": p=p.with_suffix(".webm")
        with lock: jobs[jid].update(state="finished",percent=100,title=d.get("title","Video"),file=p.name,message="اكتمل التنزيل.")
    except Exception as e:
        with lock: jobs[jid].update(state="error",message=str(e)[:400])

@app.post("/api/download")
def download():
    d=request.get_json(silent=True) or {};u=d.get("url","");fmt=d.get("format","mp4");q=d.get("quality","best")
    if not valid_url(u): return jsonify(error="الرابط غير صالح."),400
    if fmt not in {"mp4","mp3","webm"}: return jsonify(error="صيغة غير مدعومة."),400
    jid=uuid.uuid4().hex[:12]
    with lock: jobs[jid]={"id":jid,"url":u,"state":"queued","percent":0,"message":"في قائمة الانتظار","created":time.time(),"title":"جاري تجهيز الفيديو"}
    pool.submit(run_job,jid,u,fmt,q)
    return jsonify(jobs[jid])
@app.get("/api/jobs")
def get_jobs():
    with lock: return jsonify(jobs=[dict(j) for j in jobs.values()])
@app.get("/downloads/<path:filename>")
def get_file(filename): return send_from_directory(DOWNLOADS,filename,as_attachment=True)
if __name__=="__main__":
    print("NOVA is ready at http://127.0.0.1:8765")
    app.run(host="127.0.0.1",port=8765,debug=False)
