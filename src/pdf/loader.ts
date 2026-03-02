import { PDFDocument } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PdfDocument } from "./types";

GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfLoadError extends Error {
  code: "encrypted" | "invalid" | "unknown";

  constructor(message: string, code: "encrypted" | "invalid" | "unknown") {
    super(message);
    this.name = "PdfLoadError";
    this.code = code;
  }
}

export interface LoadedPdf {
  bytes: ArrayBuffer;
  pdfDoc: PdfDocument;
  pageCount: number;
  originalTitle: string | null;
}

function isEncryptedError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? "");
  const name = String((error as { name?: unknown })?.name ?? "");
  return /password|encrypted|encryption/i.test(`${name} ${message}`);
}

export async function loadPdfFromFile(file: File): Promise<LoadedPdf> {
  const pdfBytes = await file.arrayBuffer();

  let pdfDoc: PdfDocument;
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBytes.slice(0))
    });
    pdfDoc = await loadingTask.promise;
  } catch (error) {
    if (isEncryptedError(error)) {
      throw new PdfLoadError("暗号化されたPDFは読み込めません。", "encrypted");
    }

    throw new PdfLoadError("PDFの読み込みに失敗しました。", "invalid");
  }

  let originalTitle: string | null;
  try {
    const metadataDoc = await PDFDocument.load(pdfBytes.slice(0), {
      ignoreEncryption: false
    });
    originalTitle = metadataDoc.getTitle() ?? null;
  } catch (error) {
    if (isEncryptedError(error)) {
      throw new PdfLoadError("暗号化されたPDFは読み込めません。", "encrypted");
    }

    throw new PdfLoadError("PDFメタデータの読み込みに失敗しました。", "unknown");
  }

  return {
    bytes: pdfBytes,
    pdfDoc,
    pageCount: pdfDoc.numPages,
    originalTitle
  };
}
