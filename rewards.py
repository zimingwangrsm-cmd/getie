"""Reviewed publication rewards; opening the publishing page never grants credit."""
import re
import secrets
import time
from urllib.parse import urlparse
import accounts
from feedback import ReviewError

TAG='个贴创作辅助'
AMOUNT=10
DAILY_LIMIT=3

def initialize(c):
    c.executescript('''CREATE TABLE IF NOT EXISTS publication_rewards(
      id TEXT PRIMARY KEY,account TEXT NOT NULL,platform TEXT NOT NULL,url TEXT NOT NULL,
      url_key TEXT UNIQUE NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL,
      created REAL NOT NULL,submitted_day TEXT NOT NULL,reviewer TEXT,reviewed REAL,
      approved_day TEXT,canonical TEXT UNIQUE,note TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS publication_reward_owner ON publication_rewards(account,created);
    ''')

def post_url(value,platform,canonical=False):
    if not isinstance(value,str) or len(value)>500:raise ReviewError('请填写有效的帖子链接。')
    try:p=urlparse(value.strip());host=p.hostname;port=p.port
    except ValueError:raise ReviewError('帖子链接格式不正确。') from None
    if p.scheme!='https' or p.username or p.password or port not in (None,443) or p.fragment:raise ReviewError('请使用平台的 HTTPS 帖子分享链接。')
    if platform=='小红书':
        m=re.fullmatch(r'/(?:explore|discovery/item)/([a-fA-F0-9]{24})/?',p.path) if host in ('www.xiaohongshu.com','xiaohongshu.com') else None
        if m:return value.strip(),'xhs:'+m[1].lower()
        short=host in ('xhslink.com','www.xhslink.com') and re.fullmatch(r'/[A-Za-z0-9/_-]{3,120}',p.path)
    elif platform=='抖音图文':
        m=re.fullmatch(r'/(?:note|video)/(\d{10,24})/?',p.path) if host in ('www.douyin.com','douyin.com') else None
        if m:return value.strip(),'dy:'+m[1]
        short=host=='v.douyin.com' and re.fullmatch(r'/[A-Za-z0-9_-]{3,80}/?',p.path)
    else:raise ReviewError('请选择小红书或抖音图文。')
    if short and not canonical:return value.strip(),host+':'+p.path.rstrip('/')
    raise ReviewError('请填写本人帖子的完整链接'+('（需浏览器展开后的原帖地址）。' if canonical else '，不是账号主页或登录页。'))

def public(row):
    return {k:row[k] for k in ('id','platform','url','evidence','status','created','reviewed','note')}

def listing(c,owner):
    accounts.require(c,owner)
    return {'rewards':[public(r) for r in c.execute('SELECT * FROM publication_rewards WHERE account=? ORDER BY created DESC LIMIT 50',(owner,))], 'amount':AMOUNT,'daily_limit':DAILY_LIMIT,'tag':TAG}

def submit(c,owner,data):
    accounts.require(c,owner)
    platform=data.get('platform');url,key=post_url(data.get('url'),platform)
    evidence=data.get('evidence','')
    if not isinstance(evidence,str) or len(evidence)>1000:raise ReviewError('核验说明最多1000字。')
    old=c.execute('SELECT * FROM publication_rewards WHERE url_key=?',(key,)).fetchone()
    if old:
        if old['account']!=owner:raise ReviewError('此帖子已有申请，请勿重复提交。',409)
        return {'reward':public(old),'deduplicated':True}
    if c.execute('SELECT COUNT(*) FROM publication_rewards WHERE account=? AND submitted_day=?',(owner,accounts.today())).fetchone()[0]>=10:raise ReviewError('今日已提交10篇，核实后再继续。',429)
    ident=secrets.token_hex(16)
    c.execute('INSERT INTO publication_rewards(id,account,platform,url,url_key,evidence,status,created,submitted_day) VALUES(?,?,?,?,?,?,?,?,?)',(ident,owner,platform,url,key,evidence.strip(),'pending',time.time(),accounts.today()))
    return {'reward':public(c.execute('SELECT * FROM publication_rewards WHERE id=?',(ident,)).fetchone()),'deduplicated':False}

def pending(c,owner):
    accounts.require_admin(c,owner)
    return [{**public(r),'username':r['username']} for r in c.execute("SELECT r.*,a.username FROM publication_rewards r JOIN accounts a ON a.id=r.account WHERE r.status='pending' ORDER BY r.created LIMIT 50")]

def review(c,owner,data):
    accounts.require_admin(c,owner)
    ident=data.get('id')
    if not isinstance(ident,str):raise ReviewError('请选择奖励申请。')
    row=c.execute('SELECT * FROM publication_rewards WHERE id=?',(ident,)).fetchone()
    if not row:raise ReviewError('申请不存在。',404)
    if row['status']!='pending':return {'reward':public(row),'deduplicated':True}
    action=data.get('action')
    note=data.get('note','')
    if not isinstance(note,str) or len(note)>1000:raise ReviewError('核验记录最多1000字。')
    if action=='approve':
        if data.get('verified_author') is not True or data.get('verified_tag') is not True:raise ReviewError('请核实本人创作、已发布且正文包含指定标签。')
        _,key=post_url(data.get('canonical'),row['platform'],canonical=True)
        if c.execute('SELECT 1 FROM publication_rewards WHERE canonical=? AND id!=?',(key,ident)).fetchone():raise ReviewError('此原帖已发放奖励。',409)
        day=accounts.today()
        if c.execute("SELECT COUNT(*) FROM publication_rewards WHERE account=? AND status='approved' AND approved_day=?",(row['account'],day)).fetchone()[0]>=DAILY_LIMIT:raise ReviewError('该账号今日已核发3篇，请明日继续核验。',429)
        accounts.ledger(c,row['account'],AMOUNT,'publication_reward',key)
        c.execute("UPDATE publication_rewards SET status='approved',reviewer=?,reviewed=?,approved_day=?,canonical=?,note=? WHERE id=?",(owner,time.time(),day,key,note.strip(),ident))
    elif action=='reject':
        if not note.strip():raise ReviewError('请填写未通过原因。')
        c.execute("UPDATE publication_rewards SET status='rejected',reviewer=?,reviewed=?,note=? WHERE id=?",(owner,time.time(),note.strip(),ident))
    else:raise ReviewError('核验操作不正确。')
    return {'reward':public(c.execute('SELECT * FROM publication_rewards WHERE id=?',(ident,)).fetchone()),'deduplicated':False}
