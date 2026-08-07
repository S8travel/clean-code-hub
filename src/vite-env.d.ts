/// <reference types="vite/client" />

// ID build hiện tại, inject bởi vite.config (define). Dùng để so với /version.json.
declare const __APP_VERSION__: string;

// pdfjs-dist chỉ khai types cho entry chính — bản legacy (tự chứa polyfill
// Promise.withResolvers cho Safari <17.4 / Chrome <119) cùng API surface.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
