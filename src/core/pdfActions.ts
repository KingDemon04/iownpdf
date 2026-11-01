import { PDFDocument, PDFPage, StandardFonts, rgb, degrees } from 'pdf-lib';

// ============================================================================
// TIPI E INTERFACCE
// ============================================================================

export interface PageModification {
  /** Indice originale della pagina (0-based) */
  originalIndex: number;
  /** Rotazione aggiuntiva in gradi (0, 90, 180, 270) */
  rotationDelta: number;
}

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n-of-total';

export interface PageNumberOptions {
  position: PageNumberPosition;
  format: PageNumberFormat;
  startFrom?: number;
  fontSize?: number;
  margin?: number;
  lang?: 'it' | 'en';
}

// ============================================================================
// 1. UNIONE PDF (MERGE)
// ============================================================================

export async function mergePdfs(buffers: ArrayBuffer[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of buffers) {
    const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageIndices = sourcePdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);

    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  return await mergedPdf.save();
}

// ============================================================================
// 2. DIVISIONE / ESTRAZIONE PAGINE (SPLIT)
// ============================================================================

export function parsePageRanges(rangeStr: string, maxPages: number): number[] {
  const result: number[] = [];
  const parts = rangeStr
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s: string) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        const step = start <= end ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          if (i >= 1 && i <= maxPages) {
            result.push(i - 1);
          }
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        result.push(pageNum - 1);
      }
    }
  }

  return result;
}

export async function splitPdfByRange(
  buffer: ArrayBuffer,
  rangeStr: string
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const indicesToExtract = parsePageRanges(rangeStr, totalPages);

  if (indicesToExtract.length === 0) {
    throw new Error('Range di pagine non valido o fuori dai limiti del documento.');
  }

  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(sourcePdf, indicesToExtract);

  for (const page of copiedPages) {
    newPdf.addPage(page);
  }

  return await newPdf.save();
}

export interface SplitOutputFile {
  suffix: string;
  bytes: Uint8Array;
}

/**
 * Divide un PDF in molteplici file separati.
 * - Se rangeStr è vuoto o "all", crea un file PDF per ciascuna pagina.
 * - Se rangeStr contiene blocchi separati da virgola (es. "1-3, 4-6, 7"),
 *   crea un file PDF distinto per ciascun blocco!
 */
export async function splitPdfIntoSeparateFiles(
  buffer: ArrayBuffer,
  rangeStr: string
): Promise<SplitOutputFile[]> {
  const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const cleanRange = rangeStr.trim().toLowerCase();

  const results: SplitOutputFile[] = [];

  // Caso A: Tutte le pagine in file singoli (1 pagina = 1 PDF)
  if (!cleanRange || cleanRange === 'all' || cleanRange === '*') {
    for (let i = 0; i < totalPages; i++) {
      const singlePdf = await PDFDocument.create();
      const [copiedPage] = await singlePdf.copyPages(sourcePdf, [i]);
      singlePdf.addPage(copiedPage);
      results.push({
        suffix: `p${i + 1}`,
        bytes: await singlePdf.save()
      });
    }
    return results;
  }

  // Caso B: Ogni elemento separato da virgola (es. "1-2, 3-5, 6") diventa un PDF a sé
  const blocks = rangeStr
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const indices = parsePageRanges(block, totalPages);
    if (indices.length === 0) continue;

    const blockPdf = await PDFDocument.create();
    const copiedPages = await blockPdf.copyPages(sourcePdf, indices);
    for (const page of copiedPages) {
      blockPdf.addPage(page);
    }

    const safeLabel = block.replace(/\s+/g, '');
    results.push({
      suffix: `p${safeLabel}`,
      bytes: await blockPdf.save()
    });
  }

  if (results.length === 0) {
    throw new Error('Range di pagine non valido o fuori dai limiti del documento.');
  }

  return results;
}

// ============================================================================
// 3. RIORDINO, ROTAZIONE ED ELIMINAZIONE (ORGANIZE)
// ============================================================================

export async function organizePdf(
  buffer: ArrayBuffer,
  modifications: PageModification[]
): Promise<Uint8Array> {
  if (modifications.length === 0) {
    throw new Error('Il documento finale deve contenere almeno una pagina.');
  }

  const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  const indicesToCopy = modifications.map((m: PageModification) => m.originalIndex);
  const copiedPages = await newPdf.copyPages(sourcePdf, indicesToCopy);

  copiedPages.forEach((page: PDFPage, idx: number) => {
    const delta = modifications[idx].rotationDelta || 0;
    if (delta !== 0) {
      const currentRotation = page.getRotation().angle;
      const newRotation = (currentRotation + delta + 360) % 360;
      page.setRotation(degrees(newRotation));
    }
    newPdf.addPage(page);
  });

  return await newPdf.save();
}

// ============================================================================
// 4. NUMERAZIONE PAGINE (PAGE NUMBERS)
// ============================================================================

export async function addPageNumbers(
  buffer: ArrayBuffer,
  options: PageNumberOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  const fontSize = options.fontSize ?? 10;
  const margin = options.margin ?? 28;
  const startFrom = options.startFrom ?? 1;
  const lang = options.lang ?? 'it';

  pages.forEach((page: PDFPage, idx: number) => {
    const currentNum = startFrom + idx;
    const totalAdjusted = startFrom - 1 + totalPages;

    let text = `${currentNum}`;
    if (options.format === 'n-of-total') {
      text = `${currentNum} / ${totalAdjusted}`;
    } else if (options.format === 'page-n-of-total') {
      text =
        lang === 'it'
          ? `Pagina ${currentNum} di ${totalAdjusted}`
          : `Page ${currentNum} of ${totalAdjusted}`;
    }

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const { width, height } = page.getSize();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;

    // 1. Dimensioni visive effettive (scambia W e H se ruotata di 90° o 270°)
    const visualW = rot === 90 || rot === 270 ? height : width;
    const visualH = rot === 90 || rot === 270 ? width : height;

    // 2. Calcola coordinate (vx, vy) nello spazio visivo dell'utente
    let vx = (visualW - textWidth) / 2;
    if (options.position.endsWith('left')) vx = margin;
    else if (options.position.endsWith('right')) vx = visualW - textWidth - margin;

    let vy = margin;
    if (options.position.startsWith('top')) vy = visualH - margin - fontSize;

    // 3. Rimappa (vx, vy) nelle coordinate fisiche del PDF in base alla rotazione
    let pdfX = vx;
    let pdfY = vy;
    if (rot === 90) {
      pdfX = width - vy;
      pdfY = vx;
    } else if (rot === 180) {
      pdfX = width - vx;
      pdfY = height - vy;
    } else if (rot === 270) {
      pdfX = vy;
      pdfY = height - vx;
    }

    page.drawText(text, {
      x: pdfX,
      y: pdfY,
      size: fontSize,
      font,
      rotate: degrees(rot), // Ruota anche il testo così rimane dritto!
      color: rgb(0.25, 0.25, 0.25)
    });
  });

  return await pdfDoc.save();
}

// ============================================================================
// 5. FILIGRANA DIAGONALE (WATERMARK) - CON SUPPORTO PAGINE RUOTATE
// ============================================================================

export interface WatermarkOptions {
  text: string;
  opacity?: number;
  fontSize?: number;
}

export async function addWatermark(
  buffer: ArrayBuffer,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const text = options.text.trim() || 'CONFIDENTIAL';
  const opacity = Math.min(Math.max(options.opacity ?? 0.2, 0.05), 0.9);
  const fontSize = options.fontSize ?? 48;

  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  pages.forEach((page: PDFPage) => {
    const { width, height } = page.getSize();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    // 1. Dimensioni visive della pagina
    const visualW = rot === 90 || rot === 270 ? height : width;
    const visualH = rot === 90 || rot === 270 ? width : height;

    // 2. Calcola il punto di partenza (vx, vy) nello spazio visivo per centrare il testo a 45°
    const angleRad = (45 * Math.PI) / 180;
    const vx = visualW / 2 - (textWidth / 2) * Math.cos(angleRad);
    const vy = visualH / 2 - (textWidth / 2) * Math.sin(angleRad);

    // 3. Rimappa (vx, vy) nelle coordinate fisiche del PDF
    let pdfX = vx;
    let pdfY = vy;
    if (rot === 90) {
      pdfX = width - vy;
      pdfY = vx;
    } else if (rot === 180) {
      pdfX = width - vx;
      pdfY = height - vy;
    } else if (rot === 270) {
      pdfX = vy;
      pdfY = height - vx;
    }

    page.drawText(text, {
      x: pdfX,
      y: pdfY,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
      // Somma la rotazione della pagina ai 45° della filigrana
      rotate: degrees((rot + 45) % 360)
    });
  });

  return await pdfDoc.save();
}

// ============================================================================
// 6. PULIZIA METADATI E PRIVACY (SANITIZE PDF)
// ============================================================================

export async function sanitizePdfMetadata(buffer: ArrayBuffer): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  // Azzera tutti i campi del dizionario Info standard
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');

  const epoch = new Date(0);
  pdfDoc.setCreationDate(epoch);
  pdfDoc.setModificationDate(epoch);

  // Rimuove eventuale stream XML/XMP dal catalogo radice del PDF
  try {
    const catalog = pdfDoc.catalog;
    catalog.delete(pdfDoc.context.obj('Metadata'));
  } catch {
    // Nessun catalogo XMP presente
  }

  return await pdfDoc.save();
}