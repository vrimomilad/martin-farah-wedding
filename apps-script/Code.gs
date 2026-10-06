/**
 * Martin & Farah — RSVP collector.
 * Bound to the "Martin & Farah — RSVPs" Google Sheet and deployed as a web app.
 * The website POSTs each reply here; a guest who replies again with the same
 * email updates their existing row instead of adding a duplicate.
 */

const SHEET_NAME = "RSVPs";
const HEADERS = ["Submitted", "Name", "Phone", "Email", "Attending", "Dietary requirements", "Times updated"];
// Email a short note to the sheet owner on every reply. Set to false to turn off.
const NOTIFY_OWNER = true;

/** Run once from the editor to grant permissions and create the sheet. */
function setup() {
  getSheet_();
  return "Ready";
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = (e && e.parameter) || {};
    if (p.website) return json_({ ok: true }); // honeypot: bots fill hidden fields

    const data = {
      name: clean_(p.name, 120),
      phone: clean_(p.phone, 30),
      email: clean_(p.email, 160).toLowerCase(),
      attending: p.attending === "Yes" ? "Yes" : p.attending === "No" ? "No" : "",
      dietary: clean_(p.dietary, 500),
    };
    if (!data.name || !data.phone || !data.email || !data.attending) {
      return json_({ ok: false, error: "Missing required fields" });
    }

    const sheet = getSheet_();
    const row = [new Date(), data.name, data.phone, data.email, data.attending, data.dietary];

    const lastRow = sheet.getLastRow();
    let existing = -1;
    if (lastRow > 1) {
      const emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      for (let i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).toLowerCase() === data.email) { existing = i + 2; break; }
      }
    }

    let updated = false;
    if (existing > 0) {
      const times = Number(sheet.getRange(existing, 7).getValue()) || 0;
      sheet.getRange(existing, 1, 1, 7).setValues([row.concat(times + 1)]);
      updated = true;
    } else {
      sheet.appendRow(row.concat(0));
    }

    if (NOTIFY_OWNER) notify_(data, updated, sheet);
    return json_({ ok: true, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Lets you open the web app URL in a browser to check it's live. */
function doGet() {
  return json_({ ok: true, service: "Martin & Farah RSVP" });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold").setBackground("#efe3d3").setFontColor("#4a3426");
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("d mmm yyyy, h:mm am/pm");
    sheet.getRange("C:C").setNumberFormat("@");
    sheet.setColumnWidths(1, HEADERS.length, 170);
    sheet.setColumnWidth(6, 300);
  }
  return sheet;
}

function notify_(d, updated, sheet) {
  try {
    const rows = sheet.getLastRow() - 1;
    const yes = rows > 0
      ? sheet.getRange(2, 5, rows, 1).getValues().filter(function (r) { return r[0] === "Yes"; }).length
      : 0;
    const subject = (updated ? "Updated RSVP: " : "New RSVP: ") + d.name + " (" + (d.attending === "Yes" ? "attending" : "not attending") + ")";
    const body = [
      "Name: " + d.name,
      "Phone: " + d.phone,
      "Email: " + d.email,
      "Attending: " + d.attending,
      "Dietary: " + (d.dietary || "—"),
      "",
      "Total attending so far: " + yes + " of " + rows + " replies",
      SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    ].join("\n");
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, body);
  } catch (err) {
    console.warn("Notification failed: " + err);
  }
}

function clean_(v, max) {
  let s = String(v == null ? "" : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
