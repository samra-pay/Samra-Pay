"""Synthetic control-plane failure checks; never call Google Cloud."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('activation', Path(__file__).with_name('activate-dev-test.py'))
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


class Sessions(unittest.TestCase):
    def setUp(self):
        self.images = {'sourceSha': 'a' * 40, 'images': {'api': 'api@sha256:' + '1'*64, 'customer-web': 'web@sha256:' + '2'*64}}
        self.receipt = {'project': 'samra-pay-test', **copy.deepcopy(self.images), 'bootstrapRetired': True, 'services': {}}
        self.services = {}
        for key, image in [('api', 'api'), ('web', 'customer-web')]:
            name = 'samra-api-test' if key == 'api' else 'samra-customer-web-test'
            self.services[name] = {
                'metadata': {'annotations': {'run.googleapis.com/scalingMode': 'manual', 'run.googleapis.com/manualInstanceCount': '1'}},
                'spec': {'template': {'spec': {'timeoutSeconds': 60, 'containers': [{'image': self.images['images'][image]}]}}, 'traffic': []},
                'status': {'latestReadyRevisionName': name + '-00001', 'traffic': [{'percent': 100, 'revisionName': name + '-00001'}]},
            }
            self.receipt['services'][key] = copy.deepcopy(self.services[name])
        self.calls = []
        self.policy = 'ALWAYS'
        self.drained = False

    def cloud(self, *args, **kwargs):
        self.calls.append(args)
        if args[:3] == ('run', 'services', 'describe'):
            return copy.deepcopy(self.services[args[3]])
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

    def run_session(self, action, drain=None, ready=None):
        with patch.object(activation, 'gcloud', side_effect=self.cloud), patch.object(activation.time, 'sleep') as sleep:
            activation.control_session(action, 'test', {'projectNumber': '378050809796'}, self.receipt, lambda: None, drain or self.drain, ready or (lambda *_: None))
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

    def test_tagged_traffic_rejected_before_mutation(self):
        self.services['samra-customer-web-test']['status']['traffic'][0]['tag'] = 'preview'
        with self.assertRaises(AssertionError): self.run_session('stop')
        self.assertTrue(all(c[2] == 'describe' for c in self.calls))

    def test_changed_revision_rejected_before_mutation(self):
        self.services['samra-api-test']['status']['latestReadyRevisionName'] = 'unexpected'
        with self.assertRaises(AssertionError): self.run_session('start')
        self.assertTrue(all(c[2] == 'describe' for c in self.calls))

    def test_receipt_cannot_be_reused_for_other_source_project_or_images(self):
        activation.verify_receipt(self.receipt, 'samra-pay-test', self.images)
        for key, value in [('sourceSha', 'b'*40), ('images', {'api': 'other'}), ('project', 'samra-pay-dev')]:
            changed = copy.deepcopy(self.receipt)
            changed[key] = value
            with self.assertRaises(AssertionError): activation.verify_receipt(changed, 'samra-pay-test', self.images)


if __name__ == '__main__':
    unittest.main()
