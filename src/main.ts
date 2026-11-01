import './style.css';
import Sortable from 'sortablejs';
import { i18n } from './i18n/i18n';
import type {
  SplitOutputFile,
  PageNumberPosition,
  PageNumberFormat
} from './core/pdfActions';
import { compressPdf, convertToPdfA } from './core/gsClient';
import type { CompressionQuality, PdfAConformance } from './workers/gsWorker';

export type ActiveTool =
  | 'merge'
  | 'split'
  | 'organize'
  | 'number'
  | 'watermark'
  | 'sanitize'
  | 'pdf2img'
  | 'compress'
  | 'pdfa';

export interface LoadedPdfFile {
  id: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
}

const state = {
  activeTool: 'merge' as ActiveTool,
  files: [] as LoadedPdfFile[]
};

const toolOptionsEl = document.getElementById('tool-options')!;
const processBtn = document.getElementById('process-btn') as HTMLButtonElement;
const chainBtn = document.getElementById('chain-btn') as HTMLButtonElement;
const chainToast = document.getElementById('chain-toast')!;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================================
// 1. RENDERING DINAMICO DEL PANNELLO OPZIONI (#tool-options)
// ============================================================================

function renderToolOptions(): void {
  // Nasconde il pulsante "Applica in RAM" solo su PDF->Immagini (che produce PNG/JPG e non un PDF)
  if (state.activeTool === 'pdf2img') {
    chainBtn.classList.add('hidden');
  } else {
    chainBtn.classList.remove('hidden');
  }

  switch (state.activeTool) {
    case 'merge':
      toolOptionsEl.innerHTML = `<p class="text-sm text-slate-400" data-i18n="mergeHint"></p>`;
      break;

    case 'split':
      toolOptionsEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div class="flex flex-col gap-1.5">
            <label for="split-mode" class="text-xs font-semibold text-slate-300" data-i18n="splitModeLabel"></label>
            <select id="split-mode" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="single" data-i18n="splitModeSingle"></option>
              <option value="zip" data-i18n="splitModeZip"></option>
              <option value="folder" data-i18n="splitModeFolder"></option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="split-range" class="text-xs font-semibold text-slate-300" data-i18n="splitRangeLabel"></label>
            <input
              id="split-range"
              type="text"
              value="all"
              placeholder="all, 1-3, 5, 8-10"
              class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <span class="text-[11px] text-slate-400" data-i18n="splitAllPagesHint"></span>
          </div>
        </div>
      `;
      const splitModeSelect = document.getElementById('split-mode') as HTMLSelectElement | null;
      splitModeSelect?.addEventListener('change', () => {
        if (splitModeSelect.value === 'single') {
          chainBtn.classList.remove('hidden');
        } else {
          chainBtn.classList.add('hidden');
        }
      });
      break;

    case 'organize':
      toolOptionsEl.innerHTML = `
        <div class="flex flex-col gap-4">
          <div id="organize-toolbar" class="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-800">
            <button type="button" id="btn-rotate-all-right" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer" data-i18n="orgRotateAllRight"></button>
            <button type="button" id="btn-rotate-all-left" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer" data-i18n="orgRotateAllLeft"></button>
            <button type="button" id="btn-reverse-order" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer" data-i18n="orgReverseOrder"></button>
            <button type="button" id="btn-reset-organize" class="ml-auto px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-xs font-medium text-slate-400 hover:text-rose-300 border border-slate-800 transition cursor-pointer" data-i18n="orgResetAll"></button>
          </div>
          <div id="organize-grid" class="min-h-32 flex items-center justify-center text-sm text-slate-400">
            <span data-i18n="organizeHint"></span>
          </div>
        </div>
      `;
      if (state.files.length > 0) {
          const gridEl = document.getElementById('organize-grid')!;
          import('./core/pageOrganizer').then(({ renderOrganizerGrid, rotateAllPages, reversePagesOrder }) => {
          renderOrganizerGrid(state.files[0].buffer, gridEl);
          document.getElementById('btn-rotate-all-right')?.addEventListener('click', () => rotateAllPages(gridEl, 90));
          document.getElementById('btn-rotate-all-left')?.addEventListener('click', () => rotateAllPages(gridEl, -90));
          document.getElementById('btn-reverse-order')?.addEventListener('click', () => reversePagesOrder(gridEl));
          document.getElementById('btn-reset-organize')?.addEventListener('click', () => renderOrganizerGrid(state.files[0].buffer, gridEl));
        });
      }
      break;

    case 'number':
      toolOptionsEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="num-position" class="text-xs font-semibold text-slate-300" data-i18n="numPositionLabel"></label>
            <select id="num-position" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="bottom-right" data-i18n="posBottomRight"></option>
              <option value="bottom-center" data-i18n="posBottomCenter"></option>
              <option value="bottom-left" data-i18n="posBottomLeft"></option>
              <option value="top-right" data-i18n="posTopRight"></option>
              <option value="top-center" data-i18n="posTopCenter"></option>
              <option value="top-left" data-i18n="posTopLeft"></option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="num-format" class="text-xs font-semibold text-slate-300" data-i18n="numFormatLabel"></label>
            <select id="num-format" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="page-n-of-total" data-i18n="fmtFull"></option>
              <option value="n-of-total" data-i18n="fmtSlash"></option>
              <option value="n" data-i18n="fmtSimple"></option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="num-start" class="text-xs font-semibold text-slate-300" data-i18n="numStartLabel"></label>
            <input id="num-start" type="number" min="1" value="1" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
      `;
      break;

    case 'watermark':
      toolOptionsEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="wm-text" class="text-xs font-semibold text-slate-300" data-i18n="wmTextLabel"></label>
            <input id="wm-text" type="text" value="CONFIDENTIAL" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="wm-opacity" class="text-xs font-semibold text-slate-300" data-i18n="wmOpacityLabel"></label>
            <input id="wm-opacity" type="number" step="0.05" min="0.05" max="0.8" value="0.2" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="wm-size" class="text-xs font-semibold text-slate-300" data-i18n="wmSizeLabel"></label>
            <input id="wm-size" type="number" min="16" max="120" value="48" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
      `;
      break;

    case 'sanitize':
      toolOptionsEl.innerHTML = `<p class="text-sm text-slate-400" data-i18n="sanitizeHint"></p>`;
      break;

    case 'pdf2img':
      toolOptionsEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div class="flex flex-col gap-1.5">
            <label for="img-format" class="text-xs font-semibold text-slate-300" data-i18n="imgFormatLabel"></label>
            <select id="img-format" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="png">PNG (Lossless)</option>
              <option value="jpeg">JPEG (Compact)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="img-scale" class="text-xs font-semibold text-slate-300" data-i18n="imgScaleLabel"></label>
            <select id="img-scale" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="2" data-i18n="imgScaleStd"></option>
              <option value="3.5" data-i18n="imgScaleHigh"></option>
            </select>
          </div>
        </div>
      `;
      break;

    case 'compress':
      toolOptionsEl.innerHTML = `
        <div class="flex flex-col gap-3 max-w-md">
          <div class="flex flex-col gap-1.5">
            <label for="compress-level" class="text-xs font-semibold text-slate-300" data-i18n="compressLevelLabel"></label>
            <select id="compress-level" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="/ebook" data-i18n="compEbook"></option>
              <option value="/screen" data-i18n="compScreen"></option>
              <option value="/printer" data-i18n="compPrinter"></option>
            </select>
          </div>
          <div id="compression-result" class="hidden"></div>
        </div>
      `;
      break;

    case 'pdfa':
      toolOptionsEl.innerHTML = `
        <div class="flex flex-col gap-1.5 max-w-md">
          <label for="pdfa-standard" class="text-xs font-semibold text-slate-300" data-i18n="pdfaStandardLabel"></label>
          <select id="pdfa-standard" class="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="2" data-i18n="pdfa2b"></option>
            <option value="3" data-i18n="pdfa3b"></option>
            <option value="1" data-i18n="pdfa1b"></option>
          </select>
        </div>
      `;
      break;
  }

  i18n.updateDOM();
}

// ============================================================================
// 2. GESTIONE LINGUA, SIDEBAR & MODALE PRIVACY/LICENZA
// ============================================================================

const langToggleBtn = document.getElementById('lang-toggle')!;
function refreshLangUI() {
  i18n.updateDOM();
  langToggleBtn.textContent = i18n.getLang() === 'it' ? '🇮🇹 IT' : '🇬🇧 EN';
}
langToggleBtn.addEventListener('click', () => {
  i18n.toggleLang();
  refreshLangUI();
});

const aboutModal = document.getElementById('about-modal')!;
document.getElementById('about-btn')?.addEventListener('click', () => {
  aboutModal.classList.remove('hidden');
  aboutModal.classList.add('flex');
});
document.getElementById('close-about-modal')?.addEventListener('click', () => {
  aboutModal.classList.add('hidden');
  aboutModal.classList.remove('flex');
});
aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) {
    aboutModal.classList.add('hidden');
    aboutModal.classList.remove('flex');
  }
});

const toolButtons = document.querySelectorAll<HTMLButtonElement>('.tool-btn');
toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    toolButtons.forEach((b) => {
      b.classList.remove('bg-indigo-600', 'text-white');
      b.classList.add('text-slate-300');
    });
    btn.classList.add('bg-indigo-600', 'text-white');
    btn.classList.remove('text-slate-300');

    state.activeTool = btn.dataset.tool as ActiveTool;
    renderToolOptions();
  });
});

renderToolOptions();
refreshLangUI();

// ============================================================================
// 3. CARICAMENTO FILE E CODA RIORDINABILE
// ============================================================================

const dropzone = document.getElementById('dropzone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const workspaceArea = document.getElementById('workspace-area')!;
const fileListEl = document.getElementById('file-list')!;

let fileListSortable: Sortable | null = null;

async function handleFiles(fileList: FileList | File[]) {
  for (const file of Array.from(fileList)) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue;
    const buffer = await file.arrayBuffer();
    state.files.push({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      buffer
    });
  }
  renderFileList();
  if (state.activeTool === 'organize') {
    renderToolOptions();
  }
}

function renderFileList(): void {
  if (fileListSortable) {
    fileListSortable.destroy();
    fileListSortable = null;
  }

  if (state.files.length === 0) {
    workspaceArea.classList.add('hidden');
    workspaceArea.classList.remove('flex');
    return;
  }

  workspaceArea.classList.remove('hidden');
  workspaceArea.classList.add('flex');

  fileListEl.innerHTML = state.files
    .map(
      (f, idx) => `
      <li
        data-id="${f.id}"
        class="file-item px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 text-sm select-none cursor-grab active:cursor-grabbing transition"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-slate-500 font-bold text-base leading-none">⠿</span>
          <span class="w-5 h-5 rounded bg-slate-800 text-slate-400 text-xs font-semibold flex items-center justify-center shrink-0">
            ${idx + 1}
          </span>
          <span class="truncate font-medium text-slate-200">${f.name}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs text-slate-400">${formatSize(f.size)}</span>
          <button
            type="button"
            data-remove-id="${f.id}"
            class="remove-file-btn w-6 h-6 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      </li>`
    )
    .join('');

  fileListEl.querySelectorAll<HTMLButtonElement>('.remove-file-btn').forEach((btn) => {
    btn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      state.files = state.files.filter((f) => f.id !== btn.dataset.removeId);
      renderFileList();
      if (state.activeTool === 'organize') renderToolOptions();
    });
  });

  fileListSortable = Sortable.create(fileListEl, {
    animation: 150,
    ghostClass: 'opacity-40',
    filter: '.remove-file-btn',
    preventOnFilter: false,
    onEnd: () => {
      const orderedIds = Array.from(fileListEl.querySelectorAll<HTMLElement>('.file-item')).map(
        (li) => li.dataset.id!
      );
      state.files.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      renderFileList();
      if (state.activeTool === 'organize') renderToolOptions();
    }
  });
}

fileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files) handleFiles(target.files);
  fileInput.value = '';
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('border-indigo-500');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-indigo-500'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-indigo-500');
  if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
});
document.getElementById('clear-files')!.addEventListener('click', () => {
  state.files = [];
  renderFileList();
});

// ============================================================================
// 4. MOTORE DI ESECUZIONE UNIFICATO (SALVATAGGIO SU DISCO O CHAINING IN RAM)
// ============================================================================

function setProcessingState(isProcessing: boolean): void {
  processBtn.disabled = isProcessing;
  chainBtn.disabled = isProcessing;

  if (isProcessing) {
    processBtn.removeAttribute('data-i18n');
    processBtn.classList.add('opacity-75', 'cursor-wait');
    processBtn.innerHTML = `
      <span class="inline-flex items-center gap-2.5">
        <svg class="animate-spin h-4 w-4 text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>${i18n.t('processingBtn')}</span>
      </span>
    `;
  } else {
    processBtn.classList.remove('opacity-75', 'cursor-wait');
    processBtn.setAttribute('data-i18n', 'processBtn');
    processBtn.textContent = i18n.t('processBtn');
  }
}

/**
 * Esegue lo strumento corrente e restituisce il singolo PDF prodotto (bytes + nuovo nome).
 */
async function produceSinglePdfResult(): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const firstFile = state.files[0];
  const baseName = firstFile.name.replace(/\.pdf$/i, '');

  const {
    mergePdfs,
    splitPdfByRange,
    organizePdf,
    addPageNumbers,
    addWatermark,
    sanitizePdfMetadata
  } = await import('./core/pdfActions');
  const { getOrganizerModifications } = await import('./core/pageOrganizer');

  if (state.activeTool === 'merge') {
    const buffers = state.files.map((f) => f.buffer);
    return { bytes: await mergePdfs(buffers), fileName: `${baseName}_merged.pdf` };
  }

  if (state.activeTool === 'split') {
    const rangeInput = document.getElementById('split-range') as HTMLInputElement | null;
    const rangeStr = rangeInput?.value.trim() || 'all';
    const effectiveRange = rangeStr.toLowerCase() === 'all' ? '1-9999' : rangeStr;
    return { bytes: await splitPdfByRange(firstFile.buffer, effectiveRange), fileName: `${baseName}_split.pdf` };
  }

  if (state.activeTool === 'organize') {
    const gridEl = document.getElementById('organize-grid')!;
    const modifications = getOrganizerModifications(gridEl);
    return { bytes: await organizePdf(firstFile.buffer, modifications), fileName: `${baseName}_organized.pdf` };
  }

  if (state.activeTool === 'number') {
    const posEl = document.getElementById('num-position') as HTMLSelectElement;
    const fmtEl = document.getElementById('num-format') as HTMLSelectElement;
    const startEl = document.getElementById('num-start') as HTMLInputElement;
    const bytes = await addPageNumbers(firstFile.buffer, {
      position: (posEl?.value as PageNumberPosition) || 'bottom-right',
      format: (fmtEl?.value as PageNumberFormat) || 'page-n-of-total',
      startFrom: parseInt(startEl?.value || '1', 10),
      lang: i18n.getLang()
    });
    return { bytes, fileName: `${baseName}_numbered.pdf` };
  }

  if (state.activeTool === 'watermark') {
    const textEl = document.getElementById('wm-text') as HTMLInputElement;
    const opacityEl = document.getElementById('wm-opacity') as HTMLInputElement;
    const sizeEl = document.getElementById('wm-size') as HTMLInputElement;
    const bytes = await addWatermark(firstFile.buffer, {
      text: textEl?.value || 'CONFIDENTIAL',
      opacity: parseFloat(opacityEl?.value || '0.2'),
      fontSize: parseInt(sizeEl?.value || '48', 10)
    });
    return { bytes, fileName: `${baseName}_watermarked.pdf` };
  }

  if (state.activeTool === 'sanitize') {
    const bytes = await sanitizePdfMetadata(firstFile.buffer);
    return { bytes, fileName: `${baseName}_sanitized.pdf` };
  }

  if (state.activeTool === 'compress') {
    const levelEl = document.getElementById('compress-level') as HTMLSelectElement;
    const resultEl = document.getElementById('compression-result');
    const quality = (levelEl?.value as CompressionQuality) || '/ebook';
    if (resultEl) resultEl.className = 'hidden';

    const outputBytes = await compressPdf(firstFile.buffer, quality);
    const originalSize = firstFile.size;
    const newSize = outputBytes.byteLength;
    const diffBytes = originalSize - newSize;
    const savedPercent = Math.round((diffBytes / originalSize) * 100);

    if (resultEl) {
      if (diffBytes > 0) {
        resultEl.className =
          'p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2';
        resultEl.innerHTML = `
          <div>
            <span class="font-semibold" data-i18n="compSavedBadge">${i18n.t('compSavedBadge')}</span>
            <span class="font-bold text-emerald-400"> ${savedPercent}%</span>
            <span class="text-slate-400 ml-1">(-${formatSize(diffBytes)})</span>
          </div>
          <div class="font-mono text-slate-300">
            ${formatSize(originalSize)} → <span class="text-emerald-400 font-bold">${formatSize(newSize)}</span>
          </div>
        `;
      } else {
        resultEl.className =
          'p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs';
        resultEl.innerHTML = `<span data-i18n="compAlreadyOptimal">${i18n.t('compAlreadyOptimal')}</span>`;
      }
    }

    const finalBytes = diffBytes > 0 ? outputBytes : new Uint8Array(firstFile.buffer);
    return { bytes: finalBytes, fileName: `${baseName}_compressed.pdf` };
  }

  if (state.activeTool === 'pdfa') {
    const stdEl = document.getElementById('pdfa-standard') as HTMLSelectElement;
    const level = (stdEl?.value as PdfAConformance) || '2';
    const bytes = await convertToPdfA(firstFile.buffer, level);
    return { bytes, fileName: `${baseName}_PDFA-${level}b.pdf` };
  }

  return null;
}

// Pulsante 1: ⚡ Applica in RAM e Continua (Chaining multi-operazione)
chainBtn.addEventListener('click', async () => {
  if (state.files.length === 0) return;

  try {
    setProcessingState(true);
    const result = await produceSinglePdfResult();
    if (!result) return;

    const newBuffer = new Uint8Array(result.bytes).buffer;
    state.files = [
      {
        id: crypto.randomUUID(),
        name: result.fileName,
        size: newBuffer.byteLength,
        buffer: newBuffer
      }
    ];

    renderFileList();
    if (state.activeTool === 'organize') {
      renderToolOptions();
    }

    // Mostra notifica Toast di conferma per 3.5 secondi
    chainToast.classList.remove('hidden');
    chainToast.classList.add('flex');
    setTimeout(() => {
      chainToast.classList.add('hidden');
      chainToast.classList.remove('flex');
    }, 3500);
  } catch (err: any) {
    alert(err.message || 'Error processing PDF');
  } finally {
    setProcessingState(false);
  }
});

// Helper per acquisire SUBITO la destinazione di salvataggio (prima di elaborazioni lunghe)
async function acquireSaveHandle(
  suggestedName: string,
  description: string,
  mimeType: string,
  ext: string
): Promise<any | 'ABORTED' | null> {
  if ('showSaveFilePicker' in window) {
    try {
      return await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: [ext] } }]
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return 'ABORTED';
    }
  }
  return null;
}

// Pulsante 2: Elabora ed Esporta su disco (con scelta percorso immediata!)
processBtn.addEventListener('click', async () => {
  if (state.files.length === 0) return;

  try {
    const firstFile = state.files[0];
    const baseName = firstFile.name.replace(/\.pdf$/i, '');

    // Caso speciale 1: Split in modalità ZIP o Cartella
    if (state.activeTool === 'split') {
      const modeSelect = document.getElementById('split-mode') as HTMLSelectElement | null;
      const rangeInput = document.getElementById('split-range') as HTMLInputElement | null;
      const mode = modeSelect?.value || 'single';
      const rangeStr = rangeInput?.value.trim() || 'all';

      if (mode === 'zip') {
        const zipHandle = await acquireSaveHandle(`${baseName}_split.zip`, 'ZIP Archive', 'application/zip', '.zip');
        if (zipHandle === 'ABORTED') return;

        setProcessingState(true);
        const { splitPdfIntoSeparateFiles } = await import('./core/pdfActions');
        const filesToSave = await splitPdfIntoSeparateFiles(firstFile.buffer, rangeStr);
        await saveMultipleAsZip(filesToSave, `${baseName}_split.zip`, baseName, true, zipHandle);
        return;
      } else if (mode === 'folder') {
        let dirHandle: any = null;
        if ('showDirectoryPicker' in window) {
          try {
            dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
          } catch (err: any) {
            if (err.name === 'AbortError') return;
          }
        }
        setProcessingState(true);
        const { splitPdfIntoSeparateFiles } = await import('./core/pdfActions');
        const filesToSave = await splitPdfIntoSeparateFiles(firstFile.buffer, rangeStr);
        await saveMultiplePdfFiles(filesToSave, baseName, dirHandle);
        return;
      }
    }

    // Caso speciale 2: Conversione PDF in Immagini (PNG/JPEG in archivio ZIP)
    if (state.activeTool === 'pdf2img') {
      const zipHandle = await acquireSaveHandle(`${baseName}_images.zip`, 'ZIP Archive', 'application/zip', '.zip');
      if (zipHandle === 'ABORTED') return;

      setProcessingState(true);
      const fmtEl = document.getElementById('img-format') as HTMLSelectElement;
      const scaleEl = document.getElementById('img-scale') as HTMLSelectElement;
      const format = (fmtEl?.value as 'png' | 'jpeg') || 'png';
      const scale = parseFloat(scaleEl?.value || '2');

      const { convertPdfToImages } = await import('./core/pageOrganizer');
      const images = await convertPdfToImages(firstFile.buffer, format, scale);
      await saveMultipleAsZip(images, `${baseName}_images.zip`, baseName, false, zipHandle);
      return;
    }

    // Tutti gli altri strumenti (Merge, Split singolo, Organize, Number, Watermark, Sanitize, Compress, PDF/A)
    const suffixMap: Record<string, string> = {
      merge: 'merged',
      split: 'split',
      organize: 'organized',
      number: 'numbered',
      watermark: 'watermarked',
      sanitize: 'sanitized',
      compress: 'compressed',
      pdfa: `PDFA-${(document.getElementById('pdfa-standard') as HTMLSelectElement)?.value || '2'}b`
    };
    const suggestedFileName = `${baseName}_${suffixMap[state.activeTool] || 'out'}.pdf`;

    // Chiede SUBITO dove salvare il PDF (così anche se Ghostscript impiega 30 secondi non scade il permesso!)
    const pdfHandle = await acquireSaveHandle(suggestedFileName, 'PDF Document', 'application/pdf', '.pdf');
    if (pdfHandle === 'ABORTED') return;

    setProcessingState(true);
    const result = await produceSinglePdfResult();
    if (result) {
      await savePdfBytes(result.bytes, result.fileName, pdfHandle);
    }
  } catch (err: any) {
    alert(err.message || 'Error processing PDF');
  } finally {
    setProcessingState(false);
  }
});

// ============================================================================
// 5. SALVATAGGIO NATIVO WINDOWS 11 (CON HANDLE PRE-ACQUISITO)
// ============================================================================

if ('launchQueue' in window) {
  (window as any).launchQueue.setConsumer(async (launchParams: any) => {
    if (!launchParams.files?.length) return;
    const files: File[] = [];
    for (const handle of launchParams.files) {
      files.push(await handle.getFile());
    }
    await handleFiles(files);
  });
}

export async function savePdfBytes(
  bytes: Uint8Array,
  suggestedName: string,
  preAcquiredHandle?: any
): Promise<void> {
  const safeBuffer = new Uint8Array(bytes).buffer;
  const blob = new Blob([safeBuffer], { type: 'application/pdf' });

  if (preAcquiredHandle) {
    const writable = await preAcquiredHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveMultipleAsZip(
  files: SplitOutputFile[],
  suggestedZipName: string,
  baseName: string,
  appendPdfExt: boolean,
  preAcquiredHandle?: any
): Promise<void> {
  const { zipSync } = await import('fflate');
  const zipData: Record<string, Uint8Array> = {};
  for (const item of files) {
    const entryName = appendPdfExt
      ? `${baseName}_${item.suffix}.pdf`
      : `${baseName}_${item.suffix}`;
    zipData[entryName] = item.bytes;
  }

  const zippedBytes = zipSync(zipData, { level: 0 });
  const safeBuffer = new Uint8Array(zippedBytes).buffer;
  const blob = new Blob([safeBuffer], { type: 'application/zip' });

  if (preAcquiredHandle) {
    const writable = await preAcquiredHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedZipName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveMultiplePdfFiles(
  files: SplitOutputFile[],
  baseName: string,
  preAcquiredDirHandle?: any
): Promise<void> {
  if (preAcquiredDirHandle) {
    for (const item of files) {
      const fileName = `${baseName}_${item.suffix}.pdf`;
      const fileHandle = await preAcquiredDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const safeBuffer = new Uint8Array(item.bytes).buffer;
      await writable.write(new Blob([safeBuffer], { type: 'application/pdf' }));
      await writable.close();
    }
    return;
  }

  for (const item of files) {
    await savePdfBytes(item.bytes, `${baseName}_${item.suffix}.pdf`);
  }
}

// ============================================================================
// 6. SCORCIATOIE DA TASTIERA (KEYBOARD SHORTCUTS)
// ============================================================================

window.addEventListener('keydown', (e: KeyboardEvent) => {
// Intercetta F5, Ctrl+R e Ctrl+Shift+R per evitare il bypass del Service Worker (Hard Reload)
  const isReloadKey =
    e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');

  if (isReloadKey) {
    // Se siamo offline (o se l'utente ha premuto Shift per fare Hard Reload),
    // blocchiamo il bypass della cache del browser!
    if (!navigator.onLine || e.shiftKey) {
      e.preventDefault();
      // Reset pulito dello stato in RAM senza tentare connessioni di rete
      state.files = [];
      renderFileList();
      renderToolOptions();
      return;
    }
  }

  const target = e.target as HTMLElement | null;
  const isTyping =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'SELECT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable;

  // 1. Ctrl + S oppure Ctrl + Invio -> Elabora ed Esporta
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || (e.key === 'Enter' && !e.shiftKey))) {
    e.preventDefault();
    if (!processBtn.disabled && state.files.length > 0) {
      processBtn.click();
    }
    return;
  }

  // 2. Ctrl + Shift + Invio -> Applica in RAM e Continua (Chaining)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    if (!chainBtn.disabled && !chainBtn.classList.contains('hidden') && state.files.length > 0) {
      chainBtn.click();
    }
    return;
  }

  // 3. Ctrl + O -> Apri selettore file PDF
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    fileInput.click();
    return;
  }

  // 4. Alt + L -> Cambia lingua IT / EN
  if (e.altKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    langToggleBtn.click();
    return;
  }

  // Ignora le scorciatoie successive se l'utente sta digitando in un input
  if (isTyping) return;

  // 5. Alt + 1..9 -> Seleziona rapidamente gli strumenti della sidebar
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const index = parseInt(e.key, 10) - 1;
    const btn = toolButtons[index];
    if (btn) btn.click();
    return;
  }

  // 6. Tasto Canc (Delete) -> Svuota la coda dei file (solo se il modale è chiuso)
  if (e.key === 'Delete' && state.files.length > 0 && aboutModal.classList.contains('hidden')&&
    !document.getElementById('page-preview-modal')) {
    e.preventDefault();
    state.files = [];
    renderFileList();
  }

  // 7. Tasto ESC -> Chiude il modale Privacy/Licenza se aperto
  if (e.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
    aboutModal.classList.add('hidden');
    aboutModal.classList.remove('flex');
  }
});

// ============================================================================
// 7. INCOLLA FILE PDF DAGLI APPUNTI (CTRL + V)
// ============================================================================

window.addEventListener('paste', async (e: ClipboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

  const pastedFiles = e.clipboardData?.files;
  if (pastedFiles && pastedFiles.length > 0) {
    e.preventDefault();
    await handleFiles(pastedFiles);
  }
});