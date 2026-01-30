const inferShift = (schedule = "") => {
  const s = schedule.toLowerCase();
  if (s.includes("8:30") || s.includes("10:30") || s.includes("am")) return "Mañana";
  if (s.includes("1:00") || s.includes("2:30")) return "Tarde";
  if (s.includes("4:30")) return "Vespertino";
  if (s.includes("6:15") || s.includes("pm")) return "Noche";
  return "Otro";
};

export function parseCevazListFromPdfText(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentLevel = "N/A";
  let currentSchedule = "N/A";
  const students = [];
  const seen = new Set();

  for (const line of lines) {
    if (/^Nivel:/i.test(line)) {
      currentLevel = line.split(":").slice(1).join(":").trim();
      continue;
    }
    if (/^Horario:/i.test(line)) {
      currentSchedule = line.split(":").slice(1).join(":").trim();
      continue;
    }

    const tokens = line.split(/\s+/);
    if (tokens.length < 4) continue;

    const maybeRow = tokens[0];
    const maybeId = tokens[1];
    if (!/^\d+$/.test(maybeRow)) continue;
    if (!/^\d{6,}$/.test(maybeId)) continue;

    const id = maybeId;

    let phone = tokens.at(-1);
    let cut = 2;
    if (tokens.length >= 2 && (tokens.at(-2) === "+58" || tokens.at(-2)?.startsWith("+"))) {
      phone = `${tokens.at(-2)} ${tokens.at(-1)}`.trim();
      cut = 3;
    }

    let email = "";
    let nameEndIndex = tokens.length - (cut - 1);
    const maybeEmail = tokens[nameEndIndex - 1];
    if (maybeEmail && (maybeEmail.includes("@") || maybeEmail === "-")) {
      email = maybeEmail === "-" ? "" : maybeEmail;
      nameEndIndex -= 1;
    }

    const name = tokens.slice(2, nameEndIndex).join(" ").trim();
    if (!name) continue;

    if (seen.has(id)) continue;
    seen.add(id);

    students.push({
      id,
      name,
      level: currentLevel,
      schedule: currentSchedule,
      shift: inferShift(currentSchedule),
      email,
      phone,
    });
  }

  return students;
}
