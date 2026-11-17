"""Persist compact, manually observed research batches without normalizing values."""
import argparse
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('checkpoint')
parser.add_argument('--toric-reveal', action='store_true')
args = parser.parse_args()
target = Path(args.checkpoint).resolve()
root = Path(__file__).resolve().parents[1]
if root not in target.parents:
    raise SystemExit('Checkpoint must stay within the workspace')
master = json.loads((root / 'artifacts/lens-catalog-038/escrs-master.json').read_text(encoding='utf-8'))
rows = json.loads(target.read_text(encoding='utf-8')) if target.exists() else []
incoming = json.load(sys.stdin)
for item in incoming:
    if isinstance(item, list):
        manufacturer, mode, index, values, captured_at = item
        branch = next(x for x in master['captures'] if x['manufacturer'] == manufacturer and x['mode'] == mode)
        item = dict(manufacturer=manufacturer, mode=mode, optionIndex=index,
                    label=branch['options'][index], values=values, capturedAt=captured_at,
                    verifiedAfterClear=True)
    if len(item['values']) != 7:
        raise SystemExit('Expected exactly seven raw formula slots')
    if args.toric_reveal:
        item.update(exposed=[True] * 7, selectionContext='toric', revealedInMode='non-toric', sourceSelectionVerified=True)
    key = (item['manufacturer'], item['mode'], item['optionIndex'])
    rows = [x for x in rows if (x['manufacturer'], x['mode'], x['optionIndex']) != key]
    rows.append(item)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(total=len(rows), fullToric=sum(x.get('revealedInMode') == 'non-toric' for x in rows))))
