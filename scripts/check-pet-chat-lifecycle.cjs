const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-project-ts.cjs')();
const { createRequestSession } = load('src/utils/requestSession.ts');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const session = createRequestSession();
  const old = session.begin();
  let replies = 0, voices = 0, actions = 0;
  const lateResponse = () => { if (old.isCurrent()) { replies++; voices++; actions++; } };
  session.defer(old, () => actions++, 10);
  session.cancel();
  assert(old.signal.aborted);
  const fresh = session.begin();
  lateResponse();
  assert.equal(session.finish(old), false, 'old finally cannot clear a new request busy state');
  assert.equal(session.pending, true);
  await wait(25);
  assert.deepEqual([replies, voices, actions], [0, 0, 0], 'close/background/unmount invalidates late replies, voice and delayed actions');
  assert.equal(session.finish(fresh), true);
  assert.equal(session.pending, false);
  session.defer(fresh, () => actions++, 5);
  await wait(15); assert.equal(actions, 1, 'a completed current reply may still perform its intentional delayed action');
  const local = session.begin(false);
  session.defer(local, () => replies++, 5);
  session.begin(); await wait(15);
  assert.equal(replies, 0, 'a newer request supersedes pending local replies');
  session.cancel();

  // Static lifecycle hygiene checks on pet, popover & particle components
  const root = path.resolve(__dirname, '..');
  const petSource = fs.readFileSync(path.join(root, 'src/components/WhalePet.tsx'), 'utf8');
  assert(petSource.includes('foregroundStore.getSnapshot()'), 'WhalePet care heartbeat must check foreground state');
  assert(petSource.includes('cancelAnimation(panelProgress)'), 'WhalePet must cancel popover animation on unmount');
  assert(petSource.includes('hasMountedBounds'), 'WhalePet must separate mount intro from boundary resize clamping');
  assert(petSource.includes('whale_pet_summon') && petSource.includes('whale_pet_dismiss'), 'WhalePet must keep single-source summon/dismiss SFX');

  const particlesSource = fs.readFileSync(path.join(root, 'src/components/PetParticles.tsx'), 'utf8');
  assert(particlesSource.includes('cancelAnimation(p)'), 'PetParticles must cancel particle animation on unmount');

  const screenSource = fs.readFileSync(path.join(root, 'src/screens/AssistantScreen.tsx'), 'utf8');
  assert(screenSource.includes('cancelAnimation(popoverProgress)'), 'AssistantScreen must cancel companion popover animation on unmount');
  assert(screenSource.includes('whale_pet_dismiss'), 'AssistantScreen must keep semantic whale dismiss SFX key');
  assert(!screenSource.includes('playSfx("whale_pet_summon"'), 'AssistantScreen must not duplicate whale_pet_summon SFX already fired by WhalePet mount');

  console.log('PASS: pet request cancellation, stale-result rejection, close/reopen races, busy ownership, delayed-action cleanup, foreground care tick, single-source summon SFX & animation lifecycle hygiene');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
