// Offline tests for the finance client alias route. Run:
// node --test scripts/project-assignee.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/app/api/integrations/project-assignee/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const aliasCompiled = ts.transpileModule(
  fs.readFileSync(new URL('../src/lib/finance-alias.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText

const SKY = '11111111-1111-4111-8111-111111111111'
const SEA = '22222222-2222-4222-8222-222222222222'

function harness(options = {}) {
  const db = {
    companies: (options.companies ?? [{
      id: SKY,
      company_name: '주식회사 하늘',
      latest_note: '원래 메모',
      last_contacted_at: '2024-01-01T00:00:00.000Z',
      profiles: { name: '김영업' },
    }]).map(row => ({ ...row })),
    profiles: (options.profiles ?? [
      { id: 'sales-1', role: 'sales', is_active: true, created_at: '2020-01-01T00:00:00.000Z' },
      { id: 'admin-1', role: 'admin', is_active: true, created_at: '2021-01-01T00:00:00.000Z' },
      { id: 'off-1', role: 'admin', is_active: false, created_at: '2019-01-01T00:00:00.000Z' },
    ]).map(row => ({ ...row })),
    activities: (options.activities ?? []).map(row => ({ ...row })),
    notification_logs: (options.notificationLogs ?? []).map(row => ({ ...row })),
  }
  let seq = 0
  const supabase = {
    from(table) {
      const state = { filters: [], op: 'select', payload: null, order: null, limit: null }
      const run = () => {
        if (state.op === 'insert') {
          seq += 1
          const row = {
            id: `act-${seq}`,
            created_at: `2026-05-${String(seq).padStart(2, '0')}T00:00:00.000Z`,
            ...state.payload,
          }
          db[table].push(row)
          return { data: row, error: null }
        }
        if (state.op === 'update') {
          for (const row of db[table]) {
            if (state.filters.every(filter => row[filter.col] === filter.val)) Object.assign(row, state.payload)
          }
          return { data: null, error: null }
        }
        let rows = db[table].filter(row => state.filters.every(filter => row[filter.col] === filter.val))
        if (state.order) {
          const dir = state.order.ascending ? 1 : -1
          rows = [...rows].sort((a, b) => String(a[state.order.col]).localeCompare(String(b[state.order.col])) * dir)
        }
        if (state.limit != null) rows = rows.slice(0, state.limit)
        return { data: rows, error: null }
      }
      const builder = {
        select() { return builder },
        eq(col, val) { state.filters.push({ col, val }); return builder },
        order(col, opts) { state.order = { col, ascending: Boolean(opts?.ascending) }; return builder },
        limit(n) { state.limit = n; return builder },
        range() { return builder },
        insert(payload) { state.op = 'insert'; state.payload = payload; return builder },
        update(payload) { state.op = 'update'; state.payload = payload; return builder },
        maybeSingle() {
          const result = run()
          return Promise.resolve({ data: result.data[0] ?? null, error: null })
        },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject) },
      }
      return builder
    },
  }

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    INTEGRATION_SECRET: 'integration-secret',
    CRON_SECRET: 'cron-secret',
    ...options.env,
  }
  const context = vm.createContext({
    console,
    process: { env },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } }
      }
      if (name === '@supabase/supabase-js') return { createClient: () => supabase }
      if (name === '@/lib/finance-alias') {
        const loadedModule = { exports: {} }
        const previousModule = context.module
        const previousExports = context.exports
        context.module = loadedModule
        context.exports = loadedModule.exports
        vm.runInContext(aliasCompiled, context)
        context.module = previousModule
        context.exports = previousExports
        return loadedModule.exports
      }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  const route = { exports: {} }
  context.module = route
  context.exports = route.exports
  vm.runInContext(compiled, context)

  return {
    db,
    route: route.exports,
    request(header) {
      return { headers: { get: name => (name.toLowerCase() === 'authorization' ? header : null) } }
    },
    async run(body, requestOptions = {}) {
      const header = requestOptions.header === undefined ? 'Bearer integration-secret' : requestOptions.header
      return route.exports.POST({
        ...this.request(header),
        json: async () => {
          if (requestOptions.invalidJson) throw new Error('bad json')
          return body
        },
      })
    },
    async get(requestOptions = {}) {
      const header = requestOptions.header === undefined ? 'Bearer integration-secret' : requestOptions.header
      return route.exports.GET(this.request(header))
    },
  }
}

test('rejects missing auth on the write and the duplicate list', async () => {
  const h = harness()
  assert.equal(typeof h.route.GET, 'function')
  assert.equal((await h.run({ client_name: '고객' }, { header: null })).status, 401)
  assert.equal((await h.get({ header: null })).status, 401)
  assert.equal((await h.run({ client_name: '고객' }, { header: 'Bearer wrong' })).status, 401)
  const closed = harness({ env: { INTEGRATION_SECRET: undefined, CRON_SECRET: undefined } })
  assert.equal((await closed.run({ client_name: '고객' })).status, 401)
  assert.equal(h.db.activities.length, 0)
})

test('accepts the integration or cron secret and stores a normalized alias without touching the company note', async () => {
  const byCron = harness()
  const cron = await byCron.run({ client_name: ' (주) 옛 고객 ', company_id: SKY }, { header: 'Bearer cron-secret' })
  assert.equal(cron.status, 200)
  assert.equal(cron.body.result, 'created')
  assert.equal(cron.body.alias, '옛고객')
  assert.equal(cron.body.assignee_name, '김영업')
  assert.equal(cron.body.company_id, SKY)
  assert.equal(byCron.db.activities.length, 1)
  assert.equal(byCron.db.activities[0].activity_type, 'finance_alias')
  assert.equal(byCron.db.activities[0].memo, '옛고객')
  assert.equal(byCron.db.activities[0].user_id, 'admin-1')
  assert.equal(byCron.db.companies[0].latest_note, '원래 메모')
  assert.equal(byCron.db.companies[0].last_contacted_at, '2024-01-01T00:00:00.000Z')
  assert.equal(JSON.stringify(cron.body).includes('service-role-test'), false)

  const again = await byCron.run({ client_name: '옛고객', company_id: SKY })
  assert.equal(again.body.result, 'unchanged')
  assert.equal(byCron.db.activities.length, 1)
})

test('requires a company when the finance name does not match one company, and links a unique name', async () => {
  const h = harness({
    companies: [
      { id: SKY, company_name: '하늘', latest_note: null, last_contacted_at: null, profiles: { name: '김영업' } },
      { id: SEA, company_name: '바다', latest_note: '유지', last_contacted_at: null, profiles: { name: '박매니저' } },
    ],
  })
  assert.equal((await h.run({ client_name: '없는이름' })).status, 400)
  assert.equal((await h.run({ client_name: '주식회사' })).status, 400)
  assert.equal((await h.run({ client_name: '고객', company_id: 'not-a-uuid' })).status, 400)
  assert.equal((await h.run({ client_name: '고객', company_id: '33333333-3333-4333-8333-333333333333' })).status, 404)
  assert.equal(h.db.activities.length, 0)

  const linked = await h.run({ client_name: '(주) 바다' })
  assert.equal(linked.body.result, 'created')
  assert.equal(linked.body.company_id, SEA)
  assert.equal(linked.body.alias, '바다')
  assert.equal(h.db.companies[1].latest_note, '유지')
})

const CLINIC_A = '33333333-3333-4333-8333-333333333333'
const CLINIC_B = '44444444-4444-4444-8444-444444444444'

test('accepts duplicate company names when every row shares one assignee', async () => {
  const h = harness({
    companies: [
      { id: CLINIC_B, company_name: '(주) 아비쥬의원', latest_note: '메모B', last_contacted_at: '2024-02-02T00:00:00.000Z', profiles: { name: '김영업' } },
      { id: CLINIC_A, company_name: '아비쥬의원', latest_note: '메모A', last_contacted_at: '2024-01-01T00:00:00.000Z', profiles: { name: ' 김영업 ' } },
      { id: SEA, company_name: '크리투스', latest_note: '유지', last_contacted_at: null, profiles: { name: '박매니저' } },
      { id: SKY, company_name: '크리투스', latest_note: '다른담당', last_contacted_at: null, profiles: { name: '김영업' } },
    ],
  })
  const linked = await h.run({ client_name: '(주)아비쥬의원' })
  assert.equal(linked.status, 200)
  assert.equal(linked.body.result, 'created')
  assert.equal(linked.body.company_id, CLINIC_A)
  assert.equal(linked.body.alias, '아비쥬의원')
  assert.equal(linked.body.assignee_name, '김영업')
  assert.equal(h.db.activities.length, 1)
  assert.equal(h.db.activities[0].company_id, CLINIC_A)
  assert.equal(h.db.activities[0].memo, '아비쥬의원')
  assert.equal(h.db.companies.find(row => row.id === CLINIC_A).latest_note, '메모A')
  assert.equal(h.db.companies.find(row => row.id === CLINIC_B).latest_note, '메모B')
  assert.equal(h.db.companies.find(row => row.id === CLINIC_B).last_contacted_at, '2024-02-02T00:00:00.000Z')

  const again = await h.run({ client_name: '아비쥬의원' })
  assert.equal(again.body.result, 'unchanged')
  assert.equal(h.db.activities.length, 1)

  const split = await h.run({ client_name: '크리투스' })
  assert.equal(split.status, 400)
  assert.equal(split.body.error, 'company_id or assignee is required')
  assert.equal(h.db.activities.length, 1)

  const missing = harness({
    companies: [
      { id: CLINIC_A, company_name: '톡스앤필 명동', latest_note: null, last_contacted_at: null, profiles: { name: '김영업' } },
      { id: CLINIC_B, company_name: '톡스앤필명동', latest_note: null, last_contacted_at: null, profiles: null },
    ],
  })
  assert.equal((await missing.run({ client_name: '톡스앤필 명동' })).status, 400)
  assert.equal(missing.db.activities.length, 0)
})

test('stores an assignee override without a company and lists duplicate names', async () => {
  const h = harness({
    companies: [
      { id: CLINIC_A, company_name: '클레어성형외과의원', latest_note: '원본', last_contacted_at: '2024-03-03T00:00:00.000Z', profiles: { name: '김영업' } },
      { id: CLINIC_B, company_name: '(주)클레어성형외과의원', latest_note: '원본B', last_contacted_at: null, profiles: { name: '박매니저' } },
      { id: SEA, company_name: '주식회사', latest_note: null, last_contacted_at: null, profiles: { name: '김영업' } },
      { id: SKY, company_name: '주식회사 ', latest_note: null, last_contacted_at: null, profiles: { name: '박매니저' } },
      { id: '55555555-5555-4555-8555-555555555555', company_name: '비즈하이', latest_note: null, last_contacted_at: null, profiles: { name: '김영업' } },
    ],
    profiles: [
      { id: 'sales-1', name: '김영업', role: 'sales', is_active: true, created_at: '2020-01-01T00:00:00.000Z' },
      { id: 'admin-1', name: '관리자', role: 'admin', is_active: true, created_at: '2021-01-01T00:00:00.000Z' },
      { id: 'twin', name: '김영업', role: 'sales', is_active: true, created_at: '2022-01-01T00:00:00.000Z' },
      { id: 'mgr-1', name: '박매니저', role: 'manager', is_active: true, created_at: '2023-01-01T00:00:00.000Z' },
      { id: 'old', name: '퇴사자', role: 'sales', is_active: false, created_at: '2018-01-01T00:00:00.000Z' },
    ],
  })

  assert.equal((await h.run({ client_name: '옛고객', assignee: '퇴사자' })).status, 400)
  assert.equal((await h.run({ client_name: '옛고객', assignee: '없는사람' })).status, 400)
  assert.equal((await h.run({ client_name: '옛고객', assignee: '김영업' })).body.error, 'assignee is ambiguous')
  assert.equal(h.db.activities.length, 0)
  assert.equal(h.db.notification_logs.length, 0)

  const created = await h.run({
    client_name: ' (주) 옛 고객 ',
    assignee: ' 관리자 ',
    company_id: 'not-a-uuid',
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.result, 'created')
  assert.equal(created.body.company_id, null)
  assert.equal(created.body.alias, '옛고객')
  assert.equal(created.body.assignee_name, '관리자')
  assert.equal(h.db.notification_logs.length, 1)
  assert.equal(h.db.notification_logs[0].notification_type, 'finance_assignee_override')
  assert.equal(h.db.notification_logs[0].message, '옛고객')
  assert.equal(h.db.notification_logs[0].user_id, 'admin-1')
  assert.equal(h.db.notification_logs[0].company_id, null)
  assert.equal(h.db.notification_logs[0].status, 'sent')
  assert.equal(h.db.activities.length, 0)
  assert.equal(h.db.companies[0].latest_note, '원본')
  assert.equal(h.db.companies[0].last_contacted_at, '2024-03-03T00:00:00.000Z')
  assert.equal(JSON.stringify(created.body).includes('service-role-test'), false)

  const again = await h.run({ client_name: '옛고객', assignee: '관리자' })
  assert.equal(again.body.result, 'unchanged')
  assert.equal(h.db.notification_logs.length, 1)

  const moved = await h.run({ client_name: '옛고객', assignee: '박매니저' })
  assert.equal(moved.body.result, 'created')
  assert.equal(moved.body.assignee_name, '박매니저')
  assert.equal(h.db.notification_logs.length, 2)
  assert.equal(h.db.notification_logs[1].user_id, 'mgr-1')

  const listed = await h.get()
  assert.equal(listed.status, 200)
  assert.equal(listed.body.duplicates.map(group => group.normalized).join(','), '클레어성형외과의원')
  assert.equal(listed.body.duplicates[0].assignee_name, null)
  assert.equal(listed.body.duplicates[0].companies.map(company => company.company_name).join(','), '(주)클레어성형외과의원,클레어성형외과의원')
  assert.equal(listed.body.duplicates[0].companies.map(company => company.assignee_name).join(','), '박매니저,김영업')
  assert.equal(JSON.stringify(listed.body).includes('service-role-test'), false)
  assert.equal(h.db.activities.length, 0)
})
