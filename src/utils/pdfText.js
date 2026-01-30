import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractTextFromPdfFile(file) {
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;

  let out = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items) {
      out += item.str;
      out += item.hasEOL ? "\n" : " ";
    }
    out += "\n";
  }
  return out;
}
