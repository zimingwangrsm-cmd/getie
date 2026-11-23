"""Private expression profiles and reproducible design-decision evidence."""
import hashlib
import json
import time
from feedback import ReviewError

PROFILE_LIMITS={'name':80,'voice':1200,'audience':500,'facts':2400,'avoid':1200}
AXES={'theme':'主题','audience':'目标人群','goal':'内容目标','tone':'表达风格'}
INPUT_FIELDS=('mode','topic','creativeTheme','originalTitle','originalBody','platform','audience','goal','tone','additionalPrompt','model','count','variants','creatorProfile','image')

def initialize(c):
    c.execute('CREATE TABLE IF NOT EXISTS creator_profiles(owner TEXT PRIMARY KEY, profile TEXT NOT NULL, revision INTEGER NOT NULL, updated REAL NOT NULL)')

def validate_profile(value):
    if not isinstance(value,dict) or set(value)-set(PROFILE_LIMITS):raise ReviewError('表达档案格式不正确。')
    out={}
    for key,limit in PROFILE_LIMITS.items():
        text=value.get(key,'')
        if not isinstance(text,str) or len(text)>limit:raise ReviewError('表达档案内容过长或格式不正确。')
        out[key]=text.strip()
    return out

def get_profile(c,owner):
    row=c.execute('SELECT * FROM creator_profiles WHERE owner=?',(owner,)).fetchone()
    return {'profile':json.loads(row['profile']),'revision':row['revision'],'updated':row['updated']} if row else {'profile':{k:'' for k in PROFILE_LIMITS},'revision':0,'updated':None}

def put_profile(c,owner,data):
    profile=validate_profile(data.get('profile'));revision=data.get('revision')
    if type(revision) is not int or revision<0:raise ReviewError('请重新打开表达档案后保存。')
    current=get_profile(c,owner)
    if current['revision']!=revision:raise ReviewError('表达档案已在其他页面更新，请重新读取，避免覆盖。',409)
    c.execute('INSERT INTO creator_profiles VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET profile=excluded.profile,revision=excluded.revision,updated=excluded.updated',(owner,json.dumps(profile,ensure_ascii=False),revision+1,time.time()))
    return get_profile(c,owner)

def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def input_fingerprint(brief):
    # Normalize defaults so old/additional unselected UI labels cannot affect identity.
    defaults={'count':2,'variants':[],'creatorProfile':{}}
    data={k:brief.get(k,defaults.get(k,'')) for k in INPUT_FIELDS}
    if data['image']:data['image']=hashlib.sha256(data['image'].encode()).hexdigest()
    return digest(data)

def validate_decision(value):
    if not isinstance(value,dict) or set(value)-{'selected','reason','hypothesis','metric','window','signature','saved_at'}:raise ReviewError('选稿记录格式不正确。')
    if value.get('selected') not in ['A','B','undecided']:raise ReviewError('请选择 A、B 或暂不决定。')
    for key,limit in [('reason',1500),('hypothesis',1500),('signature',64)]:
        if not isinstance(value.get(key,''),str) or len(value.get(key,''))>limit:raise ReviewError('选稿记录文字过长或格式不正确。')
    if value.get('metric') not in ['collects','comments','likes','shares','clicks'] or type(value.get('window')) is not int or value['window'] not in [24,72]:raise ReviewError('请选择有效的验证指标与窗口。')
    if not isinstance(value.get('saved_at',''),str) or len(value.get('saved_at',''))>80:raise ReviewError('选稿记录时间格式不正确。')

def audit(state):
    if not isinstance(state,dict) or not isinstance(state.get('brief',{}),dict) or not isinstance(state.get('result'),dict):raise ReviewError('请先生成一套或两套完整方案。')
    brief=state.get('brief',{});result=state['result'];options=result.get('options',[])
    if not isinstance(options,list) or not 1<=len(options)<=2 or any(not isinstance(o,dict) for o in options):raise ReviewError('请先生成一套或两套完整方案。')
    for option in options:
        if any(not isinstance(option.get(k,''),str) for k in ['title','body','audience']) or not isinstance(option.get('tags',[]),list) or any(not isinstance(t,str) for t in option.get('tags',[])) or not isinstance(option.get('cover',{}),dict) or not isinstance(option.get('design',{}),dict):raise ReviewError('方案格式不完整。')
    source=state.get('sourceBrief') or brief
    if not isinstance(source,dict):raise ReviewError('生成配置不完整。')
    variants=source.get('variants') or []
    if not variants:variants=[{'theme':source.get('creativeTheme') or source.get('topic',''),'audience':source.get('audience',''),'goal':source.get('goal',''),'tone':source.get('tone','')} for _ in options]
    if not isinstance(variants,list) or len(variants)!=len(options) or any(not isinstance(v,dict) or any(not isinstance(v.get(k,''),str) for k in AXES) for v in variants):raise ReviewError('方案与生成方向不匹配，请重新生成。')
    differences=[{'axis':k,'label':label,'a':variants[0].get(k,'') or 'AI 推荐','b':variants[1].get(k,'') or 'AI 推荐'} for k,label in AXES.items() if len(variants)==2 and variants[0].get(k,'')!=variants[1].get(k,'')]
    fingerprint=result.get('input_fingerprint');fresh=fingerprint==input_fingerprint(brief) if fingerprint else None
    signature=digest({'input':input_fingerprint(brief),'options':options,'adjust':state.get('adjust',{}),'template':state.get('template','auto'),'palette':state.get('palette','auto')})
    checks=[{'label':'输入与生成时一致','status':'pass' if fresh else 'fail' if fresh is False else 'unknown','detail':'输入、图片和表达档案指纹一致。' if fresh else '输入已改动，建议重新生成后再选稿。' if fresh is False else '旧版本未留存生成指纹，无法核对原始输入。'},
            {'label':'单一维度对照','status':'pass' if len(differences)==1 else 'unknown','detail':('仅改变'+differences[0]['label']+'，其余方向配置保持一致。') if len(differences)==1 else '当前为单方案。' if len(options)==1 else '方向配置有多项差异或未显式指定差异，请结合下方记录判断。'},
            {'label':'平台与素材处理','status':'pass' if (result.get('platform') or source.get('platform'))==brief.get('platform') else 'fail','detail':'同次生成共享原始素材与平台排版；滤镜、裁切和封面文字仍可能不同。'},
            {'label':'流量效果验证','status':'unknown','detail':'设计对照尚未发布验证；RedNoob仅评估文字，不读取图片像素，也不控制账号粉丝。'}]
    features=[]
    for i,option in enumerate(options):
        features.append({'label':chr(65+i),'title':option.get('title',''),'title_chars':len(option.get('title','')),'body_chars':len(option.get('body','')),'tags':option.get('tags',[]),'audience':option.get('audience',''),'goal':option.get('design',{}).get('goal',''),'filter':option.get('imageFilter') or '跟随风格建议'})
    decision=state.get('decision')
    if decision:
        validate_decision(decision)
    current=bool(decision and decision.get('signature')==signature and (decision['selected']!='B' or len(options)==2))
    return {'signature':signature,'fresh':fresh,'differences':differences,'checks':checks,'features':features,'decision_current':current,'scope':'配置和作品结构检查，不是图像质量评估、随机实验或因果推断。'}

def report(state):
    evidence=audit(state);decision=state.get('decision') or {};brief=state.get('brief',{})
    def safe(value):return str(value).replace('\r','').replace('\n','\n> ')
    lines=['# 创作对照与选稿记录','',f'平台：{brief.get("platform","")}','', '## 对照检查']
    for check in evidence['checks']:lines.extend([f'- {check["label"]}：{check["detail"]}'])
    lines+=['','## 方向差异']
    for diff in evidence['differences']:lines.extend([f'- {diff["label"]}',f'  - A：{safe(diff["a"])}',f'  - B：{safe(diff["b"])}'])
    for i,option in enumerate(state['result']['options']):
        lines+=['',f'## 方案 {chr(65+i)}','',f'> {safe(option.get("title",""))}','',f'> {safe(option.get("body",""))}','', ' '.join('#'+t.lstrip('#') for t in option.get('tags',[]))]
    lines+=['','## 我的选择',f'选择：{decision.get("selected","未记录")}',f'记录与当前作品一致：{"是" if evidence["decision_current"] else "否 / 尚未记录"}',f'> 理由：{safe(decision.get("reason",""))}',f'> 待验证假设：{safe(decision.get("hypothesis",""))}',f'验证窗口：{decision.get("window",24)} 小时；指标：{decision.get("metric","collects")}','','仅导出当前项目内容与选稿记录，不包含完整表达档案。','手动发布后在发布复盘回填曝光、粉丝、投流与观测时间。模型评分不等于实际互动提升。']
    return {'markdown':'\n'.join(lines)+'\n','filename':'content-design-decision.md','evidence':evidence}
