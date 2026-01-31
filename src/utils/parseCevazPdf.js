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

  const afterSlash = raw.includes("/") ? raw.split("/").pop().trim() : raw.trim();
  const cleaned = afterSlash.replace(/\s+/g, " ").trim();

  const m = cleaned.match(
    /(\d{1,2}:\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2}:\d{2})\s*(AM|PM)/i
  );

  if (!m) {
    const k = normKey(cleaned);
    const exact = HORARIO_BLOQUES.find((b) => normKey(b) === k);
    return exact || cleaned;
  }

  const start = m[1];
  const startMer = (m[2] || m[4]).toUpperCase();
  const end = m[3];
  const endMer = m[4].toUpperCase();

  const candidate = `${start} ${startMer} - ${end} ${endMer}`;
  const mapped = HORARIO_BLOQUES.find((b) => normKey(b) === normKey(candidate));
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

// Extrae una cédula robusta (acepta puntos/guiones y la normaliza a dígitos)
const extractCedula = (text) => {
  // Busca un bloque tipo "33.374.557" o "33374557" o "33-374-557"
  const m = text.match(/\b\d[\d.\s-]{3,}\d\b/);
  if (!m) return "";
  const digits = m[0].replace(/[^\d]/g, "");
  if (digits.length < 4 || digits.length > 12) return "";
  return digits;
};

const parseStudentLine = (line, meta) => {
  const s = (line || "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  const up = s.toUpperCase();
  if (up.includes("APELLIDOS") && up.includes("EMAIL")) return null;

  const id = extractCedula(s);
  if (!id) return null;

  // Teléfono: tomar el último bloque numérico largo (opcional)
  const mPhone = s.match(/(\+?\d[\d\s-]{6,}\d)(?!.*\d)/);
  const phoneRaw = mPhone ? mPhone[1] : "";
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") : "";

  // Email: opcional; si está mal escrito no bloquea nada
  const mEmail = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = mEmail ? mEmail[0] : "";

  // Nombre: remover índice, cédula, email, teléfono
  let namePart = s;

  // Quita índice inicial "1 " si existe
  namePart = namePart.replace(/^\d+\s+/, "");

  // Quita la cédula (como dígitos o con puntos)
  // Quitamos ambos: digits y la versión con separadores si coincide
  namePart = namePart.replace(id, "").trim();

  if (email) namePart = namePart.replace(email, "").trim();
  if (phoneRaw) namePart = namePart.replace(phoneRaw, "").trim();

  // Quita basura doble-espacio
  const name = namePart.replace(/\s{2,}/g, " ").trim();
  if (!name) return null;

  return {
    id,
    name,
    email,
    phone,
    category: meta.category || "Otra",
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
