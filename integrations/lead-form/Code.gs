// Site lead form → the bound Sheet, plus an email to the club. Setup: docs/lead-form-setup.ru.md
// Script Properties: NOTIFY_EMAIL (who gets each lead), DIGEST_EMAIL (optional, defaults to NOTIFY_EMAIL).
var SHEET = 'Leads';
var HEADERS = ['time', 'lang', 'hall', 'hall_name', 'name', 'phone', 'who', 'age', 'message', 'status', 'reminded'];
var STATUS = HEADERS.indexOf('status'), REMINDED = HEADERS.indexOf('reminded');
// same rule as the site: Israeli mobile, landline or 07x number
var PHONE = /^(?:\+?9720?|0)(?:[57]\d{8}|[2-489]\d{7})$/;
var WHO = { child: 'ребёнок', adult: 'взрослый' };

function doPost(e) {
  var p = (e && e.parameter) || {};
  // honeypot: bots get the same answer as people, and nothing is stored
  if (p.website) return reply_('ok');
  var lead = clean_(p);
  if (!lead) return reply_('bad request');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date()].concat(HEADERS.slice(1, STATUS).map(function (k) { return cell_(lead[k]); }), 'new', ''));
  } finally {
    lock.releaseLock();
  }
  notify_(lead);
  return reply_('ok');
}

function clean_(p) {
  var s = function (k, max) { return String(p[k] || '').trim().slice(0, max); };
  var lead = {
    lang: s('lang', 2), hall: s('hall', 40), hall_name: s('hall_name', 80), name: s('name', 80),
    phone: s('phone', 20).replace(/[\s().-]/g, ''), who: s('who', 5), age: s('age', 3), message: s('message', 1000),
  };
  var ok = ['he', 'ru', 'en'].indexOf(lead.lang) >= 0 && /^[a-z-]*$/.test(lead.hall) && lead.name && PHONE.test(lead.phone) &&
    WHO[lead.who] && /^\d{1,2}$/.test(lead.age) && p.consent === 'yes';
  return ok ? lead : null;
}

// = + - @ would run as a formula, and a leading 0 would be dropped as a number
function cell_(v) {
  return /^[=+\-@]|^0\d/.test(v) ? "'" + v : v;
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function waLink_(phone) {
  return 'https://wa.me/972' + phone.replace(/^\+?9720?|^0/, '');
}

function summary_(l) {
  return [l.name + ', ' + l.phone, WHO[l.who] + ', ' + l.age, 'Зал: ' + (l.hall_name || 'не выбран'), l.message, 'WhatsApp: ' + waLink_(l.phone)]
    .filter(Boolean).join('\n');
}

function notify_(lead) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return console.warn('NOTIFY_EMAIL is not set; the lead is only in the sheet');
  MailApp.sendEmail({ to: to, subject: 'Заявка с сайта: ' + lead.name + (lead.hall_name ? ', ' + lead.hall_name : ''), body: summary_(lead) });
}

// Mails the open leads picked by pick(row, now) and stamps "reminded" so remind() skips them.
function mailOpen_(to, subject, pick) {
  var now = new Date(), sh = sheet_(), rows = sh.getDataRange().getValues(), due = [];
  rows.forEach(function (r, i) { if (i && r[STATUS] === 'new' && pick(r, now)) due.push(i); });
  if (!to || !due.length) return;
  var text = due.map(function (i) {
    var l = {};
    HEADERS.forEach(function (k, j) { l[k] = String(rows[i][j]); });
    return Utilities.formatDate(rows[i][0], 'Asia/Jerusalem', 'dd.MM HH:mm') + '\n' + summary_(l);
  }).join('\n\n');
  var foot = '\n\nПосле звонка впишите в колонку status что угодно, например «позвонили», и напоминания прекратятся.\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();
  MailApp.sendEmail({ to: to, subject: subject + ' (' + due.length + ')', body: text + foot });
  due.forEach(function (i) { if (!rows[i][REMINDED]) sh.getRange(i + 1, REMINDED + 1).setValue(now); });
}

// 09:00 list of every lead still "new".
function dailyDigest() {
  var props = PropertiesService.getScriptProperties();
  mailOpen_(props.getProperty('DIGEST_EMAIL') || props.getProperty('NOTIFY_EMAIL'), 'Необработанные заявки с сайта', function () { return true; });
}

// Hourly: one reminder for a lead still "new" 3 hours on. Silent 21:00-10:00, the 09:00 digest covers the night.
function remind() {
  var hour = +Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'H');
  if (hour < 10 || hour >= 21) return;
  mailOpen_(PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL'), 'Напоминание: перезвонить', function (r, now) {
    return !r[REMINDED] && now - r[0] >= 3 * 3600 * 1000;
  });
}

// Run once from the editor: schedules the digest and the reminders.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Jerusalem').create();
  ScriptApp.newTrigger('remind').timeBased().everyHours(1).create();
}

function reply_(s) {
  return ContentService.createTextOutput(s);
}
