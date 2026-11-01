export type CompressionQuality = '/screen' | '/ebook' | '/printer';
export type PdfAConformance = '1' | '2' | '3';

export interface GsWorkerRequest {
  id: string;
  action: 'compress' | 'pdfa';
  buffer: ArrayBuffer;
  compressQuality?: CompressionQuality;
  pdfaLevel?: PdfAConformance;
}

export interface GsWorkerResponse {
  id: string;
  success: boolean;
  outputBuffer?: ArrayBuffer;
  error?: string;
}

// Cache della factory in memoria per non ricaricare gs.js ad ogni clic
let cachedFactory: any = null;

async function getGhostscriptFactory(): Promise<any> {
  if (cachedFactory) return cachedFactory;

  const gsJsUrl = new URL('/wasm/gs.js', self.location.origin).href;
  const response = await fetch(gsJsUrl);
  if (!response.ok) {
    throw new Error('Impossibile caricare /wasm/gs.js');
  }

  let code = await response.text();
  // Rimuove eventuale "export default" finale se presente nel file
  code = code.replace(/export\s+default\s+[^;]+;?/g, '');

  // new Function esegue il codice Emscripten fuori da 'use strict',
  // dichiarando esplicitamente `var createModule, Module;`
  const loader = new Function(
    'self',
    `
    var createModule;
    var Module;
    ${code}
    return typeof createModule !== 'undefined' ? createModule : Module;
    `
  );

  const factory = loader(self);
  if (typeof factory !== 'function') {
    throw new Error('Factory WebAssembly Ghostscript non trovata in gs.js');
  }

  cachedFactory = factory;
  return factory;
}

self.onmessage = async (event: MessageEvent<GsWorkerRequest>) => {
  const { id, action, buffer, compressQuality = '/ebook', pdfaLevel = '2' } = event.data;

  try {
    const initGhostscript = await getGhostscriptFactory();
    const gsWasmUrl = new URL('/wasm/gs.wasm', self.location.origin).href;

    const gs = await initGhostscript({
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) return gsWasmUrl;
        return new URL(`/wasm/${file}`, self.location.origin).href;
      },
      print: (text: string) => console.debug('[GS]', text),
      printErr: (text: string) => console.warn('[GS-Warn]', text)
    });

    const inputBytes = new Uint8Array(buffer);
    gs.FS.writeFile('/input.pdf', inputBytes);

    let args: string[] = [];

    if (action === 'compress') {
      args = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=${compressQuality}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-sOutputFile=/output.pdf',
        '/input.pdf'
      ];
} else if (action === 'pdfa') {
      args = [
        '-sDEVICE=pdfwrite',
        `-dPDFA=${pdfaLevel}`,
        '-dPDFACompatibilityPolicy=1',
        '-sColorConversionStrategy=UseDeviceIndependentColor',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-sOutputFile=/output.pdf',
        '/input.pdf'
      ];

      if (String(pdfaLevel) === '1') {
        args.splice(4, 0, '-dHaveTransparency=false');
      }
    }

    const exitCode = gs.callMain(args);
    if (exitCode !== 0) {
      throw new Error(`Codice di uscita Ghostscript: ${exitCode}`);
    }

    const outputUint8: Uint8Array = gs.FS.readFile('/output.pdf');
    const outputCopy = new Uint8Array(outputUint8).buffer;

    try {
      gs.FS.unlink('/input.pdf');
      gs.FS.unlink('/output.pdf');
    } catch {
      // Ignora errori di pulizia nel FS virtuale
    }

    const response: GsWorkerResponse = {
      id,
      success: true,
      outputBuffer: outputCopy
    };
    (self as unknown as Worker).postMessage(response, [outputCopy]);
  } catch (err: any) {
    const response: GsWorkerResponse = {
      id,
      success: false,
      error: err?.message || 'Errore durante l\'elaborazione PDF'
    };
    (self as unknown as Worker).postMessage(response);
  }
};