import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 将导出节点克隆到 body 下再截图，避免 opacity/z-index/oklch 导致空白或报错 */
async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  const target =
    (element.querySelector('.export-itinerary-sheet') as HTMLElement | null) ?? element;

  const sandbox = document.createElement('div');
  sandbox.setAttribute('data-export-sandbox', 'true');
  sandbox.style.cssText =
    'position:fixed;left:0;top:0;z-index:2147483647;background:#ffffff;pointer-events:none;overflow:visible;';

  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.opacity = '1';
  clone.style.visibility = 'visible';
  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);

  await waitForPaint();

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      width: clone.scrollWidth,
      height: clone.scrollHeight,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
      onclone: (doc) => {
        doc.querySelectorAll('[data-export-sandbox]').forEach((node) => {
          (node as HTMLElement).style.opacity = '1';
        });
        // html2canvas 不支持 oklch/oklab，强制回退为 rgb
        doc.querySelectorAll('*').forEach((node) => {
          const el = node as HTMLElement;
          if (!el.style) return;
          try {
            const color = doc.defaultView?.getComputedStyle(el).color;
            if (color && /oklab|oklch/i.test(color)) {
              el.style.color = '#334155';
            }
            const bg = doc.defaultView?.getComputedStyle(el).backgroundColor;
            if (bg && /oklab|oklch/i.test(bg)) {
              el.style.backgroundColor = '#ffffff';
            }
          } catch {
            /* ignore */
          }
        });
      },
    });

    if (canvas.width < 1 || canvas.height < 1) {
      throw new Error('导出内容为空，请确认行程中已有站点');
    }

    return canvas;
  } finally {
    sandbox.remove();
  }
}

function addCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, margin: number) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const imgH = (canvas.height * contentW) / canvas.width;

  let imgData: string;
  try {
    imgData = canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    imgData = canvas.toDataURL('image/png');
  }

  if (imgH <= contentH) {
    pdf.addImage(imgData, 'JPEG', margin, margin, contentW, imgH);
    return;
  }

  let offsetY = 0;
  let pageIndex = 0;
  while (offsetY < imgH) {
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', margin, margin - offsetY, contentW, imgH);
    offsetY += contentH;
    pageIndex += 1;
    if (pageIndex > 50) break;
  }
}

export async function exportElementToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await captureElement(element);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  addCanvasToPdf(pdf, canvas, 36);
  pdf.save(filename);
}

export async function exportElementToPng(element: HTMLElement): Promise<string> {
  const canvas = await captureElement(element);
  return canvas.toDataURL('image/png');
}
