'use strict';
// The seven simulated children (one place, used by run.cjs and sampler.cjs).
// g1, g3, g6 are the day 1 profiles (REPORT.md, "Profiles"). gk, g2, g4, g5 (day 4) are INTERPOLATED, not measured on
// children: right-answer share p, mean thinking time t (log-normal, sd 0.35) and the keypad cost (first key, each further
// key) move in even steps between the three measured anchors; kindergarten extends the grade 1 to 3 slope one step down.
// Every number here is an assumption about a child, not an observation.
const PROFILES = {
  gk: { grade: 'k', p: 0.65, t: 7,    sd: 0.35 },
  g1: { grade: '1', p: 0.70, t: 6,    sd: 0.35 },
  g2: { grade: '2', p: 0.75, t: 5,    sd: 0.35 },
  g3: { grade: '3', p: 0.80, t: 4,    sd: 0.35 },
  g4: { grade: '4', p: 0.833, t: 3.67, sd: 0.35 },
  g5: { grade: '5', p: 0.867, t: 3.33, sd: 0.35 },
  g6: { grade: '6', p: 0.90, t: 3,    sd: 0.35 },
};
const KEYPAD = { gk: { first: 0.7, key: 0.4 }, g1: { first: 0.6, key: 0.35 }, g2: { first: 0.55, key: 0.32 }, g3: { first: 0.5, key: 0.3 }, g4: { first: 0.47, key: 0.28 }, g5: { first: 0.43, key: 0.27 }, g6: { first: 0.4, key: 0.25 } };
// HONEST_KEYPAD: 'same' (default) typing time and a 3% slip, same knowledge; 'noguess' also no lucky pick among four buttons; 'off' the old four-button child.
const keypadOf = profile => { const m = process.env.HONEST_KEYPAD || 'same'; return m === 'off' ? null : { ...KEYPAD[profile], slip: 0.03, noGuess: m === 'noguess' }; };
// Per-question solve time (quiz bank v2): the child's mean answer time t belongs to a question of the OLD bank's mean effort for her grade
// (effort-ref.json "ref", measured by effortref.cjs); a question of effort e takes t * e / ref. HONEST_EFFORT=off gives one number per grade (day 1-3 model).
const fs = require('fs'), path = require('path');
let REF = null; try { REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'effort-ref.json'), 'utf8')).ref; } catch (e) {}
const effOf = profile => process.env.HONEST_EFFORT === 'off' || !REF || childOf() ? 0 : REF[PROFILES[profile].grade] || 0;
// Day 4 B2: HONEST_CHILD = slow | median | fast switches the thinking time and the right-answer share to the independent model of
// childmodel.cjs (kind of question -> assumed seconds; nothing from effort-ref.json). Not set: the day 4 morning model above, kept so the
// numbers of REPORT.md can be reproduced.
function childOf() { const c = process.env.HONEST_CHILD || ''; if (c && !['slow', 'median', 'fast'].includes(c)) throw new Error('HONEST_CHILD ' + c); return c || null; }
// give the page its host side: __HON_EFF(text, grade) = the effort model's seconds for that question (null when it cannot read it)
async function exposeEffort(page) {
  process.env.QUIZ_CONTENT_LIB = '1'; const Q = require('../checks/quiz-content.cjs');
  await page.exposeFunction('__HON_EFF', (text, grade) => { try { const p = Q.solve(text, 'en'); return p.ok ? Q.effort(grade, p) : null; } catch (e) { return null; } });
  const M = require('./childmodel.cjs');
  // HONEST_CHILD_ACC=flat (sensitivity only): her right-answer share does not move with the kind, so the effect of her TIME can be read alone
  const flat = process.env.HONEST_CHILD_ACC === 'flat';
  await page.exposeFunction('__HON_CHILD', (text, grade, child) => { try { const r = M.rate(text, grade, child); if (flat) { r.accMul = 1; r.accAdd = 0; } return r; } catch (e) { return null; } });
}
module.exports = { PROFILES, KEYPAD, keypadOf, effOf, childOf, exposeEffort };
