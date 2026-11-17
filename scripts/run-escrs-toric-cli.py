"""Checkpoint normal UI batches through the installed Playwright CLI, no CDP."""
import argparse
import json
import pathlib
import subprocess
import time

root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--session',default='escrstoric039')
parser.add_argument('--tasks',default='output/playwright/escrs-toric-early-tasks.json')
parser.add_argument('--checkpoint',default='artifacts/escrs-constants-039/toric-checkpoint.json')
parser.add_argument('--template',default='scripts/escrs-cli-toric-template.cjs')
parser.add_argument('--batch',type=int,default=7)
args=parser.parse_args()
if not args.session.replace('-','').isalnum():raise SystemExit('Invalid session')
def task_path(value):
    p=(root/value).resolve()
    if root not in p.parents:raise SystemExit('Path outside workspace')
    return p
tasks=json.loads(task_path(args.tasks).read_text(encoding='utf-8'))
checkpoint=task_path(args.checkpoint)
template=task_path(args.template).read_text(encoding='utf-8')
script=root/'output/playwright'/f'{args.session}-batch.cjs'
last=root/'output/playwright'/f'{args.session}-last-result.json'
key=lambda r:(r['manufacturer'],r.get('mode','non-toric'),r['optionIndex'])
records={key(r):r for r in json.loads(checkpoint.read_text(encoding='utf-8'))} if checkpoint.exists() else {}
records={k:v for k,v in records.items() if v.get('sourceSelectionVerified') and v.get('revealedInMode')=='non-toric'}
failures=0
while True:
    pending=[t for t in tasks if key(t) not in records]
    if not pending:break
    batch=pending[:max(1,min(args.batch,8))]
    script.write_text(template.replace('__TASKS__',json.dumps(batch,ensure_ascii=False)),encoding='utf-8')
    command=['playwright-cli.cmd',f'-s={args.session}','--raw','run-code','--filename',str(script.relative_to(root))]
    started=time.monotonic()
    try:
        completed=subprocess.run(command,cwd=root,capture_output=True,encoding='utf-8',errors='replace',timeout=150)
        last.write_text(completed.stdout,encoding='utf-8')
        result=json.loads(completed.stdout)
        for row in result.get('rows',[]):
            task=next((t for t in tasks if key(t)==key(row)),None)
            if not task or task['label']!=row['label'] or not row.get('verifiedAfterClear') or len(row['values'])!=7:
                raise ValueError('Invalid observation identity')
            if not all(v is None or isinstance(v,str) and v.strip() and float(v)==float(v) for v in row['values']):
                raise ValueError('Invalid raw numeric value')
            records[key(row)]=row
        checkpoint.write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'saved':len(records),'target':len(tasks),'seconds':round(time.monotonic()-started,1),'ok':result.get('ok'),'next':result.get('next'),'error':result.get('error')},ensure_ascii=False),flush=True)
        if not result.get('ok'):
            failures+=1
            if failures>=3:raise SystemExit('Stopped after three failed UI batches; verified checkpoint preserved')
        else:failures=0
    except (subprocess.TimeoutExpired,json.JSONDecodeError) as error:
        raise SystemExit(f'UI command failed; checkpoint preserved: {error}')
print(json.dumps({'complete':True,'saved':len(records),'target':len(tasks)}),flush=True)
