// src/utils/parseCevazPdf.js
import { extractTextFromPdf } from "./pdfText";

const HORARIO_BLOQUES = [
  "8:30 AM - 10:00 AM",
  "10:30 AM - 12:00 PM",
  "1:00 PM - 2:30 PM",
  "2:45 PM - 4:15 PM",
  "4:30 PM - 6:00 PM",
  "6:15 PM - 7:45 PM",
  "8:00 AM - 10:40 AM",
  "10:50 AM - 1:30 PM",
  "2:30 PM - 5:10 PM",
];

const normKey = (s) =>
  (s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/–/g, "-");

const normalizeLevel = (raw) => {
  const s = (raw || "").toUpperCase();
  const m = s.match(/(\d{1,2})/);
  if (!m) return (raw || "N/A").trim();
  return `L${m[1].padStart(2, "0")}`;
};

const normalizeCategory = (raw, fileName = "") => {
  const src = `${raw || ""} ${fileName || ""}`.toUpperCase();
  if (src.includes("ADULT")) return "Adultos";
  if (src.includes("KIDS") || src.includes("NIÑ") || src.includes("NIN")) return "Niños";
  if (src.includes("YOUNG") || src.includes("JOV") || src.includes("TEEN")) return "Jóvenes";
  return raw ? raw.trim() : "Otra";
};

const normalizeHorario = (raw) => {
  if (!raw) return "N/A";

  // Ej: "TUESDAY TO FRIDAY / 8:30 A 10:00 AM"
  const afterSlash = raw.includes("/") ? raw.split("/").pop().trim() : raw.trim();

  // Normalizar separadores raros (muchos espacios, guiones, etc.)
  const cleaned = afterSlash.replace(/\s+/g, " ").trim();

  // Capturar: 8:30 A 10:00 AM | 8:00 AM - 10:40 AM
  const m = cleaned.match(
    /(\d{1,2}:\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2}:\d{2})\s*(AM|PM)/i
  );

  if (!m) {
    const k = normKey(cleaned);
    const exact = HORARIO_BLOQUES.find((b) => normKey(b) === k);
    return exact || cleaned;
  }

  const start = m[1];
  const startMer = (m[2] || m[4]).toUpperCase(); // si no trae AM/PM al inicio, asumir el del final
  const end = m[3];
  const endMer = m[4].toUpperCase();

  const candidate = `${start} ${startMer} - ${end} ${endMer}`;
  const cKey = normKey(candidate);
  const mapped = HORARIO_BLOQUES.find((b) => normKey(b) === cKey);
  return mapped || candidate;
};

const extractMetaFromLine = (line, meta, fileName) => {
  if (line.startsWith("Categoría:") || line.startsWith("Categoria:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.categoryRaw = raw;
    meta.category = normalizeCategory(raw, fileName);
  }
  if (line.startsWith("Nivel:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.levelRaw = raw;
    meta.levelNorm = normalizeLevel(raw);
  }
  if (line.startsWith("Horario:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.scheduleRaw = raw;
    meta.scheduleBlock = normalizeHorario(raw);
  }
};

const parseStudentLine = (line, meta) => {
  // Compactar espacios
  const s = (line || "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Quitar header típico
  const up = s.toUpperCase();
  if (up.includes("APELLIDOS") && up.includes("EMAIL")) return null;

  // 1) ID: normalmente viene así: "1  33193783  APELLIDO ..."
  let id = "";
  const mId = s.match(/^\d+\s+(\d{4,12})\b/);
  if (mId) id = mId[1];
  else {
    const anyId = s.match(/\b\d{6,12}\b/);
    if (anyId) id = anyId[0];
  }
  if (!id) return null;

  // 2) Teléfono: último bloque numérico largo al final
  const mPhone = s.match(/(\+?\d[\d\s-]{6,}\d)\s*$/);
  const phoneRaw = mPhone ? mPhone[1] : "";
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") : "";

  // 3) Email: opcional (si existe, lo guardamos; si es malo, no bloquea parsing)
  const mEmail = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = mEmail ? mEmail[0] : "";

  // 4) Nombre: lo que queda tras remover índice, id, email, teléfono
  let namePart = s.replace(/^\d+\s+/, "");       // quita índice
  namePart = namePart.replace(id, "").trim();   // quita cédula
  if (email) namePart = namePart.replace(email, "").trim();
  if (phoneRaw) namePart = namePart.replace(phoneRaw, "").trim();
  const name = namePart.replace(/\s{2,}/g, " ").trim();

  if (!name) return null;

  return {
    id,
    name,
    email,
    phone,
    category: meta.category || "Otra",
    categoryRaw: meta.categoryRaw || "",
    level: meta.levelRaw || "N/A",
    levelNorm: meta.levelNorm || "N/A",
    schedule: meta.scheduleRaw || "N/A",
    scheduleBlock: meta.scheduleBlock || "N/A",
  };
};

export async function parseCevazPdf(file) {
  const text = await extractTextFromPdf(file);

  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meta = {
    categoryRaw: "",
    category: normalizeCategory("", file?.name),
    levelRaw: "",
    levelNorm: "",
    scheduleRaw: "",
    scheduleBlock: "",
  };

  const students = [];

  for (const line of lines) {
    extractMetaFromLine(line, meta, file?.name);

    const st = parseStudentLine(line, meta);
    if (st && st.id) students.push(st);
  }

  return students;
}

export const __HORARIO_BLOQUES__ = HORARIO_BLOQUES;
