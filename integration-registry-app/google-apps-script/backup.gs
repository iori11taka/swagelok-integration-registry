/**
 * Google Apps Script Web App.
 * Guarda cada registro como una nueva fila (append-only desde la app) y además genera un archivo JSON por registro.
 * IMPORTANTE: protege la hoja y la carpeta para que solo administradores puedan borrar/modificar.
 */
const BACKUP_FOLDER_ID = 'PON_AQUI_EL_ID_DE_LA_CARPETA_DRIVE';
const BACKUP_SHEET_ID = 'PON_AQUI_EL_ID_DEL_GOOGLE_SHEET';
const SECRET = 'CAMBIA_ESTE_SECRETO_LARGO';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.secret !== SECRET) return json_({ ok: false, error: 'unauthorized' }, 401);
    const r = body.record || {};
    if (!r.id || !r.code) return json_({ ok: false, error: 'invalid_record' }, 400);

    const ss = SpreadsheetApp.openById(BACKUP_SHEET_ID);
    const sh = ss.getSheetByName('BACKUP') || ss.insertSheet('BACKUP');
    ensureHeader_(sh);

    // Evita duplicar el mismo UUID si Supabase reintenta el webhook.
    const last = sh.getLastRow();
    if (last > 1) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
      if (ids.includes(r.id)) return json_({ ok: true, duplicate: true }, 200);
    }

    sh.appendRow([
      r.id, r.code, r.integration_year, r.sequence_number, r.description,
      r.client, r.responsible, r.family || '', r.subfamily || '', r.subsubfamily || '',
      r.notes || '', r.created_at || new Date().toISOString(), new Date().toISOString()
    ]);

    const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    const safeCode = String(r.code).replace(/[^A-Za-z0-9_-]/g, '_');
    folder.createFile(`${safeCode}_${r.id}.json`, JSON.stringify(r, null, 2), MimeType.PLAIN_TEXT);

    return json_({ ok: true }, 200);
  } catch (err) {
    return json_({ ok: false, error: String(err) }, 500);
  }
}

function ensureHeader_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(['id','code','year','sequence','description','client','responsible','family','subfamily','subsubfamily','notes','created_at','backup_at']);
    sh.setFrozenRows(1);
  }
}

function json_(obj, status) {
  // ContentService no permite definir status code directamente; se conserva status en el cuerpo.
  obj.status = status;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
