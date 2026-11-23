"""Publication snapshots and observational comparisons, scoped to a browser session."""
import csv
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import re
import secrets
import time
from urllib.parse import urlparse

PLATFORMS = {'小红书', 'Instagram', '抖音图文', '微信公众号'}
METRICS = ('impressions', 'clicks', 'likes', 'collects', 'comments', 'shares')
COLUMNS = ('publication_id', 'observed_at', *METRICS)


class ReviewError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS publications(
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, project TEXT NOT NULL,
        platform TEXT NOT NULL, account TEXT NOT NULL, theme TEXT NOT NULL,
        audience TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL,
        post_url TEXT NOT NULL, published_at REAL, followers INTEGER,
        promoted TEXT NOT NULL, media_hash TEXT NOT NULL, snapshot TEXT NOT NULL,
        nonce TEXT NOT NULL, created REAL NOT NULL, UNIQUE(owner, nonce));
    CREATE INDEX IF NOT EXISTS publication_owner ON publications(owner,created);
    CREATE TABLE IF NOT EXISTS metric_snapshots(
        id TEXT PRIMARY KEY, publication TEXT NOT NULL, owner TEXT NOT NULL,
        observed_at REAL NOT NULL, impressions INTEGER, clicks INTEGER,
        likes INTEGER, collects INTEGER, comments INTEGER, shares INTEGER,
        source TEXT NOT NULL, created REAL NOT NULL, UNIQUE(publication, observed_at));
    CREATE INDEX IF NOT EXISTS metric_owner ON metric_snapshots(owner,publication,observed_at);
    CREATE TABLE IF NOT EXISTS publication_assets(hash TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL);
    """)


def text(value, label, limit=200, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ReviewError(f'{label}格式不正确，请检查后重试。')
    return value.strip()


def stamp(value, label, required=True):
    if value in (None, '') and not required:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            raise ValueError()
        result = dt.timestamp()
        if not math.isfinite(result) or result < 0 or result > time.time() + 300:
            raise ValueError()
        return result
    except (TypeError, AttributeError, ValueError, OverflowError):
        raise ReviewError(f'{label}需为有效时间，不能晚于当前时间。') from None


def integer(value, label):
    if value is None or value == '':
        return None
    if type(value) is not int or not 0 <= value <= 1_000_000_000_000:
        raise ReviewError(f'{label}需为非负整数，未知请留空。')
    return value


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None


def save_image(c,value):
    if not value:return ''
    if not isinstance(value,str) or len(value)>3_500_000:raise ReviewError('记录封面过大，请降低图片尺寸后重试。')
    match=re.fullmatch(r'data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)',value)
    if not match:raise ReviewError('图片格式不正确。')
    try:raw=base64.b64decode(match[2],validate=True)
    except ValueError:raise ReviewError('图片内容不正确。') from None
    signatures={'image/png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'image/jpeg':raw.startswith(b'\xff\xd8\xff'),'image/webp':raw.startswith(b'RIFF') and raw[8:12]==b'WEBP'}
    if not signatures[match[1]]:raise ReviewError('图片内容与格式不一致。')
    digest=hashlib.sha256(raw).hexdigest()
    c.execute('INSERT OR IGNORE INTO publication_assets VALUES(?,?,?)',(digest,match[1],raw))
    return digest


def publication(c, owner, ident):
    if not isinstance(ident,str) or not re.fullmatch(r'[a-f0-9]{32}',ident):
        raise ReviewError('作品记录编号无效。')
    row = c.execute('SELECT * FROM publications WHERE id=? AND owner=?', (ident, owner)).fetchone()
    if row is None:
        raise ReviewError('没有找到此发布记录。', 404)
    return dict(row)


def create(c, owner, data):
    if not isinstance(data, dict):
        raise ReviewError('作品记录格式不正确。')
    nonce = data.get('nonce', '')
    if not isinstance(nonce, str) or not re.fullmatch(r'[a-f0-9]{32}', nonce):
        raise ReviewError('保存标识无效，请刷新后重试。')
    existing = c.execute('SELECT id FROM publications WHERE owner=? AND nonce=?', (owner, nonce)).fetchone()
    if existing:
        return {'id': existing['id'], 'deduplicated': True}
    project = text(data.get('project'), '项目编号', 32, True)
    row = c.execute('SELECT state FROM projects WHERE id=? AND owner=?', (project, owner)).fetchone()
    if row is None:
        raise ReviewError('请先打开并保存一个自己的创作项目。', 404)
    version_id=text(data.get('version_id'),'作品版本编号',32,True)
    version=c.execute('SELECT state FROM versions WHERE id=? AND project=? AND owner=?',(version_id,project,owner)).fetchone()
    if version is None:raise ReviewError('最终版本不存在，请重新点击“记录当前方案”。',404)
    state = json.loads(version['state'])
    result=state.get('result')
    if not isinstance(result,dict) or not isinstance(result.get('options'),list):raise ReviewError('请先生成完整方案。')
    options = result['options']
    index = data.get('option_index', 0)
    if type(index) is not int or not 0 <= index < len(options):
        raise ReviewError('请先生成并选择一个方案。')
    brief = state.get('brief', {})
    source_brief = state.get('sourceBrief') or {}
    if not isinstance(brief, dict) or not isinstance(source_brief, dict):
        raise ReviewError('此版本的创作配置不完整，请重新生成后记录。')
    platform = brief.get('platform')
    result_platform = result.get('platform') or source_brief.get('platform') or platform
    if platform not in PLATFORMS or platform != result_platform:
        raise ReviewError('请先为当前平台重新生成方案。')
    account = text(data.get('account', ''), '账号代称', 80, True)
    option = options[index]
    if not isinstance(option,dict) or any(not isinstance(option.get(k),str) for k in ['title','body','audience']) or not isinstance(option.get('design',{}),dict):raise ReviewError('此方案内容不完整，请重新生成后记录。')
    if not isinstance(option.get('tags', []), list) or any(not isinstance(tag, str) for tag in option.get('tags', [])):
        raise ReviewError('此方案标签格式不完整，请重新生成后记录。')
    goal = option.get('design', {}).get('goal') or brief.get('goal', '')
    goal = text(goal, '创作目标', 12000)
    theme = text(data.get('theme', ''), '对照主题', 200, True)
    status = data.get('status', 'draft')
    if status not in ('draft', 'published'):
        raise ReviewError('请选择待发布或已发布。')
    published = stamp(data.get('published_at'), '发布时间', status == 'published')
    if status == 'draft':
        published = None
    followers = integer(data.get('followers'), '发布时粉丝数')
    promoted = data.get('promoted', 'unknown')
    if promoted not in ('no', 'yes', 'unknown'):
        raise ReviewError('请选择投流情况。')
    post_url = text(data.get('post_url', ''), '帖子链接', 2000)
    if post_url:
        parsed = urlparse(post_url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ReviewError('帖子链接需为不含账号凭据的 HTTPS 链接。')
    snapshot = {'option': option, 'option_index': index,'version_id':version_id,
                'brief': {k: v for k, v in brief.items() if k != 'image'},
                'adjust': state.get('adjust', {}), 'model': (state.get('result') or {}).get('model'),
                'legacy_template': state.get('template'), 'legacy_palette': state.get('palette')}
    if isinstance(state.get('planLink'),dict):snapshot['planLink']=state['planLink']
    media_hash=save_image(c,brief.get('image',''))
    if state.get('decision'):
        from creative import audit
        evidence=audit(state)
        selected_matches=state['decision'].get('selected') in ['undecided',chr(65+index)]
        snapshot['decision']={**state['decision'],'current_at_capture':evidence['decision_current'],'selected_matches_capture':selected_matches}
    snapshot['original_hash']=media_hash
    snapshot['cover_hash']=save_image(c,data.get('cover_image',''))
    ident = secrets.token_hex(16)
    inserted=c.execute('INSERT OR IGNORE INTO publications VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (ident, owner, project, platform, account, theme,
               option.get('audience', ''), goal,
               status, post_url, published, followers, promoted, media_hash,
               json.dumps(snapshot, ensure_ascii=False), nonce, time.time()))
    if inserted.rowcount==0:
        ident=c.execute('SELECT id FROM publications WHERE owner=? AND nonce=?',(owner,nonce)).fetchone()['id']
        return {'id':ident,'deduplicated':True}
    return {'id': ident, 'deduplicated': False}


def decorate(record):
    result = {k: v for k, v in record.items() if k not in ('owner', 'nonce')}
    if isinstance(result.get('snapshot'), str):
        result['snapshot'] = json.loads(result['snapshot'])
    result['published_at'] = iso(result['published_at'])
    result['created'] = iso(result['created'])
    return result


def listing(c, owner):
    rows = c.execute('SELECT * FROM publications WHERE owner=? ORDER BY created DESC LIMIT 500', (owner,)).fetchall()
    result = []
    for row in rows:
        item = decorate(dict(row))
        latest = c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND owner=? ORDER BY observed_at DESC LIMIT 1',
                           (row['id'], owner)).fetchone()
        item['latest'] = decorate_metric(dict(latest), row['published_at']) if latest else None
        result.append(item)
    return {'publications': result}


def decorate_metric(row, published):
    result = {k: v for k, v in row.items() if k not in ('owner',)}
    result['window_hours'] = round((row['observed_at'] - published) / 3600, 3) if published is not None else None
    result['observed_at'] = iso(row['observed_at'])
    result['created'] = iso(row['created'])
    return result


def detail(c, owner, ident):
    record = publication(c, owner, ident)
    rows = c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND owner=? ORDER BY observed_at',
                     (ident, owner)).fetchall()
    return {'publication': decorate(record), 'snapshots': [decorate_metric(dict(r), record['published_at']) for r in rows]}


def mark_published(c, owner, data):
    allowed={'publication_id','published_at','post_url','followers','promoted','confirmed'}
    if not isinstance(data,dict) or set(data)-allowed:raise ReviewError('只可补记发布信息，最终图文和选稿记录保持冻结。')
    record=publication(c,owner,data.get('publication_id'))
    if data.get('confirmed') is not True:raise ReviewError('请确认这份最终作品已经由你本人发布。')
    published=stamp(data.get('published_at'),'实际发布时间')
    followers=integer(data.get('followers'),'发布时粉丝数')
    promoted=data.get('promoted','unknown')
    if promoted not in ('yes','no','unknown'):raise ReviewError('请选择投流情况。')
    url=text(data.get('post_url',''),'帖子链接',2000)
    if url:
        parsed=urlparse(url)
        if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:raise ReviewError('帖子链接需为不含账号凭据的 HTTPS 链接。')
    if record['status']=='published':
        if all(record[k]==v for k,v in [('published_at',published),('followers',followers),('promoted',promoted),('post_url',url)]):return {'id':record['id'],'deduplicated':True}
        raise ReviewError('这份作品已记录发布时间，不能覆盖已有发布信息。',409)
    c.execute("UPDATE publications SET status='published',published_at=?,followers=?,promoted=?,post_url=? WHERE id=? AND owner=? AND status='draft'",(published,followers,promoted,url,record['id'],owner))
    return {'id':record['id'],'deduplicated':False}


def asset(c,owner,ident,kind):
    record=publication(c,owner,ident)
    snapshot=json.loads(record['snapshot'])
    digest=snapshot.get('cover_hash' if kind=='cover' else 'original_hash')
    row=c.execute('SELECT mime,data FROM publication_assets WHERE hash=?',(digest,)).fetchone() if digest else None
    if row is None:raise ReviewError('此作品没有已保存的对应图片。',404)
    return row['data'],row['mime']


def metric_input(c, owner, data):
    if not isinstance(data, dict):
        raise ReviewError('指标记录格式不正确。')
    record = publication(c, owner, data.get('publication_id'))
    if record['status'] != 'published':
        raise ReviewError('请先在这份待发布记录中补记实际发布时间，再回填指标。')
    observed = stamp(data.get('observed_at'), '采集时间')
    if observed < record['published_at']:
        raise ReviewError('采集时间不能早于发布时间。')
    values = {k: integer(data.get(k), k) for k in METRICS}
    if all(v is None for v in values.values()):
        raise ReviewError('请至少填写一个已知指标；未知值留空，不按零处理。')
    return record['id'], observed, values


def add_metric(c, owner, data, source='manual'):
    ident, observed, values = metric_input(c, owner, data)
    existing = c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND observed_at=? AND owner=?',
                         (ident, observed, owner)).fetchone()
    if existing:
        if all(existing[k] == values[k] for k in METRICS):
            return {'id': existing['id'], 'deduplicated': True}
        raise ReviewError('该作品在同一采集时间已有不同指标；请核对时间，原记录未被覆盖。', 409)
    key = secrets.token_hex(16)
    inserted=c.execute('INSERT OR IGNORE INTO metric_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
              (key, ident, owner, observed, *(values[k] for k in METRICS), source, time.time()))
    if inserted.rowcount==0:
        existing=c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND observed_at=? AND owner=?',(ident,observed,owner)).fetchone()
        if all(existing[k]==values[k] for k in METRICS):return {'id':existing['id'],'deduplicated':True}
        raise ReviewError('同一采集时间已有不同指标，原记录未被覆盖。',409)
    return {'id': key, 'deduplicated': False}


def import_csv(c, owner, content):
    if not isinstance(content, str) or len(content) > 500_000:
        raise ReviewError('CSV 需为 500 KB 以内的文本。')
    reader = csv.DictReader(io.StringIO(content.lstrip('\ufeff')))
    if reader.fieldnames is None or len(set(reader.fieldnames)) != len(reader.fieldnames) or set(reader.fieldnames) != set(COLUMNS):
        raise ReviewError('CSV 列名不正确，请下载模板，保留全部表头。')
    rows = list(reader)
    if not 1 <= len(rows) <= 1000:
        raise ReviewError('每次请导入 1 至 1000 行指标。')
    created = skipped = 0
    for line, row in enumerate(rows, 2):
        try:
            if None in row or any(v is None for v in row.values()):
                raise ReviewError('列数与表头不一致。')
            row = {k: v.strip() for k, v in row.items()}
            for key in METRICS:
                if row[key] == '':
                    row[key] = None
                elif re.fullmatch(r'\d{1,13}', row[key]):
                    row[key] = int(row[key])
                else:
                    raise ReviewError(f'{key}需为非负整数。')
            result = add_metric(c, owner, row, 'csv')
            if result['deduplicated']:
                skipped += 1
            else:
                created += 1
        except ReviewError as exc:
            raise ReviewError(f'第 {line} 行：{exc}；整批未导入。', exc.status) from None
    return {'created': created, 'skipped': skipped}


def compare(c, owner, data):
    if not isinstance(data, dict):
        raise ReviewError('对照条件格式不正确。')
    a = publication(c, owner, data.get('a'))
    b = publication(c, owner, data.get('b'))
    if a['id'] == b['id']:
        raise ReviewError('请选择两篇不同作品。')
    window = data.get('window', 24)
    metric = data.get('metric', 'collects')
    if type(window) is not int or window not in (24, 72) or metric not in METRICS[1:]:
        raise ReviewError('请选择 24/72 小时窗口和有效互动指标。')
    checks = []
    def check(label, ok, detail_text):
        checks.append({'label': label, 'passed': bool(ok), 'detail': detail_text})
    check('相同平台', a['platform'] == b['platform'], a['platform'] + ' / ' + b['platform'])
    check('相同账号', a['account'] == b['account'], '依据本人填写的账号代称；未向平台核验。')
    check('相同主题', a['theme'].casefold() == b['theme'].casefold(), a['theme'] + ' / ' + b['theme'])
    check('相同目标', a['goal'] == b['goal'], a['goal'] + ' / ' + b['goal'])
    check('原始素材可核对', bool(a['media_hash']) and a['media_hash'] == b['media_hash'], '比较导入原始素材的指纹，不代表成图完全一致。')
    check('粉丝快照接近', a['followers'] is not None and b['followers'] is not None and
          abs(a['followers'] - b['followers']) <= .05 * max(1, a['followers'], b['followers']),
          '发布时粉丝均已填写，差异不超过较大值的 5%；这不是因果控制。')
    check('均未投流', a['promoted'] == b['promoted'] == 'no', '未知或投流记录不进入条件齐备对照。')
    selected = []
    for label, record in [('A', a), ('B', b)]:
        rows = c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND owner=?', (record['id'], owner)).fetchall()
        picked = min(rows, key=lambda r: abs((r['observed_at'] - record['published_at']) / 3600 - window)) if rows else None
        hours = (picked['observed_at'] - record['published_at']) / 3600 if picked else None
        in_window = hours is not None and abs(hours - window) <= max(1, window * .1)
        check(label + '观测窗口', in_window, f'{hours:.2f} 小时 / 目标 {window} 小时，容差 10%' if hours is not None else '暂无指标快照。')
        known = picked is not None and picked['impressions'] is not None and picked['impressions'] > 0 and picked[metric] is not None
        check(label + '曝光分母与目标指标', known, '缺少或为零的曝光不计算参与率；未知值不视作零。')
        rate = picked[metric] / picked['impressions'] if known else None
        selected.append({'id': record['id'], 'title': json.loads(record['snapshot'])['option']['title'],
                         'metric': picked[metric] if picked else None,
                         'impressions': picked['impressions'] if picked else None,
                         'window_hours': round(hours, 3) if hours is not None else None,
                         'rate': rate, 'observed_at': iso(picked['observed_at']) if picked else None})
    eligible = all(x['passed'] for x in checks)
    return {'eligible': eligible, 'checks': checks, 'records': selected, 'metric': metric, 'window': window,
            'delta_percentage_points': round((selected[1]['rate'] - selected[0]['rate']) * 100, 6) if eligible else None,
            'scope': '手工回填的观察性对照；即使条件齐备，发布时间、流量来源、推荐位置与受众构成仍可能不同，不能认定设计造成参与变化。'}


def export_csv(c, owner):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['publication_id', 'platform', 'account', 'theme', 'goal', 'title', 'published_at',
                     'followers', 'promoted', 'observed_at', *METRICS, 'source'])
    def cell(value):
        value = '' if value is None else str(value)
        return "'" + value if value.startswith(('=', '+', '-', '@', '\t', '\r')) else value
    for record in c.execute('SELECT * FROM publications WHERE owner=? ORDER BY created', (owner,)).fetchall():
        rows = c.execute('SELECT * FROM metric_snapshots WHERE publication=? AND owner=? ORDER BY observed_at',
                         (record['id'], owner)).fetchall()
        for metric in rows or [None]:
            values = [record['id'], record['platform'], record['account'], record['theme'], record['goal'],
                      json.loads(record['snapshot'])['option']['title'], iso(record['published_at']),
                      record['followers'], record['promoted'], iso(metric['observed_at']) if metric else None,
                      *(metric[k] if metric else None for k in METRICS), metric['source'] if metric else '']
            writer.writerow([cell(v) for v in values])
    return {'csv': output.getvalue(), 'filename': 'resonance-publications.csv'}
