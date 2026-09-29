var APPLICANT_SHEET_NAME = '지원자_추이';
var APPLICANT_HEADERS = ['지원일시', '지원경로', '프로젝트', '공고명', 'Gmail Message ID'];
var APPLICANT_LABELS = ['게임잡', '그리팅'];

// 최초 한 번 실행합니다. 지원자_추이 탭과 10분 간격 Gmail 수집 트리거를 준비합니다.
function setupApplicantMailSync() {
  applicantSheet_();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncApplicantMails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncApplicantMails').timeBased().everyMinutes(10).create();
  syncApplicantMails();
}

// 최근 라벨 메일을 읽어 아직 기록되지 않은 지원 건만 추가합니다.
function syncApplicantMails() {
  collectApplicantMails_(100);
}

// 과거 메일까지 처음 가져올 때 한 번 실행합니다.
function backfillApplicantMails() {
  collectApplicantMails_(500);
}

function collectApplicantMails_(limitPerLabel) {
  var sheet = applicantSheet_();
  var known = registeredMessageIds_(sheet);
  var rows = [];

  APPLICANT_LABELS.forEach(function(labelName) {
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) return;
    var threads = label.getThreads(0, limitPerLabel);
    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        var id = message.getId();
        if (known[id]) return;
        var parsed = parseApplicantMail_(labelName, message.getSubject(), message.getPlainBody());
        if (!parsed.title) return;
        rows.push([message.getDate(), labelName, parsed.project, parsed.title, id]);
        known[id] = true;
      });
    });
  });

  rows.sort(function(a, b) { return a[0].getTime() - b[0].getTime(); });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, APPLICANT_HEADERS.length).setValues(rows);
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
}

function applicantSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(APPLICANT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(APPLICANT_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, APPLICANT_HEADERS.length).setValues([APPLICANT_HEADERS]);
  return sheet;
}

function registeredMessageIds_(sheet) {
  var result = {};
  if (sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(row) {
    if (row[0]) result[row[0]] = true;
  });
  return result;
}

function parseApplicantMail_(source, subject, plainBody) {
  var text = normalizeApplicantMailText_((subject || '') + '\n' + (plainBody || ''));
  var title = '';

  if (source === '그리팅') {
    var greeting = text.match(/님이\s+(.+?)\s+공고에\s+신규\s+지원/);
    if (greeting) title = greeting[1];
  } else {
    var gamejob = text.match(/채용공고\s*제목\s*[:：]?\s*(.+?)(?:\s{2,}|\n|지원분야|지원자\s*현황)/);
    if (gamejob) title = gamejob[1];
  }

  if (!title) {
    var bracketed = text.match(/(\[[^\]]+\]\s*[^\n]+?(?:모집|엔지니어|기획자|아티스트)[^\n]*)/);
    if (bracketed) title = bracketed[1];
  }

  title = String(title || '').replace(/\s+/g, ' ').trim();
  return { project: projectFromApplicantTitle_(title), title: title };
}

function projectFromApplicantTitle_(title) {
  var match = String(title || '').match(/\[(?:Project\s*)?([^\]]+)\]/i);
  var project = match ? match[1].trim() : '';
  var normalized = project.toLowerCase().replace(/\s+/g, '');
  if (normalized === 'octopus' || normalized === 'otps') return 'OTPS';
  if (normalized === 'artdivision' || normalized === 'art실') return 'Art실';
  if (normalized === 'server' || normalized === 'server실') return 'Server실';
  return project;
}

function normalizeApplicantMailText_(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
}
