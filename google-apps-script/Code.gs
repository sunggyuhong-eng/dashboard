var ACTIVE_STAGES = ['온라인 과제','코딩테스트','역량검사','면접','1차 면접','2차 면접','면접합격','처우단계','Offer'];

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || body.token !== expected) return output_({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
    if (body.action === 'dashboard') return output_(dashboard_());
    return output_({ ok: false, error: '허용되지 않은 요청입니다.' });
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
  var candidates = [];
  var hiredCounts = {};

  for (var i = candidateTable.headerRow; i < candidateTable.values.length; i++) {
    var row = candidateTable.values[i];
    var stage = clean_(row[col['진행단계']]);
    var name = clean_(row[col['이름']]);
    var title = clean_(row[col['직무(공고명)']]);
    var project = col['PJ'] == null ? '' : clean_(row[col['PJ']]);
    if (!title) continue;
    if (stage === 'Hired') hiredCounts[title] = (hiredCounts[title] || 0) + 1;
    if (name && ACTIVE_STAGES.indexOf(stage) >= 0) {
      candidates.push({
        id: 'row-' + (i + 1),
        row: i + 1,
        name: name,
        stage: stage,
        project: project,
        openingTitle: title
      });
    }
  }

  return {
    ok: true,
    candidates: candidates,
    hiredCounts: hiredCounts,
    syncedAt: new Date().toISOString()
  };
}

function table_(sheet, required) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      if (clean_(value)) columns[clean_(value)] = index;
    });
    if (required.every(function(name) { return columns[name] != null; })) {
      return { values: values, headerRow: r + 1, columns: columns };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 필수 열(' + required.join(', ') + ')을 찾지 못했습니다.');
}

function findSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  return null;
}

function clean_(value) {
  return value == null ? '' : String(value).trim();
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
