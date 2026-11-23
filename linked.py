"""Author-controlled linked editing. Exact patches preserve independent prose."""
import copy
import difflib
import hashlib
import json
import re
import time
from feedback import ReviewError

PLATFORMS=('小红书','抖音图文')
FIELDS=('title','body','cover_headline','cover_subtitle','tags')

def normalize(data,kind):
    if kind=='adaptation':
        data.setdefault('facts',extract_facts(data['source']))
        for v in data['versions']:
            v.setdefault('cover_headline',v['title']);v.setdefault('cover_subtitle','')
            v.setdefault('image_order',[0] if data['source'].get('image') else [])
    else:
        for e in data['episodes']:
            e.setdefault('platforms',{})
            for p in PLATFORMS:
                e['platforms'].setdefault(p,{'status':e['status'],'problem':e['problem'],
                    'new_content':copy.deepcopy(e['new_content']),'missing_materials':copy.deepcopy(e['missing_materials']),
                    'outline':copy.deepcopy(e['outline']),'reason':e['reason'],**{k:v for k,v in data.get('platform_versions',{}).get(p,{}).items() if k in ('goal','audience','tone')}})
    data.setdefault('fact_history',[])
    return data


def extract_facts(source):
    value=source.get('title','')+'\n'+source.get('body','')
    specs=[('价格',r'\d+(?:\.\d+)?\s*元'),('时间',r'周[一二三四五六日天]|(?:\d{1,2}[:：]\d{2}|\d{1,2})\s*[–—~至-]\s*(?:\d{1,2}[:：]\d{2}|\d{1,2})\s*[点时]?'),
           ('名额',r'\d+\s*人'),('预约',r'提前预约')]
    facts=[]
    for label,pattern in specs:
        for m in re.finditer(pattern,value):
            if any(f['value']==m[0] for f in facts):continue
            facts.append({'id':hashlib.sha256((label+m[0]).encode()).hexdigest()[:12],
                          'label':label,'value':m[0],'source':value[max(0,m.start()-18):m.end()+18], 'basis':'当前素材 · 作者输入'})
    return facts[:20]


def platform_item(plan,episode,platform):
    if platform not in PLATFORMS:raise ReviewError('请选择小红书或抖音图文。')
    if plan['kind']=='adaptation':return next(v for v in plan['data']['versions'] if v['platform']==platform)
    if type(episode) is not int or episode not in (1,2,3):raise ReviewError('集数格式不正确。')
    return plan['data']['episodes'][episode-1]['platforms'][platform]


def current_version(plan,platform):
    v=platform_item(plan,None,platform);d=v.get('drafts',{}).get(platform)
    if not d:return {k:copy.deepcopy(v.get(k,[] if k=='tags' else '')) for k in FIELDS}
    s=d['state'];o=(s.get('result') or {}).get('options',[])
    if o:
        o=o[s.get('selected',0)];return {'title':o['title'],'body':o['body'],'tags':o['tags'],
            'cover_headline':o['cover']['headline'],'cover_subtitle':o['cover']['subtitle']}
    return {'title':d['title'],'body':d['body'],'tags':[],'cover_headline':d['title'],'cover_subtitle':''}


def set_version(v,values):
    v.update(copy.deepcopy(values));v['status']='drafting';v['edited_at']=time.time()
    # Keep existing editor settings, profile, filters and unrelated manual edits.
    for draft in v.get('drafts',{}).values():
        s=draft['state'];opts=(s.get('result') or {}).get('options',[])
        if opts:
            o=opts[s.get('selected',0)];o.update({k:values[k] for k in ('title','body','tags')});o['cover'].update(headline=values['cover_headline'],subtitle=values['cover_subtitle']);o['explanationStale']=True
        else:s['brief'].update(originalTitle=values['title'],originalBody=values['body'])
        draft.update(title=values['title'],body=values['body'],saved_at=time.time())
    v['explanation_stale']=True


def edit(plan,data):
    p=data.get('platform');v=platform_item(plan,None,p)
    if v['status']=='published':raise ReviewError('已发布平台版本已冻结。',409)
    values=data.get('values')
    if not isinstance(values,dict) or set(values)!=set(FIELDS):raise ReviewError('请提供完整的平台文案与封面。')
    for k,n in [('title',300),('body',12000),('cover_headline',300),('cover_subtitle',300)]:
        if not isinstance(values[k],str) or len(values[k])>n or (k in ('title','body') and not values[k].strip()):raise ReviewError('标题正文不能为空，且需符合长度限制。')
    if not isinstance(values['tags'],list) or len(values['tags'])>30 or any(not isinstance(t,str) or len(t)>100 for t in values['tags']):raise ReviewError('标签格式不正确。')
    config=data.get('config',{})
    if not isinstance(config,dict) or set(config)-{'goal','audience','tone','visual'} or any(not isinstance(x,str) or len(x)>1200 for x in config.values()):raise ReviewError('平台表达配置格式不正确。')
    order=data.get('image_order',v.get('image_order',[]));images=plan['data'].get('images') or ([plan['data']['source']['image']] if plan['data']['source'].get('image') else [])
    if not isinstance(order,list) or len(order)!=len(set(str(x) for x in order)) or any(type(x) is not int or x<0 or x>=len(images) for x in order):raise ReviewError('图片顺序无效。')
    set_version(v,values);v.update(config);v['image_order']=order


def fact_preview(plan,data):
    fact=next((f for f in plan['data']['facts'] if f['id']==data.get('fact')),None)
    new=data.get('value')
    if not fact or not isinstance(new,str) or not 1<=len(new.strip())<=200:raise ReviewError('请选择事实并填写 1–200 字的新值。')
    new=new.strip()
    if new==fact['value']:raise ReviewError('共同事实没有变化。')
    pattern=r'\s*'.join(re.escape(x) for x in fact['value'] if not x.isspace())
    if fact['value'][0].isdigit():pattern=r'(?<!\d)'+pattern
    changes=[];unmatched=[]
    for p in PLATFORMS:
        v=platform_item(plan,None,p)
        if v['status']=='published':unmatched.append({'platform':p,'reason':'已发布版本冻结，请在原平台另行核对，未自动修改。'});continue
        current=current_version(plan,p);found=False
        for field,value in current.items():
            parts=value if isinstance(value,list) else [value]
            for index,part in enumerate(parts):
                changed=re.sub(pattern,lambda _:new,part)
                if changed!=part:
                    found=True;changes.append({'platform':p,'field':field,'index':index if isinstance(value,list) else None,'before':part,'after':changed})
        if not found:unmatched.append({'platform':p,'reason':'未找到原事实的准确写法，可能已手动改写；请在该版人工核对，不覆盖。'})
    payload={'fact':fact['id'],'old':fact['value'],'value':new,'changes':changes,'unmatched':unmatched,'revision':plan['revision']}
    payload['token']=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    return payload


def confirm_fact(plan,data):
    preview=fact_preview(plan,data)
    if data.get('token')!=preview['token']:raise ReviewError('同步预览已变化，请重新预览确认。',409)
    selections=data.get('selections')
    if not isinstance(selections,list) or any(type(i) is not int or i<0 or i>=len(preview['changes']) for i in selections) or len(set(selections))!=len(selections):raise ReviewError('请选择有效的同步位置。')
    versions={p:current_version(plan,p) for p in PLATFORMS}
    for i in selections:
        change=preview['changes'][i];v=versions[change['platform']]
        if change['index'] is None:v[change['field']]=change['after']
        else:v[change['field']][change['index']]=change['after']
    for p in {preview['changes'][i]['platform'] for i in selections}:set_version(platform_item(plan,None,p),versions[p])
    f=next(f for f in plan['data']['facts'] if f['id']==preview['fact']);f.update(value=preview['value'],basis='作者确认修改',updated=time.time())
    plan['data']['fact_history'].append({**preview,'selections':selections,'at':time.time()})
    plan['data']['fact_history']=plan['data']['fact_history'][-30:]


def history_repetition(c,owner,plan):
    """Private persisted drafts only. Quotes link evidence, not platform limits."""
    sources=[]
    try:
        for r in c.execute('SELECT id,title,state FROM projects WHERE owner=? ORDER BY updated DESC LIMIT 100',(owner,)):
            s=json.loads(r['state']);
            if s.get('planLink',{}).get('id')==plan.get('id'):continue
            opts=(s.get('result') or {}).get('options',[])
            for i,o in enumerate(opts):sources.append((r['id'],r['title']+' · '+chr(65+i),o.get('body','')))
    except Exception as e:
        # Minimal in-memory legacy fixtures do not include full projects schema.
        if 'no such column' not in str(e):raise
    try:
        for r in c.execute('SELECT id,state FROM versions WHERE owner=? ORDER BY created DESC LIMIT 100',(owner,)):
            state=json.loads(r['state'])
            if state.get('planLink',{}).get('id')==plan.get('id'):continue
            for i,o in enumerate((state.get('result') or {}).get('options',[])):
                sources.append((r['id'],'历史版本 · '+o.get('title','')+' · '+chr(65+i),o.get('body','')))
    except Exception as e:
        if 'no such column' not in str(e):raise
    matches=[]
    targets=plan['data'].get('versions',[])
    for v in targets:
        body=current_version(plan,v['platform'])['body']
        for ident,title,prior in sources:
            block=difflib.SequenceMatcher(None,body[:4000],prior[:4000],autojunk=True).find_longest_match()
            if block.size>=20:
                matches.append({'platform':v['platform'],'project':ident,'title':title,'quote':body[block.a:block.a+min(block.size,160)],'characters':block.size})
    return {'matches':sorted(matches,key=lambda m:-m['characters'])[:12],
            'scope':'本人最近100个项目与100份历史版本的正文前4000字；连续相同文字至少20字。保留必要共同事实，不代表抄袭、全网查重或平台限流判断。'}


def fact_coverage(plan):
    out=[]
    if plan['kind']!='adaptation':return out
    for p in PLATFORMS:
        version=current_version(plan,p);value=re.sub(r'\s+','',version['title']+version['body']+' '.join(version['tags'])+version['cover_headline']+version['cover_subtitle'])
        for fact in plan['data']['facts']:
            if re.sub(r'\s+','',fact['value']) not in value:
                out.append({'platform':p,'fact':fact['label'],'value':fact['value'],'note':'准确写法未在该版标题、正文、封面或标签中找到，可能已改写或遗漏，请作者核对。'})
    return out
