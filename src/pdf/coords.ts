import type { RectScreen } from "../app/state";
import type { PdfViewport } from "./types";

export interface CanvasPixelSize {
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizePdfPoint(point: [number, number] | { x: number; y: number }): [number, number] {
  if (Array.isArray(point)) {
    return [point[0], point[1]];
  }

  return [point.x, point.y];
}

export function screenRectToPdfRect(
  viewport: PdfViewport,
  rectScreen: RectScreen,
  canvasPixelSize: CanvasPixelSize,
  devicePixelRatio: number
): PdfRect {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  const canvasCssWidth = Math.max(1, canvasPixelSize.width / safeDpr);
  const canvasCssHeight = Math.max(1, canvasPixelSize.height / safeDpr);

  const x1 = rectScreen.x * (viewport.width / canvasCssWidth);
  const y1 = rectScreen.y * (viewport.height / canvasCssHeight);
  const x2 = (rectScreen.x + rectScreen.w) * (viewport.width / canvasCssWidth);
  const y2 = (rectScreen.y + rectScreen.h) * (viewport.height / canvasCssHeight);

  const p1 = normalizePdfPoint(viewport.convertToPdfPoint(x1, y1));
  const p2 = normalizePdfPoint(viewport.convertToPdfPoint(x2, y2));

  const minX = Math.min(p1[0], p2[0]);
  const maxX = Math.max(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]);
  const maxY = Math.max(p1[1], p2[1]);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
