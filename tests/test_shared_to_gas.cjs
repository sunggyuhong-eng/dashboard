const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const code = fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8')

function sheet(name, values) {
  return {
    getName: () => name,
    getDataRange: () => ({ getDisplayValues: () => values, getValues: () => values }),
    getRange: (_row, _column, count) => ({
      getRichTextValues: () => Array.from({ length: count }, () => [null]),
      getFormulas: () => Array.from({ length: count }, () => ['']),
    }),
  }
}
function read(openingValues) {
  const tabs = {
    Dashboard_TO: sheet('Dashboard_TO', openingValues),
    Dashboard_지원자: sheet('Dashboard_지원자', [
      ['진행단계', '이름', 'PJ', '직무(공고명)', '입사일', '1차 면접', '2차 면접'],
      ['1차 면접', '테스트 A', 'MAZE', '[MAZE] 소프트웨어 엔지니어', '', 20261119, ''],
      ['Offer', '테스트 B', 'MAZE', '[MAZE] 그래픽스 프로그래머', 20261201, '', ''],
    ]),
  }
  // Only read APIs are provided: a sheet mutation would fail this test.
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: name => tabs[name] || null, getSpreadsheetTimeZone: () => 'Asia/Seoul',
    }) },
    // Apps Script provides Utilities; mirror the date formatting used by Code.gs in this VM.
    Utilities: { formatDate: (date, timezone, pattern) => {
      assert.equal(pattern, 'yyyy-MM-dd')
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date)
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
      return `${values.year}-${values.month}-${values.day}`
    } },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  })
  vm.runInContext(code, context)
  return JSON.parse(JSON.stringify(vm.runInContext('dashboard_()', context)))
}
const headers = ['프로젝트', '공고명', '채용인원', '채용사유', '채용승인신청서 링크', 'TO 그룹', '상태', 'TO번호', '입사자', '공고마감']
const data = read([
  headers,
  ['MAZE', '[MAZE] 소프트웨어 엔지니어', '3', '대체채용', 'https://example.com/one', ' MAZE-개발-01 ', '진행중'],
  ['MAZE', '[MAZE] 그래픽스 프로그래머', '3', '대체채용', 'https://example.com/two', 'MAZE-개발-01', '완료', '15', '테스트 입사자', '2026-11-09'],
])
assert.equal(data.openings.length, 2)
assert.equal(data.candidates.length, 2)
assert.deepEqual(data.openings.map(row => row.toGroup), ['MAZE-개발-01', 'MAZE-개발-01'])
assert.deepEqual(data.openings.map(row => row.targetTo), [3, 3])
assert.deepEqual(data.openings.map(row => row.status), ['진행중', '완료'])
assert.deepEqual(data.openings.map(row => row.title), ['소프트웨어 엔지니어', '그래픽스 프로그래머'])
assert.equal(data.openings[1].approvalUrl, 'https://example.com/two')
assert.equal(data.openings[1].toNumber, 15)
assert.equal(data.openings[1].completedName, '테스트 입사자')
assert.equal(data.openings[1].completedDate, '2026-11-09')
const previousHeaders = [...headers]
previousHeaders[8] = '채용완료'
previousHeaders[9] = '입사날짜'
assert.equal(read([previousHeaders, ['KONG', '글로벌 사업PM', '1', '대체채용', '', '', '완료', '15', '테스트 입사자', '2026-11-09']]).openings[0].completedDate, '2026-11-09')
assert.equal(data.candidates[0].firstInterviewDate, '2026-11-19')
assert.equal(data.candidates[1].hireDate, '2026-12-01')
assert.equal(Object.hasOwn(data, 'applications'), false)
assert.equal(Object.hasOwn(data, 'completedHires'), false)
const old = read([headers.slice(0, 4), ['MAZE', '소프트웨어 엔지니어', '3', '대체채용']])
assert.equal(old.openings[0].toGroup, '')
assert.equal(old.openings[0].approvalUrl, '')
const alias = read([headers.slice(0, 4).concat('TO그룹'), ['MAZE', '소프트웨어 엔지니어', '3', '대체채용', '공유01']])
assert.equal(alias.openings[0].toGroup, '공유01')
console.log('Apps Script: shared TO, legacy columns, candidate dates and approval links passed (read-only).')
