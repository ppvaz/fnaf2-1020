import assert from 'node:assert/strict';
import { AI_10_20, AI_DIALS, PUPPET_AI } from '@fnaf2-1020/core/mechanics';
import {
  CAMPAIGN_STATES, CampaignStateMachine, makeCampaignSpec, validateCampaignSpec,
} from '../src/campaign.js';

const spec = makeCampaignSpec({ profile: 'hid-mediaprojection', targetBuild: 'com.scottgames.fnaf2:2.0.7+26' });
assert.deepEqual(spec.nights.map(target => target.night), [6, 7]);
assert.deepEqual(Object.values(spec.nights[1].dials), AI_DIALS.map(() => AI_10_20));
assert.equal(spec.nights[1].puppet, PUPPET_AI);
assert.doesNotThrow(() => validateCampaignSpec(spec));
assert.throws(() => validateCampaignSpec({ ...spec, nights: [{ ...spec.nights[0], menuTarget: 'customNight' }] }), /Night 6/);
assert.throws(() => validateCampaignSpec({ ...spec, nights: [{ ...spec.nights[1], dials: { ...spec.nights[1].dials, foxy: 21 } }] }), /foxy/);

const trace = [];
const machine = new CampaignStateMachine({ spec, now: () => 10, onEvent: record => trace.push(record) });
assert.equal(machine.snapshot().state, 'IDLE');
machine.startPreflight();
machine.acceptPreflight({ status: 'READY', serial: 'fixture-phone' });
machine.acceptMenu({ target: spec.nights[0].menuTarget, visible: true, selected: true });
machine.acceptIntro({ night: 6, identity: 'story', observed: true });
machine.beginAttempt();
machine.acceptTerminal({ night: 6, outcome: 'sixam', sixAm: true });
machine.acceptTerminalVerification({ sixAm: true, positive: true });
machine.acceptSave({ customNightVisible: true, observed: true });
assert.equal(machine.snapshot().state, 'MENU');
machine.acceptMenu({ target: 'customNight', visible: true, selected: true });
machine.acceptCustomConfiguration({ status: 'PASS', dials: spec.nights[1].dials, puppet: PUPPET_AI,
  readback: { status: 'PASS', dials: spec.nights[1].dials, puppet: PUPPET_AI } });
machine.acceptIntro({ night: 7, identity: 'custom', observed: true });
machine.beginAttempt();
machine.acceptTerminal({ night: 7, outcome: 'sixam', sixAm: true });
machine.acceptTerminalVerification({ sixAm: true, positive: true });
machine.acceptSave({ menuReturned: true, customCompleted: true, observed: true });
assert.equal(machine.snapshot().state, 'COMPLETE');
assert.ok(trace.length >= 10);

const held = new CampaignStateMachine({ spec });
held.startPreflight();
held.acceptPreflight({ status: 'HOLD', reason: 'no-ready-device' });
assert.equal(held.snapshot().state, 'HOLD');
held.resume();
assert.equal(held.snapshot().state, 'PREFLIGHT');
held.abort('test-stop');
assert.equal(held.snapshot().state, 'ABORTED');
assert.ok(CAMPAIGN_STATES.includes('TERMINAL_VERIFY'));

const retry = new CampaignStateMachine({ spec: { ...spec, nights: [spec.nights[0]] } });
retry.startPreflight();
retry.acceptPreflight({ status: 'READY' });
retry.acceptMenu({ target: retry.spec?.nights?.[0]?.menuTarget ?? 'sixthNight', visible: true, selected: true });
retry.acceptIntro({ night: 6, identity: 'story', observed: true });
retry.beginAttempt();
retry.acceptTerminal({ night: 6, outcome: 'death' });
retry.acceptRetry({ menuReady: true });
assert.equal(retry.snapshot().state, 'MENU');
retry.acceptMenu({ target: retry.spec?.nights?.[0]?.menuTarget ?? 'sixthNight', visible: true, selected: true });
retry.acceptIntro({ night: 6, identity: 'story', observed: true });
retry.beginAttempt();
retry.acceptTerminal({ night: 6, outcome: 'unknown' });
assert.equal(retry.snapshot().state, 'HOLD');
console.log('device campaign: target validation, lifecycle gates, retry boundary, and completion proof pass');
