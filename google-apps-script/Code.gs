var ACTIVE_STAGES = ['온라인 과제','코딩테스트','역량검사','면접','1차 면접','2차 면접','면접합격','처우단계','Offer'];
var OPENING_HEADERS = ['opening_id','source','공고명','공고URL','등록일','마감일','상태','프로젝트','목표TO','채용배경','최종동기화'];

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || body.token !== expected) return output_({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
    if (body.action === 'dashboard') return output_(dashboard_());
    if (body.action === 'sync_gamejob') return output_(syncGamejob_(body.jobs || []));
    return output_({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function dashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var interview = findSheet_(ss, ['1. 2026 Interviewee', '2026 Interviewee']);
  if (!interview) throw new Error('지원자 시트(1. 2026 Interviewee)를 찾지 못했습니다.');
  var candidateTable = table_(interview, ['진행단계','이름','직무(공고명)']);
  var col = candidateTable.columns;
  var candidateMap = {};
  var hiredMap = {};
  for (var i = candidateTable.headerRow; i < candidateTable.values.length; i++) {
    var row = candidateTable.values[i];
    var stage = clean_(row[col['진행단계']]);
    var name = clean_(row[col['이름']]);
    var title = clean_(row[col['직무(공고명)']]);
    var project = col['PJ'] == null ? '' : clean_(row[col['PJ']]);
    if (!title) continue;
    if (stage === 'Hired') hiredMap[title] = (hiredMap[title] || 0) + 1;
    if (name && ACTIVE_STAGES.indexOf(stage) >= 0) {
      if (!candidateMap[title]) candidateMap[title] = [];
      candidateMap[title].push({ id: 'row-' + (i + 1), row: i + 1, name: name, stage: stage, project: project, openingTitle: title });
    }
  }

  var toMap = readTo_(ss);
  var openingSheet = openingsSheet_(ss);
  var rows = openingSheet.getDataRange().getDisplayValues();
  var openings = [];
  var seen = {};
  for (var r = 1; r < rows.length; r++) {
    var item = rows[r];
    var openingTitle = clean_(item[2]);
    if (!openingTitle) continue;
    var to = toMap[openingTitle] || {};
    openings.push({
      id: clean_(item[0]) || 'sheet-' + hash_(openingTitle), source: clean_(item[1]) || 'sheet', title: openingTitle,
      url: clean_(item[3]), postedAt: clean_(item[4]), deadline: clean_(item[5]), status: clean_(item[6]) === '마감' ? '마감' : '진행중',
      project: clean_(item[7]) || projectFrom_(candidateMap[openingTitle]), targetTo: number_(item[8] || to.targetTo),
      hiredCount: hiredMap[openingTitle] || 0, reason: clean_(item[9]) || to.reason || '', candidates: candidateMap[openingTitle] || []
    });
    seen[openingTitle] = true;
  }
  var allTitles = Object.keys(toMap).concat(Object.keys(candidateMap));
  allTitles.forEach(function(title) {
    if (seen[title]) return;
    var to = toMap[title] || {};
    openings.push({ id: 'sheet-' + hash_(title), source: 'sheet', title: title, url: '', postedAt: '', deadline: '', status: '진행중', project: projectFrom_(candidateMap[title]), targetTo: number_(to.targetTo), hiredCount: hiredMap[title] || 0, reason: to.reason || '', candidates: candidateMap[title] || [] });
  });
  openings.sort(function(a,b) { if (a.status !== b.status) return a.status === '진행중' ? -1 : 1; return b.candidates.length - a.candidates.length || a.title.localeCompare(b.title); });
  return { ok: true, openings: openings, candidateCount: Object.keys(candidateMap).reduce(function(total,key){ return total + candidateMap[key].length; },0), syncedAt: new Date().toISOString() };
}

function syncGamejob_(jobs) {
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('게임잡 공고가 0건이라 기존 공고를 변경하지 않았습니다.');
  var sheet = openingsSheet_(SpreadsheetApp.getActiveSpreadsheet());
  var rows = sheet.getDataRange().getDisplayValues(), byId = {};
  for (var i = 1; i < rows.length; i++) if (rows[i][0]) byId[clean_(rows[i][0])] = i + 1;
  var active = {};
  jobs.forEach(function(job) {
    var id = clean_(job.id), title = clean_(job.title);
    if (!id || !title) return;
    active[id] = true;
    var rowNumber = byId[id];
    var existing = rowNumber ? sheet.getRange(rowNumber,1,1,OPENING_HEADERS.length).getDisplayValues()[0] : [];
    var values = [id,'gamejob',title,clean_(job.url),clean_(job.postedAt),clean_(job.deadline),'진행중',existing[7] || '',number_(existing[8]),existing[9] || '',new Date()];
    if (rowNumber) sheet.getRange(rowNumber,1,1,OPENING_HEADERS.length).setValues([values]);
    else { rowNumber = sheet.getLastRow() + 1; sheet.getRange(rowNumber,1,1,OPENING_HEADERS.length).setValues([values]); byId[id] = rowNumber; }
  });
  Object.keys(byId).forEach(function(id) { var rowNumber = byId[id]; if (clean_(sheet.getRange(rowNumber,2).getDisplayValue()) === 'gamejob' && !active[id]) sheet.getRange(rowNumber,7).setValue('마감'); });
  return { ok: true, synced: Object.keys(active).length };
}

function readTo_(ss) {
  var sheet = findSheet_(ss, ['TO정리']); if (!sheet) return {};
  var info = table_(sheet, ['공고명']), result = {};
  for (var i = info.headerRow; i < info.values.length; i++) {
    var title = clean_(info.values[i][info.columns['공고명']]); if (!title) continue;
    result[title] = { targetTo: info.columns['채용인원'] == null ? 0 : number_(info.values[i][info.columns['채용인원']]), reason: info.columns['채용사유'] == null ? '' : clean_(info.values[i][info.columns['채용사유']]) };
  }
  return result;
}

function openingsSheet_(ss) {
  var sheet = ss.getSheetByName('채용대시보드_공고');
  if (!sheet) { sheet = ss.insertSheet('채용대시보드_공고'); sheet.getRange(1,1,1,OPENING_HEADERS.length).setValues([OPENING_HEADERS]); sheet.setFrozenRows(1); }
  return sheet;
}

function table_(sheet, required) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {}; values[r].forEach(function(value,index){ if (clean_(value)) columns[clean_(value)] = index; });
    if (required.every(function(name){ return columns[name] != null; })) return { values: values, headerRow: r + 1, columns: columns };
  }
  throw new Error(sheet.getName() + ' 시트에서 필수 열(' + required.join(', ') + ')을 찾지 못했습니다.');
}
function findSheet_(ss, names) { for (var i=0;i<names.length;i++) { var sheet=ss.getSheetByName(names[i]); if(sheet) return sheet; } return null; }
function projectFrom_(candidates) { return candidates && candidates.length ? clean_(candidates[0].project) : ''; }
function clean_(value) { return value == null ? '' : String(value).trim(); }
function number_(value) { var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g,'')); return isFinite(parsed) ? parsed : 0; }
function hash_(text) { var hash=0; for(var i=0;i<text.length;i++) hash=((hash<<5)-hash)+text.charCodeAt(i),hash|=0; return Math.abs(hash).toString(36); }
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
