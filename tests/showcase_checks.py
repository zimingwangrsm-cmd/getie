"""Display examples must be complete, private, repeatable and unbilled."""
import json
import unittest

import accounts
import campaigns
import scenarios
import showcases
from server import validate_state
from tests.plans_checks import connection


class ShowcaseChecks(unittest.TestCase):
    def setUp(self):
        self.c = connection()
        self.c.executescript('''DROP TABLE projects; DROP TABLE versions;
        CREATE TABLE projects(id TEXT PRIMARY KEY,owner TEXT,title TEXT,state TEXT,updated REAL,archived INTEGER DEFAULT 0);
        CREATE TABLE versions(id TEXT PRIMARY KEY,project TEXT,owner TEXT,state TEXT,created REAL,label TEXT);''')

    def tearDown(self):
        self.c.close()

    def test_three_complete_projects_have_matching_platform_drafts_and_no_charge(self):
        for scene in showcases.CREATION:
            project = showcases.project(self.c, 'owner-a', scene)
            state = validate_state(project['state'])
            self.assertTrue(state['brief']['image'].startswith('data:image/'))
            self.assertTrue(state['result']['options'][0]['body'])
            self.assertTrue(state['brief']['platformNotes']['小红书'])
            second = state['platformDrafts']['抖音图文']
            self.assertEqual(second['result']['platform'], '抖音图文')
            self.assertGreater(len(second['result']['options'][0]['body']), 80)
            plan = campaigns.detail(self.c, 'owner-a', state['linkedPlanId'])
            for version in plan['data']['versions']:
                self.assertTrue(version['cover_subtitle'])
                self.assertTrue(version['tags'])
        self.assertEqual(accounts.balance(self.c, 'owner-a'), 0)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM jobs').fetchone()[0], 0)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM publications').fetchone()[0], 0)

    def test_reopening_preserves_edits_other_projects_and_owner_isolation(self):
        first = showcases.project(self.c, 'owner-a', 'coffee')
        state = first['state'];state['brief']['originalBody'] = '作者自己改过的原文'
        self.c.execute('UPDATE projects SET state=? WHERE id=?', (json.dumps(state), first['id']))
        self.c.execute("INSERT INTO projects VALUES('personal','owner-a','个人作品','{}',1,0)")
        again = showcases.project(self.c, 'owner-a', 'coffee')
        self.assertEqual(again['id'], first['id'])
        self.assertEqual(again['state']['brief']['originalBody'], '作者自己改过的原文')
        self.assertEqual(self.c.execute("SELECT archived FROM projects WHERE id='personal'").fetchone()[0], 0)
        other = showcases.project(self.c, 'owner-b', 'coffee')
        self.assertNotEqual(other['id'], first['id'])

    def test_series_has_six_full_editable_drafts_with_valid_save_contract(self):
        plan = scenarios.create(self.c, 'owner-a', 'series-desk-r4')
        self.assertEqual(len(plan['data']['episodes']), 3)
        for number in (1, 2, 3):
            for platform in campaigns.PLATFORMS:
                state = campaigns.editor_state(plan, {'episode': number, 'platform': platform})
                validate_state(state)
                option = state['result']['options'][0]
                self.assertGreater(len(option['body']), 150)
                self.assertTrue(option['tags']);self.assertTrue(option['cover']['subtitle'])
                plan = campaigns.save_draft(self.c, 'owner-a', {'id': plan['id'], 'revision': plan['revision'], 'episode': number, 'platform': platform}, state)
        self.assertEqual(accounts.balance(self.c, 'owner-a'), 0)

    def test_legacy_example_adds_only_absent_platform_draft(self):
        first = showcases.project(self.c, 'owner-a', 'portugal-r4')
        state = first['state'];state.pop('platformDrafts')
        state['result']['options'][0]['body'] = '这是作者在旧示例里保存的正文。'
        self.c.execute('UPDATE projects SET state=? WHERE id=?', (json.dumps(state), first['id']))
        again = showcases.project(self.c, 'owner-a', 'portugal-r4')
        self.assertEqual(again['state']['result']['options'][0]['body'], '这是作者在旧示例里保存的正文。')
        self.assertGreater(len(again['state']['platformDrafts']['抖音图文']['result']['options'][0]['body']), 80)

    def test_series_upgrade_never_replaces_saved_or_intentionally_cleared_drafts(self):
        plan = scenarios.create(self.c, 'owner-a', 'series-desk-r4')
        saved = plan['data']['episodes'][0]['drafts']['小红书']['state']
        saved['result'] = None
        saved['brief']['originalBody'] = ''
        plan = campaigns.persist(self.c, 'owner-a', plan)
        again = scenarios.create(self.c, 'owner-a', 'series-desk-r4')
        self.assertEqual(again['revision'], plan['revision'])
        self.assertIsNone(again['data']['episodes'][0]['drafts']['小红书']['state']['result'])
        self.assertEqual(again['data']['episodes'][0]['drafts']['小红书']['state']['brief']['originalBody'], '')

    def test_existing_plan_cleared_draft_stays_empty_when_first_opened_as_project(self):
        plan = scenarios.create(self.c, 'owner-a', 'coffee')
        state = campaigns.editor_state(plan, {'platform': '小红书'})
        state['result'] = None
        campaigns.save_draft(self.c, 'owner-a', {'id': plan['id'], 'revision': plan['revision'], 'platform': '小红书'}, state)
        project = showcases.project(self.c, 'owner-a', 'coffee')
        validate_state(project['state'])
        self.assertIsNone(project['state']['result'])
        self.assertTrue(project['state']['platformDrafts']['抖音图文']['result']['options'][0]['body'])

    def test_unknown_example_rejected_without_side_effects(self):
        for value in ['unknown', None, [], {}, True, 99]:
            with self.assertRaises(campaigns.ReviewError):
                showcases.project(self.c, 'owner-a', value)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM projects').fetchone()[0], 0)

    def test_linked_copy_can_keep_original_source_with_current_platform_output(self):
        plan = scenarios.create(self.c, 'owner-a', 'coffee')
        state = campaigns.editor_state(plan, {'platform':'抖音图文','source_input':True})
        self.assertEqual(state['brief']['originalBody'], plan['data']['source']['body'])
        self.assertEqual(state['result']['options'][0]['body'], plan['data']['versions'][1]['body'])
        self.assertNotEqual(state['brief']['originalBody'], state['result']['options'][0]['body'])
        self.assertEqual(state['planLink']['platform'],'抖音图文')
        validate_state(state)


if __name__ == '__main__':
    unittest.main()
