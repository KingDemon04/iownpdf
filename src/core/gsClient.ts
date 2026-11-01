import type {
  CompressionQuality,
  PdfAConformance,
  GsWorkerRequest,
  GsWorkerResponse
} from '../workers/gsWorker';

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/gsWorker.ts', import.meta.url), {
      type: 'module'
    });
  }
  return worker;
}

function runGsTask(request: Omit<GsWorkerRequest, 'id'>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const taskId = crypto.randomUUID();

    // Cloniamo il buffer (.slice(0)) prima di trasferirlo al Worker così
    // l'originale rimane disponibile in main.ts se l'utente vuole fare altre prove
    const bufferCopy = request.buffer.slice(0);

    const handleMessage = (event: MessageEvent<GsWorkerResponse>) => {
      if (event.data.id !== taskId) return;
      w.removeEventListener('message', handleMessage);

      if (event.data.success && event.data.outputBuffer) {
        resolve(new Uint8Array(event.data.outputBuffer));
      } else {
        reject(new Error(event.data.error || 'Elaborazione Ghostscript fallita'));
      }
    };

    w.addEventListener('message', handleMessage);

    const fullRequest: GsWorkerRequest = {
      ...request,
      id: taskId,
      buffer: bufferCopy
    };

    w.postMessage(fullRequest, [bufferCopy]);
  });
}

/**
 * Comprime il PDF riducendo la risoluzione delle immagini e ottimizzando gli stream.
 */
export async function compressPdf(
  buffer: ArrayBuffer,
  quality: CompressionQuality = '/ebook'
): Promise<Uint8Array> {
  return runGsTask({
    action: 'compress',
    buffer,
    compressQuality: quality
  });
}

/**
 * Converte il PDF nel formato archivistico standard ISO PDF/A-1b o PDF/A-2b o PDF/A-3b.
 */
export async function convertToPdfA(
  buffer: ArrayBuffer,
  pdfaLevel: PdfAConformance
): Promise<Uint8Array> {
  let inputBuffer = buffer;

  if (String(pdfaLevel) !== '1') {
    const { normalizeTransparencyGroups } = await import('./pdfActions');
    inputBuffer = await normalizeTransparencyGroups(buffer);
  }

  return runGsTask({
    action: 'pdfa',
    buffer: inputBuffer,
    pdfaLevel
  });
}