#!/usr/bin/env python3
"""Operator-run native Dev/Test setup. No production target or credential output."""
import argparse
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


def verify_access_boundary(api, web, policy, env):
    def public(service):
        return str(service['metadata'].get('annotations', {}).get('run.googleapis.com/invoker-iam-disabled', 'false')).lower() == 'true'
    assert not public(api), 'API must enforce Cloud Run IAM'
    assert public(web), 'Customer login shell is not publicly reachable'
    bindings = [b for b in policy.get('bindings', []) if b['role'] == 'roles/run.invoker']
    expected = 'serviceAccount:samra-customer-web-'+env+'@samra-pay-'+env+'.iam.gserviceaccount.com'
    assert len(bindings) == 1 and not bindings[0].get('condition') and set(bindings[0]['members']) == {expected}, 'Unexpected API invocation access'


def control_session(action, env, inventory, receipt, save, drain_job, ready, web_ready):
    """Close ingress before draining; failures never stop the worker/database."""
    project = 'samra-pay-' + env
    common = ['--project=' + project, '--region=us-east4']
    api = 'samra-api-' + env
    web = 'samra-customer-web-' + env
    instance = 'samra-' + env + '-postgres'
    assert receipt.get('bootstrapRetired') and receipt.get('services')
    assert action in ['start', 'stop']
    current_services = {}
    for key, name in [('api', api), ('web', web)]:
        current = gcloud('run', 'services', 'describe', name, *common)
        current_services[key] = current
        recorded = receipt['services'][key]
        assert current['status']['latestReadyRevisionName'] == recorded['status']['latestReadyRevisionName'], 'Service revision changed'
        assert current['spec']['template']['spec']['containers'][0]['image'] == receipt['images']['api' if key == 'api' else 'customer-web']
        assert current['spec']['template']['spec']['timeoutSeconds'] <= 60
        # Manual zero does not disable tagged revision URLs. Refuse split/tagged
        # traffic rather than claiming these sessions have closed ingress.
        assert not any(x.get('tag') for x in current['spec'].get('traffic', []) + current['status'].get('traffic', [])), 'Tagged traffic requires review'
        traffic = [x for x in current['status']['traffic'] if x.get('percent', 0)]
        assert len(traffic) == 1 and traffic[0]['percent'] == 100
        assert traffic[0]['revisionName'] == recorded['status']['latestReadyRevisionName']
    # Explicitly close the browser entry point before either start or stop.
    gcloud('run', 'services', 'update', web, *common, '--scaling=0')
    closed = gcloud('run', 'services', 'describe', web, *common)['metadata']['annotations']
    assert closed['run.googleapis.com/scalingMode'] == 'manual'
    assert str(closed['run.googleapis.com/manualInstanceCount']) == '0'
    session = {'action': action, 'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'in-progress'}
    receipt.setdefault('sessions', []).append(session)
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
            verify_access_boundary(current_services['api'], current_services['web'],
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
        for key, name in [('api', api), ('web', web)]:
            current = gcloud('run', 'services', 'describe', name, *common)
            annotations = current['metadata']['annotations']
            assert annotations['run.googleapis.com/scalingMode'] == 'manual'
            assert str(annotations['run.googleapis.com/manualInstanceCount']) == ('0' if action == 'stop' else '1')
        db = gcloud('sql', 'instances', 'describe', instance, '--project=' + project)
        assert db['settings']['activationPolicy'] == ('NEVER' if action == 'stop' else 'ALWAYS')
        session['status'] = 'passed'
    except Exception:
        session['status'] = 'blocked-recovery-required'
        raise
    finally:
        session['finishedAt'] = datetime.now(timezone.utc).isoformat()
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


def main():
    if not __debug__:
        raise RuntimeError('Optimized Python disables validation and is unsupported')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['dev', 'test'])
    parser.add_argument('action', choices=['prepare-database', 'database-job', 'retire-bootstrap', 'deploy', 'start', 'stop'])
    parser.add_argument('--images', required=True, help='Reviewed publication JSON with sourceSha and images digest map')
    parser.add_argument('--receipt', required=True, help='Sanitized per-environment operator receipt')
    parser.add_argument('--job-action', choices=['bootstrap','migrate','audit-migration','audit-runtime','audit-reader','drain'])
    opts = parser.parse_args()
    env = opts.environment
    project = 'samra-pay-'+env
    region = 'us-east4'
    instance = 'samra-'+env+'-postgres'
    receipt_path = Path(opts.receipt)
    images = json.loads(Path(opts.images).read_text())
    assert re.fullmatch('[a-f0-9]{40}', images['sourceSha'])
    for image in ['api','customer-web','migrations']:
        assert re.fullmatch(re.escape(f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{image}') + r'@sha256:[a-f0-9]{64}', images['images'][image])
        gcloud('artifacts','docker','images','describe', images['images'][image], '--project='+project)
    inventory = json.loads((Path(__file__).parent/'dev-test-environments.json').read_text())['environments'][env]
    cloud_project = gcloud('projects', 'describe', project)
    assert str(cloud_project['projectNumber']) == inventory['projectNumber']
    db = gcloud('sql','instances','describe',instance,'--project='+project)
    assert db['settings']['ipConfiguration']['ipv4Enabled'] is False
    assert db['settings']['ipConfiguration']['sslMode'] == 'ENCRYPTED_ONLY'
    assert db['settings']['ipConfiguration']['serverCaMode'] == 'GOOGLE_MANAGED_INTERNAL_CA'
    assert db['settings']['ipConfiguration']['privateNetwork'].endswith('/samra-'+env+'-vpc')
    ip = next(x['ipAddress'] for x in db['ipAddresses'] if x['type']=='PRIVATE')
    assert ip.startswith('10.61.' if env=='dev' else '10.71.')
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        verify_receipt(receipt, project, images)
    else:
        assert opts.action == 'prepare-database', 'Existing receipt required'
        receipt = {'project':project,'sourceSha':images['sourceSha'],'images':images['images'],'versions':{},'jobs':{}}
    identities = {key:f'samra-{key}-{env}@{project}.iam.gserviceaccount.com' for key in ['api','customer-web','migrations','audit','bootstrap']}
    names = {key:f'samra-{env}-{suffix}' for key,suffix in {'runtime':'database-url','migration':'migration-database-url','audit':'audit-database-url','ca':'database-ca','bootstrap':'database-setup'}.items()}
    def save():
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
    if opts.action == 'prepare-database':
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
        action=opts.job_action; assert action
        identity = 'bootstrap' if action=='bootstrap' else 'api' if action=='audit-runtime' else 'audit' if action in ['audit-reader','drain'] else 'migrations'
        key = 'bootstrap' if identity=='bootstrap' else 'runtime' if identity=='api' else 'audit' if identity=='audit' else 'migration'
        versions=receipt['versions']; assert all(k in versions for k in [key,'ca'])
        job=f'samra-db-{action}-{env}'
        binding=('SAMRA_DATABASE_SETUP_JSON' if key=='bootstrap' else 'DATABASE_URL')+'='+names[key]+':'+versions[key]
        binding+=',/secrets/ca/server-ca.pem='+names['ca']+':'+versions['ca']
        gcloud('run','jobs','deploy',job,'--project='+project,'--region='+region,
          '--image='+images['images']['migrations'],'--service-account='+identities[identity],
          '--network=samra-'+env+'-vpc','--subnet=samra-'+env+'-us-east4','--vpc-egress=private-ranges-only',
          '--tasks=1','--max-retries=0','--task-timeout=600s','--cpu=1','--memory=512Mi',
          '--command=node','--args=src/dev-test-database.mjs,'+action,'--set-secrets='+binding,
          '--set-env-vars=SAMRA_DEPLOYMENT_ENVIRONMENT='+env+',GOOGLE_CLOUD_PROJECT='+project)
        result=gcloud('run','jobs','execute',job,'--project='+project,'--region='+region,'--wait')
        receipt['jobs'][action]={'execution':result['metadata']['name'],'status':result.get('status',{})};save()
        assert result.get('status',{}).get('succeededCount') == 1, 'Job did not succeed'
        print(json.dumps({'project':project,'action':action,'execution':result['metadata']['name'],'status':'passed'}))
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
            subprocess.run([sys.executable, str(Path(__file__).resolve()), env, 'database-job', '--images', str(Path(opts.images).resolve()), '--receipt', str(receipt_path.resolve()), '--job-action', 'drain'], check=True)
            updated = json.loads(receipt_path.read_text())
            verify_receipt(updated, project, images)
            receipt['jobs'] = updated['jobs']
        control_session(opts.action, env, inventory, receipt, save, drain_job, check_readiness, check_web_readiness)
        print(json.dumps({'project': project, 'session': opts.action, 'status': 'passed'}))
    elif opts.action == 'deploy':
        assert receipt.get('bootstrapRetired'), 'Temporary access must be retired first'
        assert all(receipt['jobs'].get(k,{}).get('status',{}).get('succeededCount')==1 for k in ['migrate','audit-runtime','audit-reader'])
        number=inventory['projectNumber']; api=f'samra-api-{env}';web=f'samra-customer-web-{env}'
        apiurl=f'https://{api}-{number}.{region}.run.app';weburl=inventory['web']['plannedUrl']
        with tempfile.TemporaryDirectory(prefix='samra-runtime-') as directory:
            api_env=dict(inventory['api']['runtimeEnvironment'],SAMRA_ALLOWED_ORIGINS=weburl)
            web_env=dict(inventory['web']['runtimeEnvironment'],SAMRA_API_ORIGIN=apiurl,SAMRA_API_SERVICE_AUDIENCE=apiurl,SAMRA_API_SERVICE_AUTH_MODE='cloud-run-iam')
            ap=Path(directory)/'api.json';wp=Path(directory)/'web.json';ap.write_text(json.dumps(api_env));wp.write_text(json.dumps(web_env))
            common=['--project='+project,'--region='+region,'--cpu=1','--memory=512Mi','--max-instances=1','--concurrency=40','--timeout=60s']
            gcloud('run','deploy',api,*common,'--image='+images['images']['api'],'--service-account='+identities['api'],'--no-allow-unauthenticated','--invoker-iam-check','--no-cpu-throttling','--scaling=0','--network=samra-'+env+'-vpc','--subnet=samra-'+env+'-us-east4','--vpc-egress=private-ranges-only','--env-vars-file='+str(ap),'--set-secrets=DATABASE_URL='+names['runtime']+':'+receipt['versions']['runtime']+',/secrets/ca/server-ca.pem='+names['ca']+':'+receipt['versions']['ca'])
            gcloud('run','services','add-iam-policy-binding',api,'--project='+project,'--region='+region,'--member=serviceAccount:'+identities['customer-web'],'--role=roles/run.invoker')
            # allUsers grants can fail as a warning under domain-restricted
            # sharing. Use Cloud Run's supported public-service setting only
            # for the login shell; keep the upstream API IAM-protected.
            gcloud('run','deploy',web,*common,'--image='+images['images']['customer-web'],'--service-account='+identities['customer-web'],'--no-invoker-iam-check','--scaling=0','--min-instances=0','--env-vars-file='+str(wp))
        receipt['services']={key:gcloud('run','services','describe',name,'--project='+project,'--region='+region) for key,name in [('api',api),('web',web)]};save()
        verify_access_boundary(receipt['services']['api'], receipt['services']['web'],
                               gcloud('run','services','get-iam-policy',api,'--project='+project,'--region='+region),env)
        print(json.dumps({'project':project,'webUrl':weburl,'functionalAcceptance':False}))

if __name__ == '__main__':
    try: main()
    except Exception:
        print('Activation stopped. Inspect the named resource metadata and sanitized job status; no credentials logged.',file=sys.stderr)
        sys.exit(1)
