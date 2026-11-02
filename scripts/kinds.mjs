// Ile razy każdy rodzaj dowodu pojawia się jako fałszywka i jako prawdziwy dowód.
import { buildDailyCase } from '../js/generator.js';
import { addDays } from '../js/time.js';
const days = Number(process.argv[2] || 400);
const forged = {}; const real = {};
for (let i = 0; i < days; i++) {
  const c = buildDailyCase(addDays('2026-11-02', i));
  for (const k of c.cards) for (const f of k.facts || []) if (f.t === 'claim') {
    const bucket = k.id === c.solution.forged ? forged : real;
    bucket[f.kind] = (bucket[f.kind] || 0) + 1;
  }
}
console.log('fałszywki:', forged);
console.log('prawdziwe:', real);
