"""Persist compact native-UI capture output. No browser automation or network."""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
filename = sys.argv[1]
if filename not in {'late-normal-checkpoint.json', 'early-normal-checkpoint.json', 'toric-checkpoint.json', 'root-normal-checkpoint.json'}:
    raise SystemExit('Unexpected checkpoint name')
target = root / 'artifacts' / 'escrs-constants-039' / filename
target.parent.mkdir(parents=True, exist_ok=True)
incoming = json.load(sys.stdin)
if isinstance(incoming, dict):
    incoming = incoming['data']
rows = json.loads(target.read_text(encoding='utf-8')) if target.exists() else []
by_key = {(row['manufacturer'], row['mode'], row['optionIndex']): row for row in rows}
for item in incoming:
    if isinstance(item, dict):
        record = item
    else:
        manufacturer, index, label, values, captured_at = item
        record = dict(manufacturer=manufacturer, mode='toric' if filename.startswith('toric') else 'non-toric',
                      optionIndex=index, label=label, values=values, capturedAt=captured_at,
                      verifiedAfterClear=True, captureMethod='native-reset')
    assert len(record['values']) == 7
    assert all(value is None or isinstance(value, str) for value in record['values'])
    assert record['verifiedAfterClear'] is True
    by_key[(record['manufacturer'], record['mode'], record['optionIndex'])] = record
target.write_text(json.dumps(list(by_key.values()), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checkpoint': filename, 'rows': len(by_key)}))
