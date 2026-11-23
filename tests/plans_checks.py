"""Plan lifecycle invariants, evidence validation, and editor handoffs."""
import copy
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import accounts
import campaigns
import creative
import feedback
from model import ModelError


def fixture():
    return {'brief': {'mode': 'optimize', 'originalTitle': '我的葡萄牙海边随记',
                     'originalBody': '我拍下了海边的落日。想分享如何在忙碌旅途中留一段停顿。',
                     'creativeTheme': '旅行慢下来', 'platform': '小红书', 'image': '',
                     'audience': '第一次独立旅行的人', 'goal': '收藏', 'tone': '自然口语',
                     'creatorProfile': {'name': '旅行档案', 'voice': '第一人称，不用感叹号',
                                        'facts': '照片为本人拍摄', 'avoid': '不编造价格和餐厅体验'},
                     'count': 1, 'model': 'gpt-6-luna'}, 'result': None, 'selected': 0}


def result_for(kind):
    reasons = [{'observation': '原帖是旅行随记', 'action': '围绕不同问题设计',
                'reason': '为后续内容增加具体价值', 'evidence': '模型推测'}]
    if kind == 'series':
        return {'title': '从赶路到慢游', 'throughline': '从准备到观察再到记录',
                'episodes': [{'title': t, 'problem': p, 'new_content': [n],
                              'missing_materials': ['需作者补充实际素材'], 'outline': [n], 'reason': '承接原帖的新问题'}
                             for t, p, n in [('出发前留白', '如何规划空白时间', '介绍行程安排原则'),
                                             ('海边的观察', '如何观察周围细节', '记录听觉与光线变化'),
                                             ('旅途的回顾', '如何保存旅行记忆', '整理照片与当天的短记')]],
                'explanations': reasons}
    if kind == 'adaptation':
        return {'title': '一段慢游，两种表达', 'shared_facts': ['本人拍下海边落日'],
                'versions': [{'platform': p, 'angle': '用步骤讲清慢游' if i == 0 else '用一个瞬间引出讨论',
                              'audience': '独立旅行者', 'goal': '收藏' if i == 0 else '评论',
                              'tone': '严谨清晰' if i == 0 else '自然口语', 'title': '给旅途留一点空白' if i == 0 else '你会在海边停多久',
                              'body': '我拍下海边的落日。旅途中留一段空白，让自己停下来观察。' if i == 0 else '日落时，我停下了脚步。你会为这样的瞬间改变行程吗？',
                              'tags': ['旅行记录'], 'visual': '保留原图，核对竖屏裁切',
                              'changes': ['从相同事实出发，改变结构与读者行动'], 'missing_materials': [], 'reason': '按本次平台编辑假设安排'} for i, p in enumerate(campaigns.PLATFORMS)],
                'explanations': reasons}
    return {'groups': [{'category': '追问', 'comment_ids': ['1'], 'need': '想看更具体的安排'}],
            'updates': [{'episode': 2, 'problem': '如何在繁忙行程中留出观察时间',
                         'new_content': ['请作者补充一个实际的行程调整例子'],
                         'missing_materials': ['真实行程安排'], 'reason': '回应具体步骤的追问', 'comment_ids': ['1']}],
            'summary': '先补充真实例子，再调整未发布内容。'}


def connection():
    c = sqlite3.connect(':memory:'); c.row_factory = sqlite3.Row
    c.executescript('''CREATE TABLE projects(id TEXT,owner TEXT); CREATE TABLE versions(id TEXT,owner TEXT);
    CREATE TABLE jobs(id TEXT,owner TEXT,status TEXT,error TEXT,kind TEXT,created REAL);
    ''')
    campaigns.initialize(c); accounts.initialize(c); creative.initialize(c); feedback.initialize(c)
    return c


class PlanChecks(unittest.TestCase):
    def setUp(self): self.c = connection(); self.owner = 'test-owner'
    def tearDown(self): self.c.close()
    def create(self, kind='series'):
        task = campaigns.prepare(self.c, self.owner, {'task': kind}, fixture())
        result = campaigns.complete(self.c, self.owner, task, result_for(kind))
        return campaigns.detail(self.c, self.owner, result['plan_id'])
    def proposal(self, plan):
        task = campaigns.prepare(self.c, self.owner, {'task': 'feedback', 'id': plan['id'], 'revision': plan['revision'], 'comments': '具体步骤是什么？\n我想知道更多背景。'})
        value = campaigns.complete(self.c, self.owner, task, result_for('feedback'))
        return campaigns.detail(self.c, self.owner, plan['id']), value['proposal_id']

    def test_three_followups_preserve_source_and_profile(self):
        p = self.create(); self.assertEqual([e['number'] for e in p['data']['episodes']], [1, 2, 3])
        self.assertEqual(p['data']['source']['body'], fixture()['brief']['originalBody'])
        self.assertEqual(p['data']['source']['profile']['voice'], '第一人称，不用感叹号')
        with self.assertRaises(ReviewError): campaigns.detail(self.c, 'other-owner', p['id'])

    def test_feedback_is_proposal_until_explicit_confirmation(self):
        p = self.create(); before = copy.deepcopy(p['data']['episodes']); p, pid = self.proposal(p)
        self.assertEqual(p['data']['episodes'], before)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'confirm', 'proposal': pid, 'selections': [0]})
        self.assertEqual(p['data']['episodes'][1]['problem'], result_for('feedback')['updates'][0]['problem'])
        self.assertEqual(p['data']['episodes'][1]['feedback_evidence'], ['具体步骤是什么？'])
        self.assertEqual(p['data']['episodes'][0], before[0])
        self.assertEqual(p['data']['questions'][0]['quote'], '具体步骤是什么？')
        self.assertEqual(p['proposals'][0]['status'], 'confirmed')
        self.assertEqual(p['data']['history'][0]['before'][1]['problem'], before[1]['problem'])

    def test_fabricated_comment_id_and_published_target_rejected(self):
        p = self.create(); task = campaigns.prepare(self.c, self.owner, {'task': 'feedback', 'id': p['id'], 'revision': 1, 'comments': '如何操作？'})
        bad = result_for('feedback'); bad['updates'][0]['comment_ids'] = ['999']
        with self.assertRaises(ModelError): campaigns.validate_generated(task, bad)
        task['episodes'][1]['status'] = 'published'
        with self.assertRaises(ModelError): campaigns.validate_generated(task, result_for('feedback'))

    def test_conflicting_revision_and_old_proposal_cannot_overwrite(self):
        p = self.create(); p, pid = self.proposal(p)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': 1, 'action': 'status', 'episode': 1, 'status': 'drafting'})
        with self.assertRaises(ReviewError): campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'confirm', 'proposal': pid, 'selections': [0]})
        with self.assertRaises(ReviewError): campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': 1, 'action': 'status', 'episode': 2, 'status': 'planned'})

    def test_published_entry_frozen_and_needs_actual_confirmation(self):
        p = self.create()
        with self.assertRaises(ReviewError): campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': 1, 'action': 'status', 'episode': 1, 'status': 'published'})
        s = campaigns.editor_state(p, {'episode': 1, 'platform': '小红书'})
        p = campaigns.save_draft(self.c, self.owner, {'id': p['id'], 'revision': 1, 'episode': 1, 'platform': '小红书'}, s)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'status', 'episode': 1, 'status': 'published', 'confirmed': True})
        with self.assertRaises(ReviewError): campaigns.editor_state(p, {'episode': 1, 'platform': '小红书'})
        with self.assertRaises(ReviewError): campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'status', 'episode': 1, 'status': 'planned'})

    def test_both_platform_versions_open_in_existing_editor(self):
        p = self.create('adaptation')
        for platform in campaigns.PLATFORMS:
            s = campaigns.editor_state(p, {'platform': platform})
            self.assertEqual(s['brief']['platform'], platform)
            self.assertEqual(s['result']['platform'], platform)
            self.assertEqual(s['result']['input_fingerprint'], creative.input_fingerprint(s['brief']))
            self.assertTrue(s['result']['options'][0]['body'])
            self.assertEqual(s['brief']['creatorProfile']['voice'], '第一人称，不用感叹号')

    def test_save_draft_rejects_wrong_platform_and_wrong_plan(self):
        p = self.create(); s = campaigns.editor_state(p, {'episode': 1, 'platform': '小红书'})
        payload = {'id': p['id'], 'revision': 1, 'episode': 1, 'platform': '抖音图文'}
        with self.assertRaises(ReviewError): campaigns.save_draft(self.c, self.owner, payload, s)
        payload['platform'] = '小红书'; s['planLink']['id'] = 'bad'
        with self.assertRaises(ReviewError): campaigns.save_draft(self.c, self.owner, payload, s)

    def test_confirmation_keeps_old_draft_and_marks_refresh(self):
        p = self.create(); s = campaigns.editor_state(p, {'episode': 2, 'platform': '小红书'})
        p = campaigns.save_draft(self.c, self.owner, {'id': p['id'], 'revision': 1, 'episode': 2, 'platform': '小红书'}, s)
        old = copy.deepcopy(p['data']['episodes'][1]['drafts']); p, pid = self.proposal(p)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'confirm', 'proposal': pid, 'selections': [0]})
        self.assertEqual(p['data']['episodes'][1]['drafts'], old)
        self.assertTrue(p['data']['episodes'][1]['needs_refresh'])
        next_state = campaigns.editor_state(p, {'episode': 2, 'platform': '小红书'})
        self.assertIn('实际的行程调整例子', next_state['brief']['additionalPrompt'])

    def test_repetition_checks_different_versions_without_self_matches(self):
        p = self.create('adaptation'); d = p['data']; text = '相同事实也需要实质新增信息，不能只替换标题反复发布。'
        for v in d['versions']: v.update(title='相同标题', body=text)
        self.assertTrue(campaigns.repetition(d)['matches'])
        s = campaigns.editor_state(p, {'platform': '小红书'})
        d['versions'][0]['drafts']['小红书'] = {'title': '相同标题', 'body': text, 'state': s}
        matches = campaigns.repetition(d)['matches']
        self.assertFalse(any(m['a'].startswith('小红书') and m['b'].startswith('小红书') for m in matches))

    def test_questions_can_be_marked_answered(self):
        p = self.create(); p, pid = self.proposal(p)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': 1, 'action': 'confirm', 'proposal': pid, 'selections': [0]})
        q = p['data']['questions'][0]
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': p['revision'], 'action': 'question', 'question': q['id'], 'answered': True})
        self.assertTrue(p['data']['questions'][0]['answered'])

    def test_save_questions_without_applying_suggestions(self):
        p = self.create(); before = copy.deepcopy(p['data']['episodes']); p, pid = self.proposal(p)
        p = campaigns.update(self.c, self.owner, {'id': p['id'], 'revision': 1, 'action': 'confirm', 'proposal': pid, 'selections': []})
        self.assertEqual(p['data']['episodes'], before)
        self.assertEqual(len(p['data']['questions']), 1)

    def test_bad_identifier_and_malformed_editor_result_rejected(self):
        with self.assertRaises(ReviewError): campaigns.detail(self.c, self.owner, {})
        p = self.create('adaptation'); s = campaigns.editor_state(p, {'platform': '小红书'})
        s['result']['options'][0]['cover'] = 'broken'
        with self.assertRaises(ReviewError): campaigns.save_draft(self.c, self.owner, {'id': p['id'], 'revision': 1, 'platform': '小红书'}, s)

    def test_stale_inputs_cannot_seed_plan_but_manual_edits_can_be_saved(self):
        p = self.create('adaptation'); s = campaigns.editor_state(p, {'platform': '小红书'})
        s['brief']['additionalPrompt'] = '新的手动编辑要求'
        with self.assertRaises(ReviewError): campaigns.source_from_state(s)
        s['result']['options'][0]['body'] = '作者已手动核对后的文案。'
        p = campaigns.save_draft(self.c, self.owner, {'id': p['id'], 'revision': 1, 'platform': '小红书'}, s)
        self.assertEqual(p['data']['versions'][0]['drafts']['小红书']['body'], '作者已手动核对后的文案。')

    def test_guest_plans_and_proposals_migrate_on_registration(self):
        p = self.create(); self.proposal(p)
        member, _, _ = accounts.register(self.c, {'username': 'plan-test-member', 'password': 'test-only-secret'}, self.owner)
        self.assertEqual(campaigns.detail(self.c, member, p['id'])['proposals'][0]['status'], 'pending')
        with self.assertRaises(ReviewError): campaigns.detail(self.c, self.owner, p['id'])

    def test_malformed_source_and_model_outputs_do_not_create_plan(self):
        for broken in [{'task': 'unknown'}, {'task': 'series', 'model': 'unconfigured'}]:
            with self.assertRaises(ReviewError): campaigns.prepare(self.c, self.owner, broken, fixture())
        for key, value in [('selected', -1), ('result', {'options': ['bad']})]:
            s = fixture(); s[key] = value
            with self.assertRaises(ReviewError): campaigns.source_from_state(s)
        task = campaigns.prepare(self.c, self.owner, {'task': 'series'}, fixture()); bad = result_for('series'); bad['episodes'].pop()
        with self.assertRaises(ModelError): campaigns.complete(self.c, self.owner, task, bad)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM content_plans').fetchone()[0], 0)

    def test_platform_requirements_and_images_stay_out_of_text_provider_material(self):
        task = campaigns.prepare(self.c, self.owner, {'task': 'adaptation', 'platform_notes': {'小红书': '只用已核实的主题词'}}, fixture())
        task['source']['image'] = 'private-image-bytes'
        with patch('model.request_structured', return_value=result_for('adaptation')) as call:
            campaigns.run(task)
            material = call.call_args.args[2]
            self.assertNotIn('image', material['source'])
            self.assertEqual(material['platform_notes']['小红书'], '只用已核实的主题词')


ReviewError = feedback.ReviewError
if __name__ == '__main__': unittest.main()
