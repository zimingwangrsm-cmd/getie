"""Author-control invariants, cross-platform isolation and adversarial feedback."""
import copy,json,sqlite3,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import campaigns,linked,scenarios
from tests.plans_checks import connection,result_for,fixture
from model import ModelError
from feedback import ReviewError

class LinkedChecks(unittest.TestCase):
 def setUp(self):
  self.c=connection();self.owner='linked-test';self.p=scenarios.create(self.c,self.owner,'coffee')
 def tearDown(self):self.c.close()
 def update(self,**data):
  self.p=campaigns.update(self.c,self.owner,{'id':self.p['id'],'revision':self.p['revision'],**data});return self.p
 def series(self):
  task=campaigns.prepare(self.c,self.owner,{'task':'series','from_plan':self.p['id']})
  ident=campaigns.complete(self.c,self.owner,task,result_for('series'))['plan_id'];self.p=campaigns.detail(self.c,self.owner,ident);return self.p
 def feedback(self):
  task=campaigns.prepare(self.c,self.owner,{'task':'feedback','id':self.p['id'],'revision':self.p['revision'],'channels':{'小红书':{'comments':'没有电子秤怎么办？','metrics':{'impressions':100,'collects':0,'window':24}},'抖音图文':{'comments':'为什么咖啡会发苦？'}}})
  result={'groups':[{'platform':'小红书','category':'追问','comment_ids':['1c1'],'need':'无秤方案'}],
  'updates':[{'platform':'小红书','episode':2,'problem':'无秤如何计量','new_content':['对照量勺方法'],'missing_materials':['量勺实拍'],'reason':'回应具体追问，效果待验证','comment_ids':['1c1'],'metric_ids':['1m1']},
             {'platform':'抖音图文','episode':2,'problem':'发苦怎么排查','new_content':['苦味排查步骤'],'missing_materials':['对照记录'],'reason':'回应另一平台追问','comment_ids':['2c1'],'metric_ids':[]}],
  'reflections':[{'platform':'小红书','observation':'100曝光0收藏','hypothesis':'可能缺少可执行步骤，账号与投流未知不能归因','experiment':'下一篇补量勺图，统一24小时记录','comment_ids':['1c1'],'metric_ids':['1m1']},{'platform':'抖音图文','observation':'读者追问发苦原因','hypothesis':'可能需要排查步骤，不能据此说明全部受众','experiment':'下一篇补对照记录','comment_ids':['2c1'],'metric_ids':[]}],'summary':'各平台分别改下一篇'}
  return task,result
 def test_fact_confirmation_exact_preserves_independent_manual_edits(self):
  values=linked.current_version(self.p,'抖音图文');values['body']+='\n我手动写下的独特句子。'
  self.update(action='edit_version',platform='抖音图文',values=values,config={'tone':'作者自定义语气'})
  fact=next(f for f in self.p['data']['facts'] if f['label']=='价格')
  preview=linked.fact_preview(self.p,{'fact':fact['id'],'value':'49元'})
  self.assertTrue(preview['changes']);before=copy.deepcopy(self.p)
  self.assertIn('39元',linked.current_version(self.p,'小红书')['body'])
  self.assertEqual(self.p,before)
  self.update(action='fact_confirm',fact=fact['id'],value='49元',token=preview['token'],selections=list(range(len(preview['changes']))))
  for p in campaigns.PLATFORMS:self.assertIn('49元',linked.current_version(self.p,p)['body']);self.assertNotIn('39元',linked.current_version(self.p,p)['body'])
  self.assertIn('我手动写下的独特句子。',linked.current_version(self.p,'抖音图文')['body'])
  self.assertEqual(self.p['data']['versions'][1]['tone'],'作者自定义语气')
 def test_fact_stale_token_partial_selection_and_numeric_boundaries(self):
  fact=next(f for f in self.p['data']['facts'] if f['label']=='价格');data={'fact':fact['id'],'value':'49元'};preview=linked.fact_preview(self.p,data)
  with self.assertRaises(ReviewError):self.update(action='fact_confirm',**data,token='fake',selections=[0])
  self.update(action='fact_confirm',**data,token=preview['token'],selections=[0])
  self.assertIn('39元',linked.current_version(self.p,'抖音图文')['body'])
  with self.assertRaises(ReviewError):self.update(action='fact_confirm',**data,token=preview['token'],selections=[0])
 def test_unmatched_author_rewrite_not_overwritten(self):
  v=linked.current_version(self.p,'抖音图文');v={k:(x.replace('39元','59元') if isinstance(x,str) else x) for k,x in v.items()}
  self.update(action='edit_version',platform='抖音图文',values=v)
  fact=next(f for f in self.p['data']['facts'] if f['label']=='价格');preview=linked.fact_preview(self.p,{'fact':fact['id'],'value':'49元'})
  self.assertTrue(any(u['platform']=='抖音图文' for u in preview['unmatched']))
 def test_published_platform_freezes_only_itself(self):
  self.series();s=campaigns.editor_state(self.p,{'episode':1,'platform':'小红书'})
  self.p=campaigns.save_draft(self.c,self.owner,{'id':self.p['id'],'revision':self.p['revision'],'episode':1,'platform':'小红书'},s)
  self.update(action='platform_status',episode=1,platform='小红书',status='published',confirmed=True)
  with self.assertRaises(ReviewError):campaigns.editor_state(self.p,{'episode':1,'platform':'小红书'})
  self.assertTrue(campaigns.editor_state(self.p,{'episode':1,'platform':'抖音图文'}))
  with self.assertRaises(ReviewError):self.update(action='status',episode=1,status='planned')
 def test_feedback_separate_platforms_confirmation_and_quotes(self):
  self.series();task,result=self.feedback();before=copy.deepcopy(self.p['data']['episodes'])
  ident=campaigns.complete(self.c,self.owner,task,result)['proposal_id']
  self.p=campaigns.detail(self.c,self.owner,self.p['id']);self.assertEqual(before,self.p['data']['episodes'])
  self.update(action='confirm',proposal=ident,selections=[0]);e=self.p['data']['episodes'][1]
  self.assertEqual(e['platforms']['小红书']['problem'],'无秤如何计量')
  self.assertEqual(e['platforms']['抖音图文'],before[1]['platforms']['抖音图文'])
  self.assertEqual(e['platforms']['小红书']['feedback_evidence'],['没有电子秤怎么办？'])
  self.assertEqual(e['platforms']['小红书']['feedback_metrics'][0]['collects'],0)
  self.assertIsNone(e['platforms']['小红书']['feedback_metrics'][0]['likes'])
 def test_wrong_platform_or_fabricated_evidence_rejected(self):
  self.series();task,result=self.feedback()
  for key in ['comment_ids','metric_ids']:
   bad=copy.deepcopy(result);bad['updates'][0][key]=['2c1' if key=='comment_ids' else '2m1']
   with self.assertRaises(ModelError):campaigns.validate_generated(task,bad)
  task['episodes'][1]['platforms']['小红书']['status']='published'
  with self.assertRaises(ModelError):campaigns.validate_generated(task,result)
 def test_invalid_metrics_and_empty_feedback(self):
  for m in [{'impressions':-1,'window':24},{'impressions':1.5,'window':24},{'impressions':True,'window':24},{'likes':0,'window':0}]:
   with self.assertRaises(ReviewError):campaigns.feedback_channels({'小红书':{'metrics':m}})
  self.series()
  with self.assertRaises(ReviewError):campaigns.prepare(self.c,self.owner,{'task':'feedback','id':self.p['id'],'revision':1,'channels':{}})
 def test_scenarios_private_restore_and_parent_current_facts(self):
  self.assertEqual(scenarios.create(self.c,self.owner,'coffee')['id'],self.p['id'])
  with self.assertRaises(ReviewError):campaigns.detail(self.c,'another',self.p['id'])
  fact=next(f for f in self.p['data']['facts'] if f['label']=='价格');pr=linked.fact_preview(self.p,{'fact':fact['id'],'value':'49元'});self.update(action='fact_confirm',fact=fact['id'],value='49元',token=pr['token'],selections=list(range(len(pr['changes']))))
  task=campaigns.prepare(self.c,self.owner,{'task':'series','from_plan':self.p['id']})
  self.assertIn('49元',task['source']['body']);self.assertEqual(task['parent'],self.p['id'])
if __name__=='__main__':unittest.main(verbosity=2)
