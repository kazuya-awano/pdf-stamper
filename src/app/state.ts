import type { PdfDocument, PdfViewport } from "../pdf/types";

export type StampImageType = "png" | "jpg";

export interface RectScreen {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StampPlacement {
  id: string;
  page: number;
  rectScreen: RectScreen;
}

export interface StampImageState {
  bytes: ArrayBuffer;
  type: StampImageType;
  naturalWidth: number;
  naturalHeight: number;
  previewUrl: string;
}

export interface AppState {
  pdfBytes: ArrayBuffer | null;
  pdfDoc: PdfDocument | null;
  pageCount: number;
  currentPage: number;
  viewportByPage: Map<number, PdfViewport>;
  documentMeta: {
    originalTitle: string | null;
    editedTitle: string | null;
  };
  stampImage: StampImageState | null;
  stampsByPage: Map<number, StampPlacement[]>;
  selectedStampId: string | null;
  sourcePdfName: string | null;
}

export function createInitialState(): AppState {
  return {
    pdfBytes: null,
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    viewportByPage: new Map(),
    documentMeta: {
      originalTitle: null,
      editedTitle: null
    },
    stampImage: null,
    stampsByPage: new Map(),
    selectedStampId: null,
    sourcePdfName: null
  };
}

export function getStampsForPage(state: AppState, pageNumber: number): StampPlacement[] {
  return state.stampsByPage.get(pageNumber) ?? [];
}

export function setStampsForPage(
  state: AppState,
  pageNumber: number,
  stamps: StampPlacement[]
): void {
  if (stamps.length === 0) {
    state.stampsByPage.delete(pageNumber);
    return;
  }

  state.stampsByPage.set(pageNumber, stamps);
}

export function countStamps(stampsByPage: Map<number, StampPlacement[]>): number {
  let count = 0;
  for (const pageStamps of stampsByPage.values()) {
    count += pageStamps.length;
  }
  return count;
}

export function createStampId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
