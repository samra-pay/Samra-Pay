#!/usr/bin/env python3
"""Operator-run native Dev/Test setup. No production target or credential output."""
import argparse
import copy
import fcntl
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def atomic_write_bytes(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        dir=path.parent, prefix='.' + path.name + '.', suffix='.tmp',
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def acquire_receipt_lock(path):
    lock_path = Path(str(path) + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    stream = lock_path.open('a+', encoding='utf-8')
    try:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        stream.close()
        raise RuntimeError('Another controller process owns this receipt') from error
    return stream


def acquire_environment_lock(environment):
    assert environment in {'dev', 'test'}, 'Environment lock scope is invalid'
    target = Path(tempfile.gettempdir()) / (
        'samra-pay-' + environment + '-release-controller'
    )
    return acquire_receipt_lock(target)


def gcloud(*args, data=None):
    result = subprocess.run(['gcloud', *args, '--quiet', '--format=json'], input=data,
                            text=True, capture_output=True)
    if result.returncode:
        # gcloud errors may echo secret flags. Do not emit raw output.
        raise RuntimeError('Google Cloud operation failed: ' + ' '.join(args[:3]))
    return json.loads(result.stdout) if result.stdout.strip() else None


def secret(project, name, data, member):
    gcloud('secrets', 'create', name, '--project='+project,
           '--replication-policy=user-managed', '--locations=us-east4')
    result = gcloud('secrets', 'versions', 'add', name, '--project='+project,
                    '--data-file=-', data=data)
    version = result['name'].rsplit('/', 1)[1]
    assert version.isdigit()
    gcloud('secrets', 'add-iam-policy-binding', name, '--project='+project,
           '--member=serviceAccount:'+member, '--role=roles/secretmanager.secretAccessor')
    return version


def verify_receipt(receipt, project, images):
    assert receipt['project'] == project, 'Receipt belongs to another project'
    assert receipt['sourceSha'] == images['sourceSha'], 'Receipt belongs to another source revision'
    assert receipt['images'] == images['images'], 'Receipt image digests changed'


def direct_secret_accessors(policy):
    """Return direct, unconditional accessor bindings on one secret.

    This deliberately does not claim to evaluate inherited IAM. The release
    runbook requires a separate effective-access review of the project
    hierarchy before a Dev/Test session can start.
    """
    bindings = [
        binding for binding in policy.get('bindings', [])
        if binding.get('role') == 'roles/secretmanager.secretAccessor'
    ]
    assert all(not binding.get('condition') for binding in bindings), 'Conditional secret access requires review'
    return {
        member
        for binding in bindings
        for member in binding.get('members', [])
    }


def canonical_hash(value):
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()


def canonical_role_definition(role, definition):
    assert definition.get('name') == role, 'IAM role definition name changed'
    assert definition.get('deleted') is not True, 'Deleted IAM role cannot establish access'
    permissions = definition.get('includedPermissions')
    assert isinstance(permissions, list), 'IAM role permissions are unavailable'
    assert all(isinstance(permission, str) and permission for permission in permissions), 'IAM role permissions are malformed'
    canonical = {
        'name': role,
        'stage': definition.get('stage'),
        'includedPermissions': sorted(set(permissions)),
    }
    return canonical, canonical_hash(canonical)


def analyze_effective_iam(targets, role_definitions, approved_administrators):
    """Conservatively union resource and ancestor allow policies.

    Deny and principal-access-boundary policies can only reduce the resulting
    access. Unknown groups, domains, principal sets and relevant conditions are
    rejected rather than interpreted as harmless.
    """
    approved_administrators = set(approved_administrators)
    assert all(member.startswith('user:') for member in approved_administrators), 'Administrative IAM principals must be explicit users'
    result = {}
    role_cache = {}
    for target_name, target in targets.items():
        permission = target['permission']
        allowed = set(target['requiredPrincipals']) | approved_administrators
        required = set(target['requiredPrincipals'])
        principals = set()
        relevant = []
        for scoped_policy in target['policies']:
            scope = scoped_policy['scope']
            policy = scoped_policy['policy']
            assert isinstance(policy, dict), 'IAM policy readback is missing'
            for binding in policy.get('bindings', []):
                role = binding.get('role')
                assert isinstance(role, str) and role, 'IAM binding role is malformed'
                if role not in role_cache:
                    assert role in role_definitions, 'IAM role definition was not read'
                    role_cache[role] = canonical_role_definition(role, role_definitions[role])
                definition, definition_hash = role_cache[role]
                if permission not in definition['includedPermissions']:
                    continue
                assert not binding.get('condition'), 'Conditional protected IAM grant requires independent review'
                members = binding.get('members')
                assert isinstance(members, list) and members, 'Protected IAM binding has no readable principals'
                for member in members:
                    assert isinstance(member, str) and (member.startswith('user:') or member.startswith('serviceAccount:')), 'Group, domain, public or dynamic protected IAM grant requires independent review'
                    assert member in allowed, 'Unexpected effective IAM principal'
                    principals.add(member)
                relevant.append({
                    'scope': scope,
                    'role': role,
                    'roleDefinitionSha256': definition_hash,
                    'members': sorted(members),
                })
        assert required <= principals, 'Required effective IAM principal is missing'
        result[target_name] = {
            'resource': target['resource'],
            'permission': permission,
            'principals': sorted(principals),
            'bindings': sorted(relevant, key=lambda item: canonical_hash(item)),
        }
    return result


def describe_iam_role(role, project, organization_id):
    if role.startswith('roles/'):
        return gcloud('iam', 'roles', 'describe', role)
    project_prefix = 'projects/' + project + '/roles/'
    organization_prefix = 'organizations/' + organization_id + '/roles/'
    if role.startswith(project_prefix):
        return gcloud('iam', 'roles', 'describe', role[len(project_prefix):],
                      '--project='+project)
    if role.startswith(organization_prefix):
        return gcloud('iam', 'roles', 'describe', role[len(organization_prefix):],
                      '--organization='+organization_id)
    raise AssertionError('IAM role scope is outside the approved project and organization')


def read_effective_iam_boundary(env, project, project_number, organization_id,
                                identities, names, approved_administrators):
    project_policy = gcloud('projects', 'get-iam-policy', project)
    organization_policy = gcloud('organizations', 'get-iam-policy', organization_id)
    inherited = [
        {'scope': 'project', 'policy': project_policy},
        {'scope': 'organization', 'policy': organization_policy},
    ]
    target_specs = {}
    required_secret_principals = {
        'runtime': {'serviceAccount:'+identities['api']},
        'migration': {'serviceAccount:'+identities['migrations']},
        'audit': {'serviceAccount:'+identities['audit']},
        'ca': {
            'serviceAccount:'+identities['api'],
            'serviceAccount:'+identities['migrations'],
            'serviceAccount:'+identities['audit'],
        },
        'bootstrap': set(),
    }
    direct_secret_expectations = required_secret_principals | {'bootstrap': set()}
    for key, required in required_secret_principals.items():
        policy = gcloud('secrets', 'get-iam-policy', names[key], '--project='+project)
        assert direct_secret_accessors(policy) == direct_secret_expectations[key], 'Direct secret accessor boundary changed'
        target_specs['secret-'+key] = {
            'resource': f'//secretmanager.googleapis.com/projects/{project_number}/secrets/{names[key]}',
            'permission': 'secretmanager.versions.access',
            'requiredPrincipals': sorted(required),
            'policies': [{'scope': 'resource', 'policy': policy}, *inherited],
        }
    api_name = 'samra-api-' + env
    api_policy = gcloud('run', 'services', 'get-iam-policy', api_name,
                        '--project='+project, '--region=us-east4')
    expected_invoker = 'serviceAccount:' + identities['customer-web']
    bindings = [binding for binding in api_policy.get('bindings', [])
                if binding.get('role') == 'roles/run.invoker']
    assert len(bindings) == 1 and not bindings[0].get('condition') and set(bindings[0].get('members', [])) == {expected_invoker}, 'Unexpected direct API invocation binding'
    target_specs['private-api'] = {
        'resource': f'//run.googleapis.com/projects/{project}/locations/us-east4/services/{api_name}',
        'permission': 'run.routes.invoke',
        'requiredPrincipals': [expected_invoker],
        'policies': [{'scope': 'resource', 'policy': api_policy}, *inherited],
    }

    roles = {
        binding.get('role')
        for target in target_specs.values()
        for scoped_policy in target['policies']
        for binding in scoped_policy['policy'].get('bindings', [])
    }
    assert None not in roles, 'IAM binding role is missing'
    definitions = {
        role: describe_iam_role(role, project, organization_id)
        for role in sorted(roles)
    }
    return {
        'schemaVersion': 1,
        'organizationId': organization_id,
        'approvedAdministrativePrincipals': sorted(approved_administrators),
        'targets': analyze_effective_iam(
            target_specs, definitions, approved_administrators,
        ),
    }


def verify_current_iam_boundary(receipt, current):
    assert receipt.get('iamBoundary') == current, 'Effective IAM boundary changed after release preparation'


PHASE_TRANSITIONS = {
    'migrate': ('prepared-paused', 'migrated'),
    'audit-runtime': ('migrated', 'runtime-audited'),
    'audit-reader': ('runtime-audited', 'reader-audited'),
    'deploy': ('reader-audited', 'deployed-paused'),
    'start': ('deployed-paused', 'session-open'),
    'acceptance': ('session-open', 'session-open'),
    'drain': ('session-open', 'session-open'),
    'stop': ('session-open', 'stopped-tested'),
    'seal': ('stopped-tested', 'sealed'),
}

BOOTSTRAP_CHECKED_ACTIONS = {'migrate', 'audit-runtime', 'audit-reader'}

ROLLBACK_PHASES = {
    'prepared-paused',
    'migrated',
    'runtime-audited',
    'reader-audited',
    'deployed-paused',
    'session-open',
    'stopped-unaccepted',
    'stopped-tested',
    'blocked-recovery-required',
}


def validate_timestamp(value):
    assert isinstance(value, str) and value, 'Release event timestamp is missing'
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert parsed.tzinfo is not None, 'Release event timestamp must include a timezone'
    return parsed


def validate_bootstrap_database_absence(check, receipt, started_at, finished_at):
    assert isinstance(check, dict) and set(check) == {
        'project', 'instance', 'principal', 'absent', 'checkedAt',
    }, 'Live bootstrap database absence evidence is missing or malformed'
    project = receipt.get('project')
    assert project in {'samra-pay-dev', 'samra-pay-test'}, 'Unexpected bootstrap check project'
    env = project.removeprefix('samra-pay-')
    assert check['project'] == project, 'Bootstrap database check project changed'
    assert check['instance'] == 'samra-'+env+'-postgres', 'Bootstrap database check instance changed'
    assert check['principal'] == 'samra_bootstrap_'+env, 'Bootstrap database check principal changed'
    assert check['absent'] is True, 'Bootstrap database absence was not verified'
    observed = validate_timestamp(check['checkedAt'])
    assert validate_timestamp(started_at) <= observed <= validate_timestamp(finished_at), 'Bootstrap database check is outside its job attempt'


def verify_candidate_history(receipt):
    assert receipt.get('priorRelease'), 'Candidate release metadata is missing'
    events = receipt.get('events')
    assert isinstance(events, list) and events, 'Candidate event history is missing'
    phase = 'genesis'
    previous_finished = None
    seen_actions = set()
    executions = set()
    for number, event in enumerate(events, 1):
        assert event.get('number') == number, 'Candidate event history is not append-only'
        assert event.get('migrationImage') == receipt.get('images', {}).get('migrations'), 'Candidate event image changed'
        started = validate_timestamp(event.get('startedAt'))
        finished = validate_timestamp(event.get('finishedAt'))
        assert finished >= started, 'Candidate event finished before it started'
        if previous_finished is not None:
            assert started >= previous_finished, 'Candidate event timestamps are not monotonic'
        previous_finished = finished
        action = event.get('action')
        status = event.get('status')
        assert status in {'passed', 'failed'}, 'Candidate event status is invalid'
        if number == 1:
            assert action == 'prepare-release' and status == 'passed', 'Candidate preparation event is invalid'
            assert event.get('execution') is None, 'Candidate preparation cannot claim an execution'
            phase = 'prepared-paused'
            seen_actions.add(action)
            continue
        if action == 'rollback':
            assert phase in ROLLBACK_PHASES, 'Rollback event is out of order'
            assert event.get('execution') is None, 'Rollback cannot claim a database execution'
            details = event.get('details')
            assert isinstance(details, dict) and isinstance(details.get('trigger'), str), 'Rollback evidence is missing'
            if status == 'passed':
                assert re.fullmatch('[a-f0-9]{64}', details.get('rollbackResultSha256', '')), 'Rollback result hash is missing'
            phase = ('rolled-back-paused' if status == 'passed'
                     else 'blocked-recovery-required')
            seen_actions.add(action)
            continue
        assert action in PHASE_TRANSITIONS, 'Candidate event action is unsupported'
        assert action not in seen_actions, 'Candidate release action was replayed'
        expected_phase, next_phase = PHASE_TRANSITIONS[action]
        assert phase == expected_phase, 'Candidate event history is out of order'
        execution = event.get('execution')
        if action in {'migrate', 'audit-runtime', 'audit-reader', 'drain'}:
            assert isinstance(execution, str) and execution, 'Database event execution is missing'
            assert execution not in executions, 'Database execution was reused'
            executions.add(execution)
        else:
            assert execution is None, 'Non-database event claims a database execution'
        if action == 'acceptance':
            assert re.fullmatch('[a-f0-9]{64}', event.get('details', {}).get('acceptanceEvidenceSha256', '')), 'Acceptance evidence hash is missing'
        if status == 'passed' and action in BOOTSTRAP_CHECKED_ACTIONS:
            details = event.get('details')
            assert isinstance(details, dict), 'Live bootstrap database absence evidence is missing'
            validate_bootstrap_database_absence(
                details.get('bootstrapDatabaseAbsence'), receipt,
                event['startedAt'], event['finishedAt'],
            )
        if status == 'passed' and action == 'stop' and 'acceptance' not in seen_actions:
            phase = 'stopped-unaccepted'
        else:
            phase = next_phase if status == 'passed' else 'blocked-recovery-required'
        seen_actions.add(action)
    assert receipt.get('phase') == phase, 'Candidate phase does not match its event history'
    return {
        'phase': phase,
        'usedExecutions': executions,
        'seenActions': seen_actions,
        'lastFinishedAt': previous_finished,
    }


def validate_candidate_action(receipt, action):
    history = verify_candidate_history(receipt)
    assert action in PHASE_TRANSITIONS, 'Unsupported candidate release action'
    expected, _ = PHASE_TRANSITIONS[action]
    assert history['phase'] == expected, 'Candidate release action is out of order or already completed'
    assert action not in history['seenActions'], 'Candidate release action cannot be replayed'


def validate_candidate_database_action(receipt, action, *, stop_owned=False):
    assert action in {'migrate', 'audit-runtime', 'audit-reader', 'drain'}, 'Candidate database action is unsupported'
    if action != 'drain':
        assert not stop_owned, 'Only drain can be owned by stop'
        validate_candidate_action(receipt, action)
        return
    assert stop_owned, 'Candidate drain is owned by the stop operation'
    validate_candidate_action(receipt, 'drain')
    sessions = receipt.get('sessions', [])
    assert sessions, 'Candidate drain requires an active stop session'
    current = sessions[-1]
    assert current.get('action') == 'stop', 'Candidate drain requires an active stop session'
    assert current.get('status') == 'in-progress', 'Candidate drain stop session is not active'


def advance_candidate_receipt(receipt, action, *, status, started_at,
                              finished_at, migration_image, execution=None,
                              details=None):
    history = verify_candidate_history(receipt)
    validate_candidate_action(receipt, action)
    assert status in {'passed', 'failed'}, 'Candidate event status is invalid'
    assert migration_image == receipt.get('images', {}).get('migrations'), 'Candidate event uses another migration image'
    started = validate_timestamp(started_at)
    finished = validate_timestamp(finished_at)
    assert finished >= started, 'Candidate event finished before it started'
    assert started >= history['lastFinishedAt'], 'Candidate event timestamps are not monotonic'
    if action in {'migrate', 'audit-runtime', 'audit-reader', 'drain'}:
        assert isinstance(execution, str) and execution, 'Database event execution is missing'
        assert execution not in {
            event.get('execution') for event in receipt.get('events', [])
        }, 'Database execution cannot be reused'
    else:
        assert execution is None, 'Non-database event cannot claim a database execution'
    if action == 'acceptance':
        assert isinstance(details, dict), 'Acceptance details are missing'
        assert re.fullmatch('[a-f0-9]{64}', details.get('acceptanceEvidenceSha256', '')), 'Acceptance evidence hash is missing'

    updated = copy.deepcopy(receipt)
    events = updated.setdefault('events', [])
    assert all(event.get('number') == index for index, event in enumerate(events, 1)), 'Candidate event history is not append-only'
    event = {
        'number': len(events) + 1,
        'action': action,
        'status': status,
        'migrationImage': migration_image,
        'execution': execution,
        'startedAt': started_at,
        'finishedAt': finished_at,
    }
    if details:
        event['details'] = details
    events.append(event)
    if status == 'failed':
        updated['phase'] = 'blocked-recovery-required'
    elif action == 'stop' and 'acceptance' not in history['seenActions']:
        updated['phase'] = 'stopped-unaccepted'
    else:
        updated['phase'] = PHASE_TRANSITIONS[action][1]
    verify_candidate_history(updated)
    receipt.clear()
    receipt.update(updated)
    return receipt


def validate_database_job_bindings(receipt):
    required = {'migrate', 'audit-runtime', 'audit-reader', 'drain'}
    jobs = receipt.get('jobs', {})
    assert set(jobs) == required, 'Candidate database job receipt set changed'
    passed_events = {
        event.get('action'): event
        for event in receipt.get('events', [])
        if event.get('status') == 'passed' and event.get('action') in required
    }
    assert set(passed_events) == required, 'Candidate database event set changed'
    migration_image = receipt.get('images', {}).get('migrations')
    for action in sorted(required):
        job = jobs[action]
        event = passed_events[action]
        assert job.get('status', {}).get('succeededCount') == 1, 'Candidate database job did not pass'
        assert job.get('execution') == event.get('execution'), 'Candidate database job execution changed'
        assert job.get('image') == migration_image, 'Candidate database job image changed'
        assert job.get('startedAt') == event.get('startedAt'), 'Candidate database job start time changed'
        assert job.get('finishedAt') == event.get('finishedAt'), 'Candidate database job finish time changed'
        if action in BOOTSTRAP_CHECKED_ACTIONS:
            assert job.get('bootstrapDatabaseAbsence') == event.get('details', {}).get('bootstrapDatabaseAbsence'), 'Bootstrap database absence evidence changed after the job'


def validate_acceptance_stop_and_drain(receipt):
    passed = [event for event in receipt.get('events', []) if event.get('status') == 'passed']
    acceptance = next(event for event in reversed(passed) if event.get('action') == 'acceptance')
    acceptance_hash = acceptance.get('details', {}).get('acceptanceEvidenceSha256', '')
    assert re.fullmatch('[a-f0-9]{64}', acceptance_hash), 'Acceptance evidence is not bound'
    functional = receipt.get('functionalAcceptance', {})
    assert functional.get('status') == 'passed', 'Functional acceptance receipt is missing'
    assert functional.get('evidenceSha256') == acceptance_hash, 'Functional acceptance hash changed'
    assert functional.get('testerCount') == 2, 'Functional acceptance tester count changed'
    assert set(functional.get('checks', {})) == ACCEPTANCE_CHECKS, 'Functional acceptance checks changed'
    assert all(functional['checks'].values()), 'Functional acceptance check did not pass'
    sessions = receipt.get('sessions', [])
    assert sessions and sessions[-1].get('action') == 'stop' and sessions[-1].get('status') == 'passed', 'Candidate session is not stopped'
    validate_database_job_bindings(receipt)


def validate_sealable_receipt(receipt):
    validate_candidate_action(receipt, 'seal')
    actions = [
        event.get('action') for event in receipt.get('events', [])
        if event.get('status') == 'passed'
    ]
    required = [
        'prepare-release', 'migrate', 'audit-runtime', 'audit-reader',
        'deploy', 'start', 'acceptance', 'drain', 'stop',
    ]
    cursor = 0
    for action in actions:
        if cursor < len(required) and action == required[cursor]:
            cursor += 1
    assert cursor == len(required), 'Candidate release lacks ordered terminal evidence'
    validate_acceptance_stop_and_drain(receipt)


def validate_sealed_candidate_receipt(receipt):
    history = verify_candidate_history(receipt)
    assert history['phase'] == 'sealed', 'Candidate release history is not sealed'
    final_event = receipt['events'][-1]
    assert final_event.get('action') == 'seal' and final_event.get('status') == 'passed', 'Candidate seal event is missing'
    assert receipt.get('sealedAt') == final_event.get('finishedAt'), 'Candidate seal timestamp changed'
    validate_acceptance_stop_and_drain(receipt)
    return history


def validate_rolled_back_candidate_receipt(receipt):
    history = verify_candidate_history(receipt)
    assert history['phase'] == 'rolled-back-paused', 'Candidate rollback history is incomplete'
    final_event = receipt['events'][-1]
    assert final_event.get('action') == 'rollback' and final_event.get('status') == 'passed', 'Candidate rollback event is missing'
    rollback = receipt.get('rollback')
    assert isinstance(rollback, dict), 'Candidate rollback result is missing'
    assert canonical_hash(rollback) == final_event.get('details', {}).get('rollbackResultSha256'), 'Candidate rollback result changed'
    assert rollback.get('databaseState') == 'STOPPED', 'Rolled-back database was not stopped'
    assert rollback.get('databaseActivationPolicy') == 'NEVER', 'Rolled-back database activation is not disabled'
    assert set(rollback.get('services', {})) == {'api', 'web'}, 'Rolled-back service evidence is incomplete'
    attempts = receipt.get('recoveryAttempts', [])
    assert attempts and attempts[-1].get('status') == 'passed', 'Candidate rollback attempt did not pass'
    assert attempts[-1].get('resultSha256') == canonical_hash(rollback), 'Candidate rollback attempt changed'
    assert not any(
        session.get('status') == 'in-progress'
        for session in receipt.get('sessions', [])
    ), 'Candidate rollback left an in-progress session'
    return history


def serialized_receipt(receipt):
    return (json.dumps(receipt, indent=2) + '\n').encode()


def seal_candidate_receipt(receipt, path, *, started_at, finished_at,
                           migration_image, execution=None):
    validate_sealable_receipt(receipt)
    advance_candidate_receipt(
        receipt, 'seal', status='passed', started_at=started_at,
        finished_at=finished_at, migration_image=migration_image,
        execution=execution,
    )
    receipt['sealedAt'] = finished_at
    data = serialized_receipt(receipt)
    atomic_write_bytes(path, data)
    return hashlib.sha256(data).hexdigest()


def release_image_digests(images):
    assert set(images) == {'api', 'customer-web', 'migrations'}, 'Release image set is incomplete'
    return {key: image_digest(value) for key, value in images.items()}


def verify_dev_promotion(dev_receipt, dev_bytes, expected_hash, candidate_images):
    assert re.fullmatch('[a-f0-9]{64}', expected_hash or ''), 'Sealed Dev receipt hash is required'
    actual_hash = hashlib.sha256(dev_bytes).hexdigest()
    assert secrets.compare_digest(actual_hash, expected_hash), 'Sealed Dev receipt hash changed'
    assert dev_receipt.get('project') == 'samra-pay-dev', 'Promotion source is not Dev'
    assert dev_receipt.get('phase') == 'sealed', 'Dev release is not sealed'
    validate_sealed_candidate_receipt(dev_receipt)
    assert dev_receipt.get('sourceSha') == candidate_images.get('sourceSha'), 'Test source differs from sealed Dev source'
    assert release_image_digests(dev_receipt.get('images', {})) == release_image_digests(candidate_images.get('images', {})), 'Test image digests differ from sealed Dev images'
    validate_sealed_events = [
        event for event in dev_receipt.get('events', [])
        if event.get('status') == 'passed'
    ]
    assert validate_sealed_events and validate_sealed_events[-1].get('action') == 'seal', 'Dev seal event is missing'
    assert any(event.get('action') == 'acceptance' for event in validate_sealed_events), 'Dev acceptance is missing'
    sessions = dev_receipt.get('sessions', [])
    assert sessions and sessions[-1].get('action') == 'stop' and sessions[-1].get('status') == 'passed', 'Dev did not end stopped'
    assert dev_receipt.get('jobs', {}).get('drain', {}).get('status', {}).get('succeededCount') == 1, 'Dev did not end drained'
    return {
        'devReceiptSha256': actual_hash,
        'sourceSha': dev_receipt['sourceSha'],
        'imageDigests': release_image_digests(dev_receipt['images']),
        'sealedAt': dev_receipt.get('sealedAt'),
    }


ACCEPTANCE_CHECKS = {
    'auth0LoginCompleted',
    'twoSyntheticUsersAdmitted',
    'consentCompleted',
    'walletProvisioningCompleted',
    'fixtureFundingCompleted',
    'syntheticTransferCompleted',
    'persistenceReadbackCompleted',
}


def verify_acceptance_evidence(evidence, receipt, env):
    expected_fields = {
        'schemaVersion', 'environment', 'project', 'sourceSha', 'status',
        'syntheticOnly', 'productionChanges', 'testerCount', 'imageDigests',
        'revisions', 'checks', 'observedAt',
    }
    assert set(evidence) == expected_fields, 'Acceptance evidence fields changed'
    assert evidence.get('schemaVersion') == 1, 'Acceptance evidence schema changed'
    assert evidence.get('environment') == env, 'Acceptance evidence environment changed'
    assert evidence.get('project') == receipt.get('project'), 'Acceptance evidence project changed'
    assert evidence.get('sourceSha') == receipt.get('sourceSha'), 'Acceptance evidence source changed'
    assert evidence.get('status') == 'passed', 'Functional acceptance did not pass'
    assert evidence.get('syntheticOnly') is True, 'Acceptance must use synthetic data only'
    assert evidence.get('productionChanges') is False, 'Acceptance evidence crossed the production boundary'
    assert evidence.get('testerCount') == 2, 'Functional acceptance requires exactly two synthetic testers'
    assert evidence.get('imageDigests') == release_image_digests(receipt.get('images', {})), 'Acceptance image digests changed'
    revisions = {
        'api': receipt.get('services', {}).get('api', {}).get('status', {}).get('latestReadyRevisionName'),
        'customer-web': receipt.get('services', {}).get('web', {}).get('status', {}).get('latestReadyRevisionName'),
    }
    assert evidence.get('revisions') == revisions, 'Acceptance revisions changed'
    checks = evidence.get('checks', {})
    assert set(checks) == ACCEPTANCE_CHECKS, 'Acceptance check set is incomplete'
    assert all(value is True for value in checks.values()), 'A functional acceptance check did not pass'
    observed_at = evidence.get('observedAt')
    validate_timestamp(observed_at)
    return {
        'observedAt': observed_at,
        'checks': checks,
        'testerCount': 2,
    }


def verify_project_identity(cloud_project, project, project_number, organization_id):
    assert cloud_project.get('projectId') == project, 'Unexpected Google Cloud project ID'
    assert str(cloud_project.get('projectNumber')) == project_number, 'Unexpected Google Cloud project number'
    assert cloud_project.get('lifecycleState') == 'ACTIVE', 'Google Cloud project is not active'
    parent = cloud_project.get('parent', {})
    assert parent.get('type') == 'organization', 'Google Cloud project is not directly owned by the expected organization'
    assert str(parent.get('id')) == organization_id, 'Google Cloud organization changed'


def image_digest(image_reference):
    match = re.search(r'@(sha256:[a-f0-9]{64})$', image_reference)
    assert match, 'Receipt image reference is not digest-pinned'
    return match.group(1)


def execution_name(job):
    value = str(job.get('execution', ''))
    assert value, 'Prior database job execution is missing'
    return value.rsplit('/', 1)[-1]


def verify_prior_evidence(prior, evidence, project):
    """Bind the retained baseline receipt to reviewed, Git-tracked evidence."""
    assert evidence.get('project') == project, 'Baseline evidence belongs to another project'
    assert evidence.get('appSourceSha') == prior.get('sourceSha'), 'Baseline source revision changed'
    assert evidence.get('region') == 'us-east4', 'Baseline evidence region changed'
    assert evidence.get('productionChanges') is False, 'Baseline evidence has an invalid production boundary'

    evidence_images = evidence.get('images', {})
    assert set(evidence_images) == {'api', 'customer-web', 'migrations'}, 'Baseline image evidence is incomplete'
    env = project.removeprefix('samra-pay-')
    expected_images = {
        key: f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{key}@{digest}'
        for key, digest in evidence_images.items()
    }
    assert prior.get('images') == expected_images, 'Baseline image references changed'

    required_versions = {'ca', 'migration', 'runtime', 'audit', 'bootstrap'}
    assert set(prior.get('versions', {})) == required_versions, 'Prior secret version set is incomplete'
    assert set(evidence.get('secretVersions', {})) == required_versions, 'Baseline secret version set is incomplete'
    assert prior.get('versions') == evidence.get('secretVersions'), 'Baseline secret versions changed'
    retired = evidence.get('bootstrapRetired', {})
    required_retirement = {
        'databaseUserDeleted', 'serviceAccountDisabled',
        'setupSecretDisabled', 'readbackPassed',
    }
    assert set(retired) == required_retirement, 'Baseline bootstrap retirement evidence is incomplete'
    assert all(value is True for value in retired.values()), 'Baseline bootstrap retirement is incomplete'
    assert prior.get('bootstrapRetired') is True, 'Prior bootstrap access was not retired'

    evidence_revisions = evidence.get('revisions', {})
    prior_services = prior.get('services', {})
    assert prior_services.get('api', {}).get('status', {}).get('latestReadyRevisionName') == evidence_revisions.get('api'), 'Baseline API revision changed'
    assert prior_services.get('web', {}).get('status', {}).get('latestReadyRevisionName') == evidence_revisions.get('customer-web'), 'Baseline web revision changed'

    paused = evidence.get('pausedReadback', {})
    assert paused.get('databaseState') == 'STOPPED', 'Baseline database was not stopped'
    assert paused.get('activationPolicy') == 'NEVER', 'Baseline database activation was not disabled'
    assert paused.get('apiManualInstances') == 0 and paused.get('webManualInstances') == 0, 'Baseline services were not paused'
    assert paused.get('revisionsUnchanged') is True, 'Baseline revision readback was not stable'
    assert evidence.get('databaseJobsResult') == 'all-passed', 'Baseline database jobs did not all pass'
    assert evidence.get('sessionShutdownRestart') == 'start-stop-restart-stop-passed', 'Baseline session sequence is incomplete'
    assert evidence.get('apiReadiness') == 'passed-on-recorded-revision', 'Baseline API readiness is incomplete'
    protected_merge = evidence.get('protectedMainMerge', {})
    assert re.fullmatch('[a-f0-9]{40}', protected_merge.get('commit', '')), 'Baseline protected merge is missing'
    assert protected_merge.get('includesAppSourceAsParent') is True, 'Baseline app source is outside the protected merge'
    assert protected_merge.get('treeMatchesAppSource') is True, 'Baseline merge tree differs from the deployed source'

    evidence_jobs = evidence.get('databaseJobs', {})
    prior_jobs = prior.get('jobs', {})
    required_jobs = {'bootstrap', 'migrate', 'audit-runtime', 'audit-reader', 'drain'}
    assert set(evidence_jobs) == required_jobs, 'Baseline database job evidence is incomplete'
    assert required_jobs <= set(prior_jobs), 'Prior database job receipt is incomplete'
    for action, expected_execution in evidence_jobs.items():
        job = prior_jobs.get(action, {})
        assert job.get('status', {}).get('succeededCount') == 1, 'Prior database job did not succeed'
        assert execution_name(job) == expected_execution, 'Baseline database job execution changed'

    evidence_sessions = evidence.get('sessions', [])
    prior_sessions = prior.get('sessions', [])
    assert evidence_sessions and prior_sessions, 'Baseline session evidence is missing'
    assert evidence_sessions[-1] == prior_sessions[-1], 'Baseline final session changed'
    assert prior_sessions[-1].get('action') == 'stop' and prior_sessions[-1].get('status') == 'passed', 'Prior release does not end in a passed stop'


def prior_receipt_trust(prior, prior_bytes, project, expected_hash=None,
                        baseline_evidence=None, baseline_path=None,
                        baseline_bytes=None, baseline_expected_hash=None,
                        baseline_commit=None, baseline_provenance_bytes=None):
    """Verify at least one trust anchor for a predecessor receipt."""
    actual_hash = hashlib.sha256(prior_bytes).hexdigest()
    anchors = []
    if expected_hash:
        assert re.fullmatch('[a-f0-9]{64}', expected_hash), 'Expected prior receipt hash is malformed'
        assert secrets.compare_digest(actual_hash, expected_hash), 'Prior receipt hash does not match trusted evidence'
        anchors.append({'type': 'independently-retained-receipt-sha256'})
    if baseline_evidence is not None:
        assert baseline_path and baseline_bytes is not None, 'Baseline evidence metadata is incomplete'
        assert re.fullmatch('[a-f0-9]{64}', baseline_expected_hash or ''), 'Pinned baseline evidence hash is missing'
        assert re.fullmatch('[a-f0-9]{40}', baseline_commit or ''), 'Baseline evidence commit is missing'
        baseline_hash = hashlib.sha256(baseline_bytes).hexdigest()
        assert secrets.compare_digest(baseline_hash, baseline_expected_hash), 'Baseline evidence bytes changed'
        assert baseline_provenance_bytes == baseline_bytes, 'Baseline evidence does not match its provenance commit'
        verify_prior_evidence(prior, baseline_evidence, project)
        anchors.append({
            'type': 'git-tracked-baseline-evidence',
            'path': baseline_path,
            'sha256': baseline_hash,
            'commit': baseline_commit,
        })
    assert anchors, 'An independently retained receipt hash or committed baseline evidence is required'
    return {'receiptSha256': actual_hash, 'anchors': anchors}


def prepare_release_receipt(prior, trust, project, images, services, database,
                            iam_boundary, observed_at,
                            predecessor_revisions=None):
    """Bind a new candidate to an independently verified, paused predecessor."""
    prior_hash = trust.get('receiptSha256', '')
    assert re.fullmatch('[a-f0-9]{64}', prior_hash), 'Trusted prior receipt hash required'
    assert trust.get('anchors'), 'Prior receipt trust anchor required'
    assert prior.get('project') == project, 'Prior receipt belongs to another project'
    baseline_bridge = any(
        anchor.get('type') == 'git-tracked-baseline-evidence'
        for anchor in trust['anchors']
    )
    rolled_back = False
    if prior.get('priorRelease'):
        history = verify_candidate_history(prior)
        if history['phase'] == 'sealed':
            validate_sealed_candidate_receipt(prior)
        elif history['phase'] == 'rolled-back-paused':
            validate_rolled_back_candidate_receipt(prior)
            rolled_back = True
        else:
            raise AssertionError('Follow-on predecessor is neither sealed nor safely rolled back')
    else:
        assert baseline_bridge, 'Only the pinned legacy baseline may precede the first sealed candidate'
    assert re.fullmatch('[a-f0-9]{40}', prior.get('sourceSha', '')), 'Prior source revision missing'
    assert prior.get('sourceSha') != images['sourceSha'], 'New release must use a new source revision'
    assert prior.get('images') != images['images'], 'New release must use new image digests'
    assert prior.get('bootstrapRetired') is True, 'Prior bootstrap access was not retired'
    if not rolled_back:
        sessions = prior.get('sessions', [])
        assert sessions and sessions[-1].get('action') == 'stop' and sessions[-1].get('status') == 'passed', 'Prior release does not end in a passed stop'
        assert prior.get('jobs', {}).get('drain', {}).get('status', {}).get('succeededCount') == 1, 'Prior release has no passed final drain'
    versions = prior.get('versions', {})
    required_versions = ['ca', 'migration', 'runtime', 'audit']
    assert all(str(versions.get(key, '')).isdigit() for key in required_versions), 'Prior numbered secret versions missing'
    assert str(versions.get('bootstrap', '')).isdigit(), 'Prior bootstrap secret version missing'
    assert database.get('state') == 'STOPPED', 'Database must be stopped before preparing a release'
    assert database.get('settings', {}).get('activationPolicy') == 'NEVER', 'Database activation must be NEVER'
    assert iam_boundary.get('schemaVersion') == 1 and iam_boundary.get('targets'), 'Effective IAM review is missing'

    active_source = prior['sourceSha']
    active_images = prior['images']
    if rolled_back:
        rollback = prior['rollback']
        active_source = rollback.get('sourceSha')
        active_images = prior['priorRelease'].get('images')
        assert re.fullmatch('[a-f0-9]{40}', active_source or ''), 'Rolled-back predecessor source is missing'
        assert set(active_images or {}) == {'api', 'customer-web', 'migrations'}, 'Rolled-back predecessor images are incomplete'
        assert active_source != images['sourceSha'], 'New release cannot reuse the rolled-back source revision'
        assert predecessor_revisions and set(predecessor_revisions) == {'api', 'web'}, 'Rolled-back predecessor revisions were not read'

    predecessors = {}
    for key, image_key in [('api', 'api'), ('web', 'customer-web')]:
        current = services[key]
        if rolled_back:
            predecessor = prior['rollback']['services'][key]
            assert predecessor.get('image') == active_images[image_key], 'Rolled-back predecessor image lineage changed'
            validate_rolled_back_service(
                current, predecessor, predecessor_revisions[key], 0,
            )
            current_revision = current.get('status', {}).get(
                'latestReadyRevisionName',
            )
            template = current.get('spec', {}).get('template')
            assert isinstance(template, dict), 'Rolled-back service template is missing'
            template_image = template.get('spec', {}).get(
                'containers', [{}],
            )[0].get('image')
            assert current_revision and template_image, 'Rolled-back service latest template is incomplete'
            predecessors[key] = {
                'revision': predecessor['revision'],
                'image': predecessor['image'],
                'template': template,
                'latestRevision': current_revision,
                'templateImage': template_image,
                'activeByTraffic': True,
            }
            continue

        recorded = prior.get('services', {}).get(key, {})
        annotations = current.get('metadata', {}).get('annotations', {})
        assert annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Predecessor must use manual scaling'
        assert str(annotations.get('run.googleapis.com/manualInstanceCount')) == '0', 'Predecessor must be paused'
        metadata = current.get('metadata', {})
        status = current.get('status', {})
        assert str(metadata.get('generation')) == str(status.get('observedGeneration')), 'Predecessor service is not reconciled'
        current_revision = status.get('latestReadyRevisionName')
        assert status.get('latestCreatedRevisionName') == current_revision, 'Predecessor has a pending revision'
        ready = [condition for condition in status.get('conditions', []) if condition.get('type') == 'Ready']
        assert len(ready) == 1 and str(ready[0].get('status')).lower() == 'true', 'Predecessor service is not ready'
        assert current_revision and current_revision == recorded.get('status', {}).get('latestReadyRevisionName'), 'Predecessor revision changed'
        assert current.get('spec', {}).get('template') == recorded.get('spec', {}).get('template'), 'Predecessor service template changed'
        assert current.get('spec', {}).get('template', {}).get('spec', {}).get('containers', [{}])[0].get('image') == prior['images'][image_key], 'Predecessor image changed'
        traffic = status.get('traffic', [])
        assert not any(item.get('tag') for item in current.get('spec', {}).get('traffic', []) + traffic), 'Tagged predecessor traffic requires review'
        active = [item for item in traffic if item.get('percent', 0)]
        assert len(active) == 1 and active[0].get('percent') == 100 and active[0].get('revisionName') == current_revision, 'Predecessor traffic changed'
        predecessors[key] = {
            'revision': current_revision,
            'image': prior['images'][image_key],
            'template': recorded.get('spec', {}).get('template'),
        }

    return {
        'project': project,
        'sourceSha': images['sourceSha'],
        'images': images['images'],
        'versions': {key: str(versions[key]) for key in [*required_versions, 'bootstrap']},
        'jobs': {},
        'bootstrapRetired': True,
        'preparedAt': observed_at,
        'iamBoundary': iam_boundary,
        'phase': 'prepared-paused',
        'events': [{
            'number': 1,
            'action': 'prepare-release',
            'status': 'passed',
            'migrationImage': images['images']['migrations'],
            'execution': None,
            'startedAt': observed_at,
            'finishedAt': observed_at,
        }],
        'priorRelease': {
            'receiptSha256': prior_hash,
            'trustAnchors': trust['anchors'],
            'sourceSha': active_source,
            'images': active_images,
            'services': predecessors,
            'databaseState': 'STOPPED',
            'databaseActivationPolicy': 'NEVER',
        },
    }


def assert_no_active_operations(run_executions, sql_operations):
    assert all(
        execution.get('status', {}).get('completionTime')
        for execution in run_executions
    ), 'A Cloud Run job execution is still active'
    assert all(operation.get('status') == 'DONE' for operation in sql_operations), 'A Cloud SQL operation is still active'


def validate_exact_service(current, recorded, expected_image, expected_scale,
                           expected_active_revision=None, require_latest=True):
    metadata = current.get('metadata', {})
    status = current.get('status', {})
    annotations = metadata.get('annotations', {})
    assert annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Service must use manual scaling'
    assert str(annotations.get('run.googleapis.com/manualInstanceCount')) == str(expected_scale), 'Service scale changed'
    assert str(metadata.get('generation')) == str(status.get('observedGeneration')), 'Service is not reconciled'
    ready = [condition for condition in status.get('conditions', [])
             if condition.get('type') == 'Ready']
    assert len(ready) == 1 and str(ready[0].get('status')).lower() == 'true', 'Service is not ready'
    latest = status.get('latestReadyRevisionName')
    if require_latest:
        assert status.get('latestCreatedRevisionName') == latest, 'Service has a pending revision'
        assert latest == recorded.get('status', {}).get('latestReadyRevisionName'), 'Service revision changed'
    assert current.get('spec', {}).get('template') == recorded.get('spec', {}).get('template'), 'Service template changed'
    assert current.get('spec', {}).get('template', {}).get('spec', {}).get('containers', [{}])[0].get('image') == expected_image, 'Service image changed'
    traffic = status.get('traffic', [])
    assert not any(item.get('tag') for item in current.get('spec', {}).get('traffic', []) + traffic), 'Tagged service traffic requires review'
    active = [item for item in traffic if item.get('percent', 0)]
    expected_revision = expected_active_revision or latest
    assert len(active) == 1 and active[0].get('percent') == 100 and active[0].get('revisionName') == expected_revision, 'Service traffic changed'
    return latest


def read_services(env, project, region):
    return {
        key: gcloud('run', 'services', 'describe', name,
                    '--project='+project, '--region='+region)
        for key, name in [
            ('api', 'samra-api-'+env),
            ('web', 'samra-customer-web-'+env),
        ]
    }


def validate_predecessor_services(receipt, services):
    prior = receipt.get('priorRelease', {})
    for key, image_key in [('api', 'api'), ('web', 'customer-web')]:
        predecessor = prior.get('services', {}).get(key, {})
        latest_revision = predecessor.get(
            'latestRevision', predecessor.get('revision'),
        )
        recorded = {
            'spec': {'template': predecessor.get('template')},
            'status': {'latestReadyRevisionName': latest_revision},
        }
        validate_exact_service(
            services[key], recorded,
            predecessor.get(
                'templateImage', prior.get('images', {}).get(image_key),
            ),
            0,
            expected_active_revision=predecessor.get('revision'),
        )


def validate_candidate_services(receipt, services, expected_scale):
    recorded_services = receipt.get('services', {})
    assert set(recorded_services) == {'api', 'web'}, 'Candidate service receipt is incomplete'
    for key, image_key in [('api', 'api'), ('web', 'customer-web')]:
        validate_exact_service(
            services[key], recorded_services[key], receipt['images'][image_key],
            expected_scale,
        )


def append_recovery_event(receipt, action, status, started_at, finished_at,
                          details=None):
    history = verify_candidate_history(receipt)
    assert action == 'rollback', 'Unsupported recovery event'
    assert history['phase'] in ROLLBACK_PHASES, 'Recovery event is out of order'
    assert status in {'passed', 'failed'}, 'Recovery event status is invalid'
    started = validate_timestamp(started_at)
    finished = validate_timestamp(finished_at)
    assert finished >= started, 'Recovery event finished before it started'
    assert started >= history['lastFinishedAt'], 'Recovery event timestamps are not monotonic'
    assert isinstance(details, dict) and isinstance(details.get('trigger'), str), 'Recovery event details are missing'
    if status == 'passed':
        assert re.fullmatch('[a-f0-9]{64}', details.get('rollbackResultSha256', '')), 'Rollback result hash is missing'
    updated = copy.deepcopy(receipt)
    events = updated.setdefault('events', [])
    assert all(event.get('number') == index for index, event in enumerate(events, 1)), 'Candidate event history is not append-only'
    event = {
        'number': len(events) + 1,
        'action': action,
        'status': status,
        'migrationImage': receipt.get('images', {}).get('migrations'),
        'execution': None,
        'startedAt': started_at,
        'finishedAt': finished_at,
    }
    if details:
        event['details'] = details
    events.append(event)
    updated['phase'] = ('rolled-back-paused' if status == 'passed'
                        else 'blocked-recovery-required')
    verify_candidate_history(updated)
    receipt.clear()
    receipt.update(updated)
    return receipt


def candidate_session_may_have_run(receipt):
    if any(
        event.get('action') == 'start' and event.get('status') == 'passed'
        for event in receipt.get('events', [])
    ):
        return True
    return any(
        session.get('action') == 'start'
        and session.get('status') in {
            'in-progress', 'passed', 'blocked-recovery-required',
        }
        for session in receipt.get('sessions', [])
    )


def candidate_has_passed_drain(receipt):
    normal = (
        any(
            event.get('action') == 'drain' and event.get('status') == 'passed'
            for event in receipt.get('events', [])
        )
        and receipt.get('jobs', {}).get('drain', {}).get('status', {}).get(
            'succeededCount',
        ) == 1
    )
    recovery = any(
        job.get('status', {}).get('succeededCount') == 1
        for job in receipt.get('recoveryJobs', [])
    )
    return normal or recovery


def validate_predecessor_revision(revision, expected_name, expected_image):
    assert revision.get('metadata', {}).get('name') == expected_name, 'Predecessor revision name changed'
    assert revision.get('spec', {}).get('containers', [{}])[0].get('image') == expected_image, 'Predecessor revision image changed'
    ready = [
        condition for condition in revision.get('status', {}).get('conditions', [])
        if condition.get('type') == 'Ready'
    ]
    assert len(ready) == 1 and str(ready[0].get('status')).lower() == 'true', 'Predecessor revision is not ready'


def validate_rolled_back_service(service, predecessor, revision,
                                 expected_scale=0):
    annotations = service.get('metadata', {}).get('annotations', {})
    assert annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Rolled-back service must use manual scaling'
    assert str(annotations.get('run.googleapis.com/manualInstanceCount')) == str(expected_scale), 'Rolled-back service scale changed'
    metadata = service.get('metadata', {})
    status = service.get('status', {})
    assert str(metadata.get('generation')) == str(status.get('observedGeneration')), 'Rolled-back service is not reconciled'
    ready = [
        condition for condition in status.get('conditions', [])
        if condition.get('type') == 'Ready'
    ]
    assert len(ready) == 1 and str(ready[0].get('status')).lower() == 'true', 'Rolled-back service is not ready'
    assert not any(
        item.get('tag')
        for item in service.get('spec', {}).get('traffic', [])
        + status.get('traffic', [])
    ), 'Rolled-back service has tagged traffic'
    active = [item for item in status.get('traffic', []) if item.get('percent', 0)]
    assert len(active) == 1 and active[0].get('percent') == 100, 'Rolled-back service traffic is split'
    assert active[0].get('revisionName') == predecessor['revision'], 'Rolled-back service targets another revision'
    validate_predecessor_revision(
        revision, predecessor['revision'], predecessor['image'],
    )


def rollback_to_predecessor(receipt, env, project, region, instance,
                            drain_check):
    """Return both service traffic targets to the immutable predecessor.

    Database migrations remain forward-applied. Migration 0021 deliberately
    preserves the prior synthetic application contract during this window.
    """
    common = ['--project='+project, '--region='+region]
    api = 'samra-api-' + env
    web = 'samra-customer-web-' + env
    # Ingress closure is deliberately first. A malformed receipt or later
    # recovery failure must not leave the browser entry point open.
    gcloud('run', 'services', 'update', web, *common, '--scaling=0')
    closed_web = gcloud('run', 'services', 'describe', web, *common)
    closed_annotations = closed_web.get('metadata', {}).get('annotations', {})
    assert closed_annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Rollback web service is not manually scaled'
    assert str(closed_annotations.get('run.googleapis.com/manualInstanceCount')) == '0', 'Rollback could not close customer ingress'

    history = verify_candidate_history(receipt)
    assert history['phase'] in ROLLBACK_PHASES, 'Rollback is unavailable from this candidate phase'
    prior = receipt.get('priorRelease', {})
    assert set(prior.get('services', {})) == {'api', 'web'}, 'Rollback predecessor is missing'
    current_api = gcloud('run', 'services', 'describe', api, *common)
    api_annotations = current_api.get('metadata', {}).get('annotations', {})
    assert api_annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Rollback API service is not manually scaled'
    assert str(api_annotations.get('run.googleapis.com/manualInstanceCount')) in {'0', '1'}, 'Rollback API scale requires review'

    recovery_drain = None
    api_is_active = str(api_annotations.get(
        'run.googleapis.com/manualInstanceCount',
    )) == '1'
    if (
        api_is_active
        or (
            candidate_session_may_have_run(receipt)
            and not candidate_has_passed_drain(receipt)
        )
    ):
        time.sleep(65)
        recovery_drain = drain_check()
        assert recovery_drain.get('status', {}).get('succeededCount') == 1, 'Recovery drain did not pass'
    gcloud('run', 'services', 'update', api, *common, '--scaling=0')
    paused_api = gcloud('run', 'services', 'describe', api, *common)
    paused_annotations = paused_api.get('metadata', {}).get('annotations', {})
    assert paused_annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Rollback API service is not manually scaled'
    assert str(paused_annotations.get('run.googleapis.com/manualInstanceCount')) == '0', 'Rollback could not pause the API'
    gcloud('sql', 'instances', 'patch', instance, '--project='+project,
           '--activation-policy=NEVER')
    predecessor_revisions = {}
    for key in ['api', 'web']:
        predecessor = prior['services'][key]
        revision = gcloud(
            'run', 'revisions', 'describe', predecessor['revision'], *common,
        )
        validate_predecessor_revision(
            revision, predecessor['revision'], predecessor['image'],
        )
        predecessor_revisions[key] = revision
    for key, name in [('api', api), ('web', web)]:
        revision = prior['services'][key]['revision']
        gcloud('run', 'services', 'update-traffic', name, *common,
               '--to-revisions='+revision+'=100')
    rolled_back = read_services(env, project, region)
    for key in ['api', 'web']:
        predecessor = prior['services'][key]
        validate_rolled_back_service(
            rolled_back[key], predecessor, predecessor_revisions[key], 0,
        )
    database = gcloud('sql', 'instances', 'describe', instance,
                      '--project='+project)
    assert database.get('state') == 'STOPPED', 'Rollback did not stop the database'
    assert database.get('settings', {}).get('activationPolicy') == 'NEVER', 'Rollback did not disable database activation'
    return {
        'sourceSha': prior.get('sourceSha'),
        'services': {
            key: {
                'revision': prior['services'][key]['revision'],
                'image': prior['services'][key]['image'],
            }
            for key in ['api', 'web']
        },
        'databaseState': 'STOPPED',
        'databaseActivationPolicy': 'NEVER',
        'recoveryDrainExecution': (
            recovery_drain.get('execution') if recovery_drain else None
        ),
    }


def safe_failure_reason(error):
    message = str(error).strip()
    if isinstance(error, (AssertionError, RuntimeError)) and message:
        return re.sub(r'[^A-Za-z0-9 ._:/=-]', '?', message)[:200]
    return error.__class__.__name__


def perform_candidate_rollback(receipt, env, project, region, instance,
                               drain_check, save, trigger):
    assert isinstance(trigger, str) and trigger, 'Rollback trigger is missing'
    history = verify_candidate_history(receipt)
    assert history['phase'] in ROLLBACK_PHASES, 'Rollback is unavailable from this candidate phase'
    started_at = datetime.now(timezone.utc).isoformat()
    attempt = {
        'action': 'rollback',
        'trigger': trigger,
        'startedAt': started_at,
        'status': 'in-progress',
    }
    receipt.setdefault('recoveryAttempts', []).append(attempt)
    save()
    try:
        result = rollback_to_predecessor(
            receipt, env, project, region, instance, drain_check,
        )
    except Exception as error:
        finished_at = datetime.now(timezone.utc).isoformat()
        reason = safe_failure_reason(error)
        attempt.update({
            'finishedAt': finished_at,
            'status': 'failed',
            'failureReason': reason,
        })
        append_recovery_event(
            receipt, 'rollback', 'failed', started_at, finished_at,
            {'trigger': trigger, 'failureReason': reason},
        )
        save()
        raise

    finished_at = datetime.now(timezone.utc).isoformat()
    result_hash = canonical_hash(result)
    attempt.update({
        'finishedAt': finished_at,
        'status': 'passed',
        'resultSha256': result_hash,
    })
    for session in receipt.get('sessions', []):
        if session.get('status') == 'in-progress':
            session['status'] = 'superseded-by-rollback'
            session['finishedAt'] = finished_at
    receipt['rollback'] = result
    append_recovery_event(
        receipt, 'rollback', 'passed', started_at, finished_at,
        {
            'trigger': trigger,
            'rollbackResultSha256': result_hash,
            'recoveryDrainExecution': result['recoveryDrainExecution'],
        },
    )
    save()
    return result


def verify_direct_access_boundary(api, web, policy, env):
    def public(service):
        return str(service['metadata'].get('annotations', {}).get('run.googleapis.com/invoker-iam-disabled', 'false')).lower() == 'true'
    assert not public(api), 'API must enforce Cloud Run IAM'
    assert public(web), 'Customer login shell is not publicly reachable'
    bindings = [b for b in policy.get('bindings', []) if b['role'] == 'roles/run.invoker']
    expected = 'serviceAccount:samra-customer-web-'+env+'@samra-pay-'+env+'.iam.gserviceaccount.com'
    assert len(bindings) == 1 and not bindings[0].get('condition') and set(bindings[0]['members']) == {expected}, 'Unexpected direct API invocation binding'


def ensure_database_running(instance, project):
    gcloud('sql', 'instances', 'patch', instance, '--project='+project,
           '--activation-policy=ALWAYS')
    database = gcloud('sql', 'instances', 'describe', instance,
                      '--project='+project)
    assert database.get('state') == 'RUNNABLE', 'Database did not become runnable'
    assert database.get('settings', {}).get('activationPolicy') == 'ALWAYS', 'Database activation did not persist'


def read_bootstrap_database_absence(env, project, instance):
    """Read principals only after authorized SQL start; never retain the list."""
    assert env in {'dev', 'test'} and project == 'samra-pay-'+env
    assert instance == 'samra-'+env+'-postgres'
    users = gcloud('sql', 'users', 'list', '--instance='+instance,
                   '--project='+project)
    assert isinstance(users, list), 'Database principal list is missing or malformed'
    assert all(
        isinstance(user, dict) and isinstance(user.get('name'), str)
        and user['name']
        for user in users
    ), 'Database principal list contains a malformed entry'
    principal = 'samra_bootstrap_'+env
    assert not any(user['name'] == principal for user in users), 'Bootstrap database principal still exists'
    return {
        'project': project,
        'instance': instance,
        'principal': principal,
        'absent': True,
        'checkedAt': datetime.now(timezone.utc).isoformat(),
    }


def control_session(action, env, inventory, receipt, save, drain_job, ready,
                    web_ready, pre_start_check=None):
    """Close ingress before draining; failures never stop the worker/database."""
    project = 'samra-pay-' + env
    common = ['--project=' + project, '--region=us-east4']
    api = 'samra-api-' + env
    web = 'samra-customer-web-' + env
    instance = 'samra-' + env + '-postgres'
    assert receipt.get('bootstrapRetired') and receipt.get('services')
    assert action in ['start', 'stop']
    candidate = bool(receipt.get('priorRelease'))
    # Explicitly close the browser entry point before either start or stop.
    gcloud('run', 'services', 'update', web, *common, '--scaling=0')
    closed = gcloud('run', 'services', 'describe', web, *common)['metadata']['annotations']
    assert closed['run.googleapis.com/scalingMode'] == 'manual'
    assert str(closed['run.googleapis.com/manualInstanceCount']) == '0'
    if candidate:
        validate_candidate_action(receipt, action)
        assert not any(
            session.get('status') == 'in-progress'
            for session in receipt.get('sessions', [])
        ), 'An interrupted session requires rollback recovery'
    if action == 'start' and pre_start_check:
        pre_start_check()
    current_services = read_services(env, project, 'us-east4')
    validate_exact_service(
        current_services['api'], receipt['services']['api'],
        receipt['images']['api'], 0 if action == 'start' else 1,
    )
    validate_exact_service(
        current_services['web'], receipt['services']['web'],
        receipt['images']['customer-web'], 0,
    )
    session = {'action': action, 'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'in-progress'}
    session_index = len(receipt.setdefault('sessions', []))
    receipt['sessions'].append(session)
    # A child drain event replaces the receipt with a validated deep copy.
    # Reacquire this indexed session before updating its persisted outcome.
    save()
    try:
        if action == 'stop':
            # The deployed request timeout is 60s. Allow in-flight proxy requests
            # to finish before checking asynchronous financial work.
            time.sleep(65)
            drain_job()
            gcloud('run', 'services', 'update', api, *common, '--scaling=0')
            gcloud('sql', 'instances', 'patch', instance, '--project=' + project, '--activation-policy=NEVER')
        else:
            verify_direct_access_boundary(current_services['api'], current_services['web'],
                                   gcloud('run', 'services', 'get-iam-policy', api, *common), env)
            gcloud('sql', 'instances', 'patch', instance, '--project=' + project, '--activation-policy=ALWAYS')
            db = gcloud('sql', 'instances', 'describe', instance, '--project=' + project)
            assert db['state'] == 'RUNNABLE', 'Database is not ready'
            gcloud('run', 'services', 'update', api, *common, '--scaling=1')
            ready('https://' + api + '-' + inventory['projectNumber'] + '.us-east4.run.app', receipt['services']['api']['status']['latestReadyRevisionName'])
            gcloud('run', 'services', 'update', web, *common, '--scaling=1')
            try:
                web_ready('https://' + web + '-' + inventory['projectNumber'] + '.us-east4.run.app')
            except Exception:
                gcloud('run', 'services', 'update', web, *common, '--scaling=0')
                raise
        final_services = read_services(env, project, 'us-east4')
        validate_candidate_services(
            receipt, final_services, 0 if action == 'stop' else 1,
        ) if candidate else None
        if not candidate:
            for current in final_services.values():
                annotations = current['metadata']['annotations']
                assert annotations['run.googleapis.com/scalingMode'] == 'manual'
                assert str(annotations['run.googleapis.com/manualInstanceCount']) == ('0' if action == 'stop' else '1')
        db = gcloud('sql', 'instances', 'describe', instance, '--project=' + project)
        assert db['settings']['activationPolicy'] == ('NEVER' if action == 'stop' else 'ALWAYS')
        assert db.get('state') == ('STOPPED' if action == 'stop' else 'RUNNABLE'), 'Database runtime state changed'
        session = receipt['sessions'][session_index]
        session['status'] = 'passed'
    except Exception as error:
        session = receipt['sessions'][session_index]
        session['status'] = 'blocked-recovery-required'
        session['failureReason'] = safe_failure_reason(error)
        if action == 'start':
            try:
                gcloud('run', 'services', 'update', web, *common, '--scaling=0')
            except Exception:
                pass
        raise
    finally:
        session = receipt['sessions'][session_index]
        session['finishedAt'] = datetime.now(timezone.utc).isoformat()
        if candidate and receipt.get('phase') != 'blocked-recovery-required':
            event_time = datetime.now(timezone.utc).isoformat()
            advance_candidate_receipt(
                receipt, action,
                status='passed' if session['status'] == 'passed' else 'failed',
                started_at=event_time,
                finished_at=event_time,
                migration_image=receipt['images']['migrations'],
                details=(
                    {'failureReason': session['failureReason']}
                    if session['status'] != 'passed' else None
                ),
            )
        save()


def check_readiness(url, revision):
    token = subprocess.check_output(['gcloud', 'auth', 'print-identity-token'], text=True).strip()
    request = urllib.request.Request(url + '/api/readyz', headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=60) as response:
        assert response.headers.get('X-Samra-Cloud-Run-Revision') == revision
        assert json.load(response) == {'status': 'ready'}


def check_web_readiness(url):
    with urllib.request.urlopen(url + '/login', timeout=60) as response:
        assert response.status == 200
        assert response.headers.get_content_type() == 'text/html'


def main(argv=None):
    if not __debug__:
        raise RuntimeError('Optimized Python disables validation and is unsupported')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['dev', 'test'])
    parser.add_argument('action', choices=[
        'prepare-database', 'prepare-release', 'database-job',
        'retire-bootstrap', 'deploy', 'start', 'record-acceptance',
        'stop', 'seal', 'rollback',
    ])
    parser.add_argument('--images', required=True, help='Reviewed publication JSON with sourceSha and images digest map')
    parser.add_argument('--receipt', required=True, help='Sanitized per-environment operator receipt')
    parser.add_argument('--prior-receipt', help='Previous source-bound receipt; required only for prepare-release')
    parser.add_argument('--prior-receipt-sha256', help='Independently retained SHA-256 for --prior-receipt')
    parser.add_argument('--use-committed-baseline-evidence', action='store_true',
                        help='Use the configured Git-tracked runtime evidence for the one-time baseline transition')
    parser.add_argument('--dev-sealed-receipt', help='Sealed Dev receipt required before preparing Test')
    parser.add_argument('--dev-sealed-receipt-sha256', help='Independently retained SHA-256 for sealed Dev receipt')
    parser.add_argument('--acceptance-evidence', help='Sanitized two-user functional acceptance evidence')
    parser.add_argument('--acceptance-evidence-sha256', help='Independently retained SHA-256 for acceptance evidence')
    parser.add_argument('--job-action', choices=['bootstrap','migrate','audit-migration','audit-runtime','audit-reader','drain'])
    opts = parser.parse_args(argv)
    env = opts.environment
    project = 'samra-pay-'+env
    region = 'us-east4'
    instance = 'samra-'+env+'-postgres'
    receipt_path = Path(opts.receipt)
    # Holding the stream keeps the advisory lock for the full command.
    environment_lock = acquire_environment_lock(env)
    assert environment_lock
    emergency_action = opts.action in {'stop', 'rollback'}
    if emergency_action:
        web = 'samra-customer-web-' + env
        common = ['--project='+project, '--region='+region]
        gcloud('run', 'services', 'update', web, *common, '--scaling=0')
        closed = gcloud('run', 'services', 'describe', web, *common)
        annotations = closed.get('metadata', {}).get('annotations', {})
        assert annotations.get('run.googleapis.com/scalingMode') == 'manual', 'Customer ingress is not manually scaled'
        assert str(annotations.get('run.googleapis.com/manualInstanceCount')) == '0', 'Customer ingress did not close'
    images = json.loads(Path(opts.images).read_text())
    assert re.fullmatch('[a-f0-9]{40}', images['sourceSha'])
    for image in ['api','customer-web','migrations']:
        assert re.fullmatch(re.escape(f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{image}') + r'@sha256:[a-f0-9]{64}', images['images'][image])
        if not emergency_action:
            gcloud('artifacts','docker','images','describe', images['images'][image], '--project='+project)
    inventory_document = json.loads((Path(__file__).parent/'dev-test-environments.json').read_text())
    inventory = inventory_document['environments'][env]
    db = None
    ip = None
    if not emergency_action:
        cloud_project = gcloud('projects', 'describe', project)
        verify_project_identity(
            cloud_project, project, inventory['projectNumber'],
            inventory_document['currentOrganizationId'],
        )
        db = gcloud('sql','instances','describe',instance,'--project='+project)
        assert db['settings']['ipConfiguration']['ipv4Enabled'] is False
        assert db['settings']['ipConfiguration']['sslMode'] == 'ENCRYPTED_ONLY'
        assert db['settings']['ipConfiguration']['serverCaMode'] == 'GOOGLE_MANAGED_INTERNAL_CA'
        assert db['settings']['ipConfiguration']['privateNetwork'].endswith('/samra-'+env+'-vpc')
        ip = next(x['ipAddress'] for x in db['ipAddresses'] if x['type']=='PRIVATE')
        assert ip.startswith('10.61.' if env=='dev' else '10.71.')
    if receipt_path.exists():
        assert opts.action != 'prepare-release', 'New release receipt already exists; inspect instead of overwriting'
        receipt = json.loads(receipt_path.read_text())
        verify_receipt(receipt, project, images)
    else:
        assert opts.action in ['prepare-database', 'prepare-release'], 'Existing receipt required'
        receipt = ({'project':project,'sourceSha':images['sourceSha'],'images':images['images'],'versions':{},'jobs':{}}
                   if opts.action == 'prepare-database' else {})
    identities = {key:f'samra-{key}-{env}@{project}.iam.gserviceaccount.com' for key in ['api','customer-web','migrations','audit','bootstrap']}
    names = {key:f'samra-{env}-{suffix}' for key,suffix in {'runtime':'database-url','migration':'migration-database-url','audit':'audit-database-url','ca':'database-ca','bootstrap':'database-setup'}.items()}
    def save():
        atomic_write_bytes(receipt_path, serialized_receipt(receipt))
    def current_iam_boundary():
        return read_effective_iam_boundary(
            env, project, inventory['projectNumber'],
            inventory_document['currentOrganizationId'], identities, names,
            inventory_document['approvedAdministrativePrincipals'],
        )
    def require_unchanged_iam():
        current = current_iam_boundary()
        verify_current_iam_boundary(receipt, current)
        return current
    def require_no_active_operations():
        assert_no_active_operations(
            gcloud('run', 'jobs', 'executions', 'list', '--project='+project,
                   '--region='+region) or [],
            gcloud('sql', 'operations', 'list', '--instance='+instance,
                   '--project='+project) or [],
        )
    def run_database_action(action, *, stop_owned=False, recovery=False):
        candidate = bool(receipt.get('priorRelease'))
        if recovery:
            assert candidate and action == 'drain', 'Recovery supports only a candidate drain'
            history = verify_candidate_history(receipt)
            assert history['phase'] in ROLLBACK_PHASES, 'Recovery drain is unavailable from this phase'
            require_no_active_operations()
        elif candidate:
            validate_candidate_database_action(
                receipt, action, stop_owned=stop_owned,
            )
            if not stop_owned:
                require_unchanged_iam()
            require_no_active_operations()
            if action != 'drain':
                validate_predecessor_services(
                    receipt, read_services(env, project, region),
                )
            if action == 'migrate':
                current_db = gcloud(
                    'sql', 'instances', 'describe', instance,
                    '--project='+project,
                )
                assert current_db.get('state') == 'STOPPED', 'Migration must start from a stopped database'
                assert current_db.get('settings', {}).get('activationPolicy') == 'NEVER', 'Migration must start with database activation disabled'

        identity = (
            'bootstrap' if action == 'bootstrap'
            else 'api' if action == 'audit-runtime'
            else 'audit' if action in {'audit-reader', 'drain'}
            else 'migrations'
        )
        key = (
            'bootstrap' if identity == 'bootstrap'
            else 'runtime' if identity == 'api'
            else 'audit' if identity == 'audit'
            else 'migration'
        )
        versions = receipt['versions']
        assert all(key_name in versions for key_name in [key, 'ca'])
        job = (
            f'samra-db-drain-recovery-{env}' if recovery
            else f'samra-db-{action}-{env}'
        )
        binding = (
            ('SAMRA_DATABASE_SETUP_JSON' if key == 'bootstrap' else 'DATABASE_URL')
            + '=' + names[key] + ':' + versions[key]
            + ',/secrets/ca/server-ca.pem=' + names['ca'] + ':' + versions['ca']
        )
        started_at = datetime.now(timezone.utc).isoformat()
        attempt = {
            'execution': None,
            'image': images['images']['migrations'],
            'startedAt': started_at,
            'status': {'outcome': 'in-progress'},
        }
        if recovery:
            recovery_jobs = receipt.setdefault('recoveryJobs', [])
            if (
                recovery_jobs
                and recovery_jobs[-1].get('status', {}).get('outcome')
                == 'in-progress'
            ):
                recovery_jobs[-1]['finishedAt'] = started_at
                recovery_jobs[-1]['status'] = {
                    'outcome': 'interrupted-unknown',
                    'failureReason': (
                        'Controller exited before recovery drain evidence '
                        'was finalized; a fresh read-only drain is required'
                    ),
                }
                save()
            recovery_jobs.append(attempt)
        else:
            assert action not in receipt['jobs'], 'Database action already has a receipt'
            receipt['jobs'][action] = attempt
        save()

        try:
            # A failed job intentionally leaves SQL running so no unresolved
            # financial work is hidden by an automatic shutdown.
            ensure_database_running(instance, project)
            if candidate and action in BOOTSTRAP_CHECKED_ACTIONS:
                absence = read_bootstrap_database_absence(env, project, instance)
                validate_bootstrap_database_absence(
                    absence, receipt, started_at,
                    datetime.now(timezone.utc).isoformat(),
                )
                attempt['bootstrapDatabaseAbsence'] = absence
                save()
            gcloud(
                'run', 'jobs', 'deploy', job,
                '--project='+project, '--region='+region,
                '--image='+images['images']['migrations'],
                '--service-account='+identities[identity],
                '--network=samra-'+env+'-vpc',
                '--subnet=samra-'+env+'-us-east4',
                '--vpc-egress=private-ranges-only', '--tasks=1',
                '--max-retries=0', '--task-timeout=600s', '--cpu=1',
                '--memory=512Mi', '--command=node',
                '--args=src/dev-test-database.mjs,'+action,
                '--set-secrets='+binding,
                '--set-env-vars=SAMRA_DEPLOYMENT_ENVIRONMENT='+env
                + ',GOOGLE_CLOUD_PROJECT='+project,
            )
            result = gcloud(
                'run', 'jobs', 'execute', job, '--project='+project,
                '--region='+region, '--wait',
            )
            attempt['execution'] = result['metadata']['name']
            attempt['status'] = result.get('status', {})
            assert attempt['status'].get('succeededCount') == 1, 'Job did not succeed'
        except Exception as error:
            finished_at = datetime.now(timezone.utc).isoformat()
            failure_reason = safe_failure_reason(error)
            attempt['finishedAt'] = finished_at
            if attempt.get('status', {}).get('outcome') == 'in-progress':
                attempt['status'] = {
                    'outcome': 'failed-or-unknown',
                    'failureReason': safe_failure_reason(error),
                }
            if candidate and not recovery and receipt.get('phase') != 'blocked-recovery-required':
                advance_candidate_receipt(
                    receipt, action, status='failed',
                    started_at=started_at, finished_at=finished_at,
                    migration_image=images['images']['migrations'],
                    execution=attempt.get('execution') or 'unresolved:'+job,
                    details={'failureReason': failure_reason},
                )
            save()
            raise

        attempt['finishedAt'] = datetime.now(timezone.utc).isoformat()
        if candidate and not recovery:
            advance_candidate_receipt(
                receipt, action, status='passed', started_at=started_at,
                finished_at=attempt['finishedAt'],
                migration_image=images['images']['migrations'],
                execution=attempt['execution'],
                details=({'bootstrapDatabaseAbsence': attempt['bootstrapDatabaseAbsence']}
                         if action in BOOTSTRAP_CHECKED_ACTIONS else None),
            )
        save()
        return attempt
    if opts.action == 'prepare-release':
        assert opts.prior_receipt, 'Prior source-bound receipt required'
        assert opts.prior_receipt_sha256 or opts.use_committed_baseline_evidence, 'Prior receipt trust evidence required'
        prior_path = Path(opts.prior_receipt)
        assert prior_path.resolve() != receipt_path.resolve(), 'Prior and new receipt paths must differ'
        prior_bytes = prior_path.read_bytes()
        prior = json.loads(prior_bytes)
        for image in ['api', 'customer-web', 'migrations']:
            prior_ref = prior['images'][image]
            assert re.fullmatch(re.escape(f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{image}') + r'@sha256:[a-f0-9]{64}', prior_ref)
            gcloud('artifacts', 'docker', 'images', 'describe', prior_ref, '--project='+project)
        if prior.get('phase') == 'rolled-back-paused':
            active_images = prior.get('priorRelease', {}).get('images', {})
            for image in ['api', 'customer-web', 'migrations']:
                active_ref = active_images.get(image, '')
                assert re.fullmatch(re.escape(f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{image}') + r'@sha256:[a-f0-9]{64}', active_ref), 'Rolled-back predecessor image is malformed'
                gcloud('artifacts', 'docker', 'images', 'describe', active_ref,
                       '--project='+project)
        versions = prior.get('versions', {})
        expected_access = {
            'runtime': {'serviceAccount:'+identities['api']},
            'migration': {'serviceAccount:'+identities['migrations']},
            'audit': {'serviceAccount:'+identities['audit']},
            'ca': {
                'serviceAccount:'+identities['api'],
                'serviceAccount:'+identities['migrations'],
                'serviceAccount:'+identities['audit'],
            },
        }
        for key, expected in expected_access.items():
            version = str(versions.get(key, ''))
            assert version.isdigit(), 'Prior numbered secret version missing'
            metadata = gcloud('secrets', 'versions', 'describe', version,
                              '--secret='+names[key], '--project='+project)
            assert metadata.get('state') == 'ENABLED', 'Required secret version is not enabled'
            policy = gcloud('secrets', 'get-iam-policy', names[key], '--project='+project)
            assert direct_secret_accessors(policy) == expected, 'Direct secret accessor boundary changed'
        bootstrap_version = str(versions.get('bootstrap', ''))
        assert bootstrap_version.isdigit(), 'Prior bootstrap secret version missing'
        metadata = gcloud('secrets', 'versions', 'describe', bootstrap_version,
                          '--secret='+names['bootstrap'], '--project='+project)
        assert metadata.get('state') == 'DISABLED', 'Bootstrap secret must remain disabled'
        policy = gcloud('secrets', 'get-iam-policy', names['bootstrap'], '--project='+project)
        assert not direct_secret_accessors(policy), 'Direct bootstrap secret access must remain removed'
        for key in ['api', 'customer-web', 'migrations', 'audit']:
            account = gcloud('iam', 'service-accounts', 'describe', identities[key], '--project='+project)
            assert not account.get('disabled', False), 'Required runtime identity is disabled'
        bootstrap_account = gcloud('iam', 'service-accounts', 'describe', identities['bootstrap'], '--project='+project)
        assert bootstrap_account.get('disabled') is True, 'Bootstrap identity must remain disabled'
        # SQL users.list is unavailable while the instance is stopped. The
        # pinned predecessor proves historical database-user retirement;
        # every normal candidate database job checks live absence after start.
        assert_no_active_operations(
            gcloud('run', 'jobs', 'executions', 'list', '--project='+project,
                   '--region='+region) or [],
            gcloud('sql', 'operations', 'list', '--instance='+instance,
                   '--project='+project) or [],
        )
        final_db = gcloud('sql', 'instances', 'describe', instance,
                          '--project='+project)
        services = {
            key: gcloud('run', 'services', 'describe', name, '--project='+project, '--region='+region)
            for key, name in [('api', 'samra-api-'+env), ('web', 'samra-customer-web-'+env)]
        }
        verify_direct_access_boundary(
            services['api'], services['web'],
            gcloud('run', 'services', 'get-iam-policy', 'samra-api-'+env,
                   '--project='+project, '--region='+region), env,
        )
        # Bind the receipt to the final database read, not the earlier network
        # inventory used to validate its private address and TLS settings.
        baseline_evidence = baseline_bytes = baseline_path = None
        baseline_expected_hash = baseline_commit = None
        baseline_provenance_bytes = None
        if opts.use_committed_baseline_evidence:
            baseline_path = inventory.get('runtimeEvidence')
            assert baseline_path, 'No committed baseline evidence is configured'
            baseline_expected_hash = inventory.get('runtimeEvidenceSha256')
            baseline_commit = inventory.get('runtimeEvidenceCommit')
            repository = Path(__file__).resolve().parents[2]
            resolved = (repository / baseline_path).resolve()
            try:
                resolved.relative_to(repository)
            except ValueError:
                raise AssertionError('Baseline evidence must remain inside the reviewed repository')
            baseline_bytes = resolved.read_bytes()
            baseline_evidence = json.loads(baseline_bytes)
            provenance = subprocess.run(
                ['git', '-C', str(repository), 'show', baseline_commit+':'+baseline_path],
                capture_output=True,
            )
            assert provenance.returncode == 0, 'Pinned baseline evidence commit is unavailable'
            baseline_provenance_bytes = provenance.stdout
        trust = prior_receipt_trust(
            prior, prior_bytes, project, opts.prior_receipt_sha256,
            baseline_evidence, baseline_path, baseline_bytes,
            baseline_expected_hash, baseline_commit, baseline_provenance_bytes,
        )
        predecessor_revisions = None
        if prior.get('phase') == 'rolled-back-paused':
            validate_rolled_back_candidate_receipt(prior)
            predecessor_revisions = {
                key: gcloud(
                    'run', 'revisions', 'describe',
                    prior['rollback']['services'][key]['revision'],
                    '--project='+project, '--region='+region,
                )
                for key in ['api', 'web']
            }
        iam_boundary = current_iam_boundary()
        promotion = None
        if env == 'test':
            assert opts.dev_sealed_receipt and opts.dev_sealed_receipt_sha256, 'Test requires a sealed Dev receipt and independent hash'
            dev_bytes = Path(opts.dev_sealed_receipt).read_bytes()
            promotion = verify_dev_promotion(
                json.loads(dev_bytes), dev_bytes,
                opts.dev_sealed_receipt_sha256, images,
            )
        else:
            assert not opts.dev_sealed_receipt and not opts.dev_sealed_receipt_sha256, 'Dev cannot consume a Dev promotion receipt'
        receipt = prepare_release_receipt(
            prior, trust, project, images, services, final_db, iam_boundary,
            datetime.now(timezone.utc).isoformat(),
            predecessor_revisions,
        )
        if promotion:
            receipt['devPromotion'] = promotion
        save()
        print(json.dumps({
            'project': project,
            'sourceSha': images['sourceSha'],
            'priorSourceSha': receipt['priorRelease']['sourceSha'],
            'status': 'release-prepared-paused-direct-iam-verified',
        }))
    elif opts.action == 'prepare-database':
        assert not receipt['versions'], 'Secrets already prepared; inspect instead of overwriting'
        existing = gcloud('secrets','list','--project='+project) or []
        assert not any(x['name'].rsplit('/',1)[1] in names.values() for x in existing), 'Existing secret: inspect before retry'
        for identity in ['audit','bootstrap']:
            gcloud('iam','service-accounts','create',f'samra-{identity}-{env}','--project='+project)
        gcloud('sql','instances','patch',instance,'--project='+project,'--activation-policy=ALWAYS')
        users = gcloud('sql','users','list','--instance='+instance,'--project='+project)
        assert not any(x['name'].startswith('samra_') for x in users), 'Existing database principals require audit'
        passwords = {key:secrets.token_urlsafe(48) for key in ['bootstrap','migration','runtime','audit']}
        usernames = {key:'samra_'+('migrations' if key=='migration' else key)+'_'+env for key in passwords}
        token = subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
        body = json.dumps({'name':usernames['bootstrap'],'password':passwords['bootstrap'],'type':'BUILT_IN'}).encode()
        request = urllib.request.Request(f'https://sqladmin.googleapis.com/sql/v1beta4/projects/{project}/instances/{instance}/users',data=body,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(request) as response: operation=json.load(response)
        gcloud('sql','operations','wait',operation['name'],'--project='+project,'--timeout=300')
        del token, body, request
        ca = db['serverCaCert']['cert']
        urls = {key:f'postgresql://{usernames[key]}:{passwords[key]}@{ip}:5432/samra_{env}?sslmode=verify-ca&sslrootcert=/secrets/ca/server-ca.pem&uselibpqcompat=true' for key in passwords}
        versions=receipt['versions']
        versions['ca']=secret(project,names['ca'],ca,identities['bootstrap']); save()
        for key, identity in [('migration','migrations'),('runtime','api'),('audit','audit')]:
            versions[key]=secret(project,names[key],urls[key],identities[identity]);save()
            gcloud('secrets','add-iam-policy-binding',names['ca'],'--project='+project,'--member=serviceAccount:'+identities[identity],'--role=roles/secretmanager.secretAccessor')
        payload={key+'DatabaseUrl':value for key,value in urls.items()}
        versions['bootstrap']=secret(project,names['bootstrap'],json.dumps(payload),identities['bootstrap']);save()
        print('Database prerequisites prepared; bootstrap/migration not yet executed.')
    elif opts.action == 'database-job':
        action = opts.job_action
        assert action
        attempt = run_database_action(action)
        print(json.dumps({
            'project': project,
            'action': action,
            'execution': attempt['execution'],
            'status': 'passed',
        }))
    elif opts.action == 'retire-bootstrap':
        assert 'bootstrap' in receipt['jobs'] and receipt['jobs']['bootstrap']['status'].get('succeededCount') == 1
        # The bootstrap principal has no owned objects or permanent grant chains.
        gcloud('sql','users','delete','samra_bootstrap_'+env,'--instance='+instance,'--project='+project)
        gcloud('secrets','versions','disable',receipt['versions']['bootstrap'],'--secret='+names['bootstrap'],'--project='+project)
        gcloud('secrets','remove-iam-policy-binding',names['bootstrap'],'--project='+project,'--member=serviceAccount:'+identities['bootstrap'],'--role=roles/secretmanager.secretAccessor')
        gcloud('secrets','remove-iam-policy-binding',names['ca'],'--project='+project,'--member=serviceAccount:'+identities['bootstrap'],'--role=roles/secretmanager.secretAccessor')
        gcloud('iam','service-accounts','disable',identities['bootstrap'],'--project='+project)
        receipt['bootstrapRetired']=True;save()
    elif opts.action in ['start', 'stop']:
        def drain_job():
            return run_database_action('drain', stop_owned=True)
        def pre_start_check():
            if receipt.get('priorRelease'):
                require_unchanged_iam()
                require_no_active_operations()
        control_session(
            opts.action, env, inventory, receipt, save, drain_job,
            check_readiness, check_web_readiness, pre_start_check,
        )
        print(json.dumps({'project': project, 'session': opts.action, 'status': 'passed'}))
    elif opts.action == 'deploy':
        assert receipt.get('bootstrapRetired'), 'Temporary access must be retired first'
        candidate = bool(receipt.get('priorRelease'))
        if candidate:
            validate_candidate_action(receipt, 'deploy')
            require_unchanged_iam()
            require_no_active_operations()
            validate_predecessor_services(
                receipt, read_services(env, project, region),
            )
        assert all(receipt['jobs'].get(k,{}).get('status',{}).get('succeededCount')==1 for k in ['migrate','audit-runtime','audit-reader'])
        number=inventory['projectNumber']; api=f'samra-api-{env}';web=f'samra-customer-web-{env}'
        apiurl=f'https://{api}-{number}.{region}.run.app';weburl=inventory['web']['plannedUrl']
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            with tempfile.TemporaryDirectory(prefix='samra-runtime-') as directory:
                api_env=dict(inventory['api']['runtimeEnvironment'],SAMRA_ALLOWED_ORIGINS=weburl)
                web_env=dict(inventory['web']['runtimeEnvironment'],SAMRA_API_ORIGIN=apiurl,SAMRA_API_SERVICE_AUDIENCE=apiurl,SAMRA_API_SERVICE_AUTH_MODE='cloud-run-iam')
                ap=Path(directory)/'api.json';wp=Path(directory)/'web.json';ap.write_text(json.dumps(api_env));wp.write_text(json.dumps(web_env))
                common=['--project='+project,'--region='+region,'--cpu=1','--memory=512Mi','--max-instances=1','--concurrency=40','--timeout=60s']
                gcloud('run','deploy',api,*common,'--image='+images['images']['api'],'--service-account='+identities['api'],'--no-allow-unauthenticated','--invoker-iam-check','--no-cpu-throttling','--scaling=0','--network=samra-'+env+'-vpc','--subnet=samra-'+env+'-us-east4','--vpc-egress=private-ranges-only','--env-vars-file='+str(ap),'--set-secrets=DATABASE_URL='+names['runtime']+':'+receipt['versions']['runtime']+',/secrets/ca/server-ca.pem='+names['ca']+':'+receipt['versions']['ca'])
                gcloud('run','services','add-iam-policy-binding',api,'--project='+project,'--region='+region,'--member=serviceAccount:'+identities['customer-web'],'--role=roles/run.invoker')
                # Only the login shell is public; the upstream API remains IAM protected.
                gcloud('run','deploy',web,*common,'--image='+images['images']['customer-web'],'--service-account='+identities['customer-web'],'--no-invoker-iam-check','--scaling=0','--min-instances=0','--env-vars-file='+str(wp))
            deployed = read_services(env, project, region)
            for key, image_key in [('api', 'api'), ('web', 'customer-web')]:
                validate_exact_service(
                    deployed[key], deployed[key], images['images'][image_key], 0,
                )
            verify_direct_access_boundary(
                deployed['api'], deployed['web'],
                gcloud('run','services','get-iam-policy',api,'--project='+project,'--region='+region),env,
            )
            current = current_iam_boundary()
            verify_current_iam_boundary(receipt, current)
            repeated = read_services(env, project, region)
            for key, image_key in [('api', 'api'), ('web', 'customer-web')]:
                validate_exact_service(
                    repeated[key], deployed[key], images['images'][image_key], 0,
                )
        except Exception as error:
            finished_at = datetime.now(timezone.utc).isoformat()
            if candidate and receipt.get('phase') != 'blocked-recovery-required':
                advance_candidate_receipt(
                    receipt, 'deploy', status='failed',
                    started_at=started_at, finished_at=finished_at,
                    migration_image=images['images']['migrations'],
                    details={'failureReason': safe_failure_reason(error)},
                )
                save()
            if candidate:
                try:
                    perform_candidate_rollback(
                        receipt, env, project, region, instance,
                        lambda: run_database_action('drain', recovery=True),
                        save, 'deploy-failure',
                    )
                    print(json.dumps({
                        'project': project,
                        'phase': 'rolled-back-paused',
                        'trigger': 'deploy-failure',
                        'receiptSha256': hashlib.sha256(
                            receipt_path.read_bytes(),
                        ).hexdigest(),
                    }))
                except Exception:
                    pass
            raise
        receipt['services'] = deployed
        finished_at = datetime.now(timezone.utc).isoformat()
        if candidate:
            advance_candidate_receipt(
                receipt, 'deploy', status='passed',
                started_at=started_at, finished_at=finished_at,
                migration_image=images['images']['migrations'],
            )
        save()
        print(json.dumps({
            'project': project,
            'webUrl': weburl,
            'functionalAcceptance': False,
        }))
    elif opts.action == 'record-acceptance':
        assert receipt.get('priorRelease'), 'Acceptance requires a candidate release receipt'
        validate_candidate_action(receipt, 'acceptance')
        require_unchanged_iam()
        require_no_active_operations()
        validate_candidate_services(
            receipt, read_services(env, project, region), 1,
        )
        assert opts.acceptance_evidence and opts.acceptance_evidence_sha256, 'Acceptance evidence and independent hash are required'
        acceptance_bytes = Path(opts.acceptance_evidence).read_bytes()
        actual_hash = hashlib.sha256(acceptance_bytes).hexdigest()
        assert re.fullmatch('[a-f0-9]{64}', opts.acceptance_evidence_sha256), 'Acceptance evidence hash is malformed'
        assert secrets.compare_digest(actual_hash, opts.acceptance_evidence_sha256), 'Acceptance evidence hash changed'
        evidence = json.loads(acceptance_bytes)
        summary = verify_acceptance_evidence(evidence, receipt, env)
        finished_at = datetime.now(timezone.utc).isoformat()
        advance_candidate_receipt(
            receipt, 'acceptance', status='passed',
            started_at=summary['observedAt'], finished_at=finished_at,
            migration_image=images['images']['migrations'],
            details={'acceptanceEvidenceSha256': actual_hash, **summary},
        )
        receipt['functionalAcceptance'] = {
            'status': 'passed',
            'evidenceSha256': actual_hash,
            **summary,
        }
        save()
        print(json.dumps({'project': project, 'acceptance': 'passed', 'testerCount': 2}))
    elif opts.action == 'seal':
        assert receipt.get('priorRelease'), 'Sealing requires a candidate release receipt'
        require_unchanged_iam()
        require_no_active_operations()
        validate_candidate_services(
            receipt, read_services(env, project, region), 0,
        )
        final_db = gcloud('sql', 'instances', 'describe', instance,
                          '--project='+project)
        assert final_db.get('state') == 'STOPPED', 'Sealing requires a stopped database'
        assert final_db.get('settings', {}).get('activationPolicy') == 'NEVER', 'Sealing requires database activation disabled'
        sealed_at = datetime.now(timezone.utc).isoformat()
        digest = seal_candidate_receipt(
            receipt, receipt_path, started_at=sealed_at,
            finished_at=sealed_at,
            migration_image=images['images']['migrations'],
        )
        print(json.dumps({'project': project, 'phase': 'sealed', 'receiptSha256': digest}))
    elif opts.action == 'rollback':
        assert receipt.get('priorRelease'), 'Rollback requires a candidate release receipt'
        history = verify_candidate_history(receipt)
        assert history['phase'] in ROLLBACK_PHASES, 'Rollback is unavailable from this candidate phase'
        require_no_active_operations()
        perform_candidate_rollback(
            receipt, env, project, region, instance,
            lambda: run_database_action('drain', recovery=True), save,
            'operator-requested',
        )
        receipt_digest = hashlib.sha256(receipt_path.read_bytes()).hexdigest()
        print(json.dumps({
            'project': project,
            'phase': 'rolled-back-paused',
            'receiptSha256': receipt_digest,
        }))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(
            'Activation stopped: ' + safe_failure_reason(error)
            + '. Inspect the sanitized receipt; no credentials logged.',
            file=sys.stderr,
        )
        sys.exit(1)
