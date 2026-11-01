# IOwnPDF — Zero-Knowledge Client-Side PDF Suite

![Architecture](https://img.shields.io/badge/Architecture-100%25_Client--Side-FD3901?style=flat-square)
![Engine](https://img.shields.io/badge/Engine-WebAssembly_%2B_Web_Workers-0f0f0f?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-Offline_Ready-emerald?style=flat-square)
![Security](https://img.shields.io/badge/CSP-Strict_Self_Only-blue?style=flat-square)
![License](https://img.shields.io/badge/License-All_Rights_Reserved-lightgrey?style=flat-square)

**IOwnPDF** is a high-performance, privacy-first Progressive Web Application (PWA) for advanced PDF manipulation, archival standardization, and optimization.

Unlike traditional cloud-based PDF utilities that upload sensitive documents to remote servers, IOwnPDF executes every operation **100% locally within the user's volatile RAM** using **WebAssembly (Ghostscript Wasm)** and **Web Workers**. No document, metadata, or telemetry ever leaves the client device.

🔗 **Live Production App:** [https://iownpdf.giutringa.workers.dev](https://iownpdf.giutringa.workers.dev)
<img width="2559" height="1299" alt="Screenshot 2026-11-01 162017" src="https://github.com/user-attachments/assets/8dd43695-6d82-46cd-bc8e-2fad4fed8fef" />

---

## Key Architectural Highlights

* **Zero-Knowledge & GDPR Compliant by Design:** Enforced via strict Content Security Policy (`connect-src 'self' blob:`). The application is mathematically and network-isolated from transmitting user files over the internet.
* **Non-Blocking Multi-Threaded Execution:** Heavy PDF re-distillation, compression, and ISO PDF/A conversions run inside dedicated **Web Workers** (`gsWorker.ts`) using **Transferable Objects (`ArrayBuffer`)** for zero-copy memory transfers, keeping the UI thread responsive at 60 FPS.
* **In-RAM Operation Chaining:** Users can pipe the output buffer of one tool directly into the next (`Merge → Reorder/Rotate → Watermark → Page Numbers → PDF/A-2b`) entirely in volatile memory before exporting to disk.
* **Offline-First Desktop PWA:** Pre-caches the entire application shell and WebAssembly binaries (`gs.wasm`, `pdf.worker.mjs`) via Service Worker (`Workbox`), supporting native Windows 11 installation, offline startup, and OS-level `"Open With..."` file handling (`window.launchQueue`).
* **Lazy-Loaded Critical Rendering Path:** Configured with `esnext` build targets and dynamic module imports (`await import()`). The initial boot payload is ~10 KB, achieving top scores across Google Lighthouse metrics.

---

## Core Feature Suite (9 Tools)

| Tool | Technical Implementation | Capabilities |
| :--- | :--- | :--- |
| **1. Merge PDF** | `pdf-lib` (`copyPages`) | Combines multiple PDF documents in custom drag-and-drop sequence. |
| **2. Split PDF** | `pdf-lib` + `fflate` + File System API | Extracts page ranges into a single PDF, a `.zip` archive, or directly writes separate PDFs into a native OS folder (`showDirectoryPicker`). |
| **3. Reorder / Rotate / Delete** | `pdfjs-dist` + `SortableJS` + `pdf-lib` | Interactive thumbnail grid with bulk rotation (`±90°`), order reversal, and on-demand high-DPI modal page inspection (`1.5x` canvas scale). |
| **4. Page Numbers** | `pdf-lib` (Rotation-Aware Matrix) | Stamps localized numbering (`Page N of M`, `N / M`, `N`) with automatic coordinate transformation for rotated (`90°/180°/270°`) and landscape pages. |
| **5. Watermark** | `pdf-lib` (Vector Typography) | Draws customizable diagonal (`+45°`), semi-transparent text watermarks centered across all pages regardless of page orientation. |
| **6. Sanitize Metadata** | `pdf-lib` (Catalog & Info Stripper) | Permanently wipes `Title`, `Author`, `Subject`, `Keywords`, `Creator`, `Producer`, timestamps, and raw XML/XMP metadata streams. |
| **7. PDF to Images** | `pdfjs-dist` + HTML5 Canvas + `fflate` | Renders PDF pages into lossless `PNG` or high-density `JPEG` (`150 DPI` / `300 DPI`) and packages them into a single `.zip` archive. |
| **8. Compress PDF** | `@jspawn/ghostscript-wasm` (`pdfwrite`) | Downsamples embedded raster streams and optimizes PDF structures via `/screen` (72 dpi), `/ebook` (150 dpi), or `/printer` (300 dpi) profiles with anti-bloat fallback. |
| **9. Convert to PDF/A** | `@jspawn/ghostscript-wasm` | Generates archival-grade documents compliant with **ISO 19005-1 (PDF/A-1b)**, **ISO 19005-2 (PDF/A-2b)**, and **ISO 19005-3 (PDF/A-3b)**. |

---

## Tech Stack

* **Frontend & Bundler:** TypeScript (Strict Mode), Vite, Tailwind CSS v4 (Custom Dark Carbon `#050505` & Accent `#FD3901` theme)
* **Structural PDF Engine:** `pdf-lib`
* **Rendering & Inspection Engine:** `pdfjs-dist` (Mozilla PDF.js)
* **Distillation & ISO Archival Engine:** `@jspawn/ghostscript-wasm` (WebAssembly running in isolated Web Worker)
* **Archiving & UI:** `fflate` (Zero-dependency ZIP compression), `SortableJS`
* **PWA & Offline Caching:** `vite-plugin-pwa` (Workbox Precache & Runtime Navigation Fallback)

---

## Keyboard Shortcuts & Productivity

IOwnPDF is designed for rapid desktop workflows:

* `Ctrl + O` — Open PDF file selector
* `Ctrl + V` — Paste PDF files directly from the system clipboard
* `Ctrl + S` / `Ctrl + Enter` — Process and export to disk
* `Ctrl + Shift + Enter` — **Apply in RAM & Continue** (Chain current output into the next tool)
* `Alt + 1 ... 9` — Switch instantaneously between tools in the sidebar
* `Alt + L` — Toggle interface language (`IT` / `EN`)
* `Delete` — Clear current document queue
* `Double Click` (on page thumbnail) — Open high-resolution page preview modal (`ESC` to close)

---

## Project Structure

```text
iownpdf/
├── public/
│   ├── _headers                  # Strict CSP & security headers for Cloudflare
│   ├── icons/                    # 192x192 & 512x512 PWA manifest icons
│   └── wasm/                     # Ghostscript WebAssembly binary (gs.wasm & gs.js)
├── src/
│   ├── core/
│   │   ├── gsClient.ts           # Promise-based RPC bridge to Ghostscript Worker
│   │   ├── pageOrganizer.ts      # PDF.js grid renderer, hi-res modal & PDF-to-Image
│   │   └── pdfActions.ts         # Rotation-aware pdf-lib manipulation routines
│   ├── i18n/
│   │   ├── i18n.ts               # Reactive bilingual DOM state manager
│   │   └── translations.ts       # Full IT / EN dictionary
│   ├── workers/
│   │   └── gsWorker.ts           # Dedicated Web Worker for Wasm execution
│   ├── main.ts                   # Application controller, RAM chaining & native File I/O
│   ├── style.css                 # Tailwind v4 configuration & WCAG AAA contrast overrides
│   └── vite-env.d.ts             # TypeScript declarations for Wasm & Service Worker
├── index.html                    # Main application layout
├── package.json                  # Scripts and minimal dependency tree
├── tsconfig.json                 # Strict TypeScript compiler configuration
└── vite.config.ts                # Vite bundler, esnext target & Workbox PWA config
```

---

## Local Development & Build

### Prerequisites
* **Node.js** `>= 20.x`
* **npm** `>= 10.x`

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Start local development server with HMR
npm run dev

# 3. Type-check and build production bundle (generates dist/ and Service Worker)
npm run build

# 4. Preview production build locally on port 4173
npm run preview
```

### Deployment (Cloudflare Workers Static Assets)
```bash
npm run deploy
```

---

## Security, Privacy & License

* **Zero Telemetry:** This application collects no analytics, cookies, or usage metrics.
* **Volatile Memory Processing:** All `ArrayBuffer` instances and virtual Emscripten filesystem nodes (`gs.FS`) are unlinked immediately after processing and garbage-collected upon tab closure.

**Copyright © 2026 IOwnPDF. All Rights Reserved.**  
The software is provided "AS IS", without warranty of any kind, express or implied.
