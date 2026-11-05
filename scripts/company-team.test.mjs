// 담당자 팀 규칙 단위 테스트 (src/lib/constants.ts)
// Run: node --test scripts/company-team.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/constants.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const constants = {}
new Function('exports', compiled)(constants)
const { claimTeamFor, defaultTeamFor, memberLabel, memberTeam } = constants

const me = { id: 'me', team: '1팀' }

test('a profile team decides where a new company goes', () => {
  assert.equal(defaultTeamFor('1팀'), '1팀')
  assert.equal(defaultTeamFor('나병훈1팀'), '1팀')
  assert.equal(defaultTeamFor('2팀'), '2팀')
  assert.equal(defaultTeamFor(null), '0팀')
})

test('memberTeam only reports real sales teams', () => {
  assert.equal(memberTeam('2팀'), '2팀')
  assert.equal(memberTeam('0팀'), null)
  assert.equal(memberTeam(null), null)
})

test('memberLabel adds the team only when there is one', () => {
  assert.equal(memberLabel('나병훈', '1팀'), '나병훈 (1팀)')
  assert.equal(memberLabel('이현우', '2팀'), '이현우 (2팀)')
  assert.equal(memberLabel('티엔샤', null), '티엔샤')
  assert.equal(memberLabel('티엔샤', '0팀'), '티엔샤')
})

test('only an unassigned or own 0팀 company can be claimed', () => {
  assert.equal(claimTeamFor({ team: '0팀', assigned_to: null }, me), '1팀')
  assert.equal(claimTeamFor({ team: '0팀', assigned_to: 'me' }, me), '1팀')
  assert.equal(claimTeamFor({ team: '0팀', assigned_to: 'other' }, me), null)
})

test('other teams, unset teams, and people without a team cannot claim', () => {
  assert.equal(claimTeamFor({ team: '2팀', assigned_to: null }, me), null)
  assert.equal(claimTeamFor({ team: null, assigned_to: null }, me), null)
  assert.equal(claimTeamFor({ team: '0팀', assigned_to: null }, { id: 'me', team: null }), null)
  assert.equal(claimTeamFor({ team: '0팀', assigned_to: null }, { id: 'me', team: '0팀' }), null)
})
