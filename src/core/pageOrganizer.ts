import * as pdfjsLib from 'pdfjs-dist';
import Sortable from 'sortablejs';
import { PageModification } from './pdfActions';
import { SplitOutputFile } from './pdfActions';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

let sortableInstance: Sortable | null = null;

/**
 * Apre un modale a schermo intero renderizzando la pagina ad alta risoluzione (scala 1.5)
 * e permette di ruotarla o eliminarla direttamente dall'anteprima.
 */
/**
 * Apre un modale a schermo intero renderizzando la pagina ad alta risoluzione (scala 1.5),
 * con navigazione tramite Frecce Sinistra/Destra e azioni sincronizzate con la griglia.
 */
async function openPagePreviewModal(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  _initialPageNum: number,
  initialCard: HTMLElement,
  container: HTMLElement
): Promise<void> {
  let currentCard = initialCard;
  let renderToken = 0; // Evita sovrapposizioni se si premono le frecce molto velocemente

  // Backdrop del modale
const modal = document.createElement('div');
modal.id = 'page-preview-modal';
modal.className =
  'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 select-none';

  // Barra superiore del modale (Navigazione + Titolo + Azioni + Chiudi)
  const topBar = document.createElement('div');
  topBar.className =
    'w-full max-w-3xl mb-3 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2';

  // Gruppo Sinistra: Frecce Precedente / Successiva + Indicatore posizione
  const navGroup = document.createElement('div');
  navGroup.className = 'flex items-center gap-2';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.title = 'Precedente (←)';
  prevBtn.className =
    'px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 disabled:opacity-35 disabled:pointer-events-none text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer';
  prevBtn.textContent = '◀';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.title = 'Successiva (→)';
  nextBtn.className =
    'px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 disabled:opacity-35 disabled:pointer-events-none text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer';
  nextBtn.textContent = '▶';

  const title = document.createElement('span');
  title.className = 'text-sm font-semibold text-slate-200 ml-1 font-mono';

  navGroup.appendChild(prevBtn);
  navGroup.appendChild(nextBtn);
  navGroup.appendChild(title);

  // Gruppo Destra: Ruota, Elimina, ESC
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-2';

const rotateLeftModalBtn = document.createElement('button');
  rotateLeftModalBtn.type = 'button';
  rotateLeftModalBtn.title = 'Ruota -90° (Shift + R)';
  rotateLeftModalBtn.className =
    'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer';
  rotateLeftModalBtn.textContent = '↺ -90°';

  const rotateRightModalBtn = document.createElement('button');
  rotateRightModalBtn.type = 'button';
  rotateRightModalBtn.title = 'Ruota +90° (R)';
  rotateRightModalBtn.className =
    'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer';
  rotateRightModalBtn.textContent = '↻ +90°';

  const deleteModalBtn = document.createElement('button');
  deleteModalBtn.type = 'button';
  deleteModalBtn.title = 'Elimina pagina (Canc)';
  deleteModalBtn.className =
    'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 disabled:opacity-35 disabled:pointer-events-none text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer';
  deleteModalBtn.textContent = '✕ Elimina / Delete';

  const closeModalBtn = document.createElement('button');
  closeModalBtn.type = 'button';
  closeModalBtn.className =
    'ml-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 transition cursor-pointer';
  closeModalBtn.textContent = 'ESC';

  actions.appendChild(rotateLeftModalBtn);
  actions.appendChild(rotateRightModalBtn);
  actions.appendChild(deleteModalBtn);
  actions.appendChild(closeModalBtn);

  topBar.appendChild(navGroup);
  topBar.appendChild(actions);

  // Area contenitore del Canvas ad alta risoluzione
  const body = document.createElement('div');
  body.className =
    'flex-1 w-full max-w-3xl overflow-auto flex items-center justify-center bg-slate-900/50 border border-slate-800 rounded-xl p-6';

  const hiResCanvas = document.createElement('canvas');
  hiResCanvas.className =
    'max-w-full max-h-[75vh] object-contain rounded shadow-2xl transition-transform duration-200';

  body.appendChild(hiResCanvas);
  modal.appendChild(topBar);
  modal.appendChild(body);
  document.body.appendChild(modal);

  // Helper per leggere l'elenco aggiornato delle card presenti nella griglia
  const getCards = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>('.page-card'));

  // Renderizza la card attualmente selezionata
  const renderCurrentCard = async (): Promise<void> => {
    const token = ++renderToken;
    const cards = getCards();
    const currentIndex = cards.indexOf(currentCard);
    if (currentIndex === -1) return;

    const originalPageNum = parseInt(currentCard.dataset.originalIndex || '0', 10) + 1;
    const rotationDelta = parseInt(currentCard.dataset.rotationDelta || '0', 10);

    // Mostra posizione attuale nella sequenza e numero di pagina originale
    title.textContent = `${currentIndex + 1} / ${cards.length}  (#${originalPageNum})`;

    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= cards.length - 1;
    deleteModalBtn.disabled = cards.length <= 1;

    hiResCanvas.style.transform = `rotate(${rotationDelta}deg)`;

    const page = await pdfDoc.getPage(originalPageNum);
    if (token !== renderToken) return; // Scarta se l'utente ha già cambiato pagina

    const viewport = page.getViewport({ scale: 1.5 });
    hiResCanvas.width = viewport.width;
    hiResCanvas.height = viewport.height;

    const ctx = hiResCanvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas: hiResCanvas }).promise;
  };

  // Navigazione a delta (-1 = precedente, +1 = successiva)
  const navigate = (step: -1 | 1): void => {
    const cards = getCards();
    const idx = cards.indexOf(currentCard);
    const target = cards[idx + step];
    if (target) {
      currentCard = target;
      renderCurrentCard();
    }
  };

  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));

  // Funzione di chiusura pulita
  const closeModal = (): void => {
    window.removeEventListener('keydown', onKeyDown);
    modal.remove();
  };

  // Gestione tastiera: ESC, Freccia Sinistra, Freccia Destra, R (Ruota)
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigate(1);
    } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) {
        rotateCurrentPage(-90);
      } else {
        rotateCurrentPage(90);
      }
    }else if (e.key === 'Delete') {
    e.preventDefault();
    e.stopImmediatePropagation(); // Impedisce a main.ts di svuotare la coda!
    if (!deleteModalBtn.disabled) {
      deleteModalBtn.click();
    }
  }
  };
  window.addEventListener('keydown', onKeyDown);

  modal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === modal || e.target === body) closeModal();
  });
  closeModalBtn.addEventListener('click', closeModal);

  // Ruota pagina corrente
const rotateCurrentPage = (angleDelta: 90 | -90): void => {
    const currentDelta = parseInt(currentCard.dataset.rotationDelta || '0', 10);
    const nextDelta = (currentDelta + angleDelta + 360) % 360;
    currentCard.dataset.rotationDelta = String(nextDelta);

    hiResCanvas.style.transform = `rotate(${nextDelta}deg)`;
    const thumbCanvas = currentCard.querySelector<HTMLCanvasElement>('canvas');
    if (thumbCanvas) {
      thumbCanvas.style.transform = `rotate(${nextDelta}deg)`;
    }
  };

  rotateLeftModalBtn.addEventListener('click', () => rotateCurrentPage(-90));
  rotateRightModalBtn.addEventListener('click', () => rotateCurrentPage(90));

  // Elimina pagina corrente e passa automaticamente alla successiva (o precedente se era l'ultima)
  deleteModalBtn.addEventListener('click', () => {
    const cards = getCards();
    if (cards.length <= 1) return;

    const currentIndex = cards.indexOf(currentCard);
    const nextCard = cards[currentIndex + 1] || cards[currentIndex - 1];

    currentCard.remove();
    if (nextCard) {
      currentCard = nextCard;
      renderCurrentCard();
    } else {
      closeModal();
    }
  });

  await renderCurrentCard();
}

/**
 * Renderizza le miniature del PDF nel container specificato e attiva SortableJS.
 */
let organizerSortable: Sortable | null = null;
export async function renderOrganizerGrid(
  buffer: ArrayBuffer,
  container: HTMLElement
): Promise<void> {
  if (organizerSortable) {
    organizerSortable.destroy();
    organizerSortable = null;
  }

  container.innerHTML = '';
  container.className =
    'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[60vh] overflow-y-auto p-2';

  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Renderizza il canvas della miniatura solo quando la card diventa visibile nello scroll
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const card = entry.target as HTMLElement;
        obs.unobserve(card);

        if (card.dataset.rendered === 'true') return;
        card.dataset.rendered = 'true';

        const pageNum = parseInt(card.dataset.originalIndex || '0', 10) + 1;
        const canvas = card.querySelector<HTMLCanvasElement>('canvas');
        if (!canvas) return;

        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 0.35 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        } catch {
          // Ignora se la card è stata rimossa durante lo scroll
        }
      });
    },
    { root: container, rootMargin: '150px' }
  );

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const card = document.createElement('div');
    card.className =
      'page-card relative group rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500 p-2 flex flex-col items-center gap-2 select-none cursor-grab active:cursor-grabbing transition';
    card.dataset.originalIndex = String(pageNum - 1);
    card.dataset.rotationDelta = '0';

    const canvasWrap = document.createElement('div');
    canvasWrap.className =
      'w-full h-40 flex items-center justify-center overflow-hidden bg-slate-900 rounded';

    const canvas = document.createElement('canvas');
    canvas.className = 'max-w-full max-h-full object-contain transition-transform duration-200';
    canvasWrap.appendChild(canvas);

    const footer = document.createElement('div');
    footer.className = 'w-full flex items-center justify-between text-xs text-slate-400 px-1';
    footer.innerHTML = `<span class="font-semibold text-slate-300">#${pageNum}</span>`;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-1';

    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.title = 'Ingrandisci / Inspect';
    zoomBtn.className =
      'p-1.5 rounded bg-slate-900/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700 text-xs cursor-pointer shadow';
    zoomBtn.textContent = '🔍';

    const rotateBtn = document.createElement('button');
    rotateBtn.type = 'button';
    rotateBtn.title = 'Clic SX: +90° | Clic DX: -90°';
    rotateBtn.className =
      'p-1.5 rounded bg-slate-900/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700 text-xs cursor-pointer shadow';
    rotateBtn.textContent = '↻';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.title = 'Elimina / Delete';
    deleteBtn.className =
      'p-1.5 rounded bg-slate-900/90 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 text-xs cursor-pointer shadow';
    deleteBtn.textContent = '✕';

    actions.appendChild(zoomBtn);
    actions.appendChild(rotateBtn);
    actions.appendChild(deleteBtn);
    footer.appendChild(actions);

    card.appendChild(canvasWrap);
    card.appendChild(footer);
    container.appendChild(card);

    // Registra la card nell'IntersectionObserver per il caricamento pigro
    observer.observe(card);

    const openZoom = (e: MouseEvent) => {
      e.stopPropagation();
      openPagePreviewModal(pdfDoc, pageNum, card, container);
    };
    zoomBtn.addEventListener('click', openZoom);
    card.addEventListener('dblclick', openZoom);

    const applyCardRotation = (angleDelta: 90 | -90): void => {
      const currentDelta = parseInt(card.dataset.rotationDelta || '0', 10);
      const nextDelta = (currentDelta + angleDelta + 360) % 360;
      card.dataset.rotationDelta = String(nextDelta);
      canvas.style.transform = `rotate(${nextDelta}deg)`;
    };

    rotateBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      applyCardRotation(90);
    });

    rotateBtn.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyCardRotation(-90);
    });

    deleteBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      if (container.querySelectorAll('.page-card').length <= 1) return;
      card.remove();
    });
  }

  organizerSortable = Sortable.create(container, {
    animation: 150,
    ghostClass: 'opacity-40',
    filter: 'button',
    preventOnFilter: false
  });
}

export function getOrganizerModifications(container: HTMLElement): PageModification[] {
  const cards = container.querySelectorAll<HTMLElement>('.page-card');
  return Array.from(cards).map((card: HTMLElement) => ({
    originalIndex: parseInt(card.dataset.originalIndex || '0', 10),
    rotationDelta: parseInt(card.dataset.rotationDelta || '0', 10)
  }));
}

export function rotateAllPages(container: HTMLElement, angleDelta: 90 | -90): void {
  const cards = container.querySelectorAll<HTMLElement>('.page-card');
  cards.forEach((card: HTMLElement) => {
    const currentDelta = parseInt(card.dataset.rotationDelta || '0', 10);
    const nextDelta = (currentDelta + angleDelta + 360) % 360;
    card.dataset.rotationDelta = String(nextDelta);

    const canvas = card.querySelector<HTMLCanvasElement>('canvas');
    if (canvas) {
      canvas.style.transform = `rotate(${nextDelta}deg)`;
    }
  });
}

export function reversePagesOrder(container: HTMLElement): void {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.page-card'));
  cards.reverse().forEach((card: HTMLElement) => {
    container.appendChild(card);
  });
}

/**
 * Converte tutte le pagine del PDF in immagini PNG o JPEG ad alta risoluzione.
 */
export async function convertPdfToImages(
  buffer: ArrayBuffer,
  format: 'png' | 'jpeg' = 'png',
  scale: number = 2.0
): Promise<SplitOutputFile[]> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const results: SplitOutputFile[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Errore conversione canvas'))),
        mimeType,
        0.92
      );
    });

    const arrayBuf = await blob.arrayBuffer();
    results.push({
      suffix: `page_${String(pageNum).padStart(3, '0')}.${format}`,
      bytes: new Uint8Array(arrayBuf)
    });
  }

  return results;
}