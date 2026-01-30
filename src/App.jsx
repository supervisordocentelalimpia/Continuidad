import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Search, Users, Clock, AlertTriangle, Download,
  CheckCircle, XCircle, Filter, Phone, Upload,
  FileText, RefreshCw, ChevronRight, Trash2
} from "lucide-react";

import { extractTextFromPdfFile } from "./utils/pdfText";
import { parseCevazListFromPdfText } from "./utils/parseCevazPdf";

export default function App() {
  const [activeTab, setActiveTab] = useState("upload"); // upload | dashboard

  const [oldPdfFile, setOldPdfFile] = useState(null);
  const [newPdfFile, setNewPdfFile] = useState(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const [processedDropouts, setProcessedDropouts] = useState([]);
  const [stats, setStats] = useState({ totalOld: 0, totalNew: 0, retentionRate: 0 });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShift, setSelectedShift] = useState("All");
  const [contacted, setContacted] = useState(() => new Set());

  const clearResults = () => {
    setProcessedDropouts([]);
    setStats({ totalOld: 0, totalNew: 0, retentionRate: 0 });
    setSearchTerm("");
    setSelectedShift("All");
    setContacted(new Set());
  };

  const removeOldPdf = () => {
    setOldPdfFile(null);
    setError("");
    clearResults();
    setActiveTab("upload");
  };

  const removeNewPdf = () => {
    setNewPdfFile(null);
    setError("");
    clearResults();
    setActiveTab("upload");
  };

  const clearAll = () => {
    setOldPdfFile(null);
    setNewPdfFile(null);
    setError("");
    clearResults();
    setActiveTab("upload");
  };

  const processPdfData = async () => {
    setError("");
    if (!oldPdfFile || !newPdfFile) {
      setError("Sube ambos PDFs (viejo y nuevo).");
      return;
    }

    setIsProcessing(true);
    try {
      const [oldText, newText] = await Promise.all([
        extractTextFromPdfFile(oldPdfFile),
        extractTextFromPdfFile(newPdfFile),
      ]);

      const oldList = parseCevazListFromPdfText(oldText);
      const newList = parseCevazListFromPdfText(newText);

      if (!oldList.length || !newList.length) {
        setError("No pude leer alumnos. Posible PDF escaneado o formato distinto.");
        return;
      }

      const newIds = new Set(newList.map((s) => s.id));

      const dropouts = oldList.filter((s) => {
        const isGraduated = (s.level || "").toUpperCase().includes("19");
        const isReenrolled = newIds.has(s.id);
        return !isReenrolled && !isGraduated;
      });

      setStats({
        totalOld: oldList.length,
        totalNew: newList.length,
        retentionRate: oldList.length
          ? Math.round(((oldList.length - dropouts.length) / oldList.length) * 100)
          : 0,
      });

      setProcessedDropouts(dropouts);
      setContacted(new Set());
      setActiveTab("dashboard");
    } catch {
      setError("Error procesando PDFs. Intenta de nuevo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const metrics = useMemo(() => {
    const totalDropouts = processedDropouts.length;

    const byShift = processedDropouts.reduce((acc, curr) => {
      acc[curr.shift] = (acc[curr.shift] || 0) + 1;
      return acc;
    }, {});

    const byLevel = processedDropouts.reduce((acc, curr) => {
      const lvl = (curr.level || "N/A").replace(/(LEVEL|NIVEL)\s+/i, "L");
      acc[lvl] = (acc[lvl] || 0) + 1;
      return acc;
    }, {});

    const chartDataLevel = Object.keys(byLevel)
      .map((k) => ({ name: k, count: byLevel[k] }))
      .sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.name.replace(/\D/g, "")) || 0;
        return numA - numB;
      });

    const chartDataShift = Object.keys(byShift).map((k) => ({ name: k, value: byShift[k] }));

    return { totalDropouts, chartDataLevel, chartDataShift };
  }, [processedDropouts]);

  const filteredData = useMemo(() => {
    return processedDropouts.filter((student) => {
      const matchesSearch =
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.id.includes(searchTerm);

      const matchesShift = selectedShift === "All" || student.shift === selectedShift;
      return matchesSearch && matchesShift;
    });
  }, [processedDropouts, searchTerm, selectedShift]);

  const toggleContact = (id) => {
    const next = new Set(contacted);
    next.has(id) ? next.delete(id) : next.add(id);
    setContacted(next);
  };

  const exportCSV = () => {
    const headers = "ID,Nombre,Nivel(Anterior),Horario(Anterior),Turno,Email,Telefono,Estado\n";
    const rows = filteredData
      .map((s) =>
        `${s.id},"${(s.name || "").replace(/"/g, '""')}",` +
        `"${(s.level || "").replace(/"/g, '""')}","${(s.schedule || "").replace(/"/g, '""')}",` +
        `"${s.shift}","${s.email || ""}","${s.phone || ""}",` +
        `${contacted.has(s.id) ? "Contactado" : "Pendiente"}`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "reporte_continuidad.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Continuidad - Cargar PDFs
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Los PDFs se procesan localmente en tu navegador. No se guardan en GitHub.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">
                  Periodo ANTERIOR
                </span>
                <span className="text-sm font-medium text-slate-700">PDF viejo</span>
              </div>
              {oldPdfFile && (
                <button
                  onClick={removeOldPdf}
                  className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm"
                  title="Eliminar PDF viejo"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              )}
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => { setOldPdfFile(e.target.files?.[0] ?? null); setError(""); clearResults(); }}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0 file:text-sm file:font-semibold
                         file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="text-xs text-slate-500 mt-2">
              {oldPdfFile ? `Seleccionado: ${oldPdfFile.name}` : "Ningún PDF seleccionado"}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                  Periodo ACTUAL
                </span>
                <span className="text-sm font-medium text-slate-700">PDF nuevo</span>
              </div>
              {newPdfFile && (
                <button
                  onClick={removeNewPdf}
                  className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm"
                  title="Eliminar PDF nuevo"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              )}
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => { setNewPdfFile(e.target.files?.[0] ?? null); setError(""); clearResults(); }}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0 file:text-sm file:font-semibold
                         file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="text-xs text-slate-500 mt-2">
              {newPdfFile ? `Seleccionado: ${newPdfFile.name}` : "Ningún PDF seleccionado"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={processPdfData}
            disabled={!oldPdfFile || !newPdfFile || isProcessing}
            className="bg-blue-600 disabled:bg-slate-300 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-sm flex items-center gap-2"
          >
            <RefreshCw className={`h-5 w-5 ${isProcessing ? "animate-spin" : ""}`} />
            {isProcessing ? "Procesando..." : "Procesar y Comparar"}
          </button>

          <button
            onClick={clearAll}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
          >
            <Trash2 className="h-5 w-5" />
            Limpiar todo
          </button>
        </div>

        <div className="mt-10 text-xs text-slate-500">
          Si el PDF está escaneado (imagen), el sistema no podrá leer los alumnos.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Dashboard de Continuidad
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
              Base: {stats.totalOld} alumnos
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
              Tasa Retención: {stats.retentionRate}%
            </span>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Cambiar PDFs
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow"
            disabled={filteredData.length === 0}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>

          <button
            onClick={clearAll}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
            title="Borra PDFs y resultados"
          >
            <Trash2 className="h-4 w-4" />
            Borrar
          </button>
        </div>
      </header>

      {/* Si quieres, aquí luego metemos gráficos + tabla completos.
          Por ahora ya tienes la carga, procesamiento, export y borrado.
          Si ya te corre, en el siguiente paso te paso el dashboard completo (gráficas y tabla). */}
      <div className="bg-white p-6 rounded-xl border border-slate-100">
        <p className="text-slate-700">
          Listo: ya se procesaron <b>{processedDropouts.length}</b> no inscritos.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Ahora dime si ya ves el sitio publicado, y en el siguiente mensaje te pego la sección completa de gráficos y tabla (sin recortar).
        </p>
      </div>
    </div>
  );
}
