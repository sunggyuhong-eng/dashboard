var ACTIVE_STAGES = ['온라인 과제','코딩테스트','역량검사','면접','1차 면접','2차 면접','면접합격','처우단계','Offer'];

// GitHub Pages의 '데이터 다시 불러오기' 전용 읽기 API입니다.
// JSONP 콜백만 허용하며 시트에는 어떤 값도 쓰지 않습니다.
function doGet(e) {
  try {
    var callback = clean_(e && e.parameter && e.parameter.callback);
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      return output_({ ok: false, error: '올바르지 않은 콜백입니다.' });
    }
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(dashboard_()) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (error) {
    var message = String(error && error.message ? error.message : error);
    var safeCallback = clean_(e && e.parameter && e.parameter.callback);
    if (/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(safeCallback)) {
      return ContentService
        .createTextOutput(safeCallback + '(' + JSON.stringify({ ok: false, error: message }) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return output_({ ok: false, error: message });
  }
}

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
  var interview = findSheet_(ss, ['Dashboard_지원자']);
  if (!interview) throw new Error('연동용 사본에서 Dashboard_지원자 시트를 찾지 못했습니다.');
  var openingSheet = findSheet_(ss, ['Dashboard_TO']);
  if (!openingSheet) throw new Error('연동용 사본에서 Dashboard_TO 시트를 찾지 못했습니다.');

  var openingTable = openingTable_(openingSheet);
  var openings = [];
  for (var o = openingTable.headerRow; o < openingTable.values.length; o++) {
    var openingRow = openingTable.values[o];
    var openingProject = clean_(openingRow[openingTable.columns.project]);
    var openingTitle = dashboardOpeningTitle_(openingRow[openingTable.columns.title]);
    if (!openingProject || !openingTitle) continue;
    openings.push({
      row: o + 1,
      project: openingProject,
      title: openingTitle,
      targetTo: number_(openingRow[openingTable.columns.targetTo]),
      reason: clean_(openingRow[openingTable.columns.reason]),
      approvalUrl: openingTable.approvalLinks[o] || ''
    });
  }

  var candidateTable = table_(interview, ['진행단계','이름','직무(공고명)']);
  var col = candidateTable.columns;
  var hireDateColumn = firstColumn_(col, ['입사일', '입사 확정 날짜', '입사확정날짜', '입사 확정일', '입사확정일', '입사예정일']);
  var firstInterviewColumn = firstColumn_(col, ['1차 면접 날짜', '1차면접날짜', '1차 면접일', '1차면접일', '1차 면접']);
  var secondInterviewColumn = firstColumn_(col, ['2차 면접 날짜', '2차면접날짜', '2차 면접일', '2차면접일', '2차 면접']);
  var timezone = ss.getSpreadsheetTimeZone();
  var candidates = [];
  var hiredCounts = {};

  for (var i = candidateTable.headerRow; i < candidateTable.values.length; i++) {
    var row = candidateTable.values[i];
    var rawRow = candidateTable.rawValues[i] || [];
    var stage = clean_(row[col['진행단계']]);
    var name = clean_(row[col['이름']]);
    var title = dashboardOpeningTitle_(row[col['직무(공고명)']]);
    var project = col['PJ'] == null ? '' : clean_(row[col['PJ']]);
    if (!title) continue;
    var openingKey = key_(project, title);
    if (stage === 'Hired') hiredCounts[openingKey] = (hiredCounts[openingKey] || 0) + 1;
    if (name && ACTIVE_STAGES.indexOf(stage) >= 0) {
      candidates.push({
        id: 'row-' + (i + 1),
        row: i + 1,
        name: name,
        stage: stage,
        project: project,
        openingTitle: title,
        hireDate: dateValue_(rawRow, row, hireDateColumn, timezone),
        firstInterviewDate: dateValue_(rawRow, row, firstInterviewColumn, timezone),
        secondInterviewDate: dateValue_(rawRow, row, secondInterviewColumn, timezone)
      });
    }
  }

  return {
    ok: true,
    openings: openings,
    candidates: candidates,
    applications: applicationRows_(ss),
    hiredCounts: hiredCounts,
    syncedAt: new Date().toISOString()
  };
}

// GmailSync.gs가 만든 지원자_추이 탭을 읽기 전용으로 전달합니다.
// 지원자 이름·이메일·전화번호·메일 ID는 API 응답에 포함하지 않습니다.
function applicationRows_(ss) {
  var sheet = findSheet_(ss, ['지원자_추이']);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var table = applicationTable_(sheet);
  var columns = table.columns;
  var timezone = ss.getSpreadsheetTimeZone();
  var rows = [];

  for (var i = table.headerRow; i < table.values.length; i++) {
    var displayRow = table.values[i];
    var rawRow = table.rawValues[i] || [];
    var source = clean_(displayRow[columns.source]);
    var project = clean_(displayRow[columns.project]);
    var title = dashboardOpeningTitle_(displayRow[columns.title]);
    var date = applicationDate_(rawRow[columns.date], displayRow[columns.date], timezone);
    if (!date || !source || !title) continue;
    rows.push({
      date: date,
      source: source,
      project: project,
      openingTitle: title
    });
  }
  return rows;
}

function applicationTable_(sheet) {
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var rawValues = range.getValues();
  var aliases = {
    date: ['지원일시', '지원일', '수신일시', '메일일시', '날짜'],
    source: ['지원경로', '지원 경로', '지원채널', '지원 채널', '채널', '출처'],
    project: ['프로젝트', '프로젝트명', '프로젝트 명', 'PJ'],
    title: ['공고명', '채용공고', '채용공고 제목', '직무(공고명)']
  };
  for (var r = 0; r < Math.min(values.length, 20); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      var header = clean_(value);
      Object.keys(aliases).forEach(function(key) {
        if (aliases[key].indexOf(header) >= 0) columns[key] = index;
      });
    });
    if (columns.date != null && columns.source != null && columns.project != null && columns.title != null) {
      return { values: values, rawValues: rawValues, headerRow: r + 1, columns: columns };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 지원일시, 지원경로, 프로젝트, 공고명 헤더를 찾지 못했습니다.');
}

function applicationDate_(raw, display, timezone) {
  return dashboardDate_(raw, display, timezone);
}

function openingTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var aliases = {
    project: ['프로젝트', '프로젝트명', '프로젝트 명', '프로젝트 이름', 'PJ'],
    title: ['공고명', '공고 이름', '직무(공고명)'],
    targetTo: ['채용인원', '채용 인원', 'TO', '목표 TO'],
    reason: ['채용사유', '채용 사유', '채용배경', '채용 배경'],
    approvalUrl: ['채용승인신청서 링크', '채용 승인 신청서 링크', '채용승인신청서', '채용 승인 신청서']
  };
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      var header = clean_(value);
      Object.keys(aliases).forEach(function(key) {
        if (aliases[key].indexOf(header) >= 0) columns[key] = index;
      });
    });
    if (columns.project != null && columns.title != null && columns.targetTo != null && columns.reason != null) {
      var approvalLinks = [];
      if (columns.approvalUrl != null && values.length > r + 1) {
        // 사본의 링크 열만 읽습니다. 원본 접근이나 시트 수정은 하지 않습니다.
        var linkRange = sheet.getRange(r + 2, columns.approvalUrl + 1, values.length - r - 1, 1);
        var richLinks = linkRange.getRichTextValues();
        var linkFormulas = linkRange.getFormulas();
        for (var l = 0; l < richLinks.length; l++) {
          approvalLinks[r + 1 + l] = dashboardApprovalLink_(
            values[r + 1 + l][columns.approvalUrl], richLinks[l][0], linkFormulas[l][0]
          );
        }
      }
      return { values: values, headerRow: r + 1, columns: columns, approvalLinks: approvalLinks };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 프로젝트, 공고명, 채용인원, 채용사유 헤더를 찾지 못했습니다.');
}

function table_(sheet, required) {
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var rawValues = range.getValues();
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      if (clean_(value)) columns[clean_(value)] = index;
    });
    if (required.every(function(name) { return columns[name] != null; })) {
      return { values: values, rawValues: rawValues, headerRow: r + 1, columns: columns };
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

function firstColumn_(columns, names) {
  for (var i = 0; i < names.length; i++) {
    if (columns[names[i]] != null) return columns[names[i]];
  }
  return null;
}

function dateValue_(rawRow, displayRow, column, timezone) {
  if (column == null) return '';
  return dashboardDate_(rawRow[column], displayRow[column], timezone);
}

// 실제 날짜 값, 수식의 숫자/문자열 결과를 yyyy-MM-dd로 통일합니다.
// getValues()의 실제 값이 우선이며 시트에는 아무 값도 쓰지 않습니다.
function dashboardDate_(raw, display, timezone) {
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, timezone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var parsed = dashboardDateText_(raw);
  // null은 미지원 형식, 빈 문자열은 형식은 맞지만 존재하지 않는 날짜입니다.
  if (parsed !== null) return parsed;
  parsed = dashboardDateText_(display);
  if (parsed !== null) return parsed;

  // 날짜 서식을 적용하지 않은 DATE 수식 결과(시트 일련번호)도 지원합니다.
  // 2000~2099년 범위의 숫자만 허용하여 연도나 짧은 숫자의 오인을 막습니다.
  if (typeof raw === 'number' && isFinite(raw) && raw >= 36526 && raw < 73051) {
    var serialDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return dashboardDateParts_(serialDate.getUTCFullYear(), serialDate.getUTCMonth() + 1, serialDate.getUTCDate());
  }
  return '';
}

function dashboardDateText_(value) {
  var text = clean_(value);
  if (!text) return null;
  text = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/^'/, '').trim();
  text = text.replace(/[\u2010-\u2015\u2212]/g, '-');

  // 20261013 / 숫자 20261013 / 20261013 14:30
  var match = text.match(/^(\d{4})(\d{2})(\d{2})(?=$|[T\s(])/);
  if (match) return dashboardDateParts_(match[1], match[2], match[3]);

  // 2026-10-13 / 2026. 10. 13. / 2026/10/13 / 2026년 10월 13일
  // 날짜 뒤의 시각·요일·입사 예정 메모는 날짜를 변경하지 않습니다.
  match = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?=$|[^\d])/);
  if (match) return dashboardDateParts_(match[1], match[2], match[3]);
  return null;
}

function dashboardDateParts_(year, month, day) {
  year = Number(year);
  month = Number(month);
  day = Number(day);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  var check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return '';
  return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

// 공고명 맨 앞의 [프로젝트명] 한 개만 제외하여 같은 공고로 연결합니다.
// 프로젝트는 별도의 PJ/프로젝트 열을 그대로 사용하며 시트 값은 수정하지 않습니다.
// 계약직·경력 조건과 제목 중간/끝의 대괄호는 보존합니다.
function dashboardOpeningTitle_(value) {
  return clean_(value).replace(/^\[[^\[\]\r\n]+\]\s*/, '').trim();
}

// URL 원문, 텍스트에 삽입한 링크, HYPERLINK("URL", "표시명")을 지원합니다.
// 여러 다른 링크가 든 셀은 임의의 신청서를 선택하지 않습니다.
function dashboardApprovalLink_(display, richText, formula) {
  if (richText) {
    var direct = richText.getLinkUrl();
    if (direct) return dashboardWebUrl_(direct);
    var links = richText.getRuns().map(function(run) { return run.getLinkUrl(); })
      .filter(function(url, index, all) { return url && all.indexOf(url) === index; });
    if (links.length > 1) return '';
    if (links.length === 1) return dashboardWebUrl_(links[0]);
  }
  var hyperlink = clean_(formula).match(/^=\s*HYPERLINK\s*\(\s*"((?:[^"]|"")*)"\s*[,;)]/i);
  if (hyperlink) return dashboardWebUrl_(hyperlink[1].replace(/""/g, '"'));
  return dashboardWebUrl_(display);
}

function dashboardWebUrl_(value) {
  var url = clean_(value);
  return /^https?:\/\/[^\s\\<>"'/?#]+(?:[/?#][^\s\\<>"']*)?$/i.test(url) ? url : '';
}

function clean_(value) {
  return value == null ? '' : String(value).trim();
}

function number_(value) {
  var match = clean_(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function key_(project, title) {
  return clean_(project).replace(/\s+/g, ' ').toLowerCase() + '\u001f' + clean_(title).replace(/\s+/g, ' ').toLowerCase();
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
