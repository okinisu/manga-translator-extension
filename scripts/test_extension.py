from pathlib import Path
import subprocess,json
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for f in sorted(ROOT.glob('*tests.cjs')):
 r=subprocess.run(['node',f.name],cwd=ROOT,capture_output=True,text=True,timeout=120)
 rows.append({'file':f.name,'passed':r.returncode==0,'output':(r.stdout+r.stderr).strip()})
 print(('PASS ' if r.returncode==0 else 'FAIL ')+f.name,flush=True)
for f in sorted(ROOT.glob('*.js')):
 r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
 if r.returncode:rows.append({'file':f.name,'passed':False,'output':r.stderr})
(ROOT/'TEST-RESULTS.json').write_text(json.dumps({'passed':all(x['passed'] for x in rows),'suites':len(list(ROOT.glob('*tests.cjs'))),'checks':rows},ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if all(x['passed'] for x in rows) else 1)
