"""Package the verified MV3 build, checking archive bytes and CRC before release."""
import hashlib
import json
import pathlib
import re
import zipfile

root=pathlib.Path(__file__).resolve().parents[1]
dist=(root/'dist').resolve()
assert root in dist.parents
manifest=json.loads((dist/'manifest.json').read_text(encoding='utf-8'))
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
assert manifest['version']==version
log=(root/'artifacts'/f'check-{version}.log').read_text(encoding='utf-8',errors='replace')
passed=re.findall(r'ℹ pass (\d+)',log)
failed=re.findall(r'ℹ fail (\d+)',log)
assert passed and failed[-1]=='0' and 'Chrome MV3 extension ready: dist/' in log
files=sorted(p for p in dist.rglob('*') if p.is_file())
assert all(not p.is_symlink() and dist in p.resolve().parents for p in files)
archive=root/f'biometry-clip-{version}.zip'
temporary=archive.with_suffix('.zip.tmp')
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as output:
    for path in files:output.write(path,path.relative_to(dist).as_posix())
with zipfile.ZipFile(temporary) as output:
    assert output.testzip() is None
    assert len(output.namelist())==len(files)
    assert json.loads(output.read('manifest.json'))['version']==version
    for filename in ['manifest.json','index.html','background.js','floating.js','result-probe.js','icons/16.png','icons/48.png','icons/128.png']:
        assert output.read(filename)==(dist/filename).read_bytes()
temporary.replace(archive)
digest=hashlib.sha256()
with archive.open('rb') as stream:
    for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
preview_path=root/'artifacts'/f'ui-preview-{version}.json'
preview=json.loads(preview_path.read_text(encoding='utf-8')) if preview_path.exists() else None
metadata={'version':version,'bytes':archive.stat().st_size,'sha256':digest.hexdigest(),'files':len(files),'archiveCrc':'passed','testsPassed':int(passed[-1]),'native15SiteRunVerified':False,'uiPreviewVerified':preview}
(root/'artifacts'/f'package-{version}.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False))
