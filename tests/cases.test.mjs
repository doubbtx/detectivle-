// Opublikowane sprawy (cases/*.json) nie mogą się zmieniać i muszą być poprawne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveCase, qualityIssues } from '../js/solver.js';
import { caseFingerprint } from '../js/generator.js';

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'cases');
const has = existsSync(join(dir, 'manifest.json'));

test('opublikowane sprawy zgadzają się z manifestem (nikt ich nie przepisał)', { skip: !has }, () => {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  assert.deepEqual(files.sort(), Object.keys(manifest.files).sort(), 'lista plików różni się od manifestu');
  for (const iso of files) {
    const body = readFileSync(join(dir, `${iso}.json`), 'utf8');
    assert.equal(createHash('sha256').update(body).digest('hex'), manifest.files[iso].sha256, `${iso}: plik zmieniony po publikacji`);
  }
});

test('każda opublikowana sprawa ma jedno rozwiązanie i poprawny odcisk', { skip: !has }, () => {
  for (const f of readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const res = solveCase(c);
    assert.deepEqual(res.unique, c.solution, f);
    assert.deepEqual(qualityIssues(c, res), [], f);
    assert.equal(c.fingerprint, caseFingerprint(c), `${f}: odcisk`);
    assert.equal(c.date, f.slice(0, 10), `${f}: data`);
  }
});
