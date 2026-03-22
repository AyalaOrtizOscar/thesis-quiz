// ============================================================
// THESIS QUIZ — Cloud Sync Backend
// Google Apps Script — almacena progreso en Google Sheets
//
// SETUP:
//   1. Ve a https://script.google.com y crea un proyecto nuevo
//   2. Pega este codigo completo
//   3. Ejecuta setupSheet() UNA sola vez (menu Ejecutar)
//   4. Despliega como web app:
//      - Publicar > Implementar como aplicacion web
//      - Ejecutar como: tu cuenta
//      - Acceso: "Cualquier persona" (los datos se protegen con PIN)
//   5. Copia la URL del despliegue y pegala en app.js (SYNC_URL)
//   6. Cada vez que modifiques, haz "Nueva implementacion"
//
// DATOS: se guardan en una hoja de calculo "ThesisQuiz_Data"
// ============================================================

var SHEET_NAME = "ThesisQuiz_Data";
var PIN = "1234";  // Cambia esto por tu PIN personal

// ── Setup ─────────────────────────────────────────────────────
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create("ThesisQuiz_Data");
    Logger.log("Spreadsheet creado: " + ss.getUrl());
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange("A1:E1").setValues([["pin", "user_state", "card_states", "last_sync", "backup"]]);
    sheet.getRange("A2").setValue(PIN);
    sheet.getRange("B2").setValue("{}");
    sheet.getRange("C2").setValue("{}");
    sheet.getRange("D2").setValue(new Date().toISOString());
    Logger.log("Hoja configurada correctamente");
  }

  return "Setup completado. URL de la hoja: " + ss.getUrl();
}

// ── Web app handlers ──────────────────────────────────────────

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = e.parameter || {};
  var action = params.action || "ping";
  var pin = params.pin || "";

  // CORS headers
  var output;

  try {
    if (action === "ping") {
      output = respond({ ok: true, msg: "ThesisQuiz Sync API" });
    } else if (action === "load") {
      output = handleLoad(pin);
    } else if (action === "save") {
      var postData = JSON.parse(e.postData.contents);
      output = handleSave(pin, postData);
    } else {
      output = respond({ ok: false, error: "Unknown action" });
    }
  } catch (err) {
    output = respond({ ok: false, error: err.toString() });
  }

  return output;
}

function handleLoad(pin) {
  var sheet = getSheet();
  var storedPin = sheet.getRange("A2").getValue().toString();

  if (pin !== storedPin) {
    return respond({ ok: false, error: "PIN incorrecto" });
  }

  var userState = sheet.getRange("B2").getValue();
  var cardStates = sheet.getRange("C2").getValue();
  var lastSync = sheet.getRange("D2").getValue();

  return respond({
    ok: true,
    userState: JSON.parse(userState || "{}"),
    cardStates: JSON.parse(cardStates || "{}"),
    lastSync: lastSync,
  });
}

function handleSave(pin, data) {
  var sheet = getSheet();
  var storedPin = sheet.getRange("A2").getValue().toString();

  if (pin !== storedPin) {
    return respond({ ok: false, error: "PIN incorrecto" });
  }

  // Backup current data before overwriting
  var currentUser = sheet.getRange("B2").getValue();
  var currentCards = sheet.getRange("C2").getValue();
  sheet.getRange("E2").setValue(JSON.stringify({
    userState: currentUser,
    cardStates: currentCards,
    backedUp: new Date().toISOString()
  }));

  // Save new data
  sheet.getRange("B2").setValue(JSON.stringify(data.userState || {}));
  sheet.getRange("C2").setValue(JSON.stringify(data.cardStates || {}));
  sheet.getRange("D2").setValue(new Date().toISOString());

  return respond({ ok: true, msg: "Datos guardados", lastSync: new Date().toISOString() });
}

// ── Helpers ───────────────────────────────────────────────────

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Hoja no encontrada. Ejecuta setupSheet() primero.");
  }
  return sheet;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
