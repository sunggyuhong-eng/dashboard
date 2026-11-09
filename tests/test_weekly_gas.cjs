const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function sheet() {
  const values = []
  return {
    values,
    getLastRow: () => values.length,
    appendRow: row => values.push([...row]),
    getDataRange: () => ({ getValues: () => values.map(row => [...row]), getDisplayValues: () => values.map(row => row.map(value => String(value ?? ''))) }),
    getRange: (row, column, count, width) => ({ setValues: rows => {
      assert.equal(rows.length, count)
      rows.forEach((item, index) => { values[row + index - 1] = [...item]; assert.equal(item.length, width) })
    } }),
  }
}
const tabs = {}
const ss = {
  getSpreadsheetTimeZone: () => 'Asia/Seoul',
  getSheetByName: name => tabs[name] || null,
  insertSheet: name => (tabs[name] = sheet()),
}
const context = vm.createContext({
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { formatDate: (date, zone, pattern) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]))
    const stamp = `${parts.year}-${parts.month}-${parts.day}`
    return pattern === 'yyyy-MM-dd' ? stamp : `${stamp} ${parts.hour}:${parts.minute}:${parts.second}`
  } },
})
vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8'), context)
const data = {
  openings: [
    { row: 2, project: 'Art실', title: '컨셉아트', status: '진행중', targetTo: 1, toGroup: 'Art-1' },
    { row: 3, project: 'Art실', title: '캐릭터 컨셉아트', status: '진행중', targetTo: 0, toGroup: 'Art-1' },
    { row: 4, project: 'KONG', title: '사업PM', status: '완료', targetTo: 1, completedName: '테스트 입사자', completedDate: '2026-11-09' },
  ],
  candidates: [{ project: 'Art실', openingTitle: '컨셉아트', stage: '온라인 과제' }],
}
const monday = new Date('2026-11-09T02:00:00Z')
vm.runInContext('saveMondaySnapshot_', context)(ss, data, monday)
let rows = vm.runInContext('readWeeklySnapshots_', context)(ss)
assert.equal(rows.length, 3)
assert.equal(rows.find(row => row.project === '전체').activeTo, 1)
assert.equal(rows.find(row => row.project === '전체').candidates, 1)
assert.equal(rows.find(row => row.project === '전체').completed, 1)
data.candidates.push({ project: 'Art실', openingTitle: '캐릭터 컨셉아트', stage: '1차 면접' })
vm.runInContext('saveMondaySnapshot_', context)(ss, data, monday)
rows = vm.runInContext('readWeeklySnapshots_', context)(ss)
assert.equal(rows.length, 3)
assert.equal(rows.find(row => row.project === '전체').candidates, 2)
vm.runInContext('saveMondaySnapshot_', context)(ss, data, new Date('2026-11-10T02:00:00Z'))
assert.equal(vm.runInContext('readWeeklySnapshots_', context)(ss).length, 3)
vm.runInContext('saveMondaySnapshot_', context)(ss, data, new Date('2026-11-16T02:00:00Z'))
rows = vm.runInContext('readWeeklySnapshots_', context)(ss)
assert.equal(rows.length, 6)
assert.equal(rows.find(row => row.week === '2026-11-16' && row.project === '전체').completed, 0)
console.log('Apps Script: Monday snapshots, shared TO and completion date passed.')
