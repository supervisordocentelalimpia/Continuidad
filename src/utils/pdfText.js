// src/utils/pdfText.js
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

// Named export (esto evita tu error del build)
export async function extractTextFromPdf(file) {
  if (!file) throw new Error("No se recibió el PDF.");

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = (content.items || [])
      .map((it) => {
        const str = (it?.str || "").trim();
        const t = it?.transform || [];
        const x = typeof t[4] === "number" ? t[4] : 0;
        const y = typeof t[5] === "number" ? t[5] : 0;
        return { str, x, y };
      })
      .filter((it) => it.str);

    // Orden: arriba->abajo por Y, y dentro de fila izquierda->derecha por X
    items.sort((a, b) => {
      const dy = b.y - a.y;
      if (Math.abs(dy) > 2) return dy;
      return a.x - b.x;
    });

    // Agrupar por filas según Y
    const lines = [];
    let current = [];
    let currentY = null;

    const Y_TOL = 2;

    for (const it of items) {
      if (currentY === null) {
        currentY = it.y;
        current.push(it);
        continue;
      }

      if (Math.abs(it.y - currentY) <= Y_TOL) {
        current.push(it);
      } else {
        current.sort((a, b) => a.x - b.x);
        lines.push(current.map((z) => z.str).join(" ").replace(/\s+/g, " ").trim());

        current = [it];
        currentY = it.y;
      }
    }

    if (current.length) {
      current.sort((a, b) => a.x - b.x);
      lines.push(current.map((z) => z.str).join(" ").replace(/\s+/g, " ").trim());
    }

    for (const l of lines) if (l) allLines.push(l);
  }

  return allLines.join("\n");
}
