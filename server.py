from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from urllib.parse import urlparse
import ipaddress, uuid, time, os
import yt_dlp

ROOT=Path(__file__).resolve().parent
DOWNLOADS=Path(os.environ.get('DOWNLOAD_DIR', ROOT/'downloads')).resolve(); DOWNLOADS.mkdir(parents=True,exist_ok=True)
app=Flask(__name__)
allowed=os.environ.get('ALLOWED_ORIGINS','*').split(',')
CORS(app, resources={r'/api/*': {'origins': allowed}, r'/downloads/*': {'origins': allowed}})
pool=ThreadPoolExecutor(max_workers=int(os.environ.get('MAX_WORKERS','2')))
jobs={}; lock=Lock()

def valid_url(u):
    if not isinstance(u,str) or len(u)>4096: return False
    try:
        p=urlparse(u); host=p.hostname
        if p.scheme not in ('http','https') or not host or p.username or p.password: return False
        if host.lower() in {'localhost','localhost.localdomain'} or host.endswith('.local'): return False
        try:
            ip=ipaddress.ip_address(host)
            if not ip.is_global: return False
        except ValueError: pass
        return True
    except Exception: return False

def base_opts(): return {'quiet':True,'no_warnings':True,'noplaylist':True,'socket_timeout':30,'retries':2}

@app.get('/api/health')
def health(): return jsonify(ok=True,engine='yt-dlp',version='1.0')

@app.post('/api/info')
def info():
    u=(request.get_json(silent=True) or {}).get('url','')
    if not valid_url(u): return jsonify(error='الرابط غير صالح أو غير مسموح.'),400
    try:
        with yt_dlp.YoutubeDL({**base_opts(),'skip_download':True}) as y: d=y.extract_info(u,download=False)
        return jsonify(title=d.get('title'),extractor=d.get('extractor_key') or d.get('extractor'),duration=d.get('duration'))
    except Exception as e: return jsonify(error='تعذر تحليل الرابط: '+str(e)[:250]),422

def run_job(jid,u,fmt,q):
    def hook(d):
        with lock:
            j=jobs.get(jid)
            if not j: return
            if d.get('status')=='downloading':
                total=d.get('total_bytes') or d.get('total_bytes_estimate') or 0; done=d.get('downloaded_bytes') or 0
                j.update(state='downloading',percent=round(done*100/total) if total else j.get('percent',0),message='جارٍ تنزيل الفيديو...')
            elif d.get('status')=='finished': j.update(percent=98,message='جارٍ تجهيز الملف...')
    try:
        h=int(q) if q in {'1080','720','480','360'} else None
        common={**base_opts(),'progress_hooks':[hook],'outtmpl':str(DOWNLOADS/'%(title).90s-%(id)s.%(ext)s')}
        if fmt=='mp3': opts={**common,'format':'bestaudio/best','postprocessors':[{'key':'FFmpegExtractAudio','preferredcodec':'mp3','preferredquality':'192'}]}
        elif fmt=='webm':
            f=f'bestvideo[ext=webm][height<={h}]+bestaudio[ext=webm]/best[ext=webm]' if h else 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]'
            opts={**common,'format':f,'merge_output_format':'webm'}
        else:
            f=f'bestvideo[height<={h}]+bestaudio/best[height<={h}]' if h else 'bestvideo+bestaudio/best'
            opts={**common,'format':f,'merge_output_format':'mp4'}
        with yt_dlp.YoutubeDL(opts) as y: d=y.extract_info(u,download=True); file=y.prepare_filename(d)
        p=Path(file)
        if fmt=='mp3': p=p.with_suffix('.mp3')
        elif fmt=='mp4': p=p.with_suffix('.mp4')
        elif fmt=='webm': p=p.with_suffix('.webm')
        if not p.exists():
            candidates=list(DOWNLOADS.glob(f'*{d.get("id","")}*'))
            if candidates: p=candidates[0]
        with lock: jobs[jid].update(state='finished',percent=100,title=d.get('title','Video'),file=p.name,message='اكتمل التنزيل.')
    except Exception as e:
        with lock: jobs[jid].update(state='error',message=str(e)[:350])

@app.post('/api/download')
def download():
    d=request.get_json(silent=True) or {}; u=d.get('url',''); fmt=d.get('format','mp4'); q=d.get('quality','best')
    if not valid_url(u): return jsonify(error='الرابط غير صالح أو غير مسموح.'),400
    if fmt not in {'mp4','mp3','webm'}: return jsonify(error='صيغة غير مدعومة.'),400
    jid=uuid.uuid4().hex[:12]
    with lock: jobs[jid]={'id':jid,'url':u,'state':'queued','percent':0,'message':'في قائمة الانتظار','created':time.time(),'title':'جاري تجهيز الفيديو'}
    pool.submit(run_job,jid,u,fmt,q)
    return jsonify(jobs[jid])

@app.get('/api/jobs')
def get_jobs():
    with lock: return jsonify(jobs=[dict(j) for j in jobs.values()])

@app.get('/downloads/<path:filename>')
def get_file(filename): return send_from_directory(DOWNLOADS,filename,as_attachment=True,conditional=True)

if __name__=='__main__': app.run(host='0.0.0.0',port=int(os.environ.get('PORT','8765')))
