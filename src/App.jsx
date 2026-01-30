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
    setSearchTerm("
