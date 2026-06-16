/* ============================================================
   LEGO-LAND · Excel / CSV helpers (no external libraries)
   - Excel export uses SpreadsheetML 2003 (.xls) → opens natively
     in Excel/LibreOffice/Google Sheets, supports Hebrew + RTL +
     multiple worksheets + numeric cells.
   ============================================================ */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const isNum = (v) => typeof v === 'number' && isFinite(v);

  function cell(v) {
    if (isNum(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  }
  function headCell(v) {
    return `<Cell ss:StyleID="hd"><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  }

  /* sheets: [{ name, headers:[...], rows:[[...],[...]] }] */
  function toWorkbookXML(sheets) {
    const ws = sheets.map((sh) => {
      const head = `<Row>${(sh.headers || []).map(headCell).join('')}</Row>`;
      const body = (sh.rows || []).map(r => `<Row>${r.map(cell).join('')}</Row>`).join('');
      return `<Worksheet ss:Name="${esc(sh.name).slice(0,31)}">
   <Table>${head}${body}</Table>
   <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/></WorksheetOptions>
  </Worksheet>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="hd"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0057A8" ss:Pattern="Solid"/></Style>
 </Styles>
 ${ws}
</Workbook>`;
  }

  function download(filename, content, mime) {
    const blob = new Blob(['﻿', content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportExcel(filename, sheets) {
    download(filename.replace(/\.(xlsx?|csv)$/i, '') + '.xls',
      toWorkbookXML(sheets), 'application/vnd.ms-excel');
  }

  // ---- CSV ----------------------------------------------------------
  function exportCSV(filename, headers, rows) {
    const q = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(q).join(',')].concat(rows.map(r => r.map(q).join(',')));
    download(filename.replace(/\.\w+$/, '') + '.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* Robust-enough CSV parser (handles quotes, commas, CRLF). Returns array of arrays. */
  function parseCSV(text) {
    const rows = []; let row = [], field = '', i = 0, q = false;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
      i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length && r.some(x => String(x).trim() !== ''));
  }

  /* Parse free-text/pasted inventory list.
     Accepts CSV/TSV/space with header detection. Columns by name or position:
     sku, name, barcode, price, qty  */
  function parseInventoryText(text) {
    const raw = text.trim();
    if (!raw) return [];
    // detect delimiter
    const firstLine = raw.split(/\r?\n/)[0];
    const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(',') ? ',' : /\s{2,}/.test(firstLine) ? null : ',';
    const splitLine = (l) => delim === null ? l.trim().split(/\s{2,}|\t/) : l.split(delim);

    let lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let header = null;
    const probe = splitLine(lines[0]).map(s => s.trim().toLowerCase());
    const known = ['sku', 'מק"ט', "מקט", 'name', 'שם', 'barcode', 'ברקוד', 'price', 'מחיר', 'qty', 'quantity', 'כמות'];
    if (probe.some(p => known.includes(p))) { header = probe; lines = lines.slice(1); }

    const idx = (names) => header ? header.findIndex(h => names.includes(h)) : -1;
    const iSku = idx(['sku', 'מק"ט', 'מקט']);
    const iName = idx(['name', 'שם']);
    const iBar = idx(['barcode', 'ברקוד']);
    const iPrice = idx(['price', 'מחיר']);
    const iQty = idx(['qty', 'quantity', 'כמות']);

    return lines.map((l) => {
      const c = splitLine(l).map(s => s.trim());
      if (header) {
        return {
          sku: c[iSku] || '', name: iName >= 0 ? c[iName] : '',
          barcode: iBar >= 0 ? c[iBar] : '', price: iPrice >= 0 ? +c[iPrice] || 0 : 0,
          qty: iQty >= 0 ? +c[iQty] || 0 : 0,
        };
      }
      // positional: sku, qty   OR   sku, name, barcode, price, qty
      if (c.length <= 2) return { sku: c[0], qty: +c[1] || 0 };
      return { sku: c[0], name: c[1] || '', barcode: c[2] || '', price: +c[3] || 0, qty: +c[4] || 0 };
    }).filter(r => r.sku);
  }

  global.XL = { exportExcel, exportCSV, parseCSV, parseInventoryText, download };
})(window);
