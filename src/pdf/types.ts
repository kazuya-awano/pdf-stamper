export interface PdfViewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): [number, number] | { x: number; y: number };
}

export interface PdfRenderTask {
  promise: Promise<void>;
}

export interface PdfPage {
  getViewport(params: { scale: number; rotation?: number }): PdfViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: [number, number, number, number, number, number];
  }): PdfRenderTask;
}

export interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}
