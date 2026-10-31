// Offline route tests: Supabase and Slack are mocked.
// Run: node --test scripts/lead-integration.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const routeSource = fs.readFileSync(new URL('../src/app/api/integrations/lead/route.ts', import.meta.url), 'utf8')
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

const FIXED_MS = Date.parse('2026-10-29T16:30:00.000Z') // KST 2026-10-30 01:30

const transpileOpts = {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}

function ilikeMatch(value, pattern) {
  if (value == null) return false
  let regex = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) {
      regex += pattern[++i].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (ch === '%') regex += '[\\s\\S]*'
    else if (ch === '_') regex += '[\\s\\S]'
    else regex += ch.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${regex}$`, 'i').test(String(value))
}

function matches(row, filter) {
  if (filter.t === 'eq') return row[filter.col] === filter.val
  if (filter.t === 'ilike') return ilikeMatch(row[filter.col], filter.val)
  if (filter.t === 'not' && filter.op === 'is' && filter.val === null) return row[filter.col] != null
  throw new Error(`Unexpected filter ${JSON.stringify(filter)}`)
}

const DEFAULT_PROFILES = [
  { id: 'admin-1', name: '관리자', email: 'admin@example.com', role: 'admin', is_active: true },
  { id: 'sales-1', name: '김영업', email: 'sales@example.com', role: 'sales', is_active: true },
  { id: 'off-1', name: '휴직', email: 'off@example.com', role: 'sales', is_active: false },
]

function company(partial) {
  return {
    phone: null,
    email: null,
    contact_name: null,
    source: null,
    category: null,
    interest_level: null,
    latest_note: null,
    status: '신규문의',
    assigned_to: null,
    last_contacted_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function harness(options = {}) {
  const db = {
    profiles: (options.profiles ?? DEFAULT_PROFILES).map(row => ({ ...row })),
    companies: (options.companies ?? []).map(row => company(row)),
    activities: [],
    notification_logs: [],
  }
  const calls = []
  const notifications = []
  let seq = 0

  function apply(table, state) {
    if (state.op === 'insert') {
      if (table === 'companies') {
        const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
        const row = company({
          id,
          updated_at: '2026-10-30T00:00:00.000Z',
          ...state.payload,
        })
        db.companies.push(row)
        return { data: { id }, error: null }
      }
      if (table === 'activities') {
        const row = {
          id: `act-${++seq}`,
          created_at: new Date(FIXED_MS).toISOString(),
          ...state.payload,
        }
        db.activities.push(row)
        const target = db.companies.find(item => item.id === row.company_id)
        if (target) {
          target.last_contacted_at = row.created_at
          if (row.memo) target.latest_note = row.memo
        }
        return { data: null, error: null }
      }
      if (table === 'notification_logs') {
        db.notification_logs.push({
          created_at: new Date(FIXED_MS + db.notification_logs.length).toISOString(),
          ...state.payload,
        })
        return { data: null, error: null }
      }
      throw new Error(`Unexpected insert ${table}`)
    }

    let rows = db[table].filter(row => state.filters.every(filter => matches(row, filter)))
    if (state.op === 'update') {
      for (const row of rows) Object.assign(row, state.payload)
      return { data: null, error: null }
    }

    if (state.order) {
      const { col, asc } = state.order
      rows = [...rows].sort((a, b) => {
        const av = a[col] ?? ''
        const bv = b[col] ?? ''
        if (av < bv) return asc ? -1 : 1
        if (av > bv) return asc ? 1 : -1
        return 0
      })
    }
    if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1)
    else if (state.limit != null) rows = rows.slice(0, state.limit)
    return { data: rows, error: null }
  }

  const supabase = {
    from(table) {
      calls.push(table)
      const state = { filters: [], order: null, range: null, limit: null, op: 'select', payload: null }
      let pending = null
      const exec = () => {
        if (!pending) pending = Promise.resolve().then(() => apply(table, state))
        return pending
      }
      const api = {
        select() { return api },
        eq(col, val) { state.filters.push({ t: 'eq', col, val }); return api },
        ilike(col, val) { state.filters.push({ t: 'ilike', col, val }); return api },
        not(col, op, val) { state.filters.push({ t: 'not', col, op, val }); return api },
        order(col, opts) { state.order = { col, asc: opts?.ascending !== false }; return api },
        limit(n) { state.limit = n; return api },
        range(from, to) { state.range = [from, to]; return api },
        insert(row) { state.op = 'insert'; state.payload = row; return api },
        update(row) { state.op = 'update'; state.payload = row; return api },
        single() { return exec() },
        then(resolve, reject) { return exec().then(resolve, reject) },
      }
      return api
    },
  }

  const env = {
    INTEGRATION_SECRET: 'integration-secret',
    CRON_SECRET: 'cron-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NEXT_PUBLIC_APP_URL: 'https://crm.example.com/',
    ...options.env,
  }
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key]
  }

  const context = vm.createContext({
    FIXED_MS,
    console,
    URL,
    Buffer,
    encodeURIComponent,
    decodeURIComponent,
  })
  vm.runInContext(`
    const RealDate = Date
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [FIXED_MS]))
      }
      static now() { return FIXED_MS }
      static parse(value) { return RealDate.parse(value) }
      static UTC(...args) { return RealDate.UTC(...args) }
    }
    Date = FixedDate
  `, context)

  const loaded = new Map()
  function localRequire(name) {
    if (name === 'next/server') {
      return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } }
    }
    if (name === '@supabase/supabase-js') return { createClient: () => supabase }
    if (name === '@/lib/slack') {
      return {
        sendSlackNotification: async value => {
          notifications.push(value)
          return options.slack ?? { ok: true }
        },
      }
    }
    if (name.startsWith('@/')) {
      const file = path.join(root, 'src', `${name.slice(2)}.ts`)
      if (loaded.has(file)) return loaded.get(file)
      const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), transpileOpts).outputText
      const loadedModule = { exports: {} }
      const previous = { module: context.module, exports: context.exports, require: context.require }
      context.module = loadedModule
      context.exports = loadedModule.exports
      context.require = localRequire
      vm.runInContext(compiled, context)
      context.module = previous.module
      context.exports = previous.exports
      context.require = previous.require
      loaded.set(file, loadedModule.exports)
      return loadedModule.exports
    }
    throw new Error(`Unexpected import: ${name}`)
  }

  const routeModule = { exports: {} }
  context.module = routeModule
  context.exports = routeModule.exports
  context.require = localRequire
  context.process = { env }
  vm.runInContext(compiledRoute, context)

  return {
    db,
    calls,
    notifications,
    async run(body, requestOptions = {}) {
      const header = requestOptions.header === undefined
        ? 'Bearer integration-secret'
        : requestOptions.header
      return routeModule.exports.POST({
        headers: { get: name => (name.toLowerCase() === 'authorization' ? header : null) },
        json: async () => {
          if (requestOptions.invalidJson) throw new Error('bad json')
          return body
        },
      })
    },
  }
}

test('rejects missing auth, the wrong secret, and a missing secret before touching the database', async () => {
  const h = harness()
  assert.equal((await h.run({ company_name: 'A' }, { header: null })).status, 401)
  assert.equal((await h.run({ company_name: 'A' }, { header: 'Bearer nope' })).status, 401)
  const closed = harness({ env: { INTEGRATION_SECRET: undefined, CRON_SECRET: undefined } })
  assert.equal((await closed.run({ company_name: 'A' })).status, 401)
  assert.equal(h.db.companies.length, 0)
  assert.equal(h.calls.length, 0)
  assert.equal(closed.calls.length, 0)
})

test('accepts either integration or cron bearer token', async () => {
  const byIntegration = harness()
  const byCron = harness()
  const integration = await byIntegration.run({ company_name: '통합시크릿' })
  const cron = await byCron.run({ company_name: '크론시크릿' }, { header: 'Bearer cron-secret' })
  assert.equal(integration.body.result, 'created')
  assert.equal(cron.body.result, 'created')
})

test('rejects invalid json, a missing name, and an out-of-range interest level', async () => {
  const h = harness()
  assert.equal((await h.run(null, { invalidJson: true })).status, 400)
  assert.equal((await h.run([])).status, 400)
  assert.equal((await h.run({ company_name: '  ' })).status, 400)
  for (const interest_level of [0, 6, 1.5, '높음', true]) {
    assert.equal((await h.run({ company_name: '상호', interest_level })).status, 400)
  }
  assert.equal(h.db.companies.length, 0)
  assert.equal(h.calls.length, 0)
  assert.equal(h.notifications.length, 0)
})

test('creates a lead in KST with normalized contact fields, an activity, and the new-db alert', async () => {
  const h = harness()
  const result = await h.run({
    company_name: '  신규브랜드  ',
    phone: '010-1234-5678 User@Brand.com',
    contact_name: ' 박고객 ',
    source: '스레드',
    category: '병의원',
    special_note: '대만 진출 문의',
    interest_level: '5',
    poster_email: 'Sales@Example.com',
    poster_name: '다른이름',
    slack_permalink: 'https://slack.example/archives/C1/p1',
    raw_text: '원문 메시지',
    dedupe_key: '1712345678.000100',
  })

  assert.equal(result.status, 200)
  assert.deepEqual(Object.keys(result.body).sort(), ['id', 'result', 'url'])
  assert.equal(result.body.result, 'created')
  const row = h.db.companies.find(item => item.id === result.body.id)
  assert.equal(row.company_name, '신규브랜드')
  assert.equal(row.phone, '01012345678')
  assert.equal(row.email, 'user@brand.com')
  assert.equal(row.contact_name, '박고객')
  assert.equal(row.source, '스레드')
  assert.equal(row.category, '병의원')
  assert.equal(row.status, '신규문의')
  assert.equal(row.inflow_date, '2026-10-30')
  assert.equal(row.interest_level, 5)
  assert.equal(row.latest_note, '대만 진출 문의')
  assert.equal(row.last_contacted_at, null)
  assert.equal(row.assigned_to, 'sales-1')
  assert.equal(result.body.url, `https://crm.example.com/companies/${row.id}`)

  assert.equal(h.db.activities.length, 1)
  const activity = h.db.activities[0]
  assert.equal(activity.user_id, 'sales-1')
  assert.equal(activity.activity_type, '기타')
  assert.match(activity.memo, /^대만 진출 문의\nhttps:\/\/slack\.example\/archives\/C1\/p1\n원문 메시지\n/)
  assert.match(activity.memo, /\[\[lead-dedupe:1712345678\.000100\]\] result:created$/)
  assert.doesNotMatch(activity.memo, /슬랙 작성자/)

  assert.equal(h.notifications.length, 1)
  assert.equal(h.notifications[0].text, '[신규 DB 등록] 신규브랜드')
  assert.equal(h.notifications[0].blocks[0].text.text, '🆕 신규 DB 등록')
  assert.match(h.notifications[0].blocks[1].text.text, /신규브랜드/)
  assert.match(h.notifications[0].blocks[1].text.text, /병의원/)
  assert.match(h.notifications[0].blocks[1].text.text, /스레드/)
  assert.match(h.notifications[0].blocks[1].text.text, /김영업/)
  assert.match(h.notifications[0].blocks[1].text.text, new RegExp(result.body.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(h.db.notification_logs[0].notification_type, 'new_company')
  assert.equal(h.db.notification_logs[0].status, 'sent')
  assert.equal(h.db.notification_logs[0].company_id, row.id)
})

test('falls back source and category, keeps a failed slack post from failing the create', async () => {
  const h = harness({ slack: { ok: false, error: 'down' } })
  const result = await h.run({
    company_name: '기본값',
    source: '없는경로',
    category: '학원',
    poster_name: '없는사람',
    poster_slack_id: 'U999',
  })
  assert.equal(result.body.result, 'created')
  const row = h.db.companies[0]
  assert.equal(row.source, '기타및소개')
  assert.equal(row.category, '미분류')
  assert.equal(row.assigned_to, null)
  assert.equal(row.interest_level, null)
  assert.equal(row.phone, null)
  assert.equal(row.email, null)
  assert.equal(h.db.activities[0].user_id, 'admin-1')
  assert.match(h.db.activities[0].memo, /슬랙 작성자: 없는사람 · U999/)
  assert.match(h.notifications[0].blocks[1].text.text, /담당자:\* —/)
  assert.equal(h.db.notification_logs[0].status, 'failed')
  assert.equal(h.db.notification_logs[0].error_message, 'down')
})

test('an email in the phone field is stored as email and deduped case-insensitively', async () => {
  const h = harness({
    companies: [
      company({
        id: 'co-mail',
        company_name: '메일회사',
        email: 'Sales_Team@Example.com',
        updated_at: '2026-05-01T00:00:00.000Z',
      }),
      company({
        id: 'co-decoy',
        company_name: '미끼',
        email: 'SalesXTeam@Example.com',
        updated_at: '2026-09-01T00:00:00.000Z',
      }),
    ],
  })
  const result = await h.run({
    company_name: '다른상호',
    phone: 'sales_team@example.com',
    contact_name: '새담당',
    source: '인스타DM',
  })
  assert.equal(result.body.result, 'merged')
  assert.equal(result.body.id, 'co-mail')
  const row = h.db.companies.find(item => item.id === 'co-mail')
  assert.equal(row.contact_name, '새담당')
  assert.equal(row.source, '인스타DM')
  assert.equal(row.company_name, '메일회사')
  assert.equal(row.email, 'Sales_Team@Example.com')
  assert.equal(h.notifications.length, 0)
})

test('phone digits win over email and exact name, and the newest formatted number wins', async () => {
  const h = harness({
    companies: [
      company({
        id: 'co-old',
        company_name: '옛번호',
        phone: '010-1111-2222',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
      company({
        id: 'co-new',
        company_name: '새번호',
        phone: '(010) 1111-2222',
        email: 'taken@example.com',
        status: '계약완료',
        assigned_to: 'sales-1',
        contact_name: '기존',
        source: '메타광고',
        category: 'F&B',
        interest_level: 2,
        latest_note: '기존 메모',
        last_contacted_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      }),
      company({
        id: 'co-name',
        company_name: '요청상호',
        email: 'other@example.com',
        updated_at: '2026-10-01T00:00:00.000Z',
      }),
    ],
  })
  const result = await h.run({
    company_name: '요청상호',
    phone: '01011112222 other@example.com',
    contact_name: '새담당',
    source: '스레드',
    category: '뷰티',
    interest_level: 4,
    special_note: '추가 문의',
    poster_email: 'admin@example.com',
    slack_permalink: 'https://slack.example/p/2',
    dedupe_key: 'a_b 1',
  })
  assert.equal(result.body.result, 'merged')
  assert.equal(result.body.id, 'co-new')
  const row = h.db.companies.find(item => item.id === 'co-new')
  assert.equal(row.phone, '(010) 1111-2222')
  assert.equal(row.email, 'taken@example.com')
  assert.equal(row.contact_name, '기존')
  assert.equal(row.source, '메타광고')
  assert.equal(row.category, 'F&B')
  assert.equal(row.interest_level, 2)
  assert.equal(row.latest_note, '기존 메모')
  assert.equal(row.status, '계약완료')
  assert.equal(row.assigned_to, 'sales-1')
  assert.equal(row.company_name, '새번호')
  assert.equal(row.last_contacted_at, '2026-02-01T00:00:00.000Z')
  assert.match(h.db.activities[0].memo, /추가 문의\nhttps:\/\/slack\.example\/p\/2\n/)
  assert.match(h.db.activities[0].memo, /\[\[lead-dedupe:a_b%201\]\] result:merged$/)
  assert.equal(h.notifications.length, 0)
})

test('fills only empty fields and does not apply omitted source or category fallbacks', async () => {
  const h = harness({
    companies: [
      company({
        id: 'co-empty',
        company_name: '빈칸회사',
        email: 'empty@example.com',
        status: '미팅진행',
        assigned_to: null,
      }),
    ],
  })
  const omitted = await h.run({
    company_name: '다른이름',
    phone: '01055556666 empty@example.com',
    poster_name: '김영업',
  })
  assert.equal(omitted.body.result, 'merged')
  let row = h.db.companies.find(item => item.id === 'co-empty')
  assert.equal(row.phone, '01055556666')
  assert.equal(row.source, null)
  assert.equal(row.category, null)
  assert.equal(row.status, '미팅진행')
  assert.equal(row.assigned_to, null)
  assert.equal(row.email, 'empty@example.com')

  const filled = await h.run({
    company_name: '빈칸회사',
    phone: 'empty@example.com',
    contact_name: '채움',
    source: '회사DB',
    category: '숙박',
    special_note: '빈 메모',
    interest_level: 1,
  })
  assert.equal(filled.body.id, 'co-empty')
  row = h.db.companies.find(item => item.id === 'co-empty')
  assert.equal(row.contact_name, '채움')
  assert.equal(row.source, '회사DB')
  assert.equal(row.category, '숙박')
  assert.equal(row.latest_note, '빈 메모')
  assert.equal(row.interest_level, 1)
  assert.equal(row.assigned_to, null)
  assert.equal(h.notifications.length, 0)
})

test('maps the slack 리드 labels onto a new client assigned to the poster', async () => {
  const h = harness()
  const result = await h.run({
    상호: '  새브랜드  ',
    연락처: '010-9999-8888',
    업체담당자: ' 홍길동 ',
    퍼널: '스레드',
    특이사항: '첫 문의',
    poster_name: '김 영업',
    poster_email: '',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.result, 'created')
  const row = h.db.companies.find(item => item.id === result.body.id)
  assert.equal(row.company_name, '새브랜드')
  assert.equal(row.phone, '01099998888')
  assert.equal(row.contact_name, '홍길동')
  assert.equal(row.source, '스레드')
  assert.equal(row.category, '미분류')
  assert.equal(row.status, '신규문의')
  assert.equal(row.inflow_date, '2026-10-30')
  assert.equal(row.latest_note, '첫 문의')
  assert.equal(row.assigned_to, 'sales-1')
  assert.equal(row.last_contacted_at, null)
  assert.equal(result.body.url, `https://crm.example.com/companies/${row.id}`)
  assert.equal(h.notifications.length, 1)
  assert.match(h.notifications[0].blocks[1].text.text, /김영업/)
})

test('english fields win over the korean labels, and a schemeless app url is https', async () => {
  const h = harness({ env: { NEXT_PUBLIC_APP_URL: 'crm.example.com/' } })
  const result = await h.run({
    company_name: '영문상호',
    상호: '한글상호',
    phone: '01011112222',
    연락처: '01000000000',
    contact_name: '영문담당',
    업체담당자: '한글담당',
    source: '인스타DM',
    퍼널: '스레드',
    special_note: '영문메모',
    특이사항: '한글메모',
  })
  assert.equal(result.body.result, 'created')
  const row = h.db.companies[0]
  assert.equal(row.company_name, '영문상호')
  assert.equal(row.phone, '01011112222')
  assert.equal(row.contact_name, '영문담당')
  assert.equal(row.source, '인스타DM')
  assert.equal(row.latest_note, '영문메모')
  assert.equal(result.body.url, `https://crm.example.com/companies/${row.id}`)
})

test('the same 상호 with a suffix or inner spaces merges and does not open a second client', async () => {
  const h = harness({
    companies: [
      company({
        id: 'co-han',
        company_name: '주식회사 한케이',
        status: '제안서발송',
        assigned_to: 'sales-1',
        updated_at: '2026-04-01T00:00:00.000Z',
      }),
      company({
        id: 'co-spaced',
        company_name: '한 케이',
        status: '신규문의',
        updated_at: '2026-09-01T00:00:00.000Z',
      }),
      company({
        id: 'co-holding',
        company_name: '한케이홀딩스',
        updated_at: '2026-10-01T00:00:00.000Z',
      }),
    ],
  })
  const spaced = await h.run({
    company_name: '한케이',
    poster_name: '관리자',
    special_note: '공백 없는 같은 상호',
  })
  assert.equal(spaced.body.result, 'merged')
  assert.equal(spaced.body.id, 'co-spaced')
  assert.equal(spaced.body.url, 'https://crm.example.com/companies/co-spaced')
  assert.equal(h.db.companies.find(item => item.id === 'co-spaced').latest_note, '공백 없는 같은 상호')
  assert.equal(h.db.companies.find(item => item.id === 'co-spaced').assigned_to, null)
  assert.equal(h.db.companies.find(item => item.id === 'co-spaced').status, '신규문의')

  const suffixed = await h.run({ company_name: '(주)한케이홀딩스' })
  assert.equal(suffixed.body.result, 'merged')
  assert.equal(suffixed.body.id, 'co-holding')

  const legal = await h.run({ 상호: '（주）한 케이' })
  assert.equal(legal.body.result, 'merged')
  assert.equal(legal.body.id, 'co-spaced')

  const different = await h.run({ company_name: '다른한케이' })
  assert.equal(different.body.result, 'created')
  assert.equal(h.db.companies.length, 4)
  assert.equal(h.notifications.length, 1)
})

test('exact company name is case-sensitive and is only used after phone and email miss', async () => {
  const named = harness({
    companies: [company({ id: 'co-exact', company_name: 'Acme', status: '제안서발송' })],
  })
  const differentCase = await named.run({ company_name: 'acme' })
  assert.equal(differentCase.body.result, 'created')
  assert.notEqual(differentCase.body.id, 'co-exact')

  const same = await named.run({ company_name: 'Acme', special_note: '이름 일치' })
  assert.equal(same.body.result, 'merged')
  assert.equal(same.body.id, 'co-exact')
  assert.equal(named.db.companies.find(item => item.id === 'co-exact').status, '제안서발송')
  assert.equal(named.db.companies.find(item => item.id === 'co-exact').latest_note, '이름 일치')
})

test('a repeated dedupe key returns the first result and does not write or alert again', async () => {
  const h = harness()
  const first = await h.run({
    company_name: '한번만',
    dedupe_key: '1712.0001',
    special_note: '첫 메모',
  })
  const second = await h.run({
    company_name: '다른이름',
    phone: '01099998888',
    dedupe_key: '1712.0001',
    special_note: '두번째',
  })
  assert.equal(first.body.result, 'created')
  assert.deepEqual(second.body, first.body)
  assert.equal(h.db.companies.length, 1)
  assert.equal(h.db.activities.length, 1)
  assert.equal(h.notifications.length, 1)
  assert.equal(h.db.companies[0].latest_note, '첫 메모')
})

test('without a dedupe key the same phone merges, and a missing profile still records the key', async () => {
  const h = harness({ profiles: [] })
  const first = await h.run({ company_name: '무프로필', phone: '01012341234', dedupe_key: 'no profile' })
  assert.equal(first.body.result, 'created')
  assert.equal(h.db.activities.length, 0)
  assert.equal(h.db.notification_logs.some(row => row.notification_type === 'integration_lead'), true)
  const replay = await h.run({ company_name: '다시', dedupe_key: 'no profile' })
  assert.deepEqual(replay.body, first.body)
  assert.equal(h.db.companies.length, 1)

  const again = await h.run({ company_name: '다른상호', phone: '010-1234-1234' })
  assert.equal(again.body.result, 'merged')
  assert.equal(again.body.id, first.body.id)
  assert.equal(h.notifications.length, 1)
})

test('a missing service role key fails after validation and does not claim success', async () => {
  const h = harness({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } })
  const result = await h.run({ company_name: '키없음' })
  assert.equal(result.status, 500)
  assert.match(result.body.error, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.equal(h.db.companies.length, 0)
})
