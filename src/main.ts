import "./styles.css";
import {
  countStamps,
  createInitialState,
  createStampId,
  getStampsForPage,
  setStampsForPage,
  type StampImageType,
  type StampPlacement
} from "./app/state";
import { buildOutputPdfName, downloadPdf, exportStampedPdf } from "./export/exportPdf";
import { PdfLoadError, loadPdfFromFile } from "./pdf/loader";
import { renderPageToCanvas } from "./pdf/renderer";
import { StampOverlayController } from "./stamp/overlay";

const VIEW_SCALE = 1.35;
const INITIAL_STAMP_MARGIN = 18;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("#app が見つかりません。");
}

appRoot.innerHTML = `
  <div class="app-shell">
    <header class="hero">
      <p class="hero-kicker">Offline Workflow</p>
      <h1>PDF Stamp Tool</h1>
      <p class="hero-copy">PDFとスタンプ画像はブラウザ内だけで処理します。外部通信は行いません。</p>
    </header>

    <section class="toolbar" aria-label="操作バー">
      <label id="stepPdfField" class="field step-field step-pdf">
        <span class="step-label">STEP 1</span>
        <span>PDFを選択</span>
        <input id="pdfInput" type="file" accept="application/pdf" />
      </label>

      <label id="stepStampField" class="field step-field step-stamp">
        <span class="step-label">STEP 2</span>
        <span>スタンプ画像を選択</span>
        <input id="stampInput" type="file" accept="image/png,image/jpeg" />
      </label>

      <p id="inputOrderHint" class="order-hint" aria-live="polite"></p>

      <label class="field title-field">
        <span>Title</span>
        <input id="titleInput" type="text" placeholder="PDF Title" autocomplete="off" />
      </label>

      <div class="buttons-row">
        <button id="saveButton" class="button button-accent" type="button">保存</button>
        <button id="deleteButton" class="button" type="button">削除</button>
      </div>

      <div class="buttons-row pager-row">
        <button id="prevButton" class="button" type="button">前</button>
        <p id="pageInfo" class="page-info" aria-live="polite">0 / 0</p>
        <button id="nextButton" class="button" type="button">次</button>
      </div>
    </section>

    <p id="statusMessage" class="status" hidden aria-live="polite"></p>

    <section id="viewerPanel" class="viewer-panel" aria-label="PDFビュー" hidden>
      <div id="canvasStack" class="canvas-stack">
        <canvas id="pdfCanvas"></canvas>
        <div id="stampOverlay" class="stamp-overlay"></div>
      </div>
    </section>
  </div>
`;

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${selector} が見つかりません。`);
  }
  return element;
}

const pdfInput = mustElement<HTMLInputElement>("#pdfInput");
const stampInput = mustElement<HTMLInputElement>("#stampInput");
const stepPdfField = mustElement<HTMLElement>("#stepPdfField");
const stepStampField = mustElement<HTMLElement>("#stepStampField");
const titleInput = mustElement<HTMLInputElement>("#titleInput");
const saveButton = mustElement<HTMLButtonElement>("#saveButton");
const deleteButton = mustElement<HTMLButtonElement>("#deleteButton");
const prevButton = mustElement<HTMLButtonElement>("#prevButton");
const nextButton = mustElement<HTMLButtonElement>("#nextButton");
const pageInfo = mustElement<HTMLParagraphElement>("#pageInfo");
const statusMessage = mustElement<HTMLParagraphElement>("#statusMessage");
const inputOrderHint = mustElement<HTMLParagraphElement>("#inputOrderHint");
const viewerPanel = mustElement<HTMLElement>("#viewerPanel");
const canvas = mustElement<HTMLCanvasElement>("#pdfCanvas");
const overlay = mustElement<HTMLDivElement>("#stampOverlay");
const canvasStack = mustElement<HTMLDivElement>("#canvasStack");

const state = createInitialState();

const overlayController = new StampOverlayController(overlay, {
  onStampChange: (updatedStamp) => {
    const pageStamps = getStampsForPage(state, updatedStamp.page);
    const nextStamps = pageStamps.map((stamp) =>
      stamp.id === updatedStamp.id ? updatedStamp : stamp
    );
    setStampsForPage(state, updatedStamp.page, nextStamps);
  },
  onSelect: (stampId) => {
    state.selectedStampId = stampId;
    syncControls();
  }
});

let renderTicket = 0;

function setStatus(message: string | null, kind: "error" | "success" = "error"): void {
  if (!message) {
    statusMessage.hidden = true;
    statusMessage.textContent = "";
    statusMessage.classList.remove("is-error", "is-success");
    return;
  }

  statusMessage.hidden = false;
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", kind === "error");
  statusMessage.classList.toggle("is-success", kind === "success");
}

function syncPageInfo(): void {
  if (!state.pdfDoc) {
    pageInfo.textContent = "0 / 0";
    return;
  }

  pageInfo.textContent = `${state.currentPage} / ${state.pageCount}`;
}

function syncControls(): void {
  const hasPdf = Boolean(state.pdfDoc);
  const hasStamp = Boolean(state.stampImage);
  const hasSelectedStamp = Boolean(state.selectedStampId);

  stampInput.disabled = !hasPdf;
  titleInput.disabled = !hasPdf;
  viewerPanel.hidden = !hasPdf;

  stepPdfField.classList.toggle("is-step-active", !hasPdf);
  stepPdfField.classList.toggle("is-step-done", hasPdf);
  stepPdfField.classList.remove("is-step-disabled");

  stepStampField.classList.toggle("is-step-disabled", !hasPdf);
  stepStampField.classList.toggle("is-step-active", hasPdf && !hasStamp);
  stepStampField.classList.toggle("is-step-done", hasPdf && hasStamp);

  if (!hasPdf) {
    inputOrderHint.textContent = "STEP 1: 先にPDFを選択してください。";
  } else if (!hasStamp) {
    inputOrderHint.textContent =
      "STEP 2: 必要に応じてスタンプ画像を選択してください（タイトル変更のみでも保存できます）。";
  } else {
    inputOrderHint.textContent = "PDFとスタンプ画像の選択が完了しています。";
  }

  prevButton.disabled = !hasPdf || state.currentPage <= 1;
  nextButton.disabled = !hasPdf || state.currentPage >= state.pageCount;
  saveButton.disabled = !hasPdf;
  deleteButton.disabled = !hasSelectedStamp;
}

function clearStampImage(): void {
  if (state.stampImage) {
    URL.revokeObjectURL(state.stampImage.previewUrl);
  }

  state.stampImage = null;
  state.selectedStampId = null;
  state.stampsByPage.clear();
}

function refreshOverlayForCurrentPage(): void {
  if (!state.stampImage) {
    overlayController.render([], "", null);
    syncControls();
    return;
  }

  overlayController.render(
    getStampsForPage(state, state.currentPage),
    state.stampImage.previewUrl,
    state.selectedStampId
  );
  syncControls();
}

async function renderCurrentPage(): Promise<void> {
  if (!state.pdfDoc) {
    return;
  }

  const ticket = ++renderTicket;
  const pageNumber = state.currentPage;

  const rendered = await renderPageToCanvas({
    pdfDoc: state.pdfDoc,
    pageNumber,
    canvas,
    scale: VIEW_SCALE
  });

  if (ticket !== renderTicket || pageNumber !== state.currentPage) {
    return;
  }

  state.viewportByPage.set(pageNumber, rendered.viewport);

  canvasStack.style.width = `${rendered.cssWidth}px`;
  canvasStack.style.height = `${rendered.cssHeight}px`;
  overlay.style.width = `${rendered.cssWidth}px`;
  overlay.style.height = `${rendered.cssHeight}px`;

  refreshOverlayForCurrentPage();
  syncPageInfo();
  syncControls();
}

function parseStampImageType(file: File): StampImageType | null {
  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return "jpg";
  }

  return null;
}

async function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = () => {
      reject(new Error("スタンプ画像の読み込みに失敗しました。"));
    };
    image.src = url;
  });
}

function placeInitialStampOnCurrentPage(): void {
  if (!state.stampImage) {
    return;
  }

  const overlayRect = overlay.getBoundingClientRect();
  if (overlayRect.width <= 0 || overlayRect.height <= 0) {
    throw new Error("PDF描画後にスタンプを配置してください。");
  }

  const naturalWidth = Math.max(1, state.stampImage.naturalWidth);
  const naturalHeight = Math.max(1, state.stampImage.naturalHeight);
  // screen -> PDF 変換時に VIEW_SCALE で割られるため、初期表示時に掛け戻して
  // 「1px ~= 1pt(72dpi想定)」の見え方に合わせる。
  const naturalWidthCss = naturalWidth * VIEW_SCALE;
  const naturalHeightCss = naturalHeight * VIEW_SCALE;
  const maxWidth = Math.max(24, overlayRect.width - INITIAL_STAMP_MARGIN * 2);
  const maxHeight = Math.max(24, overlayRect.height - INITIAL_STAMP_MARGIN * 2);

  const fitRatio = Math.min(1, maxWidth / naturalWidthCss, maxHeight / naturalHeightCss);
  const width = naturalWidthCss * fitRatio;
  const height = naturalHeightCss * fitRatio;

  const stamp: StampPlacement = {
    id: createStampId(),
    page: state.currentPage,
    rectScreen: {
      x: INITIAL_STAMP_MARGIN,
      y: INITIAL_STAMP_MARGIN,
      w: width,
      h: height
    }
  };

  setStampsForPage(state, state.currentPage, [stamp]);
  state.selectedStampId = stamp.id;
  refreshOverlayForCurrentPage();
}

async function handlePdfSelection(file: File): Promise<void> {
  setStatus(null);

  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    setStatus("PDFファイルを選択してください。", "error");
    return;
  }

  try {
    const loadedPdf = await loadPdfFromFile(file);

    clearStampImage();
    state.pdfBytes = loadedPdf.bytes;
    state.pdfDoc = loadedPdf.pdfDoc;
    state.pageCount = loadedPdf.pageCount;
    state.currentPage = 1;
    state.viewportByPage.clear();
    state.sourcePdfName = file.name;

    state.documentMeta.originalTitle = loadedPdf.originalTitle;
    state.documentMeta.editedTitle = loadedPdf.originalTitle;
    titleInput.value = loadedPdf.originalTitle ?? "";

    await renderCurrentPage();
  } catch (error) {
    if (error instanceof PdfLoadError && error.code === "encrypted") {
      setStatus("暗号化PDFは非対応です。別のPDFを選択してください。", "error");
    } else {
      setStatus("PDFの読み込みに失敗しました。ファイルを確認してください。", "error");
    }
  }

  syncControls();
}

async function handleStampSelection(file: File): Promise<void> {
  setStatus(null);

  if (!state.pdfDoc) {
    setStatus("先にPDFを読み込んでください。", "error");
    return;
  }

  const imageType = parseStampImageType(file);
  if (!imageType) {
    setStatus("スタンプ画像はPNGまたはJPEGを選択してください。", "error");
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  let committedState = false;

  try {
    const [dimensions, bytes] = await Promise.all([readImageDimensions(previewUrl), file.arrayBuffer()]);

    clearStampImage();
    state.stampImage = {
      bytes,
      type: imageType,
      naturalWidth: dimensions.width,
      naturalHeight: dimensions.height,
      previewUrl
    };
    committedState = true;

    placeInitialStampOnCurrentPage();
    setStatus(
      "注記: 現在はスタンプ1つのみです。画像挿入中はページ移動・削除に制約があります。",
      "success"
    );
  } catch (error) {
    if (committedState) {
      clearStampImage();
    } else {
      URL.revokeObjectURL(previewUrl);
    }
    setStatus(
      error instanceof Error ? error.message : "スタンプ画像の読み込みに失敗しました。",
      "error"
    );
  }

  syncControls();
}

async function changePage(nextPage: number): Promise<void> {
  if (!state.pdfDoc) {
    return;
  }

  if (nextPage < 1 || nextPage > state.pageCount) {
    return;
  }

  state.currentPage = nextPage;
  state.selectedStampId = null;
  await renderCurrentPage();
}

function deleteSelectedStamp(): void {
  if (!state.selectedStampId) {
    return;
  }

  const selectedId = state.selectedStampId;

  for (const [pageNumber, stamps] of state.stampsByPage.entries()) {
    const nextStamps = stamps.filter((stamp) => stamp.id !== selectedId);
    setStampsForPage(state, pageNumber, nextStamps);
  }

  state.selectedStampId = null;
  refreshOverlayForCurrentPage();
}

async function savePdf(): Promise<void> {
  setStatus(null);

  if (!state.pdfBytes || !state.pdfDoc) {
    setStatus("PDFを読み込んでから保存してください。", "error");
    return;
  }

  const stampCount = countStamps(state.stampsByPage);
  const isTitleEdited = state.documentMeta.editedTitle !== state.documentMeta.originalTitle;

  if (stampCount > 0 && !state.stampImage) {
    setStatus("スタンプ画像を再選択してから保存してください。", "error");
    return;
  }

  if (stampCount === 0 && !isTitleEdited) {
    setStatus("タイトル変更またはスタンプ配置を行ってから保存してください。", "error");
    return;
  }

  saveButton.disabled = true;

  try {
    const outputBytes = await exportStampedPdf({
      pdfBytes: state.pdfBytes,
      stampImage: state.stampImage,
      stampsByPage: state.stampsByPage,
      viewportByPage: state.viewportByPage,
      originalTitle: state.documentMeta.originalTitle,
      editedTitle: state.documentMeta.editedTitle
    });

    downloadPdf(outputBytes, buildOutputPdfName(state.sourcePdfName));
    setStatus("PDFを保存しました。", "success");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "保存に失敗しました。PDFを再読み込みしてお試しください。",
      "error"
    );
  }

  syncControls();
}

pdfInput.addEventListener("change", () => {
  const file = pdfInput.files?.[0];
  if (!file) {
    return;
  }

  void handlePdfSelection(file);
  pdfInput.value = "";
});

stampInput.addEventListener("change", () => {
  const file = stampInput.files?.[0];
  if (!file) {
    return;
  }

  void handleStampSelection(file);
  stampInput.value = "";
});

titleInput.addEventListener("input", () => {
  state.documentMeta.editedTitle = titleInput.value;
});

prevButton.addEventListener("click", () => {
  void changePage(state.currentPage - 1);
});

nextButton.addEventListener("click", () => {
  void changePage(state.currentPage + 1);
});

deleteButton.addEventListener("click", () => {
  deleteSelectedStamp();
});

saveButton.addEventListener("click", () => {
  void savePdf();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Delete") {
    return;
  }

  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return;
  }

  deleteSelectedStamp();
});

window.addEventListener("beforeunload", () => {
  clearStampImage();
});

syncPageInfo();
syncControls();
