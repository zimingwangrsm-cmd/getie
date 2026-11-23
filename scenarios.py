"""Explicitly fictional/editable walkthroughs, never fabricated growth results."""
import base64
from pathlib import Path
import campaigns

SCENES={
 'coffee':{'title':'周六手冲咖啡课','body':'周六下午14–16点举办手冲咖啡课，39元/位，限8人，须提前预约。','image':'demo-coffee.webp',
 'versions':[
 ('周六手冲课｜39元，先确认这份信息','想参加周六的手冲咖啡课？先把安排看清楚。\n\n时间：周六14–16点\n费用：39元/位\n名额：8人，须提前预约。\n\n报名之前，先问清活动地点、是否需要自带器材以及取消规则。\n\n你报名之前最想确认什么？','报名决策者','收藏','信息清晰','按时间、费用与预约分项整理'),
 ('周六两小时，想一起学手冲吗？','这个周六，14–16点，一起参加手冲咖啡课。\n39元/位，限8人，须提前预约。\n\n如果你刚开始接触手冲，最想先解决哪一个问题：水温、研磨，还是注水？\n\n活动地点、具体课程内容与器材安排，请提前向主办方确认；把自己遇到的问题先记下来，别急着买新装备。','咖啡入门者','评论','自然口语','先交代场景，再邀请具体提问')]},
 'portugal':{'title':'葡萄牙小镇的一张旅行照片','body':'这是我在葡萄牙小镇拍摄的旅行照片。想围绕旅行观察与照片记录分享，不提供未核实的路线、价格或拍摄地点。','image':'portugal-town.webp',
 'versions':[
 ('旅行照片不只打卡：留下一段自己的观察','这张照片来自葡萄牙小镇。\n\n写旅行记录时，可以从自己实际看到的细节开始：画面里最先吸引你的是什么？为什么想留下这一刻？\n\n旅行记录也可以从一张照片、一段观察开始，不必急着把每一刻都写满。你更喜欢记录画面，还是记录当时的感受？','旅行记录爱好者','收藏','克制清晰','把照片与真实观察分开记录'),
 ('一张小镇照片，你会怎么记住旅途？','在葡萄牙小镇留下了一张照片。\n\n比起把行程写满，我更想把这张照片当成下一次整理旅行记忆的起点。\n\n如果只选一个细节，你最想在旅行记录中留下什么？','摄影与旅行同好','评论','自然口语','以一个具体问题引出个人记忆')]},
 'desk':{'title':'同一张书桌，分享整理与桌搭','body':'同一张书桌照片，准备分享桌面整理方法与布置思路。没有提供物件品牌、价格或长期使用体验。','image':'demo-desk.webp',
 'versions':[
 ('书桌整理：从常用物件开始','整理书桌时，先列出每天真正要用的物件。\n\n① 区分常用与偶尔用到的东西。\n② 为常用物件确定顺手的位置。\n③ 留出操作空间，再决定是否添加收纳。\n\n你最想先整理书桌的哪一处？','整理新手','收藏','实用清晰','给出可执行的整理问题'),
 ('同一张书桌，你会先移动哪件东西？','想重新整理书桌，但先不急着买新物件。\n\n看看现有空间，挑一件最影响顺手程度的东西，从它开始调整。\n\n你整理桌面时，最常反复挪动哪件物品？','桌搭兴趣同好','评论','自然口语','围绕现有物件提出小幅调整')]}}


import json
for _key,_sample in zip(('portugal-r4','desk-r4'),json.loads((Path(__file__).parent/'model_artifacts/creative-examples.json').read_text())):
    SCENES[_key]={'baseline_previous_title':_sample.get('baseline_previous_title',''),'material_context':_sample.get('material_context',''),'version_tags':[v['tags'] for v in _sample['designs']],'title':_sample['title'],'body':_sample['body'],'image':_sample['thumbnail'].split('/')[-1],
      'versions':[(v['title'],v['body'],v.get('audience','海外生活与迁居关注者' if i==0 else '都市品质生活人群'),'流行度',v.get('style','自然真实，保留个人表达'),v['angle']) for i,v in enumerate(_sample['designs'])]}


def create(c,owner,key):
    if key=='series-desk-r4':return create_series(c,owner)
    if key not in SCENES:raise campaigns.ReviewError('请选择已有演示场景。')
    # Opening a walkthrough again restores it, preserving author edits.
    import json
    for row in c.execute("SELECT id,data FROM content_plans WHERE owner=? AND kind='adaptation' ORDER BY updated DESC LIMIT 100",(owner,)):
        if json.loads(row['data']).get('demo')==key:
            plan=campaigns.detail(c,owner,row['id']);scene=SCENES[key];source=plan['data']['source']
            # Refresh only a known, untouched preset source; never overwrite edits.
            if scene.get('material_context') and source['body']==scene['material_context'] and source['title']==scene['baseline_previous_title']:
                import copy,time
                plan['data'].setdefault('history',[]).append({'kind':'demo_baseline_update','at':time.time(),'previous_source':copy.deepcopy(source)})
                source.update(title=scene['title'],body=scene['body'],tags=[],constraints=scene['material_context'],baseline_kind='preset-demo')
                return campaigns.persist(c,owner,plan)
            return plan
    scene=SCENES[key];asset=Path(__file__).parent/'public/assets'/scene['image']
    image='data:image/webp;base64,'+base64.b64encode(asset.read_bytes()).decode() if scene['image'] and asset.is_file() else ''
    state={'brief':{'mode':'optimize','platform':'小红书','originalTitle':scene['title'],'originalBody':scene['body'],'additionalPrompt':scene.get('material_context',''),'image':image},'selected':0}
    task=campaigns.prepare(c,owner,{'task':'adaptation'},state)
    result={'title':scene['title']+' · 演示项目','shared_facts':[scene.get('material_context') or scene['body']], 'versions':[],
            'explanations':[{'observation':'同一素材，两种读者需求','action':'按平台目标分别组织内容','reason':'用不同的信息顺序与回应入口提供价值；效果待实际验证。','evidence':'模型推测'}]}
    for index,(platform,values) in enumerate(zip(campaigns.PLATFORMS,scene['versions'])):
        title,body,audience,goal,tone,angle=values
        result['versions'].append({'platform':platform,'title':title,'body':body,'audience':audience,'goal':'流行度','tone':tone,'angle':angle,'tags':scene.get('version_tags',[['手冲咖啡'] if key=='coffee' else ['旅行记录'] if key=='portugal' else ['书桌整理']]*2)[index],'visual':'复用共同素材，符合平台预览比例；图片仅作演示。','changes':[angle],'missing_materials':['请补充实际细节与发布素材'],'reason':'预设编辑示例，读者价值与实际效果仍需作者验证。'})
    ident=campaigns.complete(c,owner,task,result)['plan_id'];plan=campaigns.detail(c,owner,ident);plan['data']['demo']=key
    return campaigns.persist(c,owner,plan)


def create_series(c,owner):
    import json
    for row in c.execute("SELECT id,data FROM content_plans WHERE owner=? AND kind='series' ORDER BY updated DESC LIMIT 100",(owner,)):
        if json.loads(row['data']).get('demo')=='desk-series-r4':
            from showcases import complete_series
            return complete_series(c,owner,campaigns.detail(c,owner,row['id']))
    sample=json.loads((Path(__file__).parent/'model_artifacts/creative-examples.json').read_text())[1]
    original=sample['designs'][0]
    image='data:image/webp;base64,'+base64.b64encode((Path(__file__).parent/'public/assets/demo-desk.webp').read_bytes()).decode()
    state={'brief':{'mode':'optimize','platform':'小红书','originalTitle':original['title'],'originalBody':original['body'],'creativeTheme':'清爽书桌布局','image':image,'goal':'流行度','audience':'家居收纳与租房人群','tone':'实用清晰，信息优先'},'selected':0}
    task=campaigns.prepare(c,owner,{'task':'series','expansion_strategy':'mixed','reader_questions':'小桌面只有80厘米宽，能不能出个布局尺寸清单？\n桌子放在合租卧室，怎么兼顾学习和化妆？'},state)
    rows=[('小书桌布局前，先量这5个尺寸','怎样把三分区变成适合自己的尺寸清单',['列出桌宽、桌深、设备占位、手臂活动与常用物件尺寸五个测量项','提供先摆电脑、留操作区、再放纸笔与生活物件的核对顺序'],['自己的书桌与电脑尺寸','调整前后的同机位照片'],'讲深原题',['按用途分成三个区域','先留操作空间，再考虑收纳'],['把原则展开为可填写的尺寸清单'],'从三条布局原则进入实际测量与核对，不重复原帖结论'),
    ('合租卧室的一角，怎样切换工作与生活','在同一小桌面上如何切换两种任务',['把常用工作物件与临时生活物件分成固定区和可移动区','列出任务切换时要拿走、留下、归位的物件'],['合租房间实际桌面和活动范围','作者需要切换的真实任务'],'换个场景',['按用途分区','常用物件放在顺手位置'],['将单一工作桌面迁移到共享卧室和多任务场景'],'改变空间约束与使用任务，新增可移动区域和切换清单'),
    ('行李箱也能用三分区：先按取用频率整理','出行时怎样把常用与偶尔使用的物品分开',['用高频随身、途中取用、到达后使用组织行李','用取用顺序设计分区，列出需要实测的容量与尺寸'],['实际旅行物品清单','行李箱尺寸和称重记录'],'迁移结构',['先识别使用场景再确定位置','给高频物件保留容易取用的位置'],['从桌面布局转向旅行收纳，重新整理需求与素材'],'只借按用途分区的组织结构，主题、人群约束和证据都需重新补充')]
    episodes=[]
    for title,problem,new,missing,distance,keep,change,difference in rows:
        episodes.append({'title':title,'problem':problem,'new_content':new,'missing_materials':missing,'outline':['说明本集问题',*new,'核对缺少素材与适用范围'],'reason':'预设续集演示：用新增问题与材料区分每集，效果尚未验证。','extension':{'distance':distance,'keep':keep,'change':change,'difference':difference,'title_candidates':[title,title+'｜一份可填写清单']}})
    result={'title':'清爽书桌之后，接着写什么？','throughline':'把原帖布局原则讲深，换场景应用，再迁移表达结构。','source_analysis':{'observations':[{'quote':original['body'].split('\n')[0],'observation':'原帖从物件位置切入，再给出分区与整理顺序。','hypothesis':'具体步骤可能便于读者对照自己的空间，尚无真实互动数据验证。'}],'reusable_elements':['从具体问题进入','给出动作顺序与适用边界'],'unknowns':['示例没有真实发布与曝光记录','评论为可编辑的合成演示，不是平台采集']},'episodes':episodes,'explanations':[{'observation':'已有书桌布局示例','action':'用三个不同问题延展','reason':'使后续内容新增材料和读者价值，不只更换标题。','evidence':'模型推测'}]}
    ident=campaigns.complete(c,owner,task,result)['plan_id'];plan=campaigns.detail(c,owner,ident);plan['data']['demo']='desk-series-r4'
    from showcases import complete_series
    return complete_series(c,owner,campaigns.persist(c,owner,plan))
