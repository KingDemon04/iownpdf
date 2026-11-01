/// <reference types="vite/client" />

declare module '*.css' {}

declare module '*.wasm?url' {
  const src: string;
  export default src;
}

declare module '@jspawn/ghostscript-wasm' {
  const init: any;
  export default init;
}

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: any) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}