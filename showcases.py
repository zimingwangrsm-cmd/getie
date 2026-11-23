"""Complete, editable examples; no provider calls, billing or publication records."""
import copy
import json
from pathlib import Path
import secrets
import time

import campaigns
import creative

ROOT = Path(__file__).resolve().parent
CREATION = {
    'portugal-r4': ('葡萄牙｜生活选择 × 日落氛围', '海外生活与迁居关注者', '自然真实，保留个人表达', {
        '小红书': '风景引入葡萄牙生活选择、移民与护照咨询讨论；标明商业示例，不编造身份、政策或办理经历。',
        '抖音图文': '面向旅行与品质生活人群，突出海景、日落、葡萄酒与高档餐厅感；未知餐厅与消费只作灵感。'}),
    'desk-r4': ('书桌｜清爽布局 × 桌面好物', '家居收纳与租房人群', '实用清晰，信息优先', {
        '小红书': '分享清爽空间的布局、三分区和收线方法，不以购买更多收纳盒为前提。',
        '抖音图文': '分享电脑、鼠标、笔记本支架等桌面好物的选购核对；没有品牌与实测资料，不编造使用体验。'}),
    'coffee': ('咖啡｜周末手冲课活动', '本地咖啡入门者', '实用清晰，信息优先', {
        '小红书': '围绕报名决策列明时间、费用、名额与预约，地点和取消规则需向主办方核实。',
        '抖音图文': '用轻松口语邀请新手提出水温、研磨与注水问题，活动事实与小红书保持一致。'})
}


def project(c, owner, scene):
    if not isinstance(scene, str) or scene not in CREATION:
        raise campaigns.ReviewError('请选择葡萄牙、书桌或咖啡示例。')
    for row in c.execute('SELECT id,state FROM projects WHERE owner=? AND archived=0 ORDER BY updated DESC', (owner,)):
        state = json.loads(row['state'])
        if state.get('demoProject') == scene:
            # Earlier saved examples held only the active platform in the editor.
            # Add absent platform copies while retaining every existing draft.
            if state.get('linkedPlanId'):
                plan = campaigns.detail(c, owner, state['linkedPlanId'])
                added = False
                for platform in campaigns.PLATFORMS:
                    if platform == state['brief']['platform'] or platform in state.get('platformDrafts', {}) or any(v['platform'] == platform and v['status'] == 'published' for v in plan['data']['versions']):
                        continue
                    other = campaigns.editor_state(plan, {'platform': platform})
                    if other.get('result'):
                        state.setdefault('platformDrafts', {})[platform] = {k: copy.deepcopy(other[k]) for k in ('brief', 'result', 'selected', 'sourceBrief')}
                        added = True
                if added:
                    payload = json.dumps(state, ensure_ascii=False)
                    c.execute('UPDATE projects SET state=? WHERE id=? AND owner=?', (payload, row['id'], owner))
                    c.execute('INSERT INTO versions VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), row['id'], owner, payload, time.time(), '补全示例平台草稿'))
            return {'id': row['id'], 'state': state, 'reused': True}
    import scenarios
    plan = scenarios.create(c, owner, scene)
    label, audience, tone, notes = CREATION[scene]
    changed = False
    if not any(plan['data'].get('platform_notes', {}).values()):
        plan['data']['platform_notes'] = notes
        changed = True
    for version in plan['data']['versions']:
        if not version.get('cover_subtitle') and not version.get('drafts') and not version.get('explanation_stale'):
            version['cover_subtitle'] = {'portugal-r4': '同一片日落，不同生活想象', 'desk-r4': '先好用，再好看', 'coffee': '周六 14–16点 · 提前预约'}[scene]
            changed = True
    if not plan['data']['facts'] and not plan['data'].get('fact_history'):
        value = '葡萄牙' if scene == 'portugal-r4' else '电脑' if scene == 'desk-r4' else ''
        if value:
            plan['data']['facts'].append({'id': secrets.token_hex(6), 'label': '地点' if scene == 'portugal-r4' else '设备',
                                         'value': value, 'source': plan['data']['source'].get('constraints') or plan['data']['source']['body'], 'basis': '作者输入'})
            changed = True
    if changed:
        plan = campaigns.persist(c, owner, plan)
    source = plan['data']['source']
    states = {}
    for platform in campaigns.PLATFORMS:
        state = campaigns.editor_state(plan, {'platform': platform})
        state.pop('planLink', None)
        state['brief'].update(mode='optimize', originalTitle=source['title'], originalBody=source['body'],
                              creativeTheme=label, creationPlatforms=list(campaigns.PLATFORMS),
                              audience=audience if platform == '小红书' else state['brief']['audience'],
                              tone=tone if platform == '小红书' else state['brief']['tone'], count=1,
                              model='gpt-6-luna', additionalPrompt=source.get('constraints') or '保留已提供的事实，分别设计两平台的表达。',
                              platformNotes=copy.deepcopy(plan['data']['platform_notes']))
        state['brief']['variants'] = [{
            'theme': label, 'audience': state['brief']['audience'], 'goal': '流行度', 'tone': state['brief']['tone']}]
        if state.get('result'):
            state['result']['input_fingerprint'] = creative.input_fingerprint(state['brief'])
        state['sourceBrief'] = {k: copy.deepcopy(v) for k, v in state['brief'].items() if k != 'image'}
        states[platform] = state
    state = states['小红书']
    state.update(linkedPlanId=plan['id'], demoProject=scene)
    state['platformDrafts'] = {'抖音图文': {k: copy.deepcopy(states['抖音图文'][k]) for k in ('brief', 'result', 'selected', 'sourceBrief')}}
    ident = secrets.token_hex(16)
    payload = json.dumps(state, ensure_ascii=False)
    c.execute('INSERT INTO projects(id,owner,title,state,updated,archived) VALUES(?,?,?,?,?,0)', (ident, owner, label, payload, time.time()))
    c.execute('INSERT INTO versions VALUES(?,?,?,?,?,?)', (secrets.token_hex(16), ident, owner, payload, time.time(), '完整展示示例'))
    return {'id': ident, 'state': state, 'reused': False}


def complete_series(c, owner, plan):
    """Fill only absent, untouched demo drafts; author edits and updates win."""
    if plan['data'].get('demo') != 'desk-series-r4':
        return plan
    copies = json.loads((ROOT / 'model_artifacts/showcase-series.json').read_text())
    changed = False
    for episode, versions in zip(plan['data']['episodes'], copies):
        for platform, option in versions.items():
            version = episode['platforms'][platform]
            if platform in episode['drafts'] or version['status'] == 'published' or version.get('feedback_reason') or version.get('needs_refresh'):
                continue
            state = campaigns.editor_state(plan, {'episode': episode['number'], 'platform': platform})
            draft = copy.deepcopy(option)
            draft.update(angle=episode['problem'], audience='家居收纳与租房人群' if episode['number'] < 3 else '旅行与收纳爱好者',
                         style='实用清晰，信息优先' if platform == '小红书' else '自然真实，保留个人表达',
                         cover={'headline': option['title'], 'subtitle': '清爽书桌之后 · 第%s集' % episode['number'], 'points': []},
                         reasons=[{'observation': episode['problem'], 'action': '给出可执行的顺序与核对项',
                                   'reason': '承接原帖并增加新信息，不虚构实测尺寸或使用经历。', 'evidence': '模型推测'}],
                         assessment={'strength': '正文、标签和封面已填完整，可直接继续编辑。', 'limitation': '预设示例未实际发布；新增机位与实测素材仍需作者补充。',
                                     'next_step': '按自己的真实空间核对内容，再补拍对应图片。'},
                         design={'theme': episode['title'], 'goal': '流行度', 'composition': '沿用原帖参考图；新机位与前后对照仍需补拍。', 'template': 'editorial', 'palette': 'blue'})
            state['brief'].update(mode='topic', topic=episode['problem'], originalTitle='', originalBody='', creationPlatforms=[platform], audience=draft['audience'], tone=draft['style'], count=1, goal='流行度')
            state['brief']['variants'] = [{'theme': state['brief']['creativeTheme'], 'audience': draft['audience'], 'goal': '流行度', 'tone': draft['style']}]
            state['result'] = {'platform': platform, 'model': '预设示例', 'summary': episode['reason'], 'options': [draft],
                               'themes': [], 'audiences': [], 'diagnostics': [], 'image_observation': '',
                               'input_fingerprint': creative.input_fingerprint(state['brief'])}
            state['sourceBrief'] = {k: copy.deepcopy(v) for k, v in state['brief'].items() if k != 'image'}
            episode['drafts'][platform] = {'state': state, 'title': draft['title'], 'body': draft['body'], 'saved_at': time.time()}
            version['status'] = episode['status'] = 'drafting'
            changed = True
    if changed:
        plan['data']['demo_content_version'] = 2
        return campaigns.persist(c, owner, plan)
    return plan
