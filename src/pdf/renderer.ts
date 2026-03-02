import type { PdfDocument, PdfViewport } from "./types";

export interface RenderedPage {
  viewport: PdfViewport;
  cssWidth: number;
  cssHeight: number;
}

export interface RenderPageParams {
  pdfDoc: PdfDocument;
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale?: number;
  rotation?: number;
}

export async function renderPageToCanvas({
  pdfDoc,
  pageNumber,
  canvas,
  scale = 1.35,
  rotation = 0
}: RenderPageParams): Promise<RenderedPage> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation }) as unknown as PdfViewport;
  const dpr = window.devicePixelRatio || 1;

  const cssWidth = Math.max(1, viewport.width);
  const cssHeight = Math.max(1, viewport.height);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Canvas 2D context を取得できませんでした。");
  }

  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  const renderTask = page.render({
    canvasContext,
    viewport: viewport as never,
    transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0]
  });

  await renderTask.promise;

  return {
    viewport,
    cssWidth,
    cssHeight
  };
}
