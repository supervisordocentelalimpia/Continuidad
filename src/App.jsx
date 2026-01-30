import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Search,
  Users,
  Clock,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
  Filter,
  Phone,
  Upload,
  FileText,
  RefreshCw,
  ChevronRight,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";

import * as XLSX from "xlsx";
import { extractTextFromPdfFile } from "./utils/pdfText";
import { parseCevazListFromPdfText } from "./utils/parseCevazPdf";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function normalizeLevel(level = "") {
  return String(level).replace(/(LEVEL|NIVEL)\s+/i, "L").trim() || "N/A";
}

function isGraduated(level = "") {
  // Excluye Level 19 / Nivel 19
  const up = String(level).toUpperCase();
  return up.includes("19");
}

function csvEscape(value) {
  const s = String(value ?? "");
  // Escapar comillas
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeTab, setActiveTab] = useState("upload"); // upload | dashboard

  const [oldPdf, setOldPdf] = useState(null);
  const [newPdf, setNewPdf] = useState(null);

  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [processedDropouts, setProcessedDropouts] = useState([]);
  const [stats, setStats] = useState({
    totalOld: 0,
    totalNew: 0,
    retentionRate: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShift, setSelectedShift] = useState("All");
  const [contacted, setContacted] = useState(new Set());

  const [periodLabel, setPeriodLabel] = useState("");

  async function processPdfs() {
    setErrorMsg("");
    if (!oldPdf || !newPdf) {
      setErrorMsg("Debes seleccionar el PDF viejo (Anterior) y el PDF nuevo (Actual).");
      return;
    }

    setProcessing(true);
    try {
      // 1) Extraer texto
      const oldText = await extractTextFromPdfFile(oldPdf);
      const newText = await extractTextFromPdfFile(newPdf);

      // 2) Parsear texto a listas
      const oldList = parseCevazListFromPdfText(oldText);
      const newList = parseCevazListFromPdfText(newText);

      if (!oldList.length) {
        setErrorMsg(
          "No pude leer alumnos del PDF ANTERIOR. Si el PDF está escaneado (imagen), no se puede extraer texto."
        );
      }
      if (!newList.length) {
        setErrorMsg(
          "No pude leer alumnos del PDF ACTUAL. Si el PDF está escaneado (imagen), no se puede extraer texto."
        );
      }

      const newIds = new Set(newList.map((s) => s.id));

      // 3) Dropouts = estaban antes y no están ahora, excluyendo graduados
      const dropouts = oldList.filter((s) => {
        const reenrolled = newIds.has(s.id);
        return !reenrolled && !isGraduated(s.level);
      });

      const retentionRate = oldList.length
        ? Math.round(((oldList.length - dropouts.length) / oldList.length) * 100)
        : 0;

      setStats({
        totalOld: oldList.length,
        totalNew: newList.length,
        retentionRate,
      });

      setProcessedDropouts(dropouts);
      setContacted(new Set());
      setSearchTerm("");
      setSelectedShift("All");
      setPeriodLabel(`Comparación: ${oldPdf.name} → ${newPdf.name}`);

      setActiveTab("dashboard");
    } catch (e) {
      setErrorMsg(
        `Error procesando PDFs. Si el PDF está escaneado (imagen) no se puede leer. Detalle: ${e?.message || e}`
      );
    } finally {
      setProcessing(false);
    }
  }

  function clearAll() {
    setOldPdf(null);
    setNewPdf(null);
    setProcessedDropouts([]);
    setStats({ totalOld: 0, totalNew: 0, retentionRate: 0 });
    setContacted(new Set());
    setSearchTerm("");
    setSelectedShift("All");
    setErrorMsg("");
    setPeriodLabel("");
    setActiveTab("upload");
  }

  const metrics = useMemo(() => {
    const totalDropouts = processedDropouts.length;

    const byShift = processedDropouts.reduce((acc, cur) => {
      const key = cur.shift || "Otro";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byLevel = processedDropouts.reduce((acc, cur) => {
      const lvl = normalizeLevel(cur.level);
      acc[lvl] = (acc[lvl] || 0) + 1;
      return acc;
    }, {});

    const chartDataLevel = Object.keys(byLevel)
      .map((k) => ({ name: k, count: byLevel[k] }))
      .sort((a, b) => {
        const na = parseInt(a.name.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.name.replace(/\D/g, "")) || 0;
        return na - nb;
      });

    const chartDataShift = Object.keys(byShift).map((k) => ({
      name: k,
      value: byShift[k],
    }));

    const worstShift =
      chartDataShift.sort((a, b) => b.value - a.value)[0]?.name || "N/A";

    return { totalDropouts, chartDataLevel, chartDataShift, worstShift };
  }, [processedDropouts]);

  const filteredData = useMemo(() => {
    return processedDropouts.filter((s) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        (s.name || "").toLowerCase().includes(term) ||
        String(s.id || "").includes(term);

      const matchesShift =
        selectedShift === "All" || (s.shift || "Otro") === selectedShift;

      return matchesSearch && matchesShift;
    });
  }, [processedDropouts, searchTerm, selectedShift]);

  function toggleContact(id) {
    setContacted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsvExcelFriendly() {
    // CSV “friendly” para Excel en español (usa ; y BOM UTF-8)
    const headers = ["ID", "Nombre", "Nivel(Anterior)", "Horario(Anterior)", "Turno", "Estado"];
    const rows = filteredData.map((s) => [
      s.id,
      s.name,
      s.level,
      s.schedule,
      s.shift,
      contacted.has(s.id) ? "Contactado" : "Pendiente",
    ]);

    const delimiter = ";";
    const lines = [
      headers.map(csvEscape).join(delimiter),
      ...rows.map((r) => r.map(csvEscape).join(delimiter)),
    ];

    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "reporte_continuidad.csv");
  }

  function exportXlsx() {
    const headers = ["ID", "Nombre", "Nivel (Anterior)", "Horario (Anterior)", "Turno", "Estado"];
    const rows = filteredData.map((s) => [
      s.id,
      s.name,
      s.level,
      s.schedule,
      s.shift,
      contacted.has(s.id) ? "Contactado" : "Pendiente",
    ]);

    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NoInscritos");

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, "reporte_continuidad.xlsx");
  }

  // ------------------- UI: UPLOAD -------------------
  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Continuidad - Cargar PDFs
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Los PDFs se procesan localmente en tu navegador. <span className="font-semibold">No se guardan en GitHub</span>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PDF viejo */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ANTERIOR
              </span>
              <button
                className="text-slate-400 hover:text-slate-600 text-sm flex items-center gap-1"
                onClick={() => setOldPdf(null)}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setOldPdf(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              Seleccionado: <span className="font-medium">{oldPdf?.name || "—"}</span>
            </p>
          </div>

          {/* PDF nuevo */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ACTUAL
              </span>
              <button
                className="text-slate-400 hover:text-slate-600 text-sm flex items-center gap-1"
                onClick={() => setNewPdf(null)}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setNewPdf(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              Seleccionado: <span className="font-medium">{newPdf?.name || "—"}</span>
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={processPdfs}
            disabled={processing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2"
          >
            <RefreshCw className={`h-5 w-5 ${processing ? "animate-spin" : ""}`} />
            {processing ? "Procesando..." : "Procesar y Comparar"}
          </button>

          <button
            onClick={clearAll}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
          >
            <Trash2 className="h-5 w-5" />
            Limpiar todo
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Si el PDF está escaneado (imagen), el sistema no puede leer alumnos porque no hay texto.
        </p>
      </div>
    );
  }

  // ------------------- UI: DASHBOARD -------------------
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-800">
      {/* HEADER */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Dashboard de Continuidad
          </h1>

          <p className="text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
              Base: {stats.totalOld} alumnos
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
              Tasa Retención: {stats.retentionRate}%
            </span>
            {periodLabel ? (
              <span className="text-xs text-slate-400">{periodLabel}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Cambiar PDFs
          </button>

          <button
            onClick={exportXlsx}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg shadow"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </button>

          <button
            onClick={exportCsvExcelFriendly}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg shadow"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>

          <button
            onClick={clearAll}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            Borrar
          </button>
        </div>
      </header>

      {/* METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">No Inscritos</p>
              <h3 className="text-4xl font-bold text-slate-800">{metrics.totalDropouts}</h3>
            </div>
            <AlertTriangle className="h-10 w-10 text-red-100" />
          </div>
          <p className="text-xs text-red-500 mt-2 font-medium">Excluye graduados (L19)</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Acción Requerida</p>
              <h3 className="text-xl font-bold text-slate-800">
                {Math.max(metrics.totalDropouts - contacted.size, 0)}
              </h3>
            </div>
            <Phone className="h-10 w-10 text-blue-100" />
          </div>
          <p className="text-xs text-slate-400 mt-2">Pendientes por llamar</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Gestión Realizada</p>
              <h3 className="text-4xl font-bold text-slate-800">
                {metrics.totalDropouts > 0
                  ? Math.round((contacted.size / metrics.totalDropouts) * 100)
                  : 0}
                %
              </h3>
            </div>
            <CheckCircle className="h-10 w-10 text-emerald-100" />
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            {contacted.size} contactados
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Turno con más fugas</p>
              <h3 className="text-lg font-bold text-slate-800 truncate">{metrics.worstShift}</h3>
            </div>
            <Clock className="h-10 w-10 text-indigo-100" />
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">Prioriza ese horario</p>
        </div>
      </div>

      {/* CHARTS */}
      {metrics.totalDropouts > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Fugas por Nivel</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartDataLevel}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="Estudiantes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Deserción por Turno</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.chartDataShift}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {metrics.chartDataShift.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center mb-8">
          <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700">No hay datos para mostrar</h3>
          <p className="text-slate-500 mb-4">Carga PDFs para comenzar.</p>
          <button onClick={() => setActiveTab("upload")} className="text-blue-600 font-semibold hover:underline">
            Ir a Cargar PDFs
          </button>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-lg font-bold text-slate-800">Lista de Gestión (CRM)</h3>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-44"
              >
                <option value="All">Todos los Turnos</option>
                <option value="Mañana">Mañana</option>
                <option value="Tarde">Tarde</option>
                <option value="Vespertino">Vespertino</option>
                <option value="Noche">Noche</option>
                <option value="Otro">Otro</option>
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o cédula..."
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold border-b border-slate-100">Estado</th>
                <th className="p-4 font-semibold border-b border-slate-100">Estudiante</th>
                <th className="p-4 font-semibold border-b border-slate-100">Cédula</th>
                <th className="p-4 font-semibold border-b border-slate-100">Nivel (Anterior)</th>
                <th className="p-4 font-semibold border-b border-slate-100">Horario (Anterior)</th>
                <th className="p-4 font-semibold border-b border-slate-100 text-right">Acción</th>
              </tr>
            </thead>

            <tbody className="text-sm text-slate-700 divide-y divide-slate-50">
              {filteredData.length > 0 ? (
                filteredData.map((s) => {
                  const isDone = contacted.has(s.id);
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50 ${isDone ? "bg-emerald-50/30" : ""}`}>
                      <td className="p-4">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3" /> Contactado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3" /> Pendiente
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-medium text-slate-900">{s.name}</td>
                      <td className="p-4 font-mono text-xs">{s.id}</td>

                      <td className="p-4">
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                          {s.level}
                        </span>
                      </td>

                      <td className="p-4 text-slate-500">{s.schedule}</td>

                      <td className="p-4 text-right">
                        <button
                          onClick={() => toggleContact(s.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            isDone
                              ? "bg-slate-200 text-slate-500 hover:bg-slate-300"
                              : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                          }`}
                          title={isDone ? "Marcar como pendiente" : "Marcar como contactado"}
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    No se encontraron estudiantes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>
            Mostrando {filteredData.length} de {metrics.totalDropouts} estudiantes detectados
          </span>
          <span>Continuidad CEVAZ v1.0</span>
        </div>
      </div>
    </div>
  );
}
