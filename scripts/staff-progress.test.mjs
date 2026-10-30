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

const PROJECT_KEYS = 'client,project,status,contract_date,contract_amount,paid_amount,items,totals'
const ITEM_KEYS = 'category,product_name,contracted'

function project(overrides = {}) {
  return {
    client: '티엔샤',
    project: '대만 캠페인',
    status: 'ongoing',
    contract_date: '2026-03-01',
    contract_amount: 1000000,
    paid_amount: 400000,
    items: [
      { category: 'KOL', product_name: '릴스', contracted: 4 },
      { category: 'PR', product_name: '기사', contracted: 2 },
    ],
    totals: { contracted: 6 },
    ...overrides,
  }
}

function feed(rows) {
  return { projects: rows }
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
      return jsonResponse(feed([project({
        project_id: 'drop-me',
        client_id: 'c1',
        client_name: '옛이름',
        assignee_name: '김영업',
        items: [{ project_item_id: 'i1', category: 'KOL', product_name: '릴스', contracted: 4, delivered: 1, remaining: 3 }],
        totals: { contracted: 6, delivered: 1, remaining: 3 },
      })]))
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://finance.example.com/api/integrations/staff-progress')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${secret}`)
  assert.equal(result.ok, true)
  assert.equal(result.projects[0].client, '티엔샤')
  assert.equal(result.projects[0].project, '대만 캠페인')
  assert.equal(result.projects[0].totals.contracted, 6)
  assert.equal(Object.keys(result.projects[0]).join(','), PROJECT_KEYS)
  assert.equal(Object.keys(result.projects[0].items[0]).join(','), ITEM_KEYS)
  assert.equal(Object.keys(result.projects[0].totals).join(','), 'contracted')
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(JSON.stringify(result).includes('김영업'), false)
  assert.equal(JSON.stringify(result).includes('drop-me'), false)
  assert.equal(JSON.stringify(calls[0].url).includes(secret), false)
})

test('reads only the projects wrapper, fills missing fields, and can ask for one status', async () => {
  const calls = []
  const wrapped = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    status: 'completed',
    fetchImpl: async (url) => {
      calls.push(url)
      return jsonResponse(feed([
        {
          client: null,
          project: '이름만',
          status: 'completed',
          contract_date: null,
          contract_amount: '1500000.50',
          paid_amount: '400000',
          items: [
            { category: 'Dcard', product_name: '디카드', contracted: '3' },
            { category: null, product_name: null, contracted: 1 },
            { contracted: 2 },
            null,
          ],
        },
        { client: '  ', project: '' },
      ]))
    },
  })
  assert.equal(calls[0], 'https://finance.example.com/api/integrations/staff-progress?status=completed')
  assert.equal(wrapped.ok, true)
  assert.equal(wrapped.projects[0].client, null)
  assert.equal(wrapped.projects[0].project, '이름만')
  assert.equal(wrapped.projects[0].contract_date, null)
  assert.equal(wrapped.projects[0].contract_amount, 1500000.5)
  assert.equal(wrapped.projects[0].paid_amount, 400000)
  assert.equal(wrapped.projects[0].totals.contracted, 6)
  assert.equal(wrapped.projects[0].items[1].category, null)
  assert.equal(wrapped.projects[0].items[1].product_name, null)
  assert.equal(wrapped.projects[0].items[2].category, null)
  assert.equal(wrapped.projects[0].items.length, 3)
  assert.equal(wrapped.projects[1].client, null)
  assert.equal(wrapped.projects[1].project, '')
  assert.equal(wrapped.projects[1].status, '')
  assert.equal(wrapped.projects[1].contract_amount, 0)
  assert.equal(wrapped.projects[1].items.length, 0)
  assert.equal(wrapped.projects[1].totals.contracted, 0)
  assert.equal(Object.keys(wrapped.projects[1]).join(','), PROJECT_KEYS)

  for (const body of [[project()], { rows: [project()] }, { data: [project()] }, { projects: [null] }, { hello: 'nope' }]) {
    const bad = await api.fetchStaffProgress({
      apiUrl: 'https://finance.example.com',
      secret,
      fetchImpl: async () => jsonResponse(body),
    })
    assert.equal(bad.ok, false)
    assert.match(bad.message, /형식/)
  }

  let called = 0
  const invalidStatus = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    status: 'paused',
    fetchImpl: async () => { called += 1; return jsonResponse(feed([])) },
  })
  assert.equal(invalidStatus.ok, false)
  assert.equal(called, 0)

  const empty = await api.fetchStaffProgress({
    apiUrl: 'https://finance.example.com',
    secret,
    fetchImpl: async () => jsonResponse(feed([])),
  })
  assert.equal(empty.ok, true)
  assert.equal(empty.projects.length, 0)
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

test('filters by CRM assignee, status, category, and client, then sums contracted counts', () => {
  const rows = [
    project(),
    project({
      client: '주식회사 다른가게',
      project: '종료건',
      status: 'cancelled',
      contract_amount: 500,
      paid_amount: 500,
      items: [{ category: 'Dcard', product_name: '게시', contracted: 1 }],
      totals: { contracted: 1 },
    }),
    project({
      client: '미배정 고객',
      project: '미배정건',
      status: 'ongoing',
      contract_amount: 10,
      paid_amount: 0,
      items: [{ category: 'KOL', product_name: '피드', contracted: 2 }],
      totals: { contracted: 2 },
    }),
  ]
  const companies = [
    { id: 'c1', company_name: '(주) 티엔샤', assignee_name: '김영업' },
    { id: 'c2', company_name: '다른가게', assignee_name: '박매니저' },
    { id: 'c-dup', company_name: '다른 가게', assignee_name: '박매니저' },
  ]
  const kol = api.filterProjects(rows, { category: 'KOL', status: 'ongoing' }, companies)
  assert.equal(kol.map(row => row.project).join(','), '대만 캠페인,미배정건')
  assert.equal(api.itemsFor(kol[0], 'KOL').map(item => item.product_name).join(','), '릴스')

  const summary = api.summarize(kol, 'KOL')
  assert.equal(summary.ongoing, 2)
  assert.equal(summary.contractAmount, 1000010)
  assert.equal(summary.paidAmount, 400000)
  assert.equal(summary.contractedCount, 6)

  const byName = api.filterProjects(rows, { q: '다른 가게' }, companies)
  assert.equal(byName.map(row => row.project).join(','), '종료건')
  const byAssignee = api.filterProjects(rows, { assignee: '박매니저' }, companies)
  assert.equal(byAssignee.length, 1)
  const unmatched = api.filterProjects(rows, { assignee: '미매칭' }, companies)
  assert.equal(unmatched.map(row => row.project).join(','), '미배정건')

  const people = api.summarizeByAssignee(rows, companies)
  assert.equal(people.map(row => row.assignee).join(','), '김영업,박매니저,미매칭')
  assert.equal(people[0].projects, 1)
  assert.equal(people[0].ongoing, 1)
  assert.equal(people[2].contractedCount, 2)
  assert.equal(api.assigneeChoices(rows, companies).join(','), '김영업,박매니저,미매칭')
  assert.equal(api.categoryChoices(rows).slice(0, 6).join(','), 'Dcard,PTT,Threads,PR,KOC,KOL')
})

test('matches a CRM assignee after trimming, dropping spaces and company suffixes, and ignoring case', () => {
  const companies = [
    { id: 'a', company_name: '주식회사 (주) 하늘', assignee_name: ' 김영업 ' },
    { id: 'b', company_name: 'ABC Corp', assignee_name: 'Lee' },
    { id: 'c1', company_name: '겹침', assignee_name: '김영업' },
    { id: 'c2', company_name: '(주)겹침', assignee_name: '박매니저' },
    { id: 'd', company_name: '주식회사', assignee_name: '김영업' },
    { id: 'e', company_name: '무담당', assignee_name: null },
  ]
  assert.equal(api.normalizeAssigneeCompanyName('  (주) 하늘  '), '하늘')
  assert.equal(api.assigneeNameFor('(주)하늘', companies), '김영업')
  assert.equal(api.assigneeNameFor('abc   corp', companies), 'Lee')
  assert.equal(api.assigneeNameFor('겹침', companies), '미매칭')
  assert.equal(api.assigneeNameFor('주식회사', companies), '미매칭')
  assert.equal(api.assigneeNameFor('무담당', companies), '미매칭')
  assert.equal(api.assigneeNameFor('없는 고객', companies), '미매칭')
  assert.equal(api.UNMATCHED_ASSIGNEE, '미매칭')
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
})
