import type { StampPlacement } from "../app/state";

interface StampOverlayCallbacks {
  onStampChange: (stamp: StampPlacement) => void;
  onSelect: (stampId: string | null) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyRect(element: HTMLElement, stamp: StampPlacement): void {
  element.style.left = `${stamp.rectScreen.x}px`;
  element.style.top = `${stamp.rectScreen.y}px`;
  element.style.width = `${stamp.rectScreen.w}px`;
  element.style.height = `${stamp.rectScreen.h}px`;
}

function readNodeRect(node: HTMLElement, fallback: StampPlacement["rectScreen"]): StampPlacement["rectScreen"] {
  const x = Number.parseFloat(node.style.left);
  const y = Number.parseFloat(node.style.top);
  const w = Number.parseFloat(node.style.width);
  const h = Number.parseFloat(node.style.height);

  return {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y,
    w: Number.isFinite(w) ? w : fallback.w,
    h: Number.isFinite(h) ? h : fallback.h
  };
}

export class StampOverlayController {
  private readonly overlay: HTMLElement;
  private readonly callbacks: StampOverlayCallbacks;
  private selectedStampId: string | null = null;

  constructor(overlay: HTMLElement, callbacks: StampOverlayCallbacks) {
    this.overlay = overlay;
    this.callbacks = callbacks;

    this.overlay.addEventListener("pointerdown", (event) => {
      if (event.target === this.overlay) {
        this.setSelected(null);
        this.callbacks.onSelect(null);
      }
    });
  }

  render(stamps: StampPlacement[], stampImageSrc: string, selectedStampId: string | null): void {
    this.overlay.replaceChildren();
    this.selectedStampId = selectedStampId;

    for (const stamp of stamps) {
      const stampEl = document.createElement("div");
      stampEl.className = "stamp-node";
      stampEl.dataset.stampId = stamp.id;
      if (stamp.id === selectedStampId) {
        stampEl.classList.add("is-selected");
      }

      const image = document.createElement("img");
      image.className = "stamp-image";
      image.src = stampImageSrc;
      image.alt = "スタンプ";
      image.draggable = false;

      const resizeHandle = document.createElement("button");
      resizeHandle.type = "button";
      resizeHandle.className = "stamp-resize";
      resizeHandle.setAttribute("aria-label", "スタンプをリサイズ");

      stampEl.append(image, resizeHandle);
      applyRect(stampEl, stamp);

      stampEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        event.stopPropagation();
        this.setSelected(stamp.id);
        this.callbacks.onSelect(stamp.id);
      });

      image.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        this.startDrag(event, stamp, stampEl);
      });

      resizeHandle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        this.startResize(event, stamp, stampEl);
      });

      this.overlay.append(stampEl);
    }
  }

  setSelected(stampId: string | null): void {
    this.selectedStampId = stampId;

    const nodes = this.overlay.querySelectorAll<HTMLElement>(".stamp-node");
    for (const node of nodes) {
      if (node.dataset.stampId === stampId) {
        node.classList.add("is-selected");
      } else {
        node.classList.remove("is-selected");
      }
    }
  }

  private startDrag(startEvent: PointerEvent, sourceStamp: StampPlacement, node: HTMLElement): void {
    const startMouseX = startEvent.clientX;
    const startMouseY = startEvent.clientY;
    const overlayRect = this.overlay.getBoundingClientRect();
    const startRect = readNodeRect(node, sourceStamp.rectScreen);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startMouseX;
      const dy = moveEvent.clientY - startMouseY;

      const nextX = clamp(startRect.x + dx, 0, Math.max(0, overlayRect.width - startRect.w));
      const nextY = clamp(startRect.y + dy, 0, Math.max(0, overlayRect.height - startRect.h));

      const updated: StampPlacement = {
        ...sourceStamp,
        rectScreen: {
          x: nextX,
          y: nextY,
          w: startRect.w,
          h: startRect.h
        }
      };

      applyRect(node, updated);
      this.callbacks.onStampChange(updated);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  private startResize(startEvent: PointerEvent, sourceStamp: StampPlacement, node: HTMLElement): void {
    const startMouseX = startEvent.clientX;
    const startMouseY = startEvent.clientY;
    const overlayRect = this.overlay.getBoundingClientRect();

    const startRect = readNodeRect(node, sourceStamp.rectScreen);
    const aspectRatio = startRect.w / startRect.h;
    const minWidth = 32;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startMouseX;
      const dy = moveEvent.clientY - startMouseY;
      const dominantDelta = Math.max(dx, dy);

      const availableWidthByX = overlayRect.width - startRect.x;
      const availableWidthByY = (overlayRect.height - startRect.y) * aspectRatio;
      const maxAllowedWidth = Math.max(minWidth, Math.min(availableWidthByX, availableWidthByY));

      const nextWidth = clamp(startRect.w + dominantDelta, minWidth, maxAllowedWidth);
      const nextHeight = nextWidth / aspectRatio;

      const updated: StampPlacement = {
        ...sourceStamp,
        rectScreen: {
          x: startRect.x,
          y: startRect.y,
          w: nextWidth,
          h: nextHeight
        }
      };

      applyRect(node, updated);
      this.callbacks.onStampChange(updated);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
}
