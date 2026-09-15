"""Synthetic control-plane failure checks; never call Google Cloud."""
import copy
import hashlib
import importlib.util
import json
from datetime import datetime as RealDatetime
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('activation', Path(__file__).with_name('activate-dev-test.py'))
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


def bootstrap_absence_fixture(env, checked_at):
    return {
        'project': 'samra-pay-'+env,
        'instance': 'samra-'+env+'-postgres',
        'principal': 'samra_bootstrap_'+env,
        'absent': True,
        'checkedAt': checked_at,
    }


class Sessions(unittest.TestCase):
    def setUp(self):
        registry = 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/'
        self.images = {
            'sourceSha': 'a' * 40,
            'images': {
                'api': registry + 'samra-api@sha256:' + '1'*64,
                'customer-web': registry + 'samra-customer-web@sha256:' + '2'*64,
                'migrations': registry + 'samra-migrations@sha256:' + '3'*64,
            },
        }
        self.receipt = {'project': 'samra-pay-test', **copy.deepcopy(self.images), 'bootstrapRetired': True, 'services': {}}
        self.services = {}
        for key, image in [('api', 'api'), ('web', 'customer-web')]:
            name = 'samra-api-test' if key == 'api' else 'samra-customer-web-test'
            self.services[name] = {
                'metadata': {'generation': 1, 'annotations': {'run.googleapis.com/scalingMode': 'manual', 'run.googleapis.com/manualInstanceCount': '1'}},
                'spec': {'template': {'spec': {'timeoutSeconds': 60, 'containers': [{'image': self.images['images'][image]}]}}, 'traffic': []},
                'status': {
                    'observedGeneration': 1,
                    'latestCreatedRevisionName': name + '-00001',
                    'latestReadyRevisionName': name + '-00001',
                    'conditions': [{'type': 'Ready', 'status': 'True'}],
                    'traffic': [{'percent': 100, 'revisionName': name + '-00001'}],
                },
            }
            self.receipt['services'][key] = copy.deepcopy(self.services[name])
        self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/invoker-iam-disabled'] = 'true'
        self.invoker_policy = {'bindings': [{'role': 'roles/run.invoker', 'members': ['serviceAccount:samra-customer-web-test@samra-pay-test.iam.gserviceaccount.com']}]}
        self.calls = []
        self.policy = 'ALWAYS'
        self.drained = False

    def cloud(self, *args, **kwargs):
        self.calls.append(args)
        if args[:3] == ('run', 'services', 'describe'):
            return copy.deepcopy(self.services[args[3]])
        if args[:3] == ('run', 'services', 'get-iam-policy'):
            return copy.deepcopy(self.invoker_policy)
        if args[:3] == ('run', 'services', 'update'):
            mode = args[-1].split('=')[1]
            self.services[args[3]]['metadata']['annotations']['run.googleapis.com/manualInstanceCount'] = mode
            return {}
        if args[:3] == ('sql', 'instances', 'patch'):
            self.policy = args[-1].split('=')[1]
            return {}
        if args[:3] == ('sql', 'instances', 'describe'):
            return {'state': 'RUNNABLE' if self.policy == 'ALWAYS' else 'STOPPED', 'settings': {'activationPolicy': self.policy}}
        self.fail('Unexpected cloud operation')

    def drain(self):
        self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '0')
        self.assertFalse(any(c[:4] == ('run', 'services', 'update', 'samra-api-test') for c in self.calls))
        self.drained = True

    def run_session(self, action, drain=None, ready=None, web_ready=None):
        if action == 'start':
            for service in self.services.values():
                service['metadata']['annotations']['run.googleapis.com/manualInstanceCount'] = '0'
        with patch.object(activation, 'gcloud', side_effect=self.cloud), patch.object(activation.time, 'sleep') as sleep:
            activation.control_session(action, 'test', {'projectNumber': '378050809796'}, self.receipt, lambda: None, drain or self.drain, ready or (lambda *_: None), web_ready or (lambda *_: None))
            if action == 'stop': sleep.assert_called_once_with(65)

    def test_successful_stop_closes_drains_then_stops_compute(self):
        self.run_session('stop')
        self.assertTrue(self.drained)
        self.assertEqual(self.policy, 'NEVER')
        self.assertEqual(self.receipt['sessions'][-1]['status'], 'passed')

    def test_failed_drain_keeps_api_and_database_running(self):
        def fail(): raise RuntimeError('unresolved synthetic transfer')
        with self.assertRaises(RuntimeError): self.run_session('stop', drain=fail)
        self.assertEqual(self.services['samra-api-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '1')
        self.assertEqual(self.policy, 'ALWAYS')
        self.assertEqual(self.receipt['sessions'][-1]['status'], 'blocked-recovery-required')

    def test_failed_readiness_keeps_web_closed(self):
        def fail(*_): raise RuntimeError('database unavailable')
        with self.assertRaises(RuntimeError): self.run_session('start', ready=fail)
        self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '0')

    def test_start_opens_web_only_after_readiness(self):
        def ready(url, revision):
            self.assertEqual(url, 'https://samra-api-test-378050809796.us-east4.run.app')
            self.assertEqual(revision, 'samra-api-test-00001')
            self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '0')
        self.run_session('start', ready=ready)
        self.assertEqual(self.receipt['sessions'][-1]['status'], 'passed')

    def test_missing_public_shell_setting_blocks_start_with_web_closed(self):
        del self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/invoker-iam-disabled']
        with self.assertRaisesRegex(AssertionError, 'login shell'):
            self.run_session('start')
        self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '0')
        self.assertFalse(any(c[:2] == ('sql', 'instances') for c in self.calls))

    def test_active_operation_gate_runs_after_ingress_closes_before_start(self):
        for service in self.services.values():
            service['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ] = '0'

        def blocked():
            self.assertEqual(
                self.services['samra-customer-web-test']['metadata'][
                    'annotations'
                ]['run.googleapis.com/manualInstanceCount'],
                '0',
            )
            raise AssertionError('A Cloud Run job execution is still active')

        with patch.object(activation, 'gcloud', side_effect=self.cloud):
            with self.assertRaisesRegex(AssertionError, 'still active'):
                activation.control_session(
                    'start', 'test', {'projectNumber': '378050809796'},
                    self.receipt, lambda: None, self.drain,
                    lambda *_: None, lambda *_: None, blocked,
                )
        self.assertFalse(any(
            call[:2] == ('sql', 'instances') for call in self.calls
        ))
        self.assertFalse(any(
            call[:4] == (
                'run', 'services', 'update', 'samra-api-test',
            )
            for call in self.calls
        ))

    def test_web_http_failure_closes_shell_and_records_blocker(self):
        def fail(url):
            self.assertEqual(url, 'https://samra-customer-web-test-378050809796.us-east4.run.app')
            raise RuntimeError('HTTP 403')
        with self.assertRaises(RuntimeError): self.run_session('start', web_ready=fail)
        self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '0')
        self.assertEqual(self.receipt['sessions'][-1]['status'], 'blocked-recovery-required')
        self.assertEqual(self.services['samra-api-test']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'], '1')
        self.assertEqual(self.policy, 'ALWAYS')

    def test_public_api_blocks_start(self):
        self.services['samra-api-test']['metadata']['annotations']['run.googleapis.com/invoker-iam-disabled'] = 'true'
        with self.assertRaisesRegex(AssertionError, 'API must enforce'):
            self.run_session('start')

    def test_unexpected_or_conditional_api_invocation_blocks_start(self):
        for member in ['allUsers', 'allAuthenticatedUsers', 'user:synthetic@example.invalid']:
            with self.subTest(member=member):
                self.invoker_policy['bindings'][0]['members'].append(member)
                with self.assertRaisesRegex(AssertionError, 'direct API invocation binding'):
                    self.run_session('start')
                self.invoker_policy['bindings'][0]['members'].pop()
        self.invoker_policy['bindings'][0]['condition'] = {'expression': 'false'}
        with self.assertRaisesRegex(AssertionError, 'direct API invocation binding'):
            self.run_session('start')

    def test_tagged_traffic_rejected_before_mutation(self):
        self.services['samra-customer-web-test']['status']['traffic'][0]['tag'] = 'preview'
        with self.assertRaises(AssertionError): self.run_session('stop')
        self.assertFalse(any(c[:2] == ('sql', 'instances') for c in self.calls))
        self.assertFalse(any(c[:4] == ('run', 'services', 'update', 'samra-api-test') for c in self.calls))

    def test_changed_revision_rejected_before_mutation(self):
        self.services['samra-api-test']['status']['latestReadyRevisionName'] = 'unexpected'
        with self.assertRaises(AssertionError): self.run_session('start')
        self.assertFalse(any(c[:2] == ('sql', 'instances') for c in self.calls))
        self.assertFalse(any(c[:4] == ('run', 'services', 'update', 'samra-api-test') for c in self.calls))

    def test_receipt_cannot_be_reused_for_other_source_project_or_images(self):
        activation.verify_receipt(self.receipt, 'samra-pay-test', self.images)
        for key, value in [('sourceSha', 'b'*40), ('images', {'api': 'other'}), ('project', 'samra-pay-dev')]:
            changed = copy.deepcopy(self.receipt)
            changed[key] = value
            with self.assertRaises(AssertionError): activation.verify_receipt(changed, 'samra-pay-test', self.images)

    def release_fixture(self):
        prior = copy.deepcopy(self.receipt)
        prior['versions'] = {'ca': '1', 'migration': '2', 'runtime': '3', 'audit': '4', 'bootstrap': '5'}
        prior['jobs'] = {
            action: {
                'execution': 'projects/example/locations/us-east4/jobs/example/executions/' + action + '-execution',
                'status': {'succeededCount': 1},
            }
            for action in ['bootstrap', 'migrate', 'audit-runtime', 'audit-reader', 'drain']
        }
        prior['sessions'] = [{'action': 'stop', 'status': 'passed'}]
        services = {'api': copy.deepcopy(self.services['samra-api-test']), 'web': copy.deepcopy(self.services['samra-customer-web-test'])}
        for service in services.values():
            service['metadata']['annotations']['run.googleapis.com/manualInstanceCount'] = '0'
        database = {'state': 'STOPPED', 'settings': {'activationPolicy': 'NEVER'}}
        candidate = {
            'sourceSha': 'b' * 40,
            'images': {
                'api': 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-api@sha256:' + '4'*64,
                'customer-web': 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-customer-web@sha256:' + '5'*64,
                'migrations': 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-migrations@sha256:' + '6'*64,
            },
        }
        return prior, services, database, candidate

    def trust_fixture(self):
        return {
            'receiptSha256': 'f' * 64,
            'anchors': [{'type': 'git-tracked-baseline-evidence'}],
        }

    def iam_boundary_fixture(self):
        return {
            'schemaVersion': 1,
            'targets': {'private-api': {'principals': ['serviceAccount:web']}},
        }

    def test_prepares_new_release_from_exact_paused_predecessor(self):
        prior, services, database, candidate = self.release_fixture()
        receipt = activation.prepare_release_receipt(
            prior, self.trust_fixture(), 'samra-pay-test', candidate, services, database,
            self.iam_boundary_fixture(),
            '2026-09-14T00:00:00+00:00',
        )
        self.assertEqual(receipt['sourceSha'], candidate['sourceSha'])
        self.assertEqual(receipt['versions'], {'ca': '1', 'migration': '2', 'runtime': '3', 'audit': '4', 'bootstrap': '5'})
        self.assertEqual(receipt['jobs'], {})
        self.assertTrue(receipt['bootstrapRetired'])
        self.assertEqual(receipt['priorRelease']['receiptSha256'], 'f'*64)
        self.assertEqual(receipt['priorRelease']['services']['api']['revision'], 'samra-api-test-00001')
        self.assertEqual(receipt['phase'], 'prepared-paused')
        self.assertEqual(receipt['events'], [{
            'number': 1,
            'action': 'prepare-release',
            'status': 'passed',
            'migrationImage': candidate['images']['migrations'],
            'execution': None,
            'startedAt': '2026-09-14T00:00:00+00:00',
            'finishedAt': '2026-09-14T00:00:00+00:00',
        }])

    def test_release_preparation_rejects_unpaused_or_drifted_predecessor(self):
        prior, services, database, candidate = self.release_fixture()
        mutations = [
            lambda p, s, d: s['api']['metadata']['annotations'].__setitem__('run.googleapis.com/manualInstanceCount', '1'),
            lambda p, s, d: s['web']['status'].__setitem__('latestReadyRevisionName', 'unexpected'),
            lambda p, s, d: s['web']['status'].__setitem__('latestCreatedRevisionName', 'pending'),
            lambda p, s, d: s['api']['status'].__setitem__('observedGeneration', 0),
            lambda p, s, d: s['api']['status']['conditions'][0].__setitem__('status', 'False'),
            lambda p, s, d: s['api']['spec']['template']['spec'].__setitem__('serviceAccountName', 'unexpected'),
            lambda p, s, d: s['api']['spec']['template']['spec']['containers'][0].__setitem__('image', 'unexpected'),
            lambda p, s, d: s['web']['status']['traffic'][0].__setitem__('tag', 'preview'),
            lambda p, s, d: d.__setitem__('state', 'RUNNABLE'),
            lambda p, s, d: d['settings'].__setitem__('activationPolicy', 'ALWAYS'),
            lambda p, s, d: p.__setitem__('bootstrapRetired', False),
            lambda p, s, d: p.__setitem__('sessions', [{'action': 'start', 'status': 'passed'}]),
            lambda p, s, d: p['jobs']['drain']['status'].__setitem__('succeededCount', 0),
            lambda p, s, d: p['versions'].__setitem__('runtime', ''),
            lambda p, s, d: p['versions'].__setitem__('bootstrap', ''),
        ]
        for mutate in mutations:
            changed_prior = copy.deepcopy(prior)
            changed_services = copy.deepcopy(services)
            changed_database = copy.deepcopy(database)
            mutate(changed_prior, changed_services, changed_database)
            with self.assertRaises(AssertionError):
                activation.prepare_release_receipt(
                    changed_prior, self.trust_fixture(), 'samra-pay-test', candidate,
                    changed_services, changed_database,
                    self.iam_boundary_fixture(),
                    '2026-09-14T00:00:00+00:00',
                )

    def test_release_preparation_requires_a_new_candidate_and_trusted_prior(self):
        prior, services, database, candidate = self.release_fixture()
        for trust, changed_candidate in [
            ({'receiptSha256': 'short', 'anchors': [{}]}, candidate),
            ({'receiptSha256': 'f'*64, 'anchors': []}, candidate),
            (self.trust_fixture(), {'sourceSha': prior['sourceSha'], 'images': candidate['images']}),
            (self.trust_fixture(), {'sourceSha': candidate['sourceSha'], 'images': prior['images']}),
        ]:
            with self.assertRaises(AssertionError):
                activation.prepare_release_receipt(
                    prior, trust, 'samra-pay-test', changed_candidate,
                    services, database, self.iam_boundary_fixture(),
                    '2026-09-14T00:00:00+00:00',
                )

    def test_prior_receipt_hash_must_match_independent_value(self):
        prior, _, _, _ = self.release_fixture()
        prior_bytes = b'{"trusted":"receipt"}\n'
        digest = __import__('hashlib').sha256(prior_bytes).hexdigest()
        trust = activation.prior_receipt_trust(
            prior, prior_bytes, 'samra-pay-test', expected_hash=digest,
        )
        self.assertEqual(trust['receiptSha256'], digest)
        self.assertEqual(trust['anchors'], [{'type': 'independently-retained-receipt-sha256'}])
        with self.assertRaises(AssertionError):
            activation.prior_receipt_trust(
                prior, prior_bytes, 'samra-pay-test', expected_hash='0' * 64,
            )

    def baseline_evidence_fixture(self, prior):
        return {
            'project': 'samra-pay-test',
            'region': 'us-east4',
            'appSourceSha': prior['sourceSha'],
            'images': {
                key: value.rsplit('@', 1)[1]
                for key, value in prior['images'].items()
            },
            'secretVersions': copy.deepcopy(prior['versions']),
            'bootstrapRetired': {
                'databaseUserDeleted': True,
                'serviceAccountDisabled': True,
                'setupSecretDisabled': True,
                'readbackPassed': True,
            },
            'revisions': {
                'api': prior['services']['api']['status']['latestReadyRevisionName'],
                'customer-web': prior['services']['web']['status']['latestReadyRevisionName'],
            },
            'pausedReadback': {
                'databaseState': 'STOPPED',
                'activationPolicy': 'NEVER',
                'apiManualInstances': 0,
                'webManualInstances': 0,
                'revisionsUnchanged': True,
            },
            'databaseJobs': {
                action: action + '-execution'
                for action in ['bootstrap', 'migrate', 'audit-runtime', 'audit-reader', 'drain']
            },
            'databaseJobsResult': 'all-passed',
            'sessionShutdownRestart': 'start-stop-restart-stop-passed',
            'apiReadiness': 'passed-on-recorded-revision',
            'protectedMainMerge': {
                'commit': 'c' * 40,
                'includesAppSourceAsParent': True,
                'treeMatchesAppSource': True,
            },
            'sessions': copy.deepcopy(prior['sessions']),
            'productionChanges': False,
        }

    def test_committed_baseline_evidence_can_anchor_first_follow_on_release(self):
        prior, _, _, _ = self.release_fixture()
        evidence = self.baseline_evidence_fixture(prior)
        evidence_bytes = b'{"reviewed":"baseline"}\n'
        trust = activation.prior_receipt_trust(
            prior, b'{"retained":"receipt"}\n', 'samra-pay-test',
            baseline_evidence=evidence,
            baseline_path='docs/operations/evidence/baseline.json',
            baseline_bytes=evidence_bytes,
            baseline_expected_hash=hashlib.sha256(evidence_bytes).hexdigest(),
            baseline_commit='a' * 40,
            baseline_provenance_bytes=evidence_bytes,
        )
        self.assertEqual(trust['anchors'][0]['type'], 'git-tracked-baseline-evidence')
        self.assertEqual(trust['anchors'][0]['path'], 'docs/operations/evidence/baseline.json')

    def test_committed_baseline_rejects_every_bound_field_drift(self):
        prior, _, _, _ = self.release_fixture()
        mutations = [
            lambda p, e: e.__setitem__('project', 'samra-pay-dev'),
            lambda p, e: e.__setitem__('appSourceSha', '0' * 40),
            lambda p, e: e['images'].__setitem__('api', 'sha256:' + '0' * 64),
            lambda p, e: e['secretVersions'].__setitem__('runtime', '99'),
            lambda p, e: e['bootstrapRetired'].__setitem__('readbackPassed', False),
            lambda p, e: e['revisions'].__setitem__('api', 'unexpected'),
            lambda p, e: e['pausedReadback'].__setitem__('databaseState', 'RUNNABLE'),
            lambda p, e: e.__setitem__('databaseJobsResult', 'partial'),
            lambda p, e: e['databaseJobs'].__setitem__('drain', 'other'),
            lambda p, e: e['sessions'][-1].__setitem__('finishedAt', 'changed'),
            lambda p, e: e.__setitem__('productionChanges', True),
        ]
        for mutate in mutations:
            changed_prior = copy.deepcopy(prior)
            evidence = self.baseline_evidence_fixture(changed_prior)
            mutate(changed_prior, evidence)
            with self.assertRaises(AssertionError):
                activation.verify_prior_evidence(changed_prior, evidence, 'samra-pay-test')

    def test_project_identity_requires_exact_active_company_parent(self):
        project = {
            'projectId': 'samra-pay-test',
            'projectNumber': '378050809796',
            'lifecycleState': 'ACTIVE',
            'parent': {'type': 'organization', 'id': '993968777863'},
        }
        activation.verify_project_identity(
            project, 'samra-pay-test', '378050809796', '993968777863',
        )
        mutations = [
            ('projectId', 'other'),
            ('projectNumber', '1'),
            ('lifecycleState', 'DELETE_REQUESTED'),
        ]
        for key, value in mutations:
            changed = copy.deepcopy(project)
            changed[key] = value
            with self.assertRaises(AssertionError):
                activation.verify_project_identity(
                    changed, 'samra-pay-test', '378050809796', '993968777863',
                )
        for key, value in [('type', 'folder'), ('id', '1')]:
            changed = copy.deepcopy(project)
            changed['parent'][key] = value
            with self.assertRaises(AssertionError):
                activation.verify_project_identity(
                    changed, 'samra-pay-test', '378050809796', '993968777863',
                )

    def test_database_job_boundary_starts_and_verifies_database(self):
        self.policy = 'NEVER'
        with patch.object(activation, 'gcloud', side_effect=self.cloud):
            activation.ensure_database_running('samra-test-postgres', 'samra-pay-test')
        self.assertEqual(self.policy, 'ALWAYS')
        self.assertEqual(self.calls[0][:3], ('sql', 'instances', 'patch'))
        self.assertEqual(self.calls[1][:3], ('sql', 'instances', 'describe'))

    def test_database_job_boundary_fails_when_database_does_not_start(self):
        def stopped(*args, **_kwargs):
            if args[:3] == ('sql', 'instances', 'patch'):
                return {}
            if args[:3] == ('sql', 'instances', 'describe'):
                return {'state': 'STOPPED', 'settings': {'activationPolicy': 'NEVER'}}
            self.fail('Unexpected cloud operation')
        with patch.object(activation, 'gcloud', side_effect=stopped):
            with self.assertRaises(AssertionError):
                activation.ensure_database_running('samra-test-postgres', 'samra-pay-test')

    def test_direct_secret_accessor_readback_is_exact_and_unconditional(self):
        policy = {
            'bindings': [
                {'role': 'roles/viewer', 'members': ['group:operators@example.invalid']},
                {'role': 'roles/secretmanager.secretAccessor', 'members': ['serviceAccount:runtime@example.invalid']},
            ],
        }
        self.assertEqual(
            activation.direct_secret_accessors(policy),
            {'serviceAccount:runtime@example.invalid'},
        )
        policy['bindings'][1]['condition'] = {'expression': 'true'}
        with self.assertRaises(AssertionError):
            activation.direct_secret_accessors(policy)

    def test_release_preparation_rejects_active_cloud_operations(self):
        activation.assert_no_active_operations(
            [{'status': {'completionTime': '2026-09-14T00:00:00Z'}}],
            [{'status': 'DONE'}],
        )
        with self.assertRaises(AssertionError):
            activation.assert_no_active_operations([{'status': {}}], [])
        with self.assertRaises(AssertionError):
            activation.assert_no_active_operations([], [{'status': 'RUNNING'}])

    def candidate_fixture(self):
        receipt = copy.deepcopy(self.receipt)
        receipt.update({
            'phase': 'prepared-paused',
            'events': [{
                'number': 1,
                'action': 'prepare-release',
                'status': 'passed',
                'migrationImage': self.images['images']['migrations'],
                'execution': None,
                'startedAt': '2026-09-14T00:00:00+00:00',
                'finishedAt': '2026-09-14T00:00:00+00:00',
            }],
            'jobs': {},
            'versions': {
                'ca': '1',
                'migration': '2',
                'runtime': '3',
                'audit': '4',
                'bootstrap': '5',
            },
            'priorRelease': {
                'receiptSha256': 'f' * 64,
                'sourceSha': 'b' * 40,
            },
        })
        return receipt

    def advance_candidate(self, receipt, action, number, *, status='passed',
                          execution=None, details=None, migration_image=None):
        if status == 'passed' and action in activation.BOOTSTRAP_CHECKED_ACTIONS and details is None:
            details = {'bootstrapDatabaseAbsence': bootstrap_absence_fixture(
                receipt['project'].removeprefix('samra-pay-'),
                f'2026-09-14T00:00:{number * 2:02d}+00:00',
            )}
        return activation.advance_candidate_receipt(
            receipt,
            action,
            status=status,
            started_at=f'2026-09-14T00:00:{number * 2:02d}+00:00',
            finished_at=f'2026-09-14T00:00:{number * 2 + 1:02d}+00:00',
            migration_image=(migration_image
                             if migration_image is not None
                             else receipt['images']['migrations']),
            execution=execution,
            details=details,
        )

    def stopped_candidate(self):
        receipt = self.candidate_fixture()
        transitions = [
            ('migrate', 'migrated', 'migrate-execution', None),
            ('audit-runtime', 'runtime-audited', 'runtime-audit-execution', None),
            ('audit-reader', 'reader-audited', 'reader-audit-execution', None),
            ('deploy', 'deployed-paused', None, None),
            ('start', 'session-open', None, None),
            ('acceptance', 'session-open', None,
             {'acceptanceEvidenceSha256': '7' * 64}),
            ('drain', 'session-open', 'drain-execution', None),
            ('stop', 'stopped-tested', None, None),
        ]
        for number, (action, phase, execution, details) in enumerate(transitions, 2):
            receipt = self.advance_candidate(
                receipt, action, number, execution=execution, details=details,
            )
            self.assertEqual(receipt['phase'], phase)
        for action in ['migrate', 'audit-runtime', 'audit-reader', 'drain']:
            event = next(
                item for item in receipt['events']
                if item['action'] == action
            )
            receipt['jobs'][action] = {
                'execution': event['execution'],
                'image': receipt['images']['migrations'],
                'startedAt': event['startedAt'],
                'finishedAt': event['finishedAt'],
                'status': {'succeededCount': 1},
            }
            if action in activation.BOOTSTRAP_CHECKED_ACTIONS:
                receipt['jobs'][action]['bootstrapDatabaseAbsence'] = copy.deepcopy(
                    event['details']['bootstrapDatabaseAbsence'],
                )
        receipt['functionalAcceptance'] = {
            'status': 'passed',
            'evidenceSha256': '7' * 64,
            'testerCount': 2,
            'checks': {
                check: True for check in activation.ACCEPTANCE_CHECKS
            },
        }
        receipt['sessions'] = [{'action': 'stop', 'status': 'passed'}]
        return receipt

    def test_candidate_receipt_advances_in_order_with_append_only_bound_events(self):
        receipt = self.candidate_fixture()
        original = copy.deepcopy(receipt)
        expected = [
            ('migrate', 'migrated', 'migrate-execution'),
            ('audit-runtime', 'runtime-audited', 'runtime-audit-execution'),
            ('audit-reader', 'reader-audited', 'reader-audit-execution'),
            ('deploy', 'deployed-paused', None),
            ('start', 'session-open', None),
            ('acceptance', 'session-open', None),
            ('drain', 'session-open', 'drain-execution'),
            ('stop', 'stopped-tested', None),
        ]
        snapshots = []
        for number, (action, phase, execution) in enumerate(expected, 2):
            before = copy.deepcopy(receipt)
            details = ({'acceptanceEvidenceSha256': '7' * 64}
                       if action == 'acceptance' else None)
            receipt = self.advance_candidate(
                receipt, action, number, execution=execution, details=details,
            )
            self.assertEqual(before, snapshots[-1] if snapshots else original)
            self.assertEqual(receipt['phase'], phase)
            self.assertEqual(receipt['events'][:-1], before['events'])
            event = receipt['events'][-1]
            self.assertEqual(event['number'], number)
            self.assertEqual(event['action'], action)
            self.assertEqual(event['status'], 'passed')
            self.assertEqual(event['migrationImage'], self.images['images']['migrations'])
            self.assertEqual(event['execution'], execution)
            self.assertEqual(event['startedAt'], f'2026-09-14T00:00:{number * 2:02d}+00:00')
            self.assertEqual(event['finishedAt'], f'2026-09-14T00:00:{number * 2 + 1:02d}+00:00')
            if action == 'acceptance':
                self.assertEqual(event['details']['acceptanceEvidenceSha256'], '7' * 64)
            snapshots.append(copy.deepcopy(receipt))

        self.assertEqual(original['phase'], 'prepared-paused')
        self.assertEqual(len(original['events']), 1)
        self.assertEqual([event['number'] for event in receipt['events']], list(range(1, 10)))

    def test_candidate_receipt_rejects_out_of_order_and_replayed_jobs_without_mutation(self):
        receipt = self.candidate_fixture()
        for action, execution in [
            ('audit-runtime', 'runtime-audit-execution'),
            ('audit-reader', 'reader-audit-execution'),
            ('deploy', None),
            ('start', None),
            ('stop', None),
        ]:
            with self.subTest(action=action):
                before = copy.deepcopy(receipt)
                with self.assertRaises(AssertionError):
                    self.advance_candidate(receipt, action, 2, execution=execution)
                self.assertEqual(receipt, before)

        receipt = self.advance_candidate(
            receipt, 'migrate', 2, execution='migrate-execution',
        )
        for action, execution in [
            ('migrate', 'second-migrate-execution'),
            ('audit-runtime', 'migrate-execution'),
        ]:
            with self.subTest(action=action, execution=execution):
                before = copy.deepcopy(receipt)
                with self.assertRaises(AssertionError):
                    self.advance_candidate(receipt, action, 3, execution=execution)
                self.assertEqual(receipt, before)

    def test_candidate_event_binding_rejects_wrong_image_missing_job_execution_and_bad_time(self):
        receipt = self.candidate_fixture()
        attempts = [
            {
                'migration_image': 'migrations@sha256:' + '0' * 64,
                'execution': 'migrate-execution',
            },
            {'execution': None},
        ]
        for kwargs in attempts:
            with self.subTest(kwargs=kwargs):
                before = copy.deepcopy(receipt)
                with self.assertRaises(AssertionError):
                    self.advance_candidate(receipt, 'migrate', 2, **kwargs)
                self.assertEqual(receipt, before)

        before = copy.deepcopy(receipt)
        with self.assertRaises(AssertionError):
            activation.advance_candidate_receipt(
                receipt,
                'migrate',
                status='passed',
                started_at='2026-09-14T00:00:03+00:00',
                finished_at='2026-09-14T00:00:02+00:00',
                migration_image=receipt['images']['migrations'],
                execution='migrate-execution',
                details=None,
            )
        self.assertEqual(receipt, before)

    def test_current_action_failure_blocks_candidate_and_preserves_prior_events(self):
        receipt = self.advance_candidate(
            self.candidate_fixture(), 'migrate', 2, execution='migrate-execution',
        )
        prior_events = copy.deepcopy(receipt['events'])
        before = copy.deepcopy(receipt)
        blocked = self.advance_candidate(
            receipt,
            'audit-runtime',
            3,
            status='failed',
            execution='runtime-audit-execution',
        )
        self.assertIs(blocked, receipt)
        self.assertNotEqual(receipt, before)
        self.assertEqual(blocked['phase'], 'blocked-recovery-required')
        self.assertEqual(blocked['events'][:-1], prior_events)
        self.assertEqual(blocked['events'][-1]['status'], 'failed')
        self.assertEqual(blocked['events'][-1]['action'], 'audit-runtime')

        for action, execution in [
            ('audit-runtime', 'retry-execution'),
            ('audit-reader', 'reader-audit-execution'),
            ('deploy', None),
        ]:
            with self.subTest(action=action):
                unchanged = copy.deepcopy(blocked)
                with self.assertRaises(AssertionError):
                    self.advance_candidate(blocked, action, 4, execution=execution)
                self.assertEqual(blocked, unchanged)

    def test_seal_rejects_missing_or_failed_session_evidence(self):
        valid = self.stopped_candidate()
        mutations = [
            lambda receipt: receipt['events'][5].__setitem__('status', 'failed'),
            lambda receipt: receipt['events'][6].__setitem__('status', 'failed'),
            lambda receipt: receipt['events'][6]['details'].__setitem__(
                'acceptanceEvidenceSha256', 'short',
            ),
            lambda receipt: receipt['events'][7].__setitem__('status', 'failed'),
            lambda receipt: receipt['events'][8].__setitem__('status', 'failed'),
        ]
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / 'candidate.json'
            for mutate in mutations:
                changed = copy.deepcopy(valid)
                mutate(changed)
                before = copy.deepcopy(changed)
                with self.assertRaises(AssertionError):
                    activation.seal_candidate_receipt(
                        changed,
                        receipt_path,
                        started_at='2026-09-14T00:00:18+00:00',
                        finished_at='2026-09-14T00:00:19+00:00',
                        migration_image=changed['images']['migrations'],
                        execution=None,
                    )
                self.assertEqual(changed, before)
                self.assertFalse(receipt_path.exists())

    def test_seal_saves_canonical_receipt_then_returns_deterministic_file_hash(self):
        first = self.stopped_candidate()
        second = copy.deepcopy(first)
        with tempfile.TemporaryDirectory() as directory:
            first_path = Path(directory) / 'first.json'
            second_path = Path(directory) / 'second.json'
            first_hash = activation.seal_candidate_receipt(
                first,
                first_path,
                started_at='2026-09-14T00:00:20+00:00',
                finished_at='2026-09-14T00:00:21+00:00',
                migration_image=first['images']['migrations'],
                execution=None,
            )
            second_hash = activation.seal_candidate_receipt(
                second,
                second_path,
                started_at='2026-09-14T00:00:20+00:00',
                finished_at='2026-09-14T00:00:21+00:00',
                migration_image=second['images']['migrations'],
                execution=None,
            )

            self.assertEqual(first['phase'], 'sealed')
            self.assertEqual(first['events'][-1]['action'], 'seal')
            self.assertEqual(first['events'][-1]['number'], 10)
            self.assertEqual(first['events'][-1]['status'], 'passed')
            self.assertEqual(first_path.read_bytes(), second_path.read_bytes())
            self.assertEqual(first_hash, second_hash)
            self.assertEqual(first_hash, hashlib.sha256(first_path.read_bytes()).hexdigest())
            self.assertEqual(
                first_path.read_bytes(),
                (json.dumps(first, indent=2) + '\n').encode(),
            )

            saved = first_path.read_bytes()
            with self.assertRaises(AssertionError):
                activation.seal_candidate_receipt(
                    first,
                    first_path,
                    started_at='2026-09-14T00:00:22+00:00',
                    finished_at='2026-09-14T00:00:23+00:00',
                    migration_image=first['images']['migrations'],
                    execution=None,
                )
            self.assertEqual(first_path.read_bytes(), saved)

    def open_candidate(self):
        receipt = self.candidate_fixture()
        transitions = [
            ('migrate', 'migrate-execution', None),
            ('audit-runtime', 'runtime-audit-execution', None),
            ('audit-reader', 'reader-audit-execution', None),
            ('deploy', None, None),
            ('start', None, None),
            ('acceptance', None, {
                'acceptanceEvidenceSha256': '7' * 64,
            }),
        ]
        for number, (action, execution, details) in enumerate(transitions, 2):
            receipt = self.advance_candidate(
                receipt, action, number, execution=execution, details=details,
            )
        return receipt

    def blocked_partial_start_candidate(self):
        receipt = self.candidate_fixture()
        transitions = [
            ('migrate', 'migrate-execution'),
            ('audit-runtime', 'runtime-audit-execution'),
            ('audit-reader', 'reader-audit-execution'),
            ('deploy', None),
        ]
        for number, (action, execution) in enumerate(transitions, 2):
            receipt = self.advance_candidate(
                receipt, action, number, execution=execution,
            )
        receipt = self.advance_candidate(
            receipt, 'start', 6, status='failed', execution=None,
        )
        receipt['sessions'] = [{
            'action': 'start',
            'status': 'blocked-recovery-required',
        }]
        return receipt

    def blocked_after_passed_drain_candidate(self):
        receipt = self.open_candidate()
        receipt = self.advance_candidate(
            receipt, 'drain', 8, execution='drain-execution',
        )
        receipt['jobs']['drain'] = {
            'execution': 'drain-execution',
            'status': {'succeededCount': 1},
        }
        return self.advance_candidate(
            receipt, 'stop', 9, status='failed', execution=None,
        )

    def add_predecessor(self, receipt):
        registry = 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/'
        receipt['priorRelease']['images'] = {
            'api': registry + 'samra-api@sha256:' + '8' * 64,
            'customer-web': registry + 'samra-customer-web@sha256:' + '9' * 64,
            'migrations': registry + 'samra-migrations@sha256:' + '0' * 64,
        }
        receipt['priorRelease']['services'] = {
            'api': {
                'revision': 'samra-api-test-00000',
                'image': receipt['priorRelease']['images']['api'],
            },
            'web': {
                'revision': 'samra-customer-web-test-00000',
                'image': receipt['priorRelease']['images']['customer-web'],
            },
        }
        receipt['services'] = copy.deepcopy(self.receipt['services'])
        return receipt

    def predecessor_revisions(self, receipt):
        return {
            key: {
                'metadata': {'name': predecessor['revision']},
                'spec': {'containers': [{'image': predecessor['image']}]},
                'status': {
                    'conditions': [{'type': 'Ready', 'status': 'True'}],
                },
            }
            for key, predecessor in receipt['priorRelease']['services'].items()
        }

    @staticmethod
    def next_candidate():
        registry = 'us-east4-docker.pkg.dev/samra-pay-test/samra-test/'
        return {
            'sourceSha': 'c' * 40,
            'images': {
                'api': registry + 'samra-api@sha256:' + '4' * 64,
                'customer-web': (
                    registry + 'samra-customer-web@sha256:' + '5' * 64
                ),
                'migrations': (
                    registry + 'samra-migrations@sha256:' + '6' * 64
                ),
            },
        }

    def recovery_cloud(self, *args, **kwargs):
        if args[:3] == ('run', 'services', 'update-traffic'):
            self.calls.append(args)
            target = next(
                item.removeprefix('--to-revisions=')
                for item in args if item.startswith('--to-revisions=')
            )
            revision, percent = target.rsplit('=', 1)
            self.assertEqual(percent, '100')
            self.services[args[3]]['status']['traffic'] = [{
                'percent': 100,
                'revisionName': revision,
            }]
            return {}
        if args[:3] == ('run', 'revisions', 'describe'):
            self.calls.append(args)
            key = 'api' if args[3].startswith('samra-api-') else 'web'
            image = self.active_recovery_receipt['priorRelease']['services'][
                key
            ]['image']
            return {
                'metadata': {'name': args[3]},
                'spec': {'containers': [{'image': image}]},
                'status': {
                    'conditions': [{'type': 'Ready', 'status': 'True'}],
                },
            }
        return self.cloud(*args, **kwargs)

    @staticmethod
    def controlled_datetime(*values):
        instants = iter(
            RealDatetime.fromisoformat(value) for value in values
        )

        class ControlledDatetime:
            @classmethod
            def now(cls, _timezone):
                return next(instants)

            @classmethod
            def fromisoformat(cls, value):
                return RealDatetime.fromisoformat(value)

        return ControlledDatetime

    def run_rollback(self, receipt, drain_check):
        saved = []
        self.rollback_saves = saved
        self.active_recovery_receipt = receipt
        clock = self.controlled_datetime(
            '2026-09-14T00:00:20+00:00',
            '2026-09-14T00:00:21+00:00',
            '2026-09-14T00:00:22+00:00',
        )
        with patch.object(activation, 'gcloud', side_effect=self.recovery_cloud), \
             patch.object(activation, 'datetime', clock), \
             patch.object(activation.time, 'sleep', side_effect=lambda seconds: self.calls.append(('sleep', seconds))):
            result = activation.perform_candidate_rollback(
                receipt,
                'test',
                'samra-pay-test',
                'us-east4',
                'samra-test-postgres',
                drain_check,
                lambda: saved.append(copy.deepcopy(receipt)),
                'operator-requested',
            )
        return result, saved

    def test_candidate_drain_requires_internal_stop_owner(self):
        receipt = self.open_candidate()
        before = copy.deepcopy(receipt)

        with self.assertRaisesRegex(AssertionError, 'owned by the stop'):
            activation.validate_candidate_database_action(
                receipt, 'drain', stop_owned=False,
            )

        self.assertEqual(receipt, before)
        receipt['sessions'] = [{
            'action': 'stop',
            'status': 'in-progress',
        }]
        activation.validate_candidate_database_action(
            receipt, 'drain', stop_owned=True,
        )

    def test_candidate_stop_event_begins_after_child_drain_finishes(self):
        receipt = self.stopped_candidate()
        receipt['events'] = receipt['events'][:-2]
        receipt['phase'] = 'session-open'
        del receipt['jobs']['drain']
        receipt['sessions'] = []
        self.receipt = receipt
        saved = []

        def drain():
            self.assertEqual(receipt['sessions'][-1]['status'], 'in-progress')
            receipt['jobs']['drain'] = {
                'execution': 'drain-execution',
                'image': receipt['images']['migrations'],
                'startedAt': '2026-09-14T00:00:22+00:00',
                'finishedAt': '2026-09-14T00:00:23+00:00',
                'status': {'succeededCount': 1},
            }
            activation.advance_candidate_receipt(
                receipt,
                'drain',
                status='passed',
                started_at='2026-09-14T00:00:22+00:00',
                finished_at='2026-09-14T00:00:23+00:00',
                migration_image=receipt['images']['migrations'],
                execution='drain-execution',
            )

        clock = self.controlled_datetime(
            '2026-09-14T00:00:20+00:00',
            '2026-09-14T00:00:24+00:00',
            '2026-09-14T00:00:25+00:00',
        )
        with patch.object(activation, 'gcloud', side_effect=self.cloud), \
             patch.object(activation, 'datetime', clock), \
             patch.object(activation.time, 'sleep'):
            activation.control_session(
                'stop', 'test', {'projectNumber': '378050809796'},
                receipt,
                lambda: saved.append(json.loads(activation.serialized_receipt(receipt))),
                drain, lambda *_: None,
                lambda *_: None,
            )

        drain_event, stop_event = receipt['events'][-2:]
        self.assertEqual(drain_event['action'], 'drain')
        self.assertEqual(stop_event['action'], 'stop')
        self.assertGreaterEqual(
            RealDatetime.fromisoformat(stop_event['startedAt']),
            RealDatetime.fromisoformat(drain_event['finishedAt']),
        )
        self.assertNotEqual(
            stop_event['startedAt'], receipt['sessions'][-1]['startedAt'],
        )
        self.assertEqual(receipt['phase'], 'stopped-tested')
        self.assertEqual(receipt['sessions'][-1], {
            'action': 'stop',
            'startedAt': '2026-09-14T00:00:20+00:00',
            'finishedAt': '2026-09-14T00:00:24+00:00',
            'status': 'passed',
        })
        self.assertEqual(saved[-1], receipt)
        activation.validate_sealable_receipt(saved[-1])
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / 'candidate.json'
            activation.seal_candidate_receipt(
                receipt, receipt_path,
                started_at='2026-09-14T00:00:26+00:00',
                finished_at='2026-09-14T00:00:27+00:00',
                migration_image=receipt['images']['migrations'],
            )
            activation.validate_sealed_candidate_receipt(
                json.loads(receipt_path.read_bytes()),
            )

    def test_failed_candidate_drain_finalizes_current_stop_session(self):
        receipt = self.open_candidate()
        saved = []

        def drain():
            activation.advance_candidate_receipt(
                receipt, 'drain', status='failed',
                started_at='2026-09-14T00:00:22+00:00',
                finished_at='2026-09-14T00:00:23+00:00',
                migration_image=receipt['images']['migrations'],
                execution='unresolved:drain-execution',
                details={'failureReason': 'Unresolved synthetic transfer'},
            )
            raise RuntimeError('Unresolved synthetic transfer')

        clock = self.controlled_datetime(
            '2026-09-14T00:00:20+00:00',
            '2026-09-14T00:00:24+00:00',
        )
        with patch.object(activation, 'gcloud', side_effect=self.cloud), \
             patch.object(activation, 'datetime', clock), \
             patch.object(activation.time, 'sleep'), \
             self.assertRaisesRegex(RuntimeError, 'Unresolved synthetic transfer'):
            activation.control_session(
                'stop', 'test', {'projectNumber': '378050809796'},
                receipt,
                lambda: saved.append(json.loads(activation.serialized_receipt(receipt))),
                drain, lambda *_: None, lambda *_: None,
            )

        self.assertEqual(receipt['phase'], 'blocked-recovery-required')
        self.assertEqual(receipt['sessions'][-1], {
            'action': 'stop',
            'startedAt': '2026-09-14T00:00:20+00:00',
            'finishedAt': '2026-09-14T00:00:24+00:00',
            'status': 'blocked-recovery-required',
            'failureReason': 'Unresolved synthetic transfer',
        })
        self.assertEqual(saved[-1], receipt)
        self.assertEqual(receipt['events'][-1]['action'], 'drain')
        self.assertEqual(receipt['events'][-1]['status'], 'failed')
        self.assertEqual(self.policy, 'ALWAYS')
        self.assertEqual(self.services['samra-api-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'], '1')
        self.assertEqual(self.services['samra-customer-web-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'], '0')

    def test_pause_failure_after_passed_drain_finalizes_current_stop_session(self):
        receipt = self.open_candidate()
        saved = []

        def drain():
            activation.advance_candidate_receipt(
                receipt, 'drain', status='passed',
                started_at='2026-09-14T00:00:22+00:00',
                finished_at='2026-09-14T00:00:23+00:00',
                migration_image=receipt['images']['migrations'],
                execution='drain-execution',
            )

        def cloud(*args, **kwargs):
            if args[:3] == ('sql', 'instances', 'patch'):
                raise RuntimeError('Database pause failed')
            return self.cloud(*args, **kwargs)

        clock = self.controlled_datetime(
            '2026-09-14T00:00:20+00:00',
            '2026-09-14T00:00:24+00:00',
            '2026-09-14T00:00:25+00:00',
        )
        with patch.object(activation, 'gcloud', side_effect=cloud), \
             patch.object(activation, 'datetime', clock), \
             patch.object(activation.time, 'sleep'), \
             self.assertRaisesRegex(RuntimeError, 'Database pause failed'):
            activation.control_session(
                'stop', 'test', {'projectNumber': '378050809796'},
                receipt,
                lambda: saved.append(json.loads(activation.serialized_receipt(receipt))),
                drain, lambda *_: None, lambda *_: None,
            )

        self.assertEqual(receipt['phase'], 'blocked-recovery-required')
        self.assertEqual(receipt['sessions'][-1], {
            'action': 'stop',
            'startedAt': '2026-09-14T00:00:20+00:00',
            'finishedAt': '2026-09-14T00:00:24+00:00',
            'status': 'blocked-recovery-required',
            'failureReason': 'Database pause failed',
        })
        self.assertEqual(saved[-1], receipt)
        self.assertEqual(
            [(event['action'], event['status']) for event in receipt['events'][-2:]],
            [('drain', 'passed'), ('stop', 'failed')],
        )
        self.assertEqual(self.policy, 'ALWAYS')
        for name in ['samra-api-test', 'samra-customer-web-test']:
            self.assertEqual(self.services[name]['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'], '0')

    def test_partial_start_rollback_drains_before_pausing_and_routing(self):
        receipt = self.add_predecessor(
            self.blocked_partial_start_candidate(),
        )
        self.services['samra-customer-web-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'
        ] = '1'

        def drain_check():
            self.calls.append(('recovery-drain-check',))
            self.assertEqual(
                self.services['samra-customer-web-test']['metadata'][
                    'annotations'
                ]['run.googleapis.com/manualInstanceCount'],
                '0',
            )
            self.assertEqual(
                self.services['samra-api-test']['metadata']['annotations'][
                    'run.googleapis.com/manualInstanceCount'
                ],
                '1',
            )
            self.assertEqual(self.policy, 'ALWAYS')
            return {
                'execution': 'recovery-drain-execution',
                'status': {'succeededCount': 1},
            }

        result, saved = self.run_rollback(receipt, drain_check)

        self.assertEqual(result['databaseActivationPolicy'], 'NEVER')
        self.assertTrue(saved)
        self.assertEqual(receipt['phase'], 'rolled-back-paused')
        self.assertEqual(receipt['events'][-1]['action'], 'rollback')
        self.assertEqual(receipt['events'][-1]['status'], 'passed')
        self.assertEqual(
            receipt['events'][-1]['details']['trigger'],
            'operator-requested',
        )
        positions = {
            'web-close': next(
                index for index, call in enumerate(self.calls)
                if call[:4] == (
                    'run', 'services', 'update',
                    'samra-customer-web-test',
                )
            ),
            'wait': self.calls.index(('sleep', 65)),
            'drain': self.calls.index(('recovery-drain-check',)),
            'api-pause': next(
                index for index, call in enumerate(self.calls)
                if call[:4] == (
                    'run', 'services', 'update', 'samra-api-test',
                )
            ),
            'sql-pause': next(
                index for index, call in enumerate(self.calls)
                if call[:3] == ('sql', 'instances', 'patch')
            ),
            'api-route': next(
                index for index, call in enumerate(self.calls)
                if call[:4] == (
                    'run', 'services', 'update-traffic',
                    'samra-api-test',
                )
            ),
        }
        self.assertLess(positions['web-close'], positions['wait'])
        self.assertLess(positions['wait'], positions['drain'])
        self.assertLess(positions['drain'], positions['api-pause'])
        self.assertLess(positions['api-pause'], positions['sql-pause'])
        self.assertLess(positions['sql-pause'], positions['api-route'])

    def test_rollback_refreshes_passed_stop_drain_while_api_is_active(self):
        receipt = self.add_predecessor(
            self.blocked_after_passed_drain_candidate(),
        )
        drain_calls = []

        self.run_rollback(receipt, lambda: (
            drain_calls.append('called')
            or {
                'execution': 'fresh-recovery-drain-execution',
                'status': {'succeededCount': 1},
            }
        ))

        self.assertEqual(drain_calls, ['called'])
        self.assertIn(('sleep', 65), self.calls)
        self.assertEqual(self.policy, 'NEVER')
        self.assertEqual(
            self.services['samra-api-test']['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ],
            '0',
        )
        self.assertEqual(
            self.services['samra-customer-web-test']['status']['traffic'],
            [{
                'percent': 100,
                'revisionName': 'samra-customer-web-test-00000',
            }],
        )
        sql_pause = next(
            index for index, call in enumerate(self.calls)
            if call[:3] == ('sql', 'instances', 'patch')
        )
        first_route = next(
            index for index, call in enumerate(self.calls)
            if call[:3] == ('run', 'services', 'update-traffic')
        )
        self.assertLess(sql_pause, first_route)

    def test_rollback_reuses_passed_stop_drain_when_api_is_already_paused(self):
        receipt = self.add_predecessor(
            self.blocked_after_passed_drain_candidate(),
        )
        self.services['samra-api-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'
        ] = '0'
        drain_calls = []

        self.run_rollback(receipt, lambda: drain_calls.append('called'))

        self.assertEqual(drain_calls, [])
        self.assertNotIn(('sleep', 65), self.calls)
        self.assertEqual(self.policy, 'NEVER')
        self.assertEqual(
            self.services['samra-api-test']['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ],
            '0',
        )

    def test_rollback_drain_failure_preserves_workers_and_records_recovery(self):
        receipt = self.add_predecessor(
            self.blocked_partial_start_candidate(),
        )
        self.services['samra-customer-web-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'
        ] = '1'

        def fail_drain():
            self.calls.append(('recovery-drain-check',))
            raise RuntimeError('unresolved synthetic transfer')

        with self.assertRaisesRegex(RuntimeError, 'unresolved synthetic'):
            self.run_rollback(receipt, fail_drain)

        self.assertEqual(
            self.services['samra-customer-web-test']['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ],
            '0',
        )
        self.assertEqual(
            self.services['samra-api-test']['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ],
            '1',
        )
        self.assertEqual(self.policy, 'ALWAYS')
        self.assertFalse(any(
            call[:3] == ('run', 'services', 'update-traffic')
            for call in self.calls
        ))
        self.assertTrue(self.rollback_saves)
        self.assertEqual(receipt['phase'], 'blocked-recovery-required')
        self.assertEqual(receipt['events'][-1]['action'], 'rollback')
        self.assertEqual(receipt['events'][-1]['status'], 'failed')
        self.assertEqual(
            receipt['events'][-1]['details']['trigger'],
            'operator-requested',
        )

    def test_successful_rollback_is_terminal_for_recovery_and_normal_actions(self):
        receipt = self.add_predecessor(
            self.blocked_partial_start_candidate(),
        )
        self.run_rollback(receipt, lambda: {
            'execution': 'recovery-drain-execution',
            'status': {'succeededCount': 1},
        })
        before = copy.deepcopy(receipt)

        for action in activation.PHASE_TRANSITIONS:
            with self.subTest(action=action):
                with self.assertRaises(AssertionError):
                    activation.validate_candidate_action(receipt, action)
                self.assertEqual(receipt, before)
        with self.assertRaises(AssertionError):
            self.run_rollback(receipt, lambda: None)
        self.assertEqual(receipt, before)

    def test_new_candidate_can_use_exact_paused_rollback_as_predecessor(self):
        rolled_back = self.add_predecessor(
            self.blocked_partial_start_candidate(),
        )
        self.services['samra-customer-web-test']['metadata']['annotations'][
            'run.googleapis.com/manualInstanceCount'
        ] = '1'
        self.run_rollback(rolled_back, lambda: {
            'execution': 'recovery-drain-execution',
            'status': {'succeededCount': 1},
        })
        prior_bytes = activation.serialized_receipt(rolled_back)
        prior_hash = hashlib.sha256(prior_bytes).hexdigest()
        trust = activation.prior_receipt_trust(
            rolled_back, prior_bytes, 'samra-pay-test',
            expected_hash=prior_hash,
        )
        services = {
            'api': copy.deepcopy(self.services['samra-api-test']),
            'web': copy.deepcopy(self.services['samra-customer-web-test']),
        }
        revisions = self.predecessor_revisions(rolled_back)

        prepared = activation.prepare_release_receipt(
            rolled_back, trust, 'samra-pay-test', self.next_candidate(),
            services,
            {'state': 'STOPPED', 'settings': {'activationPolicy': 'NEVER'}},
            self.iam_boundary_fixture(),
            '2026-09-14T00:00:24+00:00',
            predecessor_revisions=revisions,
        )

        self.assertEqual(prepared['phase'], 'prepared-paused')
        self.assertEqual(prepared['priorRelease']['receiptSha256'], prior_hash)
        self.assertEqual(
            prepared['priorRelease']['trustAnchors'],
            [{'type': 'independently-retained-receipt-sha256'}],
        )
        self.assertEqual(
            prepared['priorRelease']['sourceSha'],
            rolled_back['priorRelease']['sourceSha'],
        )
        self.assertEqual(
            prepared['priorRelease']['images'],
            rolled_back['priorRelease']['images'],
        )
        self.assertNotEqual(
            prepared['priorRelease']['sourceSha'], rolled_back['sourceSha'],
        )
        for key in ['api', 'web']:
            active = rolled_back['rollback']['services'][key]
            recorded = prepared['priorRelease']['services'][key]
            self.assertEqual(recorded['revision'], active['revision'])
            self.assertEqual(recorded['image'], active['image'])
            self.assertTrue(recorded['activeByTraffic'])
            self.assertEqual(
                recorded['latestRevision'],
                services[key]['status']['latestReadyRevisionName'],
            )
            self.assertEqual(
                recorded['templateImage'],
                services[key]['spec']['template']['spec']['containers'][0][
                    'image'
                ],
            )

    def test_rollback_rebaseline_rejects_live_or_revision_drift(self):
        rolled_back = self.add_predecessor(
            self.blocked_partial_start_candidate(),
        )
        self.run_rollback(rolled_back, lambda: {
            'execution': 'recovery-drain-execution',
            'status': {'succeededCount': 1},
        })
        prior_bytes = activation.serialized_receipt(rolled_back)
        trust = activation.prior_receipt_trust(
            rolled_back, prior_bytes, 'samra-pay-test',
            expected_hash=hashlib.sha256(prior_bytes).hexdigest(),
        )
        services = {
            'api': copy.deepcopy(self.services['samra-api-test']),
            'web': copy.deepcopy(self.services['samra-customer-web-test']),
        }
        revisions = self.predecessor_revisions(rolled_back)
        database = {
            'state': 'STOPPED',
            'settings': {'activationPolicy': 'NEVER'},
        }
        attempts = [
            (
                'missing-revision-readback',
                lambda _receipt, _services, _database, revision: revision.clear(),
            ),
            (
                'revision-image',
                lambda _receipt, _services, _database, revision: revision[
                    'api'
                ]['spec']['containers'][0].__setitem__('image', 'unexpected'),
            ),
            (
                'revision-not-ready',
                lambda _receipt, _services, _database, revision: revision[
                    'web'
                ]['status']['conditions'][0].__setitem__('status', 'False'),
            ),
            (
                'active-traffic',
                lambda _receipt, changed, _database, _revision: changed['api'][
                    'status'
                ]['traffic'][0].__setitem__(
                    'revisionName', 'samra-api-test-00001'
                ),
            ),
            (
                'service-scale',
                lambda _receipt, changed, _database, _revision: changed['web'][
                    'metadata'
                ]['annotations'].__setitem__(
                    'run.googleapis.com/manualInstanceCount', '1'
                ),
            ),
            (
                'database-running',
                lambda _receipt, _services, changed, _revision: changed.update({
                    'state': 'RUNNABLE',
                    'settings': {'activationPolicy': 'ALWAYS'},
                }),
            ),
            (
                'rollback-result',
                lambda changed, _services, _database, _revision: changed[
                    'rollback'
                ].__setitem__('sourceSha', 'd' * 40),
            ),
            (
                'rollback-event-hash',
                lambda changed, _services, _database, _revision: changed[
                    'events'
                ][-1]['details'].__setitem__('rollbackResultSha256', '0' * 64),
            ),
            (
                'failed-rollback-event',
                lambda changed, _services, _database, _revision: (
                    changed['events'][-1].__setitem__('status', 'failed'),
                    changed.__setitem__('phase', 'blocked-recovery-required'),
                ),
            ),
            (
                'failed-recovery-attempt',
                lambda changed, _services, _database, _revision: changed[
                    'recoveryAttempts'
                ][-1].__setitem__('status', 'failed'),
            ),
        ]
        for name, mutate in attempts:
            with self.subTest(name=name):
                changed_receipt = copy.deepcopy(rolled_back)
                changed_services = copy.deepcopy(services)
                changed_database = copy.deepcopy(database)
                changed_revisions = copy.deepcopy(revisions)
                mutate(
                    changed_receipt, changed_services, changed_database,
                    changed_revisions,
                )
                with self.assertRaises(AssertionError):
                    activation.prepare_release_receipt(
                        changed_receipt, trust, 'samra-pay-test',
                        self.next_candidate(), changed_services,
                        changed_database, self.iam_boundary_fixture(),
                        '2026-09-14T00:00:24+00:00',
                        predecessor_revisions=changed_revisions,
                    )

    def test_only_verified_legacy_baseline_can_bridge_unsealed_receipt(self):
        legacy, services, database, candidate = self.release_fixture()
        prior_bytes = activation.serialized_receipt(legacy)
        independent = activation.prior_receipt_trust(
            legacy, prior_bytes, 'samra-pay-test',
            expected_hash=hashlib.sha256(prior_bytes).hexdigest(),
        )
        with self.assertRaisesRegex(
            AssertionError, 'Only the pinned legacy baseline',
        ):
            activation.prepare_release_receipt(
                legacy, independent, 'samra-pay-test', candidate, services,
                database, self.iam_boundary_fixture(),
                '2026-09-14T00:00:00+00:00',
            )

        evidence = self.baseline_evidence_fixture(legacy)
        evidence_bytes = b'{"reviewed":"baseline"}\n'
        baseline = activation.prior_receipt_trust(
            legacy, prior_bytes, 'samra-pay-test',
            baseline_evidence=evidence,
            baseline_path='docs/operations/evidence/baseline.json',
            baseline_bytes=evidence_bytes,
            baseline_expected_hash=hashlib.sha256(evidence_bytes).hexdigest(),
            baseline_commit='a' * 40,
            baseline_provenance_bytes=evidence_bytes,
        )
        prepared = activation.prepare_release_receipt(
            legacy, baseline, 'samra-pay-test', candidate, services, database,
            self.iam_boundary_fixture(), '2026-09-14T00:00:00+00:00',
        )
        self.assertEqual(
            prepared['priorRelease']['trustAnchors'][0]['type'],
            'git-tracked-baseline-evidence',
        )

    def test_follow_on_receipt_must_be_sealed_accepted_stopped_and_drained(self):
        sealed = self.stopped_candidate()
        with tempfile.TemporaryDirectory() as directory:
            activation.seal_candidate_receipt(
                sealed, Path(directory) / 'sealed.json',
                started_at='2026-09-14T00:00:20+00:00',
                finished_at='2026-09-14T00:00:21+00:00',
                migration_image=sealed['images']['migrations'],
            )
        sealed_bytes = activation.serialized_receipt(sealed)
        trust = activation.prior_receipt_trust(
            sealed, sealed_bytes, 'samra-pay-test',
            expected_hash=hashlib.sha256(sealed_bytes).hexdigest(),
        )
        services = copy.deepcopy(sealed['services'])
        for service in services.values():
            service['metadata']['annotations'][
                'run.googleapis.com/manualInstanceCount'
            ] = '0'
        database = {
            'state': 'STOPPED',
            'settings': {'activationPolicy': 'NEVER'},
        }
        prepared = activation.prepare_release_receipt(
            sealed, trust, 'samra-pay-test', self.next_candidate(), services,
            database, self.iam_boundary_fixture(),
            '2026-09-14T00:00:22+00:00',
        )
        self.assertEqual(prepared['phase'], 'prepared-paused')

        baseline_only = {
            'receiptSha256': trust['receiptSha256'],
            'anchors': [{'type': 'git-tracked-baseline-evidence'}],
        }
        mutations = [
            lambda receipt: receipt.__setitem__('phase', 'stopped-tested'),
            lambda receipt: receipt['events'][-1].__setitem__('status', 'failed'),
            lambda receipt: receipt['functionalAcceptance'].__setitem__(
                'status', 'failed'
            ),
            lambda receipt: receipt.__setitem__(
                'sessions', [{'action': 'start', 'status': 'passed'}]
            ),
            lambda receipt: receipt['jobs']['drain']['status'].__setitem__(
                'succeededCount', 0
            ),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(sealed)
            mutate(changed)
            with self.assertRaises(AssertionError):
                activation.prepare_release_receipt(
                    changed, baseline_only, 'samra-pay-test',
                    self.next_candidate(),
                    services, database, self.iam_boundary_fixture(),
                    '2026-09-14T00:00:22+00:00',
                )


class PromotionAcceptance(unittest.TestCase):
    SOURCE_SHA = 'a' * 40
    DIGESTS = {
        'api': 'sha256:' + '1' * 64,
        'customer-web': 'sha256:' + '2' * 64,
        'migrations': 'sha256:' + '3' * 64,
    }

    def images(self, env):
        registry = f'us-east4-docker.pkg.dev/samra-pay-{env}/samra-{env}/'
        return {
            'sourceSha': self.SOURCE_SHA,
            'images': {
                key: f'{registry}samra-{key}@{digest}'
                for key, digest in self.DIGESTS.items()
            },
        }

    def sealed_dev_receipt(self):
        images = self.images('dev')
        def event(number, action, started, finished, execution=None,
                  details=None):
            value = {
                'number': number,
                'action': action,
                'status': 'passed',
                'migrationImage': images['images']['migrations'],
                'execution': execution,
                'startedAt': f'2026-09-14T00:00:{started:02d}+00:00',
                'finishedAt': f'2026-09-14T00:00:{finished:02d}+00:00',
            }
            if action in activation.BOOTSTRAP_CHECKED_ACTIONS:
                details = {'bootstrapDatabaseAbsence': bootstrap_absence_fixture(
                    'dev', value['startedAt'],
                )}
            if details:
                value['details'] = details
            return value
        receipt = {
            'project': 'samra-pay-dev',
            **copy.deepcopy(images),
            'phase': 'sealed',
            'sealedAt': '2026-09-14T00:00:19+00:00',
            'events': [
                event(1, 'prepare-release', 0, 0),
                event(2, 'migrate', 1, 2, 'migrate-execution'),
                event(3, 'audit-runtime', 3, 4, 'runtime-execution'),
                event(4, 'audit-reader', 5, 6, 'reader-execution'),
                event(5, 'deploy', 7, 8),
                event(6, 'start', 9, 10),
                event(
                    7, 'acceptance', 11, 12, details={
                        'acceptanceEvidenceSha256': '7' * 64,
                    },
                ),
                event(8, 'drain', 13, 14, 'drain-execution'),
                event(9, 'stop', 15, 16),
                event(10, 'seal', 18, 19),
            ],
            'sessions': [{'action': 'stop', 'status': 'passed'}],
            'jobs': {},
            'functionalAcceptance': {
                'status': 'passed',
                'evidenceSha256': '7' * 64,
                'testerCount': 2,
                'checks': {
                    check: True for check in activation.ACCEPTANCE_CHECKS
                },
            },
            'priorRelease': {'receiptSha256': 'f' * 64},
        }
        for action in ['migrate', 'audit-runtime', 'audit-reader', 'drain']:
            bound_event = next(
                item for item in receipt['events']
                if item['action'] == action
            )
            receipt['jobs'][action] = {
                'execution': bound_event['execution'],
                'image': receipt['images']['migrations'],
                'startedAt': bound_event['startedAt'],
                'finishedAt': bound_event['finishedAt'],
                'status': {'succeededCount': 1},
            }
            if action in activation.BOOTSTRAP_CHECKED_ACTIONS:
                receipt['jobs'][action]['bootstrapDatabaseAbsence'] = copy.deepcopy(
                    bound_event['details']['bootstrapDatabaseAbsence'],
                )
        data = (json.dumps(receipt, indent=2) + '\n').encode()
        return receipt, data, hashlib.sha256(data).hexdigest()

    def acceptance_fixture(self, env='test'):
        images = self.images(env)
        receipt = {
            'project': f'samra-pay-{env}',
            **copy.deepcopy(images),
            'services': {
                'api': {
                    'status': {
                        'latestReadyRevisionName': f'samra-api-{env}-00042',
                    },
                },
                'web': {
                    'status': {
                        'latestReadyRevisionName': f'samra-customer-web-{env}-00042',
                    },
                },
            },
        }
        evidence = {
            'schemaVersion': 1,
            'environment': env,
            'project': receipt['project'],
            'sourceSha': receipt['sourceSha'],
            'status': 'passed',
            'syntheticOnly': True,
            'productionChanges': False,
            'testerCount': 2,
            'imageDigests': copy.deepcopy(self.DIGESTS),
            'revisions': {
                'api': receipt['services']['api']['status']['latestReadyRevisionName'],
                'customer-web': receipt['services']['web']['status']['latestReadyRevisionName'],
            },
            'checks': {
                check: True for check in activation.ACCEPTANCE_CHECKS
            },
            'observedAt': '2026-09-14T00:00:12+00:00',
        }
        return receipt, evidence

    def test_dev_promotion_binds_exact_source_digests_seal_acceptance_stop_and_drain(self):
        receipt, receipt_bytes, receipt_hash = self.sealed_dev_receipt()

        promotion = activation.verify_dev_promotion(
            receipt, receipt_bytes, receipt_hash, self.images('test'),
        )

        self.assertEqual(promotion, {
            'devReceiptSha256': receipt_hash,
            'sourceSha': self.SOURCE_SHA,
            'imageDigests': self.DIGESTS,
            'sealedAt': '2026-09-14T00:00:19+00:00',
        })

    def test_dev_promotion_rejects_hash_cross_environment_and_unsealed_receipts(self):
        receipt, receipt_bytes, receipt_hash = self.sealed_dev_receipt()
        attempts = [
            ('hash', receipt, '0' * 64, self.images('test')),
            (
                'cross-environment',
                {**copy.deepcopy(receipt), 'project': 'samra-pay-test'},
                None,
                self.images('test'),
            ),
            (
                'unsealed',
                {**copy.deepcopy(receipt), 'phase': 'stopped-tested'},
                None,
                self.images('test'),
            ),
        ]
        for name, changed, override_hash, candidate in attempts:
            with self.subTest(name=name):
                changed_bytes = (
                    receipt_bytes if name == 'hash'
                    else (json.dumps(changed, indent=2) + '\n').encode()
                )
                expected_hash = (
                    override_hash
                    or hashlib.sha256(changed_bytes).hexdigest()
                )
                with self.assertRaises(AssertionError):
                    activation.verify_dev_promotion(
                        changed, changed_bytes, expected_hash, candidate,
                    )

    def test_dev_promotion_rejects_every_release_binding_mismatch(self):
        receipt, _, _ = self.sealed_dev_receipt()
        attempts = [
            (
                'source', receipt,
                {**self.images('test'), 'sourceSha': 'b' * 40},
            ),
            (
                'digest', receipt,
                {
                    **self.images('test'),
                    'images': {
                        **self.images('test')['images'],
                        'api': (
                            'us-east4-docker.pkg.dev/samra-pay-test/samra-test/'
                            'samra-api@sha256:' + '9' * 64
                        ),
                    },
                },
            ),
            (
                'seal-event',
                {
                    **copy.deepcopy(receipt),
                    'events': copy.deepcopy(receipt['events'][:-1]),
                },
                self.images('test'),
            ),
            (
                'acceptance',
                {
                    **copy.deepcopy(receipt),
                    'events': copy.deepcopy(receipt['events'][1:]),
                },
                self.images('test'),
            ),
            (
                'stop',
                {
                    **copy.deepcopy(receipt),
                    'sessions': [{'action': 'start', 'status': 'passed'}],
                },
                self.images('test'),
            ),
            (
                'drain',
                {
                    **copy.deepcopy(receipt),
                    'jobs': {'drain': {'status': {'succeededCount': 0}}},
                },
                self.images('test'),
            ),
        ]
        for name, changed, candidate in attempts:
            with self.subTest(name=name):
                changed_bytes = (json.dumps(changed, indent=2) + '\n').encode()
                with self.assertRaises(AssertionError):
                    activation.verify_dev_promotion(
                        changed,
                        changed_bytes,
                        hashlib.sha256(changed_bytes).hexdigest(),
                        candidate,
                    )

    def test_acceptance_binds_exact_two_synthetic_users_checks_revisions_and_images(self):
        receipt, evidence = self.acceptance_fixture()

        summary = activation.verify_acceptance_evidence(
            evidence, receipt, 'test',
        )

        self.assertEqual(summary, {
            'observedAt': '2026-09-14T00:00:12+00:00',
            'checks': evidence['checks'],
            'testerCount': 2,
        })

    def test_acceptance_rejects_user_scope_checks_revision_image_and_production_drift(self):
        receipt, evidence = self.acceptance_fixture()
        attempts = [
            ('one-tester', lambda changed: changed.__setitem__('testerCount', 1)),
            ('three-testers', lambda changed: changed.__setitem__('testerCount', 3)),
            ('not-synthetic', lambda changed: changed.__setitem__('syntheticOnly', False)),
            ('production', lambda changed: changed.__setitem__('productionChanges', True)),
            (
                'missing-check',
                lambda changed: changed['checks'].pop('consentCompleted'),
            ),
            (
                'extra-check',
                lambda changed: changed['checks'].__setitem__('anonymousHealthCheck', True),
            ),
            (
                'failed-check',
                lambda changed: changed['checks'].__setitem__('syntheticTransferCompleted', False),
            ),
            (
                'revision',
                lambda changed: changed['revisions'].__setitem__('api', 'other'),
            ),
            (
                'image',
                lambda changed: changed['imageDigests'].__setitem__(
                    'api', 'sha256:' + '9' * 64,
                ),
            ),
            (
                'cross-environment',
                lambda changed: changed.__setitem__('environment', 'dev'),
            ),
        ]
        for name, mutate in attempts:
            with self.subTest(name=name):
                changed = copy.deepcopy(evidence)
                mutate(changed)
                with self.assertRaises(AssertionError):
                    activation.verify_acceptance_evidence(
                        changed, receipt, 'test',
                    )

    def test_real_dev_and_test_baseline_evidence_matches_inventory_hash_and_git_bytes(self):
        repository = Path(__file__).resolve().parents[2]
        inventory = json.loads(
            (repository / 'deploy/gcp/dev-test-environments.json').read_text()
        )
        expected = {
            'dev': {
                'path': 'docs/operations/evidence/2026-09-14-dev-runtime-baseline-reconciliation.json',
                'sha256': 'f5e4d198578e6d7341a3f3cd2486bad3ce44871060f0c0bb9417d9ab2f260101',
            },
            'test': {
                'path': 'docs/operations/evidence/2026-09-14-test-runtime-baseline-reconciliation.json',
                'sha256': '80230ff7dab2ce5b4bb56ebcdff956ebb77ee9a1015783e6f68884871fea80db',
            },
        }
        for env, pinned in expected.items():
            with self.subTest(environment=env):
                configured = inventory['environments'][env]
                self.assertEqual(configured['runtimeEvidence'], pinned['path'])
                self.assertEqual(configured['runtimeEvidenceSha256'], pinned['sha256'])
                self.assertEqual(
                    configured['runtimeEvidenceCommit'],
                    '32286e63745d96adcb3f4b98dd4027a14ca86e25',
                )

                evidence_path = repository / pinned['path']
                evidence_bytes = evidence_path.read_bytes()
                self.assertEqual(
                    hashlib.sha256(evidence_bytes).hexdigest(), pinned['sha256'],
                )
                evidence = json.loads(evidence_bytes)
                self.assertEqual(evidence['project'], configured['projectId'])
                self.assertEqual(
                    evidence['appSourceSha'],
                    '836f76bd368e9d81c633d7483e48b907c42ef775',
                )
                self.assertIs(evidence['productionChanges'], False)

                reconciliation = evidence['reconciliation']
                original_pin = reconciliation['originalActivation']
                original_bytes = (repository / original_pin['path']).read_bytes()
                self.assertEqual(hashlib.sha256(original_bytes).hexdigest(), original_pin['sha256'])
                original = json.loads(original_bytes)
                for key in ('appSourceSha', 'images', 'secretVersions', 'bootstrapRetired',
                            'revisions', 'protectedMainMerge'):
                    self.assertEqual(evidence[key], original[key])
                self.assertEqual(evidence['sessions'][:-2], original['sessions'])
                self.assertEqual(evidence['sessions'][-1]['action'], 'stop')
                self.assertEqual(evidence['sessions'][-1]['status'], 'passed')
                drain = reconciliation['latestDrainLiveReadback']
                self.assertEqual(evidence['databaseJobs']['drain'], drain['execution'])
                self.assertNotEqual(drain['execution'], original['databaseJobs']['drain'])
                self.assertEqual(drain['succeededCount'], 1)
                self.assertLessEqual(
                    activation.validate_timestamp(evidence['sessions'][-1]['startedAt']),
                    activation.validate_timestamp(drain['startedAt']),
                )
                self.assertLessEqual(
                    activation.validate_timestamp(drain['completedAt']),
                    activation.validate_timestamp(evidence['sessions'][-1]['finishedAt']),
                )
                for action in ('bootstrap', 'migrate', 'audit-runtime', 'audit-reader'):
                    self.assertEqual(evidence['databaseJobs'][action], original['databaseJobs'][action])
                self.assertIs(evidence['functionalAcceptance'], False)
                self.assertIs(reconciliation['noCloudMutationPerformed'], True)

                provenance = subprocess.run(
                    [
                        'git', '-C', str(repository), 'show',
                        configured['runtimeEvidenceCommit'] + ':' + pinned['path'],
                    ],
                    check=False,
                    capture_output=True,
                )
                self.assertEqual(
                    provenance.returncode, 0, provenance.stderr.decode(),
                )
                self.assertEqual(provenance.stdout, evidence_bytes)


class BootstrapDatabaseRetirement(unittest.TestCase):
    def setUp(self):
        fixture = Sessions()
        fixture.setUp()
        prior, services, _, images = fixture.release_fixture()
        value = json.dumps([prior, services, images])
        for before, after in [
            ('samra-pay-test', 'samra-pay-dev'),
            ('samra-test', 'samra-dev'),
            ('samra-api-test', 'samra-api-dev'),
            ('samra-customer-web-test', 'samra-customer-web-dev'),
        ]:
            value = value.replace(before, after)
        self.prior, self.services, self.images = json.loads(value)
        self.prior['services'] = copy.deepcopy(self.services)
        self.boundary = {'schemaVersion': 1, 'targets': {'synthetic-test': {}}}
        self.trust = fixture.trust_fixture()
        self.candidate = activation.prepare_release_receipt(
            self.prior, self.trust, 'samra-pay-dev', self.images,
            self.services, {'state': 'STOPPED', 'settings': {'activationPolicy': 'NEVER'}},
            self.boundary, '2026-09-14T00:00:00+00:00',
        )
        self.policy = 'NEVER'
        self.calls = []
        self.users = [{'name': 'postgres'}, {'name': 'samra_audit_dev'}]
        self.invoker = {'bindings': [{'role': 'roles/run.invoker', 'members': [
            'serviceAccount:samra-customer-web-dev@samra-pay-dev.iam.gserviceaccount.com',
        ]}]}

    def cloud(self, *args, **_kwargs):
        self.calls.append(args)
        if args[:4] == ('artifacts', 'docker', 'images', 'describe'):
            return {}
        if args[:2] == ('projects', 'describe'):
            return {'projectId': 'samra-pay-dev', 'projectNumber': '829811168658',
                    'lifecycleState': 'ACTIVE',
                    'parent': {'type': 'organization', 'id': '993968777863'}}
        if args[:3] == ('sql', 'instances', 'describe'):
            return {'state': 'RUNNABLE' if self.policy == 'ALWAYS' else 'STOPPED',
                    'settings': {'activationPolicy': self.policy, 'ipConfiguration': {
                        'ipv4Enabled': False, 'sslMode': 'ENCRYPTED_ONLY',
                        'serverCaMode': 'GOOGLE_MANAGED_INTERNAL_CA',
                        'privateNetwork': 'projects/samra-pay-dev/global/networks/samra-dev-vpc',
                    }}, 'ipAddresses': [{'type': 'PRIVATE', 'ipAddress': '10.61.0.3'}]}
        if args[:3] == ('sql', 'instances', 'patch'):
            self.policy = args[-1].split('=')[1]
            return {}
        if args[:3] == ('sql', 'users', 'list'):
            if self.policy != 'ALWAYS':
                raise RuntimeError('HTTP 400 Invalid request since instance is not running')
            if isinstance(self.users, Exception):
                raise self.users
            return copy.deepcopy(self.users)
        if args[:3] == ('secrets', 'versions', 'describe'):
            return {'state': 'DISABLED' if '--secret=samra-dev-database-setup' in args else 'ENABLED'}
        if args[:2] == ('secrets', 'get-iam-policy'):
            roles = {
                'samra-dev-database-url': ['api'],
                'samra-dev-migration-database-url': ['migrations'],
                'samra-dev-audit-database-url': ['audit'],
                'samra-dev-database-ca': ['api', 'migrations', 'audit'],
                'samra-dev-database-setup': [],
            }[args[2]]
            return {'bindings': [] if not roles else [{
                'role': 'roles/secretmanager.secretAccessor',
                'members': [f'serviceAccount:samra-{role}-dev@samra-pay-dev.iam.gserviceaccount.com' for role in roles],
            }]}
        if args[:3] == ('iam', 'service-accounts', 'describe'):
            return {'disabled': args[3].startswith('samra-bootstrap-')}
        if args[:4] == ('run', 'jobs', 'executions', 'list') or args[:3] == ('sql', 'operations', 'list'):
            return []
        if args[:3] == ('run', 'services', 'describe'):
            return copy.deepcopy(self.services['api' if args[3] == 'samra-api-dev' else 'web'])
        if args[:3] == ('run', 'services', 'update'):
            self.assertEqual(args[3], 'samra-customer-web-dev')
            self.assertEqual(args[-1], '--scaling=0')
            self.services['web']['metadata']['annotations']['run.googleapis.com/manualInstanceCount'] = '0'
            return {}
        if args[:3] == ('run', 'services', 'get-iam-policy'):
            return copy.deepcopy(self.invoker)
        if args[:3] == ('run', 'jobs', 'deploy'):
            saved = json.loads(self.receipt_path.read_text())
            job = (saved['recoveryJobs'][-1] if args[3] == 'samra-db-drain-recovery-dev'
                   else next(reversed(saved['jobs'].values())))
            if args[3].startswith('samra-db-drain-'):
                self.assertNotIn('bootstrapDatabaseAbsence', job)
            else:
                self.assertIs(job['bootstrapDatabaseAbsence']['absent'], True)
            self.assertIsNone(job['execution'])
            return {}
        if args[:3] == ('run', 'jobs', 'execute'):
            return {'metadata': {'name': args[3]+'-execution'}, 'status': {'succeededCount': 1}}
        self.fail('Unexpected Google Cloud operation: '+repr(args))

    def receipt_before(self, action):
        receipt = copy.deepcopy(self.candidate)
        for number, prior_action in enumerate(['migrate', 'audit-runtime', 'audit-reader'], 1):
            if prior_action == action:
                break
            started = f'2026-09-14T00:00:0{number * 2}+00:00'
            finished = f'2026-09-14T00:00:0{number * 2 + 1}+00:00'
            absence = bootstrap_absence_fixture('dev', started)
            activation.advance_candidate_receipt(
                receipt, prior_action, status='passed', started_at=started,
                finished_at=finished, migration_image=receipt['images']['migrations'],
                execution=prior_action+'-prior-execution',
                details={'bootstrapDatabaseAbsence': absence},
            )
            receipt['jobs'][prior_action] = {
                'execution': prior_action+'-prior-execution',
                'status': {'succeededCount': 1}, 'bootstrapDatabaseAbsence': absence,
            }
        return receipt

    def command(self, action, job_action=None, receipt=None, missing_check=False, drain_only=False):
        with tempfile.TemporaryDirectory(prefix='samra-bootstrap-check-test-') as directory:
            root = Path(directory)
            images_path, prior_path = root/'images.json', root/'prior.json'
            self.receipt_path = root/'candidate.json'
            images_path.write_text(json.dumps(self.images))
            prior_path.write_text(json.dumps(self.prior))
            args = ['dev', action, '--images', str(images_path), '--receipt', str(self.receipt_path)]
            if action == 'prepare-release':
                args += ['--prior-receipt', str(prior_path), '--prior-receipt-sha256', 'f'*64]
            else:
                self.receipt_path.write_text(json.dumps(receipt or self.candidate))
            if job_action:
                args += ['--job-action', job_action]
            original_check = activation.read_bootstrap_database_absence
            original_session = activation.control_session
            original_rollback = activation.perform_candidate_rollback

            def stop_drain(_action, _env, _inventory, receipt, save, drain_job, *_args):
                receipt['sessions'] = [{'action': 'stop', 'status': 'in-progress'}]
                save()
                return drain_job()

            def recovery_drain(_receipt, _env, _project, _region, _instance, drain_check, *_args):
                return drain_check()

            with patch.object(activation, 'gcloud', side_effect=self.cloud), \
                 patch.object(activation, 'read_effective_iam_boundary', return_value=self.boundary), \
                 patch.object(activation, 'prior_receipt_trust', return_value=self.trust), \
                 patch.object(activation, 'acquire_environment_lock', return_value=True), \
                 patch.object(activation, 'read_bootstrap_database_absence',
                              side_effect=(lambda *_: None) if missing_check else original_check), \
                 patch.object(activation, 'control_session', side_effect=stop_drain if drain_only else original_session), \
                 patch.object(activation, 'perform_candidate_rollback', side_effect=recovery_drain if drain_only else original_rollback), \
                 patch('builtins.print'):
                error = None
                try:
                    activation.main(args)
                except Exception as caught:
                    error = caught
            return json.loads(self.receipt_path.read_text()), error

    def test_preparation_does_not_query_users_or_start_stopped_sql(self):
        receipt, error = self.command('prepare-release')
        self.assertIsNone(error)
        self.assertEqual(receipt['phase'], 'prepared-paused')
        self.assertTrue(receipt['bootstrapRetired'])
        self.assertEqual(self.policy, 'NEVER')
        self.assertFalse(any(call[:3] in {
            ('sql', 'users', 'list'), ('sql', 'instances', 'patch'),
        } for call in self.calls))

    def test_normal_database_jobs_check_live_absence_after_start_before_deploy(self):
        for action in ['migrate', 'audit-runtime', 'audit-reader']:
            with self.subTest(action=action):
                self.calls = []
                self.policy = 'NEVER' if action == 'migrate' else 'ALWAYS'
                receipt, error = self.command('database-job', action, self.receipt_before(action))
                self.assertIsNone(error)
                commands = [call[:3] for call in self.calls]
                start = commands.index(('sql', 'instances', 'patch'))
                running = commands.index(('sql', 'instances', 'describe'), start)
                listed = commands.index(('sql', 'users', 'list'))
                deployed = commands.index(('run', 'jobs', 'deploy'))
                executed = commands.index(('run', 'jobs', 'execute'))
                self.assertLess(start, running)
                self.assertLess(running, listed)
                self.assertLess(listed, deployed)
                self.assertLess(deployed, executed)
                event_check = receipt['events'][-1]['details']['bootstrapDatabaseAbsence']
                self.assertEqual(event_check, receipt['jobs'][action]['bootstrapDatabaseAbsence'])
                self.assertEqual(set(event_check), {'project','instance','principal','absent','checkedAt'})

    def test_absence_failure_or_missing_result_blocks_every_normal_database_job(self):
        invalid = [
            [{'name': 'samra_bootstrap_dev'}],
            RuntimeError('Google Cloud operation failed: sql users list'),
            None, False, {}, {'items': []}, [None], [{}], [{'name': ''}], [{'name': False}],
        ]
        for action in ['migrate', 'audit-runtime', 'audit-reader']:
            for users in invalid:
                with self.subTest(action=action, result=users):
                    self.calls = []
                    self.policy = 'NEVER' if action == 'migrate' else 'ALWAYS'
                    self.users = users
                    receipt, error = self.command('database-job', action, self.receipt_before(action))
                    self.assertIsNotNone(error)
                    self.assertEqual(receipt['phase'], 'blocked-recovery-required')
                    self.assertEqual(receipt['events'][-1]['status'], 'failed')
                    self.assertIsNone(receipt['jobs'][action]['execution'])
                    self.assertEqual(self.policy, 'ALWAYS')
                    self.assertFalse(any(call[:3] in {
                        ('run', 'jobs', 'deploy'), ('run', 'jobs', 'execute'),
                    } for call in self.calls))
        self.calls = []
        self.policy = 'NEVER'
        receipt, error = self.command('database-job', 'migrate', missing_check=True)
        self.assertIsNotNone(error)
        self.assertEqual(receipt['phase'], 'blocked-recovery-required')
        self.assertFalse(any(call[:2] == ('run', 'jobs') and call[2] in {'deploy','execute'} for call in self.calls))

    def session_receipt(self):
        receipt = self.receipt_before('deploy')
        for number, action in enumerate(['deploy', 'start'], 4):
            activation.advance_candidate_receipt(
                receipt, action, status='passed',
                started_at=f'2026-09-14T00:00:{number * 2:02d}+00:00',
                finished_at=f'2026-09-14T00:00:{number * 2 + 1:02d}+00:00',
                migration_image=receipt['images']['migrations'],
            )
        return receipt

    def test_missing_or_invalid_live_check_blocks_deployment_and_acceptance(self):
        valid = bootstrap_absence_fixture('dev', '2026-09-14T00:00:02+00:00')
        checks = [None, False, {}, {**valid, 'absent': False}, {**valid, 'absent': 1},
                  {**valid, 'project': 'samra-pay-test'},
                  {**valid, 'principal': 'samra_bootstrap_test'},
                  {**valid, 'checkedAt': '2026-09-14T00:00:00+00:00'},
                  {**valid, 'extra': True}]
        for action in ['deploy', 'record-acceptance']:
            for check in checks:
                with self.subTest(action=action, check=check):
                    self.calls = []
                    receipt = self.receipt_before('deploy') if action == 'deploy' else self.session_receipt()
                    receipt['events'][1]['details'] = {'bootstrapDatabaseAbsence': check}
                    _, error = self.command(action, receipt=receipt)
                    self.assertIsInstance(error, AssertionError)
                    self.assertIn('bootstrap', str(error).lower())
                    self.assertFalse(any(call[:3] in {
                        ('run', 'jobs', 'deploy'), ('run', 'jobs', 'execute'),
                        ('run', 'services', 'update'), ('sql', 'instances', 'patch'),
                    } or call[:2] == ('run', 'deploy') for call in self.calls))

    def test_stop_and_recovery_drains_do_not_depend_on_users_list(self):
        for action in ['stop', 'rollback']:
            for users in [[{'name': 'samra_bootstrap_dev'}], RuntimeError('users.list unavailable')]:
                with self.subTest(action=action, users=users):
                    self.calls = []
                    self.users = users
                    self.policy = 'ALWAYS'
                    receipt, error = self.command(action, receipt=self.session_receipt(), drain_only=True)
                    self.assertIsNone(error)
                    self.assertFalse(any(call[:3] == ('sql', 'users', 'list') for call in self.calls))
                    executed = [call for call in self.calls if call[:3] == ('run', 'jobs', 'execute')]
                    self.assertEqual(len(executed), 1)
                    self.assertTrue(executed[0][3].startswith('samra-db-drain-'))
                    if action == 'stop':
                        self.assertEqual(receipt['events'][-1]['action'], 'drain')
                        self.assertEqual(receipt['events'][-1]['status'], 'passed')
                    else:
                        self.assertEqual(receipt['recoveryJobs'][-1]['status']['succeededCount'], 1)


class EffectiveIamBoundary(unittest.TestCase):
    permission = 'secretmanager.versions.access'
    required = 'serviceAccount:samra-api-test@samra-pay-test.iam.gserviceaccount.com'
    admin_one = 'user:platform-one@example.invalid'
    admin_two = 'user:platform-two@example.invalid'
    predefined_role = 'roles/secretmanager.secretAccessor'
    project_role = 'projects/samra-pay-test/roles/samraSecretReader'
    organization_role = 'organizations/993968777863/roles/samraSecretAuditor'

    def role_definitions(self):
        return {
            self.predefined_role: {
                'name': self.predefined_role,
                'stage': 'GA',
                'includedPermissions': [
                    'resourcemanager.projects.get',
                    self.permission,
                ],
            },
            self.project_role: {
                'name': self.project_role,
                'stage': 'GA',
                'includedPermissions': [
                    self.permission,
                    'resourcemanager.projects.get',
                ],
            },
            self.organization_role: {
                'name': self.organization_role,
                'stage': 'BETA',
                'includedPermissions': [self.permission],
            },
            'roles/viewer': {
                'name': 'roles/viewer',
                'stage': 'GA',
                'includedPermissions': ['resourcemanager.projects.get'],
            },
        }

    def target(self, policies=None, required=None):
        return {
            'runtime-secret': {
                'resource': (
                    '//secretmanager.googleapis.com/projects/378050809796/'
                    'secrets/samra-test-runtime-database-url'
                ),
                'permission': self.permission,
                'requiredPrincipals': (
                    [self.required] if required is None else required
                ),
                'policies': policies if policies is not None else [
                    {
                        'scope': 'resource',
                        'policy': {'bindings': [{
                            'role': self.predefined_role,
                            'members': [self.required],
                        }]},
                    },
                ],
            },
        }

    def test_resource_project_and_organization_grants_form_stable_canonical_summary(self):
        policies = [
            {
                'scope': 'resource',
                'policy': {'bindings': [
                    {
                        'role': 'roles/viewer',
                        'members': ['group:irrelevant@example.invalid'],
                        'condition': {'expression': 'true'},
                    },
                    {
                        'role': self.predefined_role,
                        'members': [self.required],
                    },
                ]},
            },
            {
                'scope': 'project',
                'policy': {'bindings': [{
                    'role': self.project_role,
                    'members': [self.admin_two],
                }]},
            },
            {
                'scope': 'organization',
                'policy': {'bindings': [{
                    'role': self.organization_role,
                    'members': [self.admin_one],
                }]},
            },
        ]
        definitions = self.role_definitions()
        first = activation.analyze_effective_iam(
            self.target(policies),
            definitions,
            [self.admin_two, self.admin_one],
        )

        expected_bindings = [
            {
                'scope': 'resource',
                'role': self.predefined_role,
                'roleDefinitionSha256': activation.canonical_hash({
                    'name': self.predefined_role,
                    'stage': 'GA',
                    'includedPermissions': [
                        'resourcemanager.projects.get',
                        self.permission,
                    ],
                }),
                'members': [self.required],
            },
            {
                'scope': 'project',
                'role': self.project_role,
                'roleDefinitionSha256': activation.canonical_hash({
                    'name': self.project_role,
                    'stage': 'GA',
                    'includedPermissions': [
                        'resourcemanager.projects.get',
                        self.permission,
                    ],
                }),
                'members': [self.admin_two],
            },
            {
                'scope': 'organization',
                'role': self.organization_role,
                'roleDefinitionSha256': activation.canonical_hash({
                    'name': self.organization_role,
                    'stage': 'BETA',
                    'includedPermissions': [self.permission],
                }),
                'members': [self.admin_one],
            },
        ]
        expected = {
            'runtime-secret': {
                'resource': (
                    '//secretmanager.googleapis.com/projects/378050809796/'
                    'secrets/samra-test-runtime-database-url'
                ),
                'permission': self.permission,
                'principals': sorted([
                    self.required,
                    self.admin_one,
                    self.admin_two,
                ]),
                'bindings': sorted(
                    expected_bindings,
                    key=activation.canonical_hash,
                ),
            },
        }
        self.assertEqual(first, expected)

        reordered_definitions = copy.deepcopy(definitions)
        for definition in reordered_definitions.values():
            definition['includedPermissions'] = list(reversed(
                definition['includedPermissions'],
            ))
        reordered_definitions[self.project_role]['includedPermissions'].append(
            self.permission,
        )
        reordered_policies = copy.deepcopy(list(reversed(policies)))
        reordered_policies[-1]['policy']['bindings'].reverse()
        second = activation.analyze_effective_iam(
            self.target(reordered_policies),
            reordered_definitions,
            [self.admin_one, self.admin_two],
        )
        self.assertEqual(second, expected)
        self.assertEqual(
            activation.canonical_hash(second),
            activation.canonical_hash(first),
        )

    def test_unexpected_service_account_is_rejected_even_with_required_principal(self):
        policies = self.target()['runtime-secret']['policies'] + [{
            'scope': 'project',
            'policy': {'bindings': [{
                'role': self.project_role,
                'members': [
                    'serviceAccount:unexpected@samra-pay-test.iam.gserviceaccount.com',
                ],
            }]},
        }]
        with self.assertRaisesRegex(AssertionError, 'Unexpected effective IAM principal'):
            activation.analyze_effective_iam(
                self.target(policies),
                self.role_definitions(),
                [self.admin_one],
            )

    def test_group_domain_public_and_dynamic_principals_are_rejected(self):
        unreviewable = [
            'group:platform@example.invalid',
            'domain:example.invalid',
            'allUsers',
            'allAuthenticatedUsers',
            'principal://iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/pool/subject/name',
            'principalSet://iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/pool/group/team',
        ]
        for member in unreviewable:
            with self.subTest(member=member):
                policies = [{
                    'scope': 'organization',
                    'policy': {'bindings': [{
                        'role': self.organization_role,
                        'members': [member],
                    }]},
                }]
                with self.assertRaisesRegex(
                    AssertionError,
                    'Group, domain, public or dynamic protected IAM grant',
                ):
                    activation.analyze_effective_iam(
                        self.target(policies, required=[]),
                        self.role_definitions(),
                        [],
                    )

    def test_only_conditions_on_permission_relevant_bindings_are_blocking(self):
        policies = self.target()['runtime-secret']['policies'] + [{
            'scope': 'project',
            'policy': {'bindings': [{
                'role': 'roles/viewer',
                'members': ['group:platform@example.invalid'],
                'condition': {'expression': 'request.time < timestamp("2030-01-01T00:00:00Z")'},
            }]},
        }]
        summary = activation.analyze_effective_iam(
            self.target(policies),
            self.role_definitions(),
            [],
        )
        self.assertEqual(summary['runtime-secret']['principals'], [self.required])
        self.assertEqual(len(summary['runtime-secret']['bindings']), 1)

        relevant = copy.deepcopy(policies)
        relevant[0]['policy']['bindings'][0]['condition'] = {
            'expression': 'request.time < timestamp("2030-01-01T00:00:00Z")',
        }
        with self.assertRaisesRegex(
            AssertionError,
            'Conditional protected IAM grant requires independent review',
        ):
            activation.analyze_effective_iam(
                self.target(relevant),
                self.role_definitions(),
                [],
            )

    def test_unresolved_deleted_and_malformed_roles_are_rejected(self):
        cases = []

        unresolved_targets = self.target()
        unresolved_targets['runtime-secret']['policies'][0]['policy']['bindings'][0][
            'role'
        ] = 'projects/samra-pay-test/roles/notRead'
        cases.append((
            'unresolved',
            unresolved_targets,
            self.role_definitions(),
            'IAM role definition was not read',
        ))

        deleted = self.role_definitions()
        deleted[self.predefined_role]['deleted'] = True
        cases.append((
            'deleted',
            self.target(),
            deleted,
            'Deleted IAM role cannot establish access',
        ))

        wrong_name = self.role_definitions()
        wrong_name[self.predefined_role]['name'] = 'roles/other'
        cases.append((
            'wrong-name',
            self.target(),
            wrong_name,
            'IAM role definition name changed',
        ))

        missing_permissions = self.role_definitions()
        del missing_permissions[self.predefined_role]['includedPermissions']
        cases.append((
            'missing-permissions',
            self.target(),
            missing_permissions,
            'IAM role permissions are unavailable',
        ))

        malformed_permissions = self.role_definitions()
        malformed_permissions[self.predefined_role]['includedPermissions'] = [
            self.permission,
            '',
        ]
        cases.append((
            'malformed-permissions',
            self.target(),
            malformed_permissions,
            'IAM role permissions are malformed',
        ))

        malformed_binding = self.target()
        del malformed_binding['runtime-secret']['policies'][0]['policy']['bindings'][0]['role']
        cases.append((
            'malformed-binding',
            malformed_binding,
            self.role_definitions(),
            'IAM binding role is malformed',
        ))

        for name, targets, definitions, message in cases:
            with self.subTest(case=name):
                with self.assertRaisesRegex(AssertionError, message):
                    activation.analyze_effective_iam(targets, definitions, [])

    def test_project_and_organization_custom_role_descriptions_are_scope_bound(self):
        calls = []

        def describe(*args, **_kwargs):
            calls.append(args)
            return {'name': args[3]}

        with patch.object(activation, 'gcloud', side_effect=describe):
            activation.describe_iam_role(
                self.project_role,
                'samra-pay-test',
                '993968777863',
            )
            activation.describe_iam_role(
                self.organization_role,
                'samra-pay-test',
                '993968777863',
            )
        self.assertEqual(calls, [
            (
                'iam', 'roles', 'describe', 'samraSecretReader',
                '--project=samra-pay-test',
            ),
            (
                'iam', 'roles', 'describe', 'samraSecretAuditor',
                '--organization=993968777863',
            ),
        ])
        for role in [
            'projects/other/roles/samraSecretReader',
            'organizations/1/roles/samraSecretAuditor',
            'samraSecretReader',
        ]:
            with self.subTest(role=role):
                with self.assertRaisesRegex(
                    AssertionError,
                    'IAM role scope is outside the approved project and organization',
                ):
                    activation.describe_iam_role(
                        role,
                        'samra-pay-test',
                        '993968777863',
                    )

    def test_missing_required_principal_is_rejected(self):
        policies = [{
            'scope': 'project',
            'policy': {'bindings': [{
                'role': self.project_role,
                'members': [self.admin_one],
            }]},
        }]
        with self.assertRaisesRegex(
            AssertionError,
            'Required effective IAM principal is missing',
        ):
            activation.analyze_effective_iam(
                self.target(policies),
                self.role_definitions(),
                [self.admin_one],
            )


if __name__ == '__main__':
    unittest.main()
