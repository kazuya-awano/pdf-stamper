import { PDFDocument } from "pdf-lib";
import type { StampImageState, StampPlacement } from "../app/state";
import { screenRectToPdfRect } from "../pdf/coords";
import type { PdfViewport } from "../pdf/types";

interface ExportPdfParams {
  pdfBytes: ArrayBuffer;
  stampImage: StampImageState;
  stampsByPage: Map<number, StampPlacement[]>;
  viewportByPage: Map<number, PdfViewport>;
  originalTitle: string | null;
  editedTitle: string | null;
}

export async function exportStampedPdf({
  pdfBytes,
  stampImage,
  stampsByPage,
  viewportByPage,
  originalTitle,
  editedTitle
}: ExportPdfParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), {
    ignoreEncryption: false
  });

  const embeddedImage =
    stampImage.type === "png"
      ? await pdfDoc.embedPng(stampImage.bytes)
      : await pdfDoc.embedJpg(stampImage.bytes);

  const pages = pdfDoc.getPages();
  const dpr = window.devicePixelRatio || 1;

  for (const [pageNumber, placements] of stampsByPage) {
    const page = pages[pageNumber - 1];
    const viewport = viewportByPage.get(pageNumber);

    if (!page || !viewport) {
      continue;
    }

    const canvasPixelSize = {
      width: viewport.width * dpr,
      height: viewport.height * dpr
    };

    for (const placement of placements) {
      const rectPdf = screenRectToPdfRect(
        viewport,
        placement.rectScreen,
        canvasPixelSize,
        dpr
      );

      page.drawImage(embeddedImage, {
        x: rectPdf.x,
        y: rectPdf.y,
        width: rectPdf.width,
        height: rectPdf.height
      });
    }
  }

  if (editedTitle === originalTitle) {
    // No-op: keep original metadata untouched.
  } else if (editedTitle === "") {
    pdfDoc.setTitle("");
  } else if (editedTitle !== null) {
    pdfDoc.setTitle(editedTitle);
  }

  return pdfDoc.save();
}

export function buildOutputPdfName(sourcePdfName: string | null): string {
  const safeName = sourcePdfName && sourcePdfName.trim().length > 0 ? sourcePdfName : "document.pdf";
  const baseName = safeName.replace(/\.pdf$/i, "");
  return `${baseName}_stamped.pdf`;
}

export function downloadPdf(bytes: Uint8Array, outputName: string): void {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = outputName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(objectUrl);
}
