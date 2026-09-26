import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PocketEngine} from '../engine.js';
function mockAudio(resume) {
  const calls = [];
  const audio = {state:'suspended',sampleRate:48000,destination:{},
    resume() { calls.push('resume'); return resume(audio); },
    createBuffer() { return {}; },
    createBufferSource() { return {connect(){},disconnect(){},stop(){},start(){calls.push('start');}}; }
  };
  const engine = Object.create(PocketEngine.prototype); engine.audio = audio;
  return {engine,calls};
}
test('audio resume and silent primer start inside the user gesture before awaiting',async () => {
  let finish;
  const {engine,calls} = mockAudio(audio => new Promise(resolve => { finish = () => {audio.state='running';resolve();}; }));
  const pending = engine.enableAudio();
  assert.deepEqual(calls,['resume','start']);
  finish(); await pending; assert.equal(engine.audioTime,0);
});
test('a resolved resume is not considered success if iOS remains interrupted',async () => {
  const {engine} = mockAudio(audio => {audio.state='interrupted';return Promise.resolve();});
  await assert.rejects(engine.enableAudio(),/suspendido/);
});
test('a refused resume can be retried successfully',async () => {
  let attempts = 0;
  const {engine} = mockAudio(audio => { if (++attempts === 1) return Promise.reject(new Error('blocked')); audio.state='running'; return Promise.resolve(); });
  await assert.rejects(engine.enableAudio(),/blocked/); await engine.enableAudio();
  assert.equal(engine.audio.state,'running');
});
