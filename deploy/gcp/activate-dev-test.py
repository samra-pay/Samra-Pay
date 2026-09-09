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
import urllib.request
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['dev', 'test'])
    parser.add_argument('action', choices=['prepare-database', 'database-job', 'retire-bootstrap', 'deploy'])
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
        assert re.fullmatch(f'us-east4-docker.pkg.dev/{project}/samra-{env}/samra-{image}@sha256:[a-f0-9]{{64}}', images['images'][image])
        gcloud('artifacts','docker','images','describe', images['images'][image], '--project='+project)
    inventory = json.loads((Path(__file__).parent/'dev-test-environments.json').read_text())['environments'][env]
    db = gcloud('sql','instances','describe',instance,'--project='+project)
    assert db['settings']['ipConfiguration']['ipv4Enabled'] is False
    assert db['settings']['ipConfiguration']['sslMode'] == 'ENCRYPTED_ONLY'
    assert db['settings']['ipConfiguration']['serverCaMode'] == 'GOOGLE_MANAGED_INTERNAL_CA'
    assert db['settings']['ipConfiguration']['privateNetwork'].endswith('/samra-'+env+'-vpc')
    ip = next(x['ipAddress'] for x in db['ipAddresses'] if x['type']=='PRIVATE')
    assert ip.startswith('10.61.' if env=='dev' else '10.71.')
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        assert receipt['project'] == project
    else:
        receipt = {'project':project,'sourceSha':images['sourceSha'],'versions':{},'jobs':{}}
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
            gcloud('run','deploy',api,*common,'--image='+images['images']['api'],'--service-account='+identities['api'],'--no-allow-unauthenticated','--no-cpu-throttling','--scaling=1','--network=samra-'+env+'-vpc','--subnet=samra-'+env+'-us-east4','--vpc-egress=private-ranges-only','--env-vars-file='+str(ap),'--set-secrets=DATABASE_URL='+names['runtime']+':'+receipt['versions']['runtime']+',/secrets/ca/server-ca.pem='+names['ca']+':'+receipt['versions']['ca'])
            gcloud('run','services','add-iam-policy-binding',api,'--project='+project,'--region='+region,'--member=serviceAccount:'+identities['customer-web'],'--role=roles/run.invoker')
            gcloud('run','deploy',web,*common,'--image='+images['images']['customer-web'],'--service-account='+identities['customer-web'],'--allow-unauthenticated','--min-instances=0','--env-vars-file='+str(wp))
        receipt['services']={key:gcloud('run','services','describe',name,'--project='+project,'--region='+region) for key,name in [('api',api),('web',web)]};save()
        print(json.dumps({'project':project,'webUrl':weburl,'functionalAcceptance':False}))

if __name__ == '__main__':
    try: main()
    except Exception:
        print('Activation stopped. Inspect the named resource metadata and sanitized job status; no credentials logged.',file=sys.stderr)
        sys.exit(1)
