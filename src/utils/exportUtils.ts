import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Category, Expense } from '../types/expense';
import { formatDateDDMMYYYY, formatNumberIN } from './format';

function sanitizeSpreadsheetCell(value: string): string {
  const trimmed = value ?? '';
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function escapeCsvCell(value: string | number): string {
  const str = typeof value === 'number' ? String(value) : sanitizeSpreadsheetCell(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportExpensesToCSV(
  expenses: Expense[],
  categoryMap: Map<string, Category>,
  filenamePrefix: string
): void {
  const headers = ['Date (DD-MM-YYYY)', 'Category', 'Description', 'Payment Method', 'Amount (INR)', 'Notes'];
  const rows = expenses.map((exp) => [
    formatDateDDMMYYYY(exp.date),
    categoryMap.get(exp.categoryId)?.name || 'Other Expenses',
    exp.description,
    exp.paymentMethod,
    exp.amount.toFixed(2),
    exp.notes || '',
  ]);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  rows.push(['', '', 'TOTAL', '', total.toFixed(2), '']);

  const csvLines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filenamePrefix}.csv`);
}

// --- Pure TypeScript OOXML (.xlsx) Generator (Store ZIP, zero external dependencies) ---

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(colIdx: number): string {
  let letter = '';
  let n = colIdx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

type CellVal = string | number;

function buildWorksheetXml(rows: CellVal[][], boldRowIndices: Set<number>): string {
  const rowXml = rows
    .map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const isBold = boldRowIndices.has(rIdx);
      const cellsXml = cells
        .map((val, cIdx) => {
          const ref = `${columnLetter(cIdx)}${rowNum}`;
          if (typeof val === 'number' && Number.isFinite(val)) {
            const styleAttr = isBold ? ' s="2"' : ' s="3"';
            return `<c r="${ref}"${styleAttr}><v>${val}</v></c>`;
          }
          const safeText = sanitizeSpreadsheetCell(String(val ?? ''));
          const styleAttr = isBold ? ' s="1"' : '';
          return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${escapeXml(safeText)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="36" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="32" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // Store (no compression)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => new Uint8Array(u)),
    ...centralParts.map((u) => new Uint8Array(u)),
    new Uint8Array(endRecord),
  ];

  return new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function exportExpensesToExcel(
  expenses: Expense[],
  categoryMap: Map<string, Category>,
  reportTitle: string,
  filenamePrefix: string
): void {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Sheet 1: Transactions
  const txRows: CellVal[][] = [
    ['My Expense Manager Pro — Expense Ledger'],
    [`Period: ${reportTitle}`, '', `Generated: ${formatDateDDMMYYYY(new Date().toISOString().slice(0, 10))}`],
    [],
    ['Date (DD-MM-YYYY)', 'Category', 'Description', 'Payment Method', 'Amount (INR)', 'Notes'],
  ];

  for (const exp of expenses) {
    txRows.push([
      formatDateDDMMYYYY(exp.date),
      categoryMap.get(exp.categoryId)?.name || 'Other Expenses',
      exp.description,
      exp.paymentMethod,
      Number(exp.amount.toFixed(2)),
      exp.notes || '',
    ]);
  }
  txRows.push(['', '', 'TOTAL EXPENSES', '', Number(total.toFixed(2)), `${expenses.length} transactions`]);

  const txBold = new Set<number>([0, 3, txRows.length - 1]);
  const sheet1Xml = buildWorksheetXml(txRows, txBold);

  // Sheet 2: Category Summary
  const byCategory = new Map<string, { name: string; count: number; total: number }>();
  for (const exp of expenses) {
    const catName = categoryMap.get(exp.categoryId)?.name || 'Other Expenses';
    const curr = byCategory.get(exp.categoryId) || { name: catName, count: 0, total: 0 };
    curr.count += 1;
    curr.total += exp.amount;
    byCategory.set(exp.categoryId, curr);
  }
  const sortedCats = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
  const catRows: CellVal[][] = [
    ['Category-Wise Summary', `Period: ${reportTitle}`],
    [],
    ['Category', 'Transactions', 'Total Spent (INR)', 'Share (%)'],
    ...sortedCats.map((c) => [
      c.name,
      c.count,
      Number(c.total.toFixed(2)),
      total > 0 ? Number(((c.total / total) * 100).toFixed(1)) : 0,
    ]),
    ['TOTAL', expenses.length, Number(total.toFixed(2)), total > 0 ? 100 : 0],
  ];
  const catBold = new Set<number>([0, 2, catRows.length - 1]);
  const sheet2Xml = buildWorksheetXml(catRows, catBold);

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Transactions" sheetId="1" r:id="rId1"/>
    <sheet name="Category Summary" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1Xml },
    { name: 'xl/worksheets/sheet2.xml', content: sheet2Xml },
  ];

  const xlsxBlob = createZipBlob(files);
  triggerDownload(xlsxBlob, `${filenamePrefix}.xlsx`);
}

export function exportExpensesToPDF(
  expenses: Expense[],
  categoryMap: Map<string, Category>,
  reportTitle: string,
  userName: string,
  filenamePrefix: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const generatedDate = formatDateDDMMYYYY(new Date().toISOString().slice(0, 10));

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('My Expense Manager Pro', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Expense Report: ${reportTitle}`, 14, 25);
  doc.text(`Account: ${userName}  |  Generated: ${generatedDate}`, 14, 30);

  doc.setDrawColor(203, 213, 225);
  doc.line(14, 34, 196, 34);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Expenses: INR ${formatNumberIN(total)}`, 14, 41);
  doc.text(`Transactions: ${expenses.length}`, 120, 41);

  // Category Breakdown
  const byCategory = new Map<string, { name: string; count: number; total: number }>();
  for (const exp of expenses) {
    const catName = categoryMap.get(exp.categoryId)?.name || 'Other Expenses';
    const curr = byCategory.get(exp.categoryId) || { name: catName, count: 0, total: 0 };
    curr.count += 1;
    curr.total += exp.amount;
    byCategory.set(exp.categoryId, curr);
  }
  const sortedCats = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);

  autoTable(doc, {
    startY: 47,
    head: [['Category', 'Transactions', 'Total (INR)', 'Share']],
    body: sortedCats.map((c) => [
      c.name,
      String(c.count),
      `INR ${formatNumberIN(c.total)}`,
      total > 0 ? `${((c.total / total) * 100).toFixed(1)}%` : '0.0%',
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  const lastTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;

  autoTable(doc, {
    startY: lastTableY + 8,
    head: [['Date', 'Category', 'Description', 'Method', 'Amount (INR)']],
    body: expenses.map((exp) => [
      formatDateDDMMYYYY(exp.date),
      categoryMap.get(exp.categoryId)?.name || 'Other Expenses',
      exp.description + (exp.notes ? ` (${exp.notes})` : ''),
      exp.paymentMethod,
      `INR ${formatNumberIN(exp.amount)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 24 },
      3: { cellWidth: 18 },
      4: { halign: 'right', cellWidth: 32 },
    },
  });

  doc.save(`${filenamePrefix}.pdf`);
}
