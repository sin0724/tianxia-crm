// Offline tests for the finance staff-progress loader. Run:
// node --test scripts/staff-progress.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/staff-progress.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const cacheCalls = []
const context = vm.createContext({
  console,
  URL,
  AbortSignal,
  process: { env: {} },
  fetch: async () => { throw new Error('unexpected fetch') },
  require(name) {
    if (name === 'next/cache') {
      return {
        unstable_cache(fn, keys, options) {
          cacheCalls.push({ keys, options })
          return fn
        },
      }
    }
    throw new Error(`Unexpected import: ${name}`)
  },
})
const lib = { exports: {} }
context.module = lib
context.exports = lib.exports
vm.runInContext(compiled, context)
const api = lib.exports

const secret = 'staff-progress-test-secret'

function project(overrides = {}) {
  return {
    project_id: 'p1',
    client_id: 'c1',
    client_name: '티엔샤',
    project_name: '대만 캠페인',
    status: 'ongoing',
    contract_date: '2026-03-01',
    assignee_employee_id: 'e1',
    assignee_name: '김영업',
    contract_amount: 1000000,
    paid_amount: 400000,
    items: [
      { project_item_id: 'i1', category: 'KOL', product_name: '릴스', contracted: 4, delivered: 1, remaining: 3 },
      { project_item_id: 'i2', category: 'PR', product_name: '기사', contracted: 2, delivered: 2, remaining: 0 },
    ],
    totals: { contracted: 6, delivered: 3, remaining: 3 },
    ...overrides,
  }
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('caches the finance response for 60 seconds without calling fetch at import', () => {
  assert.equal(cacheCalls.length, 1)
  assert.equal(cacheCalls[0].keys.join(','), 'finance-staff-progress')
  assert.equal(cacheCalls[0].options.revalidate, 60)
  assert.equal(api.STAFF_PROGRESS_REVALIDATE_SECONDS, 60)
})

test('missing env or a non-http base does not call the finance API', async () => {
  let called = 0
  const fetchImpl = async () => { called += 1; return jsonResponse([]) }
  for (const options of [
    { apiUrl: '', secret },
    { apiUrl: 'https://finance.example.com', secret: '  ' },
    { apiUrl: 'javascript:alert(1)', secret },
    { apiUrl: 'https://user:pass@finance.example.com', secret },
  ]) {
    const result = await api.fetchStaffProgress({ ...options, fetchImpl })
    assert.equal(result.ok, false)
    assert.equal(JSON.stringify(result).includes(secret), false)
  }
  assert.equal(called, 0)
  assert.equal((await api.fetchStaffProgress({ apiUrl: '', secret, fetchImpl })).reason, 'unconfigured')
})

test('sends the bearer token to the staff-progress path and keeps it out of the result', async () => {
  const calls = []
  const result = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com/',
    secret,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse([project()])
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://finance.example.com/api/integrations/staff-progress')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${secret}`)
  assert.equal(result.ok, true)
  assert.equal(result.projects[0].client_name, '티엔샤')
  assert.equal(result.projects[0].totals.remaining, 3)
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(JSON.stringify(calls[0].url).includes(secret), false)
})

test('accepts wrapped rows, computes missing totals, and rejects a payload with no projects', async () => {
  const wrapped = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => jsonResponse({
      projects: [{
        project_id: 7,
        client_name: '브랜드',
        project_name: '3월',
        status: 'completed',
        contract_amount: '2500',
        paid_amount: 0,
        items: [{ project_item_id: 'a', category: 'Threads', product_name: '게시', contracted: 3, delivered: 1, remaining: 2 }],
      }],
    }),
  })
  assert.equal(wrapped.ok, true)
  assert.equal(wrapped.projects[0].project_id, '7')
  assert.equal(wrapped.projects[0].contract_amount, 2500)
  assert.equal(wrapped.projects[0].totals.contracted, 3)
  assert.equal(wrapped.projects[0].totals.delivered, 1)
  assert.equal(wrapped.projects[0].totals.remaining, 2)

  const bad = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => jsonResponse({ hello: 'nope' }),
  })
  assert.equal(bad.ok, false)
  assert.match(bad.message, /형식/)
})

test('turns HTTP, redirect, and network failures into a message without the response body', async () => {
  const denied = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ token: secret }) }),
  })
  assert.match(denied.message, /인증/)
  assert.equal(denied.message.includes(secret), false)

  const down = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ detail: 'db password' }) }),
  })
  assert.match(down.message, /HTTP 503/)
  assert.equal(down.message.includes('password'), false)

  const redirect = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => ({ ok: false, status: 302, json: async () => { throw new Error('should not read body') } }),
  })
  assert.equal(redirect.ok, false)

  const offline = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => { throw new Error(`connect ${secret}`) },
  })
  assert.equal(offline.reason, 'error')
  assert.equal(offline.message.includes(secret), false)
})

test('filters by assignee, status, category, and client, then summarizes what remains', () => {
  const rows = [
    project(),
    project({
      project_id: 'p2',
      client_name: '주식회사 다른가게',
      project_name: '종료건',
      status: 'cancelled',
      assignee_name: '박매니저',
      assignee_employee_id: 'e2',
      contract_amount: 500,
      paid_amount: 500,
      items: [{ project_item_id: 'i3', category: 'Dcard', product_name: '게시', contracted: 1, delivered: 0, remaining: 1 }],
      totals: { contracted: 1, delivered: 0, remaining: 1 },
    }),
    project({
      project_id: 'p3',
      client_name: '미배정 고객',
      assignee_name: null,
      status: 'ongoing',
      contract_amount: 10,
      paid_amount: 0,
      items: [{ project_item_id: 'i4', category: 'KOL', product_name: '피드', contracted: 2, delivered: 0, remaining: 2 }],
      totals: { contracted: 2, delivered: 0, remaining: 2 },
    }),
  ]
  const kol = api.filterProjects(rows, { category: 'KOL', status: 'ongoing' })
  assert.equal(kol.map(row => row.project_id).join(','), 'p1,p3')
  assert.equal(api.itemsFor(kol[0], 'KOL').map(item => item.project_item_id).join(','), 'i1')

  const summary = api.summarize(kol, 'KOL')
  assert.equal(summary.ongoing, 2)
  assert.equal(summary.contractAmount, 1000010)
  assert.equal(summary.paidAmount, 400000)
  assert.equal(summary.remaining, 5)

  const byName = api.filterProjects(rows, { q: '다른 가게' })
  assert.equal(byName.map(row => row.project_id).join(','), 'p2')
  const byAssignee = api.filterProjects(rows, { assignee: '박매니저' })
  assert.equal(byAssignee.length, 1)

  const people = api.summarizeByAssignee(rows, rows)
  assert.equal(people.map(row => row.assignee).join(','), '김영업,박매니저,미배정')
  assert.equal(people[0].projects, 1)
  assert.equal(people[0].ongoing, 1)
  assert.equal(people[2].remaining, 2)
  assert.equal(api.categoryChoices(rows).slice(0, 6).join(','), 'Dcard,PTT,Threads,PR,KOC,KOL')
})

test('links a client only when the company name matches exactly or uniquely after normalization', () => {
  const companies = [
    { id: 'exact', company_name: '티엔샤' },
    { id: 'spaced', company_name: '주식회사 (주) 하늘' },
    { id: 'dup-a', company_name: '같은이름' },
    { id: 'dup-b', company_name: '같은이름' },
  ]
  assert.equal(api.linkCompanyId('티엔샤', companies), 'exact')
  assert.equal(api.linkCompanyId('주식회사주하늘', companies), 'spaced')
  assert.equal(api.linkCompanyId('같은이름', companies), null)
  assert.equal(api.linkCompanyId('없는 고객', companies), null)
  assert.equal(api.formatContractDate('2026-03-01'), '2026.03.01')
  assert.equal(api.formatContractDate('2026-10-29T16:30:00.000Z'), '2026.10.30')
  assert.equal(api.progressPercent(4, 1), 25)
  assert.equal(api.progressPercent(0, 2), 100)
})
