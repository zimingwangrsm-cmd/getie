"""Local accounts, append-only credit ledger and server-enforced entitlements."""
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import re
import secrets
import time
import unicodedata
from feedback import ReviewError

RULES={'signup':30,'checkin':5,'invite':10,'basic_cost':5,'premium_cost':15,'guest_trials':2,'vip_credits':500}

class AccessError(ReviewError):
    def __init__(self,message,status,action):
        super().__init__(message,status)
        self.action=action

def error_payload(exc):
    out={'error':str(exc)}
    action=getattr(exc,'action',None)
    if action in ('login','register','upgrade','credits'):
        out.update(action=action,href='/?auth='+action+'#account')
    return out

def initialize(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,recovery TEXT NOT NULL,invite_code TEXT UNIQUE NOT NULL,invited_by TEXT,created REAL NOT NULL,vip_until REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,account TEXT NOT NULL,expires REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS credit_ledger(id TEXT PRIMARY KEY,account TEXT NOT NULL,delta INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL,created REAL NOT NULL,UNIQUE(account,reason,reference));
    CREATE INDEX IF NOT EXISTS credit_account ON credit_ledger(account,created);
    CREATE TABLE IF NOT EXISTS generation_charges(job TEXT PRIMARY KEY,owner TEXT NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL,created REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT NOT NULL,created REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_rate ON auth_attempts(bucket,created);
    ''')
    if 'role' not in {r[1] for r in c.execute('PRAGMA table_info(accounts)')}:
        c.execute("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'member'")

def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def hash_password(password,salt=None):
    salt=salt or secrets.token_hex(16)
    return salt+':'+hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def verify(password,encoded):
    return hmac.compare_digest(hash_password(password,encoded.split(':')[0]),encoded)
def name(value):
    if not isinstance(value,str):raise ReviewError('请输入账号名称。')
    value=unicodedata.normalize('NFKC',value).casefold().strip()
    if not re.fullmatch(r'[\w.@-]{3,40}',value):raise ReviewError('账号名称为 3–40 个字母、数字、中文或 . @ _ -，不含空格。')
    return value

def password(value):
    if not isinstance(value,str) or not 10<=len(value)<=128:raise ReviewError('密码长度为 10–128 位。')
    return value

def resolve(c,token):
    if not isinstance(token,str) or not re.fullmatch(r'[a-f0-9]{64}',token):return None
    row=c.execute('SELECT a.* FROM accounts a JOIN auth_sessions s ON s.account=a.id WHERE s.token_hash=? AND s.expires>?',(digest(token),time.time())).fetchone()
    return dict(row) if row else None

def ledger(c,ident,amount,reason,reference):
    return c.execute('INSERT OR IGNORE INTO credit_ledger VALUES(?,?,?,?,?,?)',(secrets.token_hex(16),ident,amount,reason,reference,time.time())).rowcount

def balance(c,ident):return c.execute('SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE account=?',(ident,)).fetchone()[0]
def get_account(c,owner):
    row=c.execute('SELECT * FROM accounts WHERE id=?',(owner,)).fetchone()
    return dict(row) if row else None

def require(c,owner,vip=False):
    account=get_account(c,owner)
    if not account:raise AccessError('请先注册或登录账号。',401,'login')
    if vip and account.get('role')!='admin' and account['vip_until']<=time.time():raise AccessError('双方向比较与精细模型需要 VIP，可先使用基础创作。',403,'upgrade')
    return account

def require_admin(c,owner):
    a=require(c,owner)
    if a.get('role')!='admin':raise ReviewError('此功能仅管理员可用。',403)
    return a

def today():return datetime.now(timezone(timedelta(hours=8))).date().isoformat()
def profile(c,owner):
    a=get_account(c,owner)
    common={'rules':RULES}
    if not a:
        used=c.execute("SELECT COUNT(*) FROM generation_charges WHERE owner=? AND status!='refunded'",(owner,)).fetchone()[0]
        return {**common,'user':None,'guest_remaining':max(0,RULES['guest_trials']-used),'guest_full_trial':used==0}
    entries=c.execute('SELECT delta,reason,reference,created FROM credit_ledger WHERE account=? ORDER BY created DESC LIMIT 30',(owner,)).fetchall()
    return {**common,'user':{k:a[k] for k in ('id','username','invite_code','vip_until','role')},'unlimited':a['role']=='admin','credits':balance(c,owner),'first_topup':not bool(c.execute("SELECT 1 FROM credit_ledger WHERE account=? AND reason='topup'",(owner,)).fetchone()),'vip':a['role']=='admin' or a['vip_until']>time.time(),'checked_in':bool(c.execute("SELECT 1 FROM credit_ledger WHERE account=? AND reason='checkin' AND reference=?",(owner,today())).fetchone()),'ledger':[dict(r) for r in entries]}

def rate_limit(c,ip,username):
    now=time.time();keys=[digest('ip:'+ip),digest('account:'+username)]
    c.execute('DELETE FROM auth_attempts WHERE created<?',(now-3600,))
    for key in keys:
        if c.execute('SELECT COUNT(*) FROM auth_attempts WHERE bucket=? AND created>?',(key,now-900)).fetchone()[0]>=20:raise ReviewError('尝试次数较多，请 15 分钟后重试。',429)
    for key in keys:c.execute('INSERT INTO auth_attempts VALUES(?,?)',(key,now))

def register(c,data,guest):
    username=name(data.get('username'));pw=password(data.get('password'))
    invitation=data.get('invite','')
    if not isinstance(invitation,str) or len(invitation)>20:raise ReviewError('邀请码格式不正确。')
    inviter=None
    if invitation.strip():
        row=c.execute('SELECT id FROM accounts WHERE invite_code=?',(invitation.strip().upper(),)).fetchone()
        if not row:raise ReviewError('邀请码不存在，请核对或留空。')
        inviter=row['id']
    if c.execute('SELECT 1 FROM accounts WHERE username=?',(username,)).fetchone():raise ReviewError('此账号名称已被使用。',409)
    ident='u_'+secrets.token_hex(16);recovery=secrets.token_hex(20)
    c.execute('INSERT INTO accounts(id,username,password,recovery,invite_code,invited_by,created,vip_until) VALUES(?,?,?,?,?,?,?,0)',(ident,username,hash_password(pw),digest(recovery),secrets.token_hex(5).upper(),inviter,time.time()))
    ledger(c,ident,RULES['signup'],'signup','once')
    migrate(c,guest,ident)
    token=new_session(c,ident)
    return ident,token,recovery

def migrate(c,guest,ident):
    if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='content_diagnostics'").fetchone():
        c.execute('UPDATE OR IGNORE content_diagnostics SET owner=? WHERE owner=?',(ident,guest))
    # Preserve an existing member profile; never overwrite it with a guest profile.
    if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='creator_profiles'").fetchone():
        row=c.execute('SELECT 1 FROM creator_profiles WHERE owner=?',(ident,)).fetchone()
        if not row:c.execute('UPDATE creator_profiles SET owner=? WHERE owner=?',(ident,guest))
    for table in ('content_plans','plan_proposals'):
        if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone():
            c.execute('UPDATE '+table+' SET owner=? WHERE owner=?',(ident,guest))
    for table in ('projects','versions','jobs','publications','metric_snapshots'):
        c.execute('UPDATE '+table+' SET owner=? WHERE owner=?',(ident,guest))

def new_session(c,ident):
    token=secrets.token_hex(32)
    c.execute('INSERT INTO auth_sessions VALUES(?,?,?)',(digest(token),ident,time.time()+30*86400))
    return token

def login(c,data,guest):
    username=name(data.get('username'));pw=password(data.get('password'))
    row=c.execute('SELECT * FROM accounts WHERE username=?',(username,)).fetchone()
    encoded=row['password'] if row else hash_password('dummy-password', '0'*32)
    if not verify(pw,encoded) or not row:raise ReviewError('账号或密码不正确。',401)
    migrate(c,guest,row['id'])
    return row['id'],new_session(c,row['id'])

def recover(c,data):
    username=name(data.get('username'));pw=password(data.get('password'));code=data.get('recovery','')
    if not isinstance(code,str) or len(code)>100:raise ReviewError('账号或恢复码不正确。',401)
    row=c.execute('SELECT * FROM accounts WHERE username=?',(username,)).fetchone()
    if not row or not hmac.compare_digest(row['recovery'],digest(code.strip())):raise ReviewError('账号或恢复码不正确。',401)
    new_code=secrets.token_hex(20)
    c.execute('UPDATE accounts SET password=?,recovery=? WHERE id=?',(hash_password(pw),digest(new_code),row['id']))
    c.execute('DELETE FROM auth_sessions WHERE account=?',(row['id'],))
    return new_code

def checkin(c,owner):
    require(c,owner)
    added=ledger(c,owner,RULES['checkin'],'checkin',today())
    return {'added':RULES['checkin'] if added else 0,**profile(c,owner)}

def reserve(c,owner,brief,job):
    a=get_account(c,owner);premium=brief.get('count',2)==2 or (brief.get('model') or 'gpt-6.1-sol')=='gpt-6.1-sol'
    if a and a.get('role')=='admin':
        c.execute('INSERT INTO generation_charges VALUES(?,?,?,?,?)',(job,owner,0,'reserved',time.time()))
        return
    used=0 if a else c.execute("SELECT COUNT(*) FROM generation_charges WHERE owner=? AND status!='refunded'",(owner,)).fetchone()[0]
    if not a and used>=RULES['guest_trials']:
        raise AccessError('免费试用已用完，注册可领取创作积分。',401,'register')
    if premium and (a or used>0):require(c,owner,True)
    cost=RULES['premium_cost'] if premium else RULES['basic_cost']
    if a:
        if balance(c,owner)<cost:raise AccessError('积分不足，可签到领取或充值补充额度。',402,'credits')
        ledger(c,owner,-cost,'generation',job)
    else:
        cost=0
    c.execute('INSERT INTO generation_charges VALUES(?,?,?,?,?)',(job,owner,cost,'reserved',time.time()))

def settle(c,job,success):
    row=c.execute('SELECT * FROM generation_charges WHERE job=?',(job,)).fetchone()
    if not row or row['status']!='reserved':return
    c.execute('UPDATE generation_charges SET status=? WHERE job=?',('completed' if success else 'refunded',job))
    if not success:
        if row['cost']:ledger(c,row['owner'],row['cost'],'refund',job)
        return
    a=get_account(c,row['owner'])
    if a and a['invited_by']:
        # Reward only once, after useful work, cap inviter at 10 activations/day.
        rewarded=c.execute("SELECT 1 FROM credit_ledger WHERE account=? AND reason='invite_join'",(a['id'],)).fetchone()
        start=datetime.combine(datetime.now(timezone(timedelta(hours=8))).date(),datetime.min.time(),timezone(timedelta(hours=8))).timestamp()
        count=c.execute("SELECT COUNT(*) FROM credit_ledger WHERE account=? AND reason='invite_host' AND created>=?",(a['invited_by'],start)).fetchone()[0]
        if not rewarded and count<10:
            ledger(c,a['id'],RULES['invite'],'invite_join',a['id'])
            ledger(c,a['invited_by'],RULES['invite'],'invite_host',a['id'])
