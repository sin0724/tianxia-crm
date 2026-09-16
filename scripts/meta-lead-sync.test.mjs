// Offline route integration tests: Graph, Supabase and Slack are all mocked.
// Run: node --test scripts/meta-lead-sync.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/app/api/cron/sync-meta-leads/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const liveForm = '1637094898076006'
const comprehensiveForm = '3145166442355495'

function lead(id, field_data = []) {
  return { id: String(id), created_time: '2026-09-15T00:00:00Z', field_data }
}

function harness(options = {}) {
  const state = { requests: [], inserts: [], notifications: [], logs: [], lookups: [] }
  const existing = new Set(options.existing ?? [])
  const removed = new Set(options.removed ?? [])
  const supabase = {
    from(table) {
      return {
        select() {
          return {
            async in(_column, ids) {
              state.lookups.push({ table, ids })
              if (options.lookupError) return { data: null, error: { message: 'Database unavailable' } }
              const known = table === 'companies' ? existing : removed
              return { data: ids.filter(id => known.has(id)).map(meta_lead_id => ({ meta_lead_id })), error: null }
            },
          }
        },
        insert(row) {
          if (table === 'notification_logs') {
            state.logs.push(row)
            return Promise.resolve({ error: null })
          }
          assert.equal(table, 'companies')
          state.inserts.push(row)
          existing.add(row.meta_lead_id)
          return { select: () => ({ single: async () => ({ data: { id: `company-${row.meta_lead_id}` }, error: null }) }) }
        },
      }
    },
  }
  const routeModule = { exports: {} }
  vm.runInNewContext(compiled, {
    module: routeModule,
    exports: routeModule.exports,
    URL,
    process: { env: {
      CRON_SECRET: 'test-secret',
      META_PAGE_ACCESS_TOKEN: 'test-token',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      NEXT_PUBLIC_APP_URL: 'https://test.invalid',
      ...options.env,
    } },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } }
      if (name === '@supabase/supabase-js') return { createClient: () => supabase }
      if (name === '@/lib/slack') return { sendSlackNotification: async value => { state.notifications.push(value); return { ok: true } } }
      throw new Error(`Unexpected import: ${name}`)
    },
    async fetch(url) {
      state.requests.push(url)
      const parsed = new URL(url)
      const formId = parsed.pathname.split('/')[2]
      const page = options.graph ? options.graph(parsed, formId) : { data: options.leads ?? [] }
      return { ok: page.status === undefined || page.status < 400, status: page.status ?? 200, json: async () => page }
    },
  })
  return {
    state,
    async run(body, authorized = true) {
      return routeModule.exports.POST({
        headers: { get: () => authorized ? 'Bearer test-secret' : null },
        text: async () => body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body),
      })
    },
  }
}

test('authentication and option validation fail before external access', async () => {
  const h = harness()
  assert.equal((await h.run(undefined, false)).status, 401)
  for (const body of ['{', '[]', { dry_run: 'true' }, { notify: 0 }]) {
    assert.equal((await h.run(body)).status, 400)
  }
  assert.equal(h.state.requests.length, 0)
  assert.equal(h.state.inserts.length, 0)
})

test('default sync includes all six forms while explicit form overrides stay authoritative', async () => {
  const h = harness()
  const result = await h.run({ dry_run: true })
  assert.ok(result.body.form_ids.includes(liveForm))
  assert.ok(result.body.form_ids.includes(comprehensiveForm))
  assert.ok(result.body.form_ids.includes('1415220923622365'))
  assert.ok(!result.body.form_ids.includes('1354349703348317'))
  assert.equal(result.body.form_ids.length, 6)
  assert.equal(new Set(result.body.form_ids).size, 6)
  assert.equal(h.state.requests.length, 6)
  const restricted = harness({ env: { META_LEAD_FORM_IDS: '995635199922325' } })
  const override = await restricted.run({ dry_run: true })
  assert.equal(override.body.form_ids.join(','), '995635199922325')
  assert.equal(restricted.state.requests.length, 1)
})

test('dry run follows every page, deduplicates and excludes existing and deleted leads without writing', async () => {
  const h = harness({
    env: { META_LEAD_FORM_IDS: liveForm },
    existing: ['1'], removed: ['2'],
    graph: url => url.searchParams.has('after')
      ? { data: [lead(50), lead(51)] }
      : { data: Array.from({ length: 50 }, (_, i) => lead(i + 1)), paging: { next: `https://graph.facebook.com/v23.0/${liveForm}/leads?after=page2` } },
  })
  const result = await h.run({ dry_run: true })
  assert.equal(result.body.checked, 51)
  assert.equal(result.body.pending, 49)
  assert.equal(result.body.already_known, 2)
  assert.equal(h.state.requests.length, 2)
  assert.equal(h.state.inserts.length, 0)
  assert.equal(h.state.notifications.length, 0)
  assert.equal(h.state.logs.length, 0)
})

test('notify false imports new aliases and product category with no Slack or notification logs', async () => {
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, leads: [lead(1, [
    { name: '업체명_브랜드명', values: ['테스트 브랜드'] },
    { name: '제품_카테고리', values: ['스킨케어'] },
    { name: 'full_name', values: ['테스트 담당자'] },
    { name: 'phone_number', values: ['+821000000000'] },
  ])] })
  const result = await h.run({ notify: false })
  assert.equal(result.body.inserted, 1)
  assert.equal(result.body.notified, 0)
  const row = h.state.inserts[0]
  assert.equal(row.company_name, '테스트 브랜드')
  assert.equal(row.category, '뷰티')
  assert.equal(row.phone, '01000000000')
  assert.match(row.latest_note, /제품: 스킨케어/)
  assert.equal(row.assigned_to, null)
  assert.equal(h.state.notifications.length, 0)
  assert.equal(h.state.logs.length, 0)
  assert.equal((await h.run({ notify: false })).body.inserted, 0)
})

test('empty cron request keeps default notifications and legacy field mapping', async () => {
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, leads: [lead(1, [
    { name: '업체명_또는_브랜드명을_입력해주세요.', values: ['기존 테스트 브랜드'] },
    { name: '제품_카테고리를_선택해주세요.', values: ['스킨케어'] },
  ])] })
  const result = await h.run()
  assert.equal(result.body.inserted, 1)
  assert.equal(result.body.notified, 1)
  assert.equal(h.state.inserts[0].company_name, '기존 테스트 브랜드')
  assert.equal(h.state.notifications.length, 1)
  assert.equal(h.state.logs.length, 1)
})

test('new comprehensive form industry choices map to CRM categories ahead of product category', async () => {
  const cases = [
    ['업종', '병원/의료', '병의원'],
    ['업종', '대행사/마케팅', '기타및대행사'],
    ['업종을_선택해주세요.', '병원/의료', '병의원'],
    ['업종을_선택해주세요.', '대행사/마케팅', '기타및대행사'],
  ]
  const h = harness({
    env: { META_LEAD_FORM_IDS: comprehensiveForm },
    leads: cases.map(([name, value], i) => lead(i + 1, [
      { name, values: [value] },
      { name: '제품_카테고리', values: ['스킨케어'] },
    ])),
  })
  const result = await h.run({ notify: false })
  assert.equal(result.body.inserted, cases.length)
  for (const [i, [name, value, expected]] of cases.entries()) {
    assert.equal(h.state.inserts[i].category, expected, `${name}: ${value}`)
  }
})

test('new industry choices preserve legacy categories and product fallback behavior', async () => {
  const cases = [
    ['F&B/음식점/카페', 'F&B'],
    ['피부과/시술', '뷰티'],
    ['뷰티/화장품', '뷰티'],
    ['패션/의류', '커머스'],
    ['기타', '미분류'],
    [null, '뷰티'],
  ]
  const h = harness({
    env: { META_LEAD_FORM_IDS: liveForm },
    leads: cases.map(([industry], i) => lead(i + 1, [
      ...(industry ? [{ name: '업종', values: [industry] }] : []),
      { name: '제품_카테고리', values: ['스킨케어'] },
    ])),
  })
  const result = await h.run({ notify: false })
  assert.equal(result.body.inserted, cases.length)
  for (const [i, [industry, expected]] of cases.entries()) {
    assert.equal(h.state.inserts[i].category, expected, industry ?? 'product fallback')
  }
})

test('backfill preserves the original inquiry date in Seoul rather than the import date', async () => {
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, leads: [
    { ...lead(1), created_time: '2026-09-02T16:00:00Z' },
  ] })
  await h.run({ notify: false })
  assert.equal(h.state.inserts[0].inflow_date, '2026-09-03')
})

test('large backfills split existing/deleted checks into at most 100 IDs', async () => {
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, leads: Array.from({ length: 205 }, (_, i) => lead(i)) })
  const result = await h.run({ dry_run: true })
  assert.equal(result.body.pending, 205)
  assert.equal(h.state.lookups.length, 6)
  assert.ok(h.state.lookups.every(query => query.ids.length <= 100))
})

test('database deduplication failure prevents imports and notifications', async () => {
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, leads: [lead(1)], lookupError: true })
  assert.equal((await h.run({ notify: false })).status, 500)
  assert.equal(h.state.inserts.length, 0)
  assert.equal(h.state.notifications.length, 0)
})

test('Graph HTTP errors remain visible and unsafe or repeating pagination is stopped', async () => {
  for (const next of ['https://untrusted.invalid/leads', `https://graph.facebook.com/v23.0/${liveForm}/leads?after=repeated`]) {
    const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, graph: () => ({ data: [], paging: { next } }) })
    const result = await h.run({ dry_run: true })
    assert.equal(result.body.errors.length, 1)
    assert.ok(h.state.requests.every(url => new URL(url).origin === 'https://graph.facebook.com'))
    assert.ok(h.state.requests.length <= 2)
  }
  const h = harness({ env: { META_LEAD_FORM_IDS: liveForm }, graph: () => ({ status: 503 }) })
  assert.match((await h.run({ dry_run: true })).body.errors[0], /Meta HTTP 503/)
})
