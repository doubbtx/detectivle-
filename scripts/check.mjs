// Szybki test: generuje sprawy na wiele dni i sprawdza je solverem.
import { buildDailyCase, buildPracticeCase } from '../js/generator.js';
import { solveCase, qualityIssues } from '../js/solver.js';
import { addDays } from '../js/time.js';

const days = Number(process.argv[2] || 60);
let fails = 0, attempts = 0, maxAttempt = 0;
const t0 = Date.now();
for (let i = 0; i < days; i++) {
  const iso = addDays('2026-11-02', i);
  try {
    const c = buildDailyCase(iso);
    const issues = qualityIssues(c, solveCase(c));
    if (issues.length) { fails++; console.log(iso, issues); }
    attempts += c.attempt; maxAttempt = Math.max(maxAttempt, c.attempt);
  } catch (e) { fails++; console.log(iso, e.message); }
}
console.log(`dni: ${days}, błędy: ${fails}, śr. prób: ${(attempts / days).toFixed(2)}, max prób: ${maxAttempt}, czas: ${Date.now() - t0} ms`);
