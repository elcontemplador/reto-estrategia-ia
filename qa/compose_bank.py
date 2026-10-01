"""Reconstruye el banco jugable desde los tres bloques editoriales versionados."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Comprueba sin reescribir el banco')
args = parser.parse_args()
rows = []
for block in ['conceptos', 'historia', 'sociedad']:
    rows.extend({**q, 'track': block} for q in json.loads((ROOT / 'data' / f'{block}.json').read_text(encoding='utf-8')))
assert len(rows) == len({q['id'] for q in rows}) == 1000
assert len({q['factKey'] for q in rows}) == 1000
assert len({q['prompt'].casefold() for q in rows}) == 1000
payload = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
target = ROOT / 'dist' / 'questions.json'
if args.check:
    if target.read_bytes() != payload:
        raise SystemExit('El banco jugable no coincide con data/. Ejecuta python qa/compose_bank.py y revisa el cambio.')
else:
    target.write_bytes(payload)
print(json.dumps({'questions': len(rows), 'sha256': hashlib.sha256(payload).hexdigest(), 'mode': 'check' if args.check else 'build'}))
