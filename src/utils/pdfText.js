// src/utils/pdfText.js
import * as pdfjsLib from "pdfjs-dist";

// ✅ Para Vite (muy importante): worker como URL
// Si esto te falla en build, cambia a: "pdfjs-dist/build/pdf.worker.min.mjs?url"
import workerSrc from "pdfjs-dist/build/pdf.worker.min?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractTextFromPdf(file) {
  if (!file) return "";

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Esto reconstruye texto “decente” por página
    const strings = content.items.map((it) => (it?.str ? it.str : ""));
    fullText += strings.join(" ") + "\n";
  }

  return fullText;
}
