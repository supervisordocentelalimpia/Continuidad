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

  // si viene con días tipo: "TUESDAY TO FRIDAY / 8:30 A 10:00 AM"
  const afterSlash = raw.includes("/") ? raw.split("/").pop().trim() : raw.trim();

  // Intentar capturar: 8:30 A 10:00 AM  |  8:00 AM - 10:40 AM
  const m = afterSlash.match(
    /(\d{1,2}:\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2}:\d{2})\s*(AM|PM)/i
  );

  if (!m) {
    // fallback: si coincide exacto con alguno
    const k = normKey(afterSlash);
    const exact = HORARIO_BLOQUES.find((b) => normKey(b) === k);
    return exact || afterSlash;
  }

  const start = m[1];
  const startMer = (m[2] || m[4]).toUpperCase(); // si no trae AM/PM al inicio, asumir el del final
  const end = m[3];
  const endMer = m[4].toUpperCase();

  const candidate = `${start} ${startMer} - ${end} ${endMer}`;

  // mapear al bloque “oficial” si existe
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
  // Buscar email
  const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!emailMatch) return null;
  const email = emailMatch[0];
  const emailIdx = emailMatch.index ?? -1;

  const beforeEmail = line.slice(0, emailIdx).trim();
  const afterEmail = line.slice(emailIdx + email.length).trim();

  // Teléfono: tomar cualquier cosa numérica “larga”
  const phoneMatch = afterEmail.match(/(\+?\d[\d\s-]{6,}\d)/);
  const phoneRaw = phoneMatch ? phoneMatch[0] : "";
  const phone = phoneRaw.replace(/[^\d+]/g, "");

  // ID: primer número largo (>=4) antes del email
  const idMatch = beforeEmail.match(/\b\d{4,12}\b/);
  if (!idMatch) return null;
  const id = idMatch[0];

  // Nombre: quitar índice y cédula del inicio, quedarnos con texto restante
  const withoutIdx = beforeEmail.replace(/^\d+\s+/, ""); // quita el "#"
  const withoutId = withoutIdx.replace(new RegExp(`\\b${id}\\b`), "").trim();
  const name = withoutId.replace(/\s{2,}/g, " ").trim();

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

    // Cabecera de columnas suele ser: "#  ID.  APELLIDOS NOMBRES EMAIL TELEFONO"
    if (line.toUpperCase().includes("APELLIDOS") && line.toUpperCase().includes("EMAIL")) continue;

    // Intentar leer alumno
    const s = parseStudentLine(line, meta);
    if (s && s.id) students.push(s);
  }

  return students;
}

export const __HORARIO_BLOQUES__ = HORARIO_BLOQUES;
