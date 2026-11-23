"""Dependency-free hosted application, private browser sessions, SQLite and async jobs."""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
for line in (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []:
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())
from model import generate, ModelError, model_catalog
import feedback
import accounts
import maintenance
import creative
import campaigns

DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
DB = DATA / "studio.sqlite3"
POOL = threading.BoundedSemaphore(3)
JOB_LOCK = threading.Lock()

class StudioHTTPServer(ThreadingHTTPServer):
    # Generation polling and a burst of account requests share the listener.
    request_queue_size = 64


def db():
    c = sqlite3.connect(DB, timeout=20)
    c.row_factory = sqlite3.Row
    return c


def initialize_database():
    with db() as c:
        c.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL, updated REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS project_owner ON projects(owner, updated);
        CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, project TEXT NOT NULL, owner TEXT NOT NULL, state TEXT NOT NULL, created REAL NOT NULL, label TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner TEXT NOT NULL, project TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, created REAL NOT NULL);
        """)
        c.execute("UPDATE jobs SET status='failed', error='服务刚刚重启，原结果已保留，请重新生成。' WHERE status='running'")
        feedback.initialize(c)
        accounts.initialize(c)
        creative.initialize(c)
        campaigns.initialize(c)
        import rewards
        rewards.initialize(c)
        if 'kind' not in {r[1] for r in c.execute('PRAGMA table_info(jobs)')}:
            c.execute("ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'design'")
        if 'archived' not in {r[1] for r in c.execute('PRAGMA table_info(projects)')}:
            c.execute('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
        for interrupted in c.execute("SELECT job FROM generation_charges WHERE status='reserved'").fetchall():
            accounts.settle(c,interrupted['job'],False)


def job_worker(job_id, brief, task=None):
    try:
        result = campaigns.run(task) if task else generate(brief)
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            if task:
                # A guest can register while a task runs; use the migrated owner.
                owner = c.execute('SELECT owner FROM jobs WHERE id=?', (job_id,)).fetchone()[0]
                result = campaigns.complete(c, owner, task, result)
            c.execute("UPDATE jobs SET status='completed', result=? WHERE id=?", (json.dumps(result, ensure_ascii=False), job_id))
            accounts.settle(c,job_id,True)
    except Exception as exc:
        error = str(exc) if isinstance(exc, (ModelError, feedback.ReviewError)) else "生成未完成，原有内容已保留，请重试。"
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE jobs SET status='failed', error=? WHERE id=?", (error, job_id))
            accounts.settle(c,job_id,False)
    finally:
        POOL.release()


def validate_state(state):
    if not isinstance(state, dict):
        raise ValueError("项目格式不正确。")
    brief = state.get("brief", {})
    if not isinstance(brief, dict):
        raise ValueError("输入格式不正确。")
    for k in ["topic", "creativeTheme", "originalTitle", "originalBody", "audience", "platform", "goal", "tone"]:
        if not isinstance(brief.get(k, ""), str) or len(brief.get(k, "")) > 12000:
            raise ValueError("输入过长，请控制在 12000 字以内。")
    if not isinstance(brief.get('additionalPrompt',''),str) or len(brief.get('additionalPrompt',''))>4000:raise ValueError('补充创作要求最多 4000 字。')
    choices=brief.get('customChoices',{})
    if not isinstance(choices,dict) or any(axis not in ['goal','audience','tone'] or not isinstance(values,list) or len(values)>8 or any(not isinstance(v,str) or not v.strip() or len(v)>120 for v in values) or len(set(values))!=len(values) for axis,values in choices.items()):raise ValueError('自定义标签格式不正确，每个维度最多 8 个、每个 120 字。')
    if 'creationPlatforms' in brief and (not isinstance(brief['creationPlatforms'],list) or not 1<=len(brief['creationPlatforms'])<=2 or any(p not in ['小红书','抖音图文'] for p in brief['creationPlatforms']) or len(set(brief['creationPlatforms']))!=len(brief['creationPlatforms'])):raise ValueError('请选择一个或两个已开放平台。')
    if 'platformNotes' in brief and (not isinstance(brief['platformNotes'],dict) or any(k not in ['小红书','抖音图文'] or not isinstance(v,str) or len(v)>1200 for k,v in brief['platformNotes'].items())):raise ValueError('各平台创作要求最多1200字。')
    if 'creatorProfile' in brief:creative.validate_profile(brief['creatorProfile'])
    if state.get('decision') is not None:creative.validate_decision(state['decision'])
    if type(brief.get('count',2)) is not int or brief.get('count',2) not in [1,2]:raise ValueError('请选择生成一套或对比两套。')
    variants=brief.get('variants')
    if variants is not None:
        if not isinstance(variants,list) or len(variants)!=brief.get('count',2):raise ValueError('设计方向数量不正确。')
        if any(not isinstance(v,dict) or any(not isinstance(v.get(k,''),str) or len(v.get(k,''))>12000 for k in ['theme','audience','goal','tone']) for v in variants):raise ValueError('设计方向格式不正确。')
    if not isinstance(brief.get('model',''),str) or (brief.get('model') and brief['model'] not in [m['id'] for m in model_catalog()]):raise ValueError('模型未配置。')
    image = brief.get("image", "")
    if not isinstance(image, str):
        raise ValueError("图片格式无效。")
    if image:
        if not isinstance(image, str) or len(image) > 3_500_000 or not re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+", image):
            raise ValueError("图片格式无效，请上传 JPG、PNG 或 WebP 图片。")
        try:
            raw = base64.b64decode(image.split(",", 1)[1], validate=True)
            if not (raw.startswith(b"\xff\xd8\xff") or raw.startswith(b"\x89PNG\r\n\x1a\n") or (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP")):
                raise ValueError("图片内容无效。")
        except Exception:
            raise ValueError("图片内容无效。") from None
    return state


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith('"GET /api/jobs'):
            return
        super().log_message(fmt, *args)

    def session(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        token = cookies["resonance_session"].value if "resonance_session" in cookies else ""
        self.new_cookie = None
        if not re.fullmatch(r"[a-f0-9]{64}", token):
            token = secrets.token_hex(32)
            self.new_cookie = token
        self.extra_cookie=None
        self.guest_owner=hashlib.sha256(token.encode()).hexdigest()
        self.auth_token=cookies['studio_auth'].value if 'studio_auth' in cookies else ''
        with db() as c:self.account=accounts.resolve(c,self.auth_token)
        return self.account['id'] if self.account else self.guest_owner

    def auth_cookie(self,token):
        secure='; Secure' if os.environ.get('PUBLIC_APP_URL','').startswith('https://') else ''
        self.extra_cookie='studio_auth='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age='+('2592000' if token else '0')+secure

    def send(self, status, body, mime="application/json; charset=utf-8"):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if mime.startswith("application/json") or self.path.startswith('/api/') else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
        if getattr(self, "new_cookie", None):
            self.send_header("Set-Cookie", "resonance_session=" + self.new_cookie + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000")
        if getattr(self,'extra_cookie',None):self.send_header('Set-Cookie',self.extra_cookie)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        owner = self.session()
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send(200, {"ok": True, "model_ready": bool(os.environ.get("MODEL_API_KEY") or os.environ.get("OPENAI_API_KEY")), "version": "2.0-linked", "popularity_engine":"unavailable"})
        if path == '/api/creator-profile':
            with db() as c:return self.send(200,creative.get_profile(c,owner))
        if path == '/api/plans':
            with db() as c:return self.send(200,campaigns.listing(c,owner))
        plan_match=re.fullmatch(r'/api/plans/([a-f0-9]{32})',path)
        if plan_match:
            try:
                with db() as c:return self.send(200,campaigns.detail(c,owner,plan_match[1]))
            except feedback.ReviewError as exc:return self.send(exc.status,accounts.error_payload(exc))

        if path == '/api/config':return self.send(200,{'models':model_catalog(),'default_model':os.environ.get('MODEL_NAME','gpt-6.1-sol')})
        if path in ('/api/publishing/rewards','/api/admin/rewards'):
            try:
                import rewards
                with db() as c:result=rewards.listing(c,owner) if path=='/api/publishing/rewards' else {'rewards':rewards.pending(c,owner)}
                return self.send(200,result)
            except feedback.ReviewError as e:return self.send(e.status,accounts.error_payload(e))
        if path=='/api/account':
            with db() as c:result=accounts.profile(c,owner)
            return self.send(200,{**result,'payment':{'enabled':False,'message':'此公开发行版未启用支付。'}})
        image_match=re.fullmatch(r'/api/publications/([a-f0-9]{32})/(cover|original)',path)
        if image_match:
            try:
                with db() as c:raw,mime=feedback.asset(c,owner,*image_match.groups())
                return self.send(200,raw,mime)
            except feedback.ReviewError as exc:return self.send(exc.status,accounts.error_payload(exc))
        if path == '/api/publications' or path == '/api/publications/export' or re.fullmatch(r'/api/publications/[a-f0-9]{32}',path):
            try:
                with db() as c:
                    result=(feedback.listing(c,owner) if path=='/api/publications' else feedback.export_csv(c,owner) if path.endswith('/export') else feedback.detail(c,owner,path.rsplit('/',1)[1]))
                return self.send(200,result)
            except feedback.ReviewError as exc:return self.send(exc.status,accounts.error_payload(exc))
        if path == "/api/projects":
            with db() as c:
                rows = c.execute("SELECT id,title,updated FROM projects WHERE owner=? AND archived=0 ORDER BY updated DESC LIMIT 100", (owner,)).fetchall()
            return self.send(200, {"projects": [dict(r) for r in rows]})
        if path == "/api/research":
            return self.send(200, {'creative_examples': json.loads((ROOT/'model_artifacts/creative-examples.json').read_text()), 'examples':[], 'reference_examples':[], 'pairs':[], 'report':None, 'review':None, 'summary':'此发行版未启用研究数据服务。'})
        match = re.fullmatch(r"/api/(projects|jobs|versions)/([a-f0-9]{32})", path)
        if match:
            kind, ident = match.groups()
            with db() as c:
                if kind == "versions":
                    rows = c.execute("SELECT id,created,label FROM versions WHERE project=? AND owner=? ORDER BY created DESC LIMIT 20", (ident, owner)).fetchall()
                    return self.send(200, {"versions": [dict(r) for r in rows]})
                row = c.execute(f"SELECT * FROM {kind} WHERE id=? AND owner=?", (ident, owner)).fetchone()
            if not row or (kind=='projects' and row['archived']):
                return self.send(404, {"error": "没有找到该记录。"})
            result = dict(row)
            result.pop("owner", None)
            for field in ["state", "result"]:
                if result.get(field):
                    result[field] = json.loads(result[field])
            return self.send(200, result)
        match = re.fullmatch(r"/api/version/([a-f0-9]{32})", path)
        if match:
            with db() as c:
                row = c.execute("SELECT state FROM versions WHERE id=? AND owner=?", (match[1], owner)).fetchone()
            return self.send(200, {"state": json.loads(row[0])}) if row else self.send(404, {"error": "版本不存在。"})
        files = {"/feedback.js": ("feedback.js", "text/javascript; charset=utf-8"), "/feedback.css": ("feedback.css", "text/css; charset=utf-8"), "/platforms.js": ("platforms.js", "text/javascript; charset=utf-8"), "/intent.js": ("intent.js", "text/javascript; charset=utf-8"), "/intent.css": ("intent.css", "text/css; charset=utf-8"), "/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/views.js": ("views.js", "text/javascript; charset=utf-8"), "/style.css": ("style.css", "text/css; charset=utf-8"), "/views.css": ("views.css", "text/css; charset=utf-8"), "/favicon.svg": ("favicon.svg", "image/svg+xml")}
        files['/guides/travel-photo-captions']=('travel-guide.html','text/html; charset=utf-8')
        for filename in ['account.js','account.css','creation.css','experience.css','decisions.js','decisions.css','guide.css','entry.css','insights.js','insights.css','plans.js','plans.css','linked.js','series-feedback.js','experience.js','getie.css','unified.js','unified.css','walkthrough.js','walkthrough.css','related.js','publishing.js','demos.js']:
            files['/'+filename]=(filename,'text/javascript; charset=utf-8' if filename.endswith('.js') else 'text/css; charset=utf-8')
        if path in files:
            filename, mime = files[path]
            return self.send(200, (ROOT / "public" / filename).read_bytes(), mime)
        if path.startswith('/assets/'):
            asset=(ROOT/'public'/path.lstrip('/')).resolve()
            base=(ROOT/'public/assets').resolve()
            if asset.is_relative_to(base) and asset.is_file() and asset.suffix.lower() in ['.png','.jpg','.jpeg','.webp','.svg']:
                return self.send(200,asset.read_bytes(),{'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[asset.suffix.lower()])
        return self.send(404, {"error": "页面不存在。"})

    def enqueue(self, owner, brief, project='', task=None):
        with JOB_LOCK:
            with db() as c:
                if task is None and not c.execute("SELECT 1 FROM projects WHERE id=? AND owner=? AND archived=0", (project, owner)).fetchone():
                    raise ValueError("请先保存项目再生成。")
                active=c.execute("SELECT id FROM jobs WHERE owner=? AND status='running'",(owner,)).fetchone()
                count=c.execute('SELECT count(*) FROM jobs WHERE owner=? AND created>?',(owner,time.time()-3600)).fetchone()[0]
            if active:raise feedback.ReviewError('已有任务正在生成，请等待当前任务完成。',409)
            if count>=25 and not(self.account and self.account.get('role')=='admin'):
                raise feedback.ReviewError('本小时生成次数较多，请稍后再试。',429)
            if not POOL.acquire(blocking=False):raise feedback.ReviewError('创作服务正在忙，请稍后重试。',429)
            ident=secrets.token_hex(16)
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    accounts.reserve(c,owner,brief,ident)
                    c.execute('INSERT INTO jobs(id,owner,project,status,created,kind) VALUES(?,?,?,?,?,?)',
                              (ident,owner,project,'running',time.time(),task['kind'] if task else 'design'))
                threading.Thread(target=job_worker,args=(ident,brief,task),daemon=True).start()
            except Exception:
                POOL.release()
                raise
        return self.send(202,{'id':ident,'status':'running'})

    def do_POST(self):
        owner = self.session()
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403, {"error": "请求来源无效。"})
        actor=self.headers.get('X-Studio-Identity')
        if urlparse(self.path).path=='/api/diagnostics' and actor is not None and actor!=(self.account['id'] if self.account else 'guest'):
            return self.send(409, {'error':'账号已切换，请刷新后重新诊断。'})
        private_write=urlparse(self.path).path in ['/api/projects','/api/projects/clear','/api/creator-profile','/api/design-audit','/api/design-report','/api/generate','/api/account/logout','/api/account/checkin','/api/payments/checkout','/api/payments/claim','/api/admin/payments/confirm','/api/publishing/rewards','/api/admin/rewards/review','/api/publications','/api/publications/publish','/api/publications/metrics','/api/publications/import']
        private_write=private_write or urlparse(self.path).path.startswith('/api/plans/')
        if private_write and actor is not None and actor!=(self.account['id'] if self.account else 'guest'):
            return self.send(409, {'error':'账号已在其他标签页切换，请刷新后继续，当前草稿未写入其他账号。'})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 5_000_000:
                return self.send(413, {"error": "内容过大，请缩小图片或文字后重试。"})
            raw=self.rfile.read(length)
            path=urlparse(self.path).path
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("请求格式不正确。")
            path = urlparse(self.path).path
            if path=='/api/plans/example':
                import scenarios
                with db() as c:
                    c.execute('BEGIN IMMEDIATE');result=scenarios.create(c,owner,data.get('scene'))
                return self.send(200,result)
            if path=='/api/projects/example':
                import showcases
                with db() as c:
                    c.execute('BEGIN IMMEDIATE');result=showcases.project(c,owner,data.get('scene'))
                return self.send(200,result)
            if path=='/api/plans/generate':
                state=validate_state(data.get('state')) if data.get('task')!='feedback' else None
                with db() as c:task=campaigns.prepare(c,owner,data,state)
                brief={'model':task['model'],'count':2 if task['kind']=='adaptation' else 1}
                return self.enqueue(owner,brief,task.get('plan',''),task)
            if path in ['/api/plans/update','/api/plans/editor','/api/plans/draft']:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if path.endswith('/update'):result=campaigns.update(c,owner,data)
                    elif path.endswith('/editor'):
                        plan=campaigns.detail(c,owner,data.get('id'));campaigns.expect_revision(plan,data)
                        result={'state':campaigns.editor_state(plan,data)}
                    else:result=campaigns.save_draft(c,owner,data,validate_state(data.get('state')))
                return self.send(200,result)
            if path=='/api/creator-profile':
                with db() as c:
                    c.execute('BEGIN IMMEDIATE');result=creative.put_profile(c,owner,data)
                return self.send(200,result)
            if path in ['/api/design-audit','/api/design-report']:
                state=validate_state(data.get('state'))
                return self.send(200,creative.report(state) if path.endswith('report') else creative.audit(state))
            if path in ['/api/account/register','/api/account/login','/api/account/recover']:
                if self.account:raise feedback.ReviewError('请先退出当前账号，再切换身份。',409)
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    accounts.rate_limit(c,self.client_address[0],str(data.get('username',''))[:100].casefold())
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if path.endswith('/recover'):
                        result={'recovery_code':accounts.recover(c,data)}
                    else:
                        if path.endswith('/register'):ident,token,recovery=accounts.register(c,data,self.guest_owner)
                        else:ident,token=accounts.login(c,data,self.guest_owner);recovery=None
                        self.auth_cookie(token)
                        result={**accounts.profile(c,ident),'recovery_code':recovery}
                return self.send(200,result)
            if path=='/api/account/logout':
                with db() as c:c.execute('DELETE FROM auth_sessions WHERE token_hash=?',(accounts.digest(self.auth_token),))
                self.auth_cookie('');self.new_cookie=secrets.token_hex(32)
                return self.send(200,{'ok':True})
            if path in ('/api/publishing/rewards','/api/admin/rewards/review'):
                import rewards
                with db() as c:
                    c.execute('BEGIN IMMEDIATE');result=rewards.submit(c,owner,data) if path=='/api/publishing/rewards' else rewards.review(c,owner,data)
                return self.send(200,result)
            if path=='/api/account/checkin':
                with db() as c:
                    c.execute('BEGIN IMMEDIATE');result=accounts.checkin(c,owner)
                return self.send(200,result)
            if path in ['/api/publications','/api/publications/publish','/api/publications/metrics','/api/publications/import','/api/publications/compare']:
                with db() as c:
                    if path=='/api/publications':result=feedback.create(c,owner,data)
                    elif path.endswith('/publish'):
                        c.execute('BEGIN IMMEDIATE');result=feedback.mark_published(c,owner,data)
                    elif path.endswith('/metrics'):result=feedback.add_metric(c,owner,data)
                    elif path.endswith('/import'):result=feedback.import_csv(c,owner,data.get('csv'))
                    else:result=feedback.compare(c,owner,data)
                return self.send(200,result)
            if path == '/api/projects/clear':
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if c.execute("SELECT 1 FROM jobs WHERE owner=? AND status='running'",(owner,)).fetchone():
                        raise feedback.ReviewError('当前方案仍在生成，完成后可以清空历史。',409)
                    count=c.execute('UPDATE projects SET archived=1 WHERE owner=? AND archived=0',(owner,)).rowcount
                return self.send(200,{'cleared':count,'archived':True})
            if path == "/api/projects":
                state = validate_state(data.get("state"))
                ident = data.get("id") or secrets.token_hex(16)
                if not re.fullmatch(r"[a-f0-9]{32}", ident):
                    raise ValueError("项目编号无效。")
                brief = state.get("brief", {})
                current_options = (state.get("result") or {}).get("options", [])
                selected = state.get("selected", 0)
                latest_title = current_options[selected].get("title", "") if type(selected) is int and 0 <= selected < len(current_options) and isinstance(current_options[selected], dict) else ""
                title = (latest_title or brief.get("creativeTheme") or brief.get("topic") or brief.get("originalTitle") or brief.get("originalBody") or "未命名创作")[:40]
                version_id=None
                with db() as c:
                    existing = c.execute("SELECT owner,archived FROM projects WHERE id=?", (ident,)).fetchone()
                    if existing and existing[0] != owner:
                        return self.send(404, {"error": "项目不存在。"})
                    if existing and existing['archived']:
                        return self.send(409,{'error':'此创作已从历史清空，请开始新创作。'})
                    c.execute("INSERT INTO projects(id,owner,title,state,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,state=excluded.state,updated=excluded.updated", (ident, owner, title, json.dumps(state, ensure_ascii=False), time.time()))
                    if data.get("snapshot"):
                        version_id=secrets.token_hex(16)
                        c.execute("INSERT INTO versions VALUES(?,?,?,?,?,?)", (version_id, ident, owner, json.dumps(state, ensure_ascii=False), time.time(), str(data.get("label", "手动保存"))[:50]))
                        c.execute("DELETE FROM versions WHERE project=? AND owner=? AND id NOT IN (SELECT id FROM versions WHERE project=? AND owner=? ORDER BY created DESC LIMIT 20)", (ident, owner, ident, owner))
                return self.send(200, {"id": ident, "saved": True,"version_id":version_id})
            if path == "/api/generate":
                brief = data.get("brief")
                if isinstance(brief,dict):
                    brief=dict(brief)
                    brief.setdefault("count",1)
                    if not brief.get("model"):brief["model"]="gpt-6-luna"
                brief=validate_state({"brief":brief})["brief"]
                if brief.get("mode") not in ["topic", "optimize"]:
                    raise ValueError("请选择创作入口。")
                if brief["mode"] == "topic" and not (brief.get("topic", "").strip() or str(brief.get('creativeTheme','')).strip() or brief.get('image')):
                    raise ValueError("请写下一个主题，或上传图片让 AI 推荐主题。")
                if brief["mode"] == "optimize" and not (brief.get("originalTitle", "").strip() or brief.get("originalBody", "").strip() or brief.get('image')):
                    raise ValueError("请先填写已有标题或正文。")
                project = data.get("project", "")
                return self.enqueue(owner,brief,project)
            return self.send(404, {"error": "接口不存在。"})
        except feedback.ReviewError as exc:
            return self.send(exc.status,accounts.error_payload(exc))
        except (ValueError, TypeError, KeyError):
            return self.send(400, {"error": "输入格式有误，请检查文字和图片后重试。"})
        except Exception:
            return self.send(500, {"error": "保存暂未完成，请保留当前页面后重试。"})


if __name__ == "__main__":
    initialize_database()
    os.chmod(DB,0o600)
    threading.Thread(target=maintenance.loop,args=(DB,),daemon=True).start()
    port = int(os.environ["PORT"])
    print(f"Resonance Studio listening on 0.0.0.0:{port}", flush=True)
    StudioHTTPServer(("0.0.0.0", port), Handler).serve_forever()
