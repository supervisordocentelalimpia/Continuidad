// src/utils/pdfText.js
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

// Extrae texto de un PDF (texto real; si es escaneado/imagen, quedará vacío)
export async function extractTextFromPdf(file) {
  if (!file) throw new Error("No PDF provided");

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  let out = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const strings = content.items
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean);

    out += strings.join(" ") + "\n";
  }

  return out;
}
