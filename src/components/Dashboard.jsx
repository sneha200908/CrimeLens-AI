import { useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle,
  Clock,
  FileText,
  Filter,
  MapPin,
  Moon,
  RadioTower,
  Route,
  Scale,
  Shield,
  Sun,
  Target,
  Upload,
} from "lucide-react";
import { crimeData } from "../data/crimeData";
import CrimeMap from "./CrimeMap";

function countByField(data, field) {
  const counts = {};

  data.forEach((item) => {
    counts[item[field]] = (counts[item[field]] || 0) + item.totalCrimes;
  });

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function getTopValue(data, field) {
  return countByField(data, field).sort((a, b) => b.value - a.value)[0]?.name || "N/A";
}

function getCategoryGroup(crimeType = "") {
  const text = crimeType.toLowerCase();
  if (text.includes("cyber")) return "Cyber Crime Division";
  if (text.includes("suicide") || text.includes("accidental") || text.includes("drowning") || text.includes("hanging")) return "Suicides and Accidental Deaths";
  if (text.includes("child") || text.includes("juvenile")) return "Crimes Against Children";
  if (text.includes("rape") || text.includes("women") || text.includes("dowry") || text.includes("modesty") || text.includes("husband")) return "Crimes Against Women";
  if (text.includes("murder") || text.includes("robbery") || text.includes("dacoity")) return "Violent Crimes";
  if (text.includes("theft") || text.includes("burglary") || text.includes("snatching")) return "Property Crimes";
  if (text.includes("sll")) return "SLL Crimes";
  if (text.includes("ipc") || text.includes("bns")) return "IPC/BNS Crimes";
  return "Other Crime Records";
}

function getMonthlyData(data) {
  const total = data.reduce((sum, crime) => sum + (crime.totalCrimes || 0), 0);

  return [
    { month: "Jan", cases: Math.round(total * 0.1) },
    { month: "Feb", cases: Math.round(total * 0.11) },
    { month: "Mar", cases: Math.round(total * 0.12) },
    { month: "Apr", cases: Math.round(total * 0.13) },
    { month: "May", cases: Math.round(total * 0.15) },
    { month: "Jun", cases: Math.round(total * 0.18) },
    { month: "Jul", cases: Math.round(total * 0.21) },
  ];
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function getHour(time) {
  return Number.parseInt(time?.split(":")[0] || "0", 10);
}

function getSeverityScore(severity) {
  if (severity === "High") return 28;
  if (severity === "Medium") return 17;
  return 8;
}

function getStatusScore(status) {
  if (status === "Under Investigation") return 16;
  if (status === "Pending") return 13;
  return 4;
}

function getRiskScore(crime, maxCrimes) {
  const volumeScore = Math.round(((crime.totalCrimes || 0) / maxCrimes) * 42);
  const hour = getHour(crime.time);
  const nightScore = hour >= 18 || hour <= 5 ? 14 : hour >= 12 ? 7 : 3;

  return Math.min(100, volumeScore + getSeverityScore(crime.severity) + getStatusScore(crime.status) + nightScore);
}

function getRiskLevel(score) {
  if (score >= 80) return "Critical";
  if (score >= 62) return "High";
  if (score >= 42) return "Moderate";
  return "Watch";
}

function getPatrolWindow(time) {
  const hour = getHour(time);
  if (hour >= 18 || hour <= 5) return "7 PM - 11 PM";
  if (hour >= 12) return "2 PM - 6 PM";
  return "8 AM - 12 PM";
}

function getAreaProfiles(data) {
  const groups = new Map();

  data.forEach((crime) => {
    const current = groups.get(crime.area) || {
      name: crime.area,
      total: 0,
      highCases: 0,
      unresolvedCases: 0,
      eveningCases: 0,
      riskTotal: 0,
      records: 0,
      categories: {},
      latitude: crime.latitude,
      longitude: crime.longitude,
      patrolWindow: getPatrolWindow(crime.time),
    };

    current.total += crime.totalCrimes || 0;
    current.highCases += crime.severity === "High" ? crime.totalCrimes || 0 : 0;
    current.unresolvedCases += crime.status === "Solved" ? 0 : crime.totalCrimes || 0;
    current.eveningCases += getHour(crime.time) >= 18 ? crime.totalCrimes || 0 : 0;
    current.riskTotal += crime.riskScore || 0;
    current.records += 1;
    const category = crime.categoryGroup || getCategoryGroup(crime.crimeType);
    current.categories[category] = (current.categories[category] || 0) + (crime.totalCrimes || 0);
    groups.set(crime.area, current);
  });

  return [...groups.values()]
    .map((area) => {
      const topCategory = Object.entries(area.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
      const riskScore = Math.round(area.riskTotal / area.records);
      const reasons = [
        `${formatNumber(area.total)} total reported crimes`,
        `${formatNumber(area.unresolvedCases)} pending or active-investigation crimes`,
        `${topCategory} is the dominant crime category`,
      ];

      if (area.highCases > 0) {
        reasons.push(`${formatNumber(area.highCases)} high-severity crimes need senior review`);
      }

      return {
        ...area,
        topCategory,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        reasons,
        recommendation: `Deploy visible patrols around ${area.patrolWindow} and fast-track ${topCategory} records.`,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.total - a.total);
}

function parseCsvRows(text) {
  return text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const values = [];
    let current = "";
    let quoted = false;

    for (const char of line) {
      if (char === "\"") quoted = !quoted;
      else if (char === "," && !quoted) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  });
}

function toNumber(value) {
  return Number(String(value || "").replaceAll(",", "")) || 0;
}

function normalizeHeader(header) {
  return header.trim().replace(/^\uFEFF/, "").toLowerCase().replaceAll("_", "").replaceAll(" ", "");
}

function readField(record, aliases) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (record[normalized] !== undefined && record[normalized] !== "") return record[normalized];
  }
  return "";
}

function inferTextField(record, headers) {
  const ignored = new Set(["id", "_id", "srno", "serialno", "year"]);
  for (const header of headers) {
    if (ignored.has(header)) continue;
    const value = record[header];
    if (value && Number.isNaN(Number(value.replaceAll(",", "")))) return value;
  }
  return "Uploaded Crime";
}

function inferNumericField(record, headers) {
  const ignored = new Set(["id", "_id", "srno", "serialno", "year", "latitude", "longitude", "lat", "lng", "lon"]);
  const numericValues = headers
    .filter((header) => !ignored.has(header))
    .map((header) => toNumber(record[header]))
    .filter((value) => value > 0);

  return numericValues.at(-1) || Math.max(0, ...numericValues);
}

function getUploadedStatus(reported, detected, underInvestigation) {
  if (underInvestigation > 0 || detected < reported * 0.6) return "Under Investigation";
  if (detected > 0 && detected < reported) return "Pending";
  return "Solved";
}

function getUploadedSeverity(total, label = "") {
  const text = label.toLowerCase();
  if (text.includes("murder") || text.includes("rape") || text.includes("dowry death") || total >= 1500) return "High";
  if (text.includes("robbery") || text.includes("dacoity") || text.includes("theft") || total >= 150) return "Medium";
  return "Low";
}

function normalizeUploadedCsv(text, fileName = "Uploaded CSV") {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  const records = [];

  rows.slice(1).forEach((values, rowIndex) => {
    const record = headers.reduce((current, header, headerIndex) => {
      current[header] = values[headerIndex] || "";
      return current;
    }, {});
    const label = readField(record, ["crimeType", "category", "typeOfCrime", "type of crime", "crime", "offence", "offense", "cause", "type"]) || inferTextField(record, headers);
    const area = readField(record, ["area", "unit", "division", "divisions", "district", "station", "policeStation", "location", "place"]) || "Uploaded Area";
    const years = headers.some((header) => header.includes("2021")) ? [2021, 2022, 2023] : [Number(readField(record, ["year"])) || 2025];

    years.forEach((year) => {
      const reported = toNumber(
        readField(record, [`${year}reported`]) ||
        (readField(record, [`${year}male`]) ? toNumber(readField(record, [`${year}male`])) + toNumber(readField(record, [`${year}female`])) : "") ||
        readField(record, ["totalCrimes", "total", "cases", "reported", "count", "crimes", "incidents"]) ||
        inferNumericField(record, headers),
      );
      const detected = toNumber(readField(record, [`${year}detected`, "detectedCrimes", "detected"]));
      const underInvestigation = toNumber(readField(record, [`${year}ui`, `${year}underInvestigation`, "underInvestigation"]));

      if (!reported) return;

      records.push({
        caseId: readField(record, ["caseId", "recordId"]) || `UPLOAD-${year}-${rowIndex + 1}`,
        crimeType: label,
        categoryGroup: readField(record, ["categoryGroup"]) || getCategoryGroup(label),
        district: readField(record, ["district"]) || "Uploaded Dataset",
        area,
        date: readField(record, ["date"]) || `${year}-12-31`,
        time: readField(record, ["time"]) || "19:30",
        latitude: Number(readField(record, ["latitude", "lat"])) || 12.9716 + rowIndex * 0.01,
        longitude: Number(readField(record, ["longitude", "lng", "lon"])) || 77.5946 + rowIndex * 0.01,
        severity: readField(record, ["severity"]) || getUploadedSeverity(reported, label),
        status: readField(record, ["status"]) || getUploadedStatus(reported, detected, underInvestigation),
        totalCrimes: reported,
        detectedCrimes: detected,
        underInvestigation,
        ipcBnsCrimes: toNumber(readField(record, ["ipcBnsCrimes"])) || (label.toLowerCase().includes("ipc") ? reported : 0),
        sllCrimes: toNumber(readField(record, ["sllCrimes"])) || (label.toLowerCase().includes("cyber") ? reported : 0),
        source: `${fileName} ${year}`,
      });
    });
  });

  return records;
}

function getPrediction(monthlyData) {
  const last = monthlyData.at(-1)?.cases || 0;
  const previous = monthlyData.at(-2)?.cases || last;
  const growth = Math.max(0, last - previous);
  return Math.round(last + growth * 0.8);
}

function getEmergencyPlan(topProfile, patrolUnits) {
  if (!topProfile) {
    return { level: "Standby", units: 0, investigators: 0, message: "Apply filters to generate emergency allocation." };
  }

  const extraUnits = topProfile.riskScore >= 80 ? 2 : topProfile.riskScore >= 62 ? 1 : 0;
  const investigators = topProfile.unresolvedCases > 10000 ? 4 : topProfile.unresolvedCases > 5000 ? 3 : 2;

  return {
    level: topProfile.riskLevel,
    units: patrolUnits + extraUnits,
    investigators,
    message: `Move ${patrolUnits + extraUnits} patrol units and ${investigators} investigation officers toward ${topProfile.name}.`,
  };
}

function getStoredUploadedCrimes() {
  if (typeof window === "undefined") return [];

  try {
    const savedRecords = window.localStorage.getItem("crimelens-uploaded-crimes");
    const parsed = savedRecords ? JSON.parse(savedRecords) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem("crimelens-uploaded-crimes");
    return [];
  }
}

function downloadCrimeDataFile(records) {
  const content = `export const crimeData = ${JSON.stringify(records, null, 2)};\n`;
  const blob = new Blob([content], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "crimeData.js";
  link.click();
  URL.revokeObjectURL(url);
}

function Dashboard() {
  const csvInputRef = useRef(null);
  const [showReport, setShowReport] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [patrolUnits, setPatrolUnits] = useState(3);
  const [shift, setShift] = useState("Night");
  const [uploadedCrimes, setUploadedCrimes] = useState(getStoredUploadedCrimes);
  const [uploadedFileNames, setUploadedFileNames] = useState([]);
  const [csvStatus, setCsvStatus] = useState(() => {
    const stored = getStoredUploadedCrimes();
    return stored.length ? `${stored.length} uploaded records restored` : "No uploaded CSV";
  });
  const [compareLeft, setCompareLeft] = useState("Bengaluru City");
  const [compareRight, setCompareRight] = useState("Karnataka State");
  const [filters, setFilters] = useState({
    search: "",
    area: "All",
    crimeType: "All",
    severity: "All",
    status: "All",
  });

  const baseCrimes = useMemo(() => [...crimeData, ...uploadedCrimes], [uploadedCrimes]);
  const maxCrimes = Math.max(...baseCrimes.map((crime) => crime.totalCrimes || 0));
  const intelligenceCrimes = useMemo(
    () => baseCrimes.map((crime) => ({
      ...crime,
      riskScore: getRiskScore(crime, maxCrimes),
      riskLevel: getRiskLevel(getRiskScore(crime, maxCrimes)),
      patrolWindow: getPatrolWindow(crime.time),
    })),
    [baseCrimes, maxCrimes],
  );

  const areas = ["All", ...new Set(intelligenceCrimes.map((crime) => crime.area))];
  const crimeTypes = ["All", ...new Set(intelligenceCrimes.map((crime) => crime.crimeType))];
  const severities = ["All", "High", "Medium", "Low"];
  const statuses = ["All", ...new Set(intelligenceCrimes.map((crime) => crime.status))];

  const filteredCrimes = useMemo(() => {
    const searchText = filters.search.toLowerCase();

    return intelligenceCrimes.filter((crime) => {
      return (
        (filters.search === "" ||
          crime.area.toLowerCase().includes(searchText) ||
          crime.crimeType.toLowerCase().includes(searchText) ||
          crime.district.toLowerCase().includes(searchText)) &&
        (filters.area === "All" || crime.area === filters.area) &&
        (filters.crimeType === "All" || crime.crimeType === filters.crimeType) &&
        (filters.severity === "All" || crime.severity === filters.severity) &&
        (filters.status === "All" || crime.status === filters.status)
      );
    });
  }, [filters, intelligenceCrimes]);

  const totalCases = filteredCrimes.reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const highSeverityCases = filteredCrimes
    .filter((crime) => crime.severity === "High")
    .reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const solvedCases = filteredCrimes
    .filter((crime) => crime.status === "Solved")
    .reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const activeCases = filteredCrimes
    .filter((crime) => crime.status !== "Solved")
    .reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const topArea = getTopValue(filteredCrimes, "area");
  const topCrimeType = getTopValue(filteredCrimes, "categoryGroup");

  const crimeTypeData = countByField(filteredCrimes, "categoryGroup")
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const areaData = countByField(filteredCrimes, "area")
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const monthlyData = getMonthlyData(filteredCrimes);
  const priorityCases = [...filteredCrimes].sort((a, b) => b.riskScore - a.riskScore).slice(0, 7);
  const areaProfiles = getAreaProfiles(filteredCrimes);
  const allAreaProfiles = getAreaProfiles(intelligenceCrimes);
  const riskRanking = areaProfiles.slice(0, 5);
  const topProfile = riskRanking[0];
  const clearanceRate = totalCases ? Math.round((solvedCases / totalCases) * 100) : 0;
  const nextMonthPrediction = getPrediction(monthlyData);
  const emergencyPlan = getEmergencyPlan(topProfile, patrolUnits);
  const compareLeftProfile = allAreaProfiles.find((area) => area.name === compareLeft) || allAreaProfiles[0];
  const compareRightProfile = allAreaProfiles.find((area) => area.name === compareRight) || allAreaProfiles[1] || allAreaProfiles[0];
  const averageRisk = filteredCrimes.length
    ? Math.round(filteredCrimes.reduce((sum, crime) => sum + crime.riskScore, 0) / filteredCrimes.length)
    : 0;
  const patrolPlan = areaProfiles.slice(0, patrolUnits);
  const totalSourceRecords = crimeData.length;
  const totalUploadedRecords = uploadedCrimes.length;
  const uploadedCases = uploadedCrimes.reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const uploadedHighSeverityCases = uploadedCrimes
    .filter((crime) => crime.severity === "High")
    .reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const uploadedSolvedCases = uploadedCrimes
    .filter((crime) => crime.status === "Solved")
    .reduce((sum, crime) => sum + crime.totalCrimes, 0);
  const uploadedClearanceRate = uploadedCases ? Math.round((uploadedSolvedCases / uploadedCases) * 100) : 0;
  const uploadedAverageRisk = uploadedCrimes.length
    ? Math.round(uploadedCrimes.reduce((sum, crime) => sum + getRiskScore(crime, maxCrimes), 0) / uploadedCrimes.length)
    : 0;

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function processCsvFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (!files.length) return;

    setCsvStatus(`Reading ${files.length} CSV file(s)...`);
    try {
      const parsedBatches = await Promise.all(
        files.map(async (file) => normalizeUploadedCsv(await file.text(), file.name.replace(/\.csv$/i, ""))),
      );
      const parsed = parsedBatches.flat().map((crime, index) => ({
        ...crime,
        caseId: crime.caseId.startsWith("UPLOAD") ? `UPLOAD-${String(index + 1).padStart(4, "0")}` : crime.caseId,
      }));

      setUploadedCrimes(parsed);
      setUploadedFileNames(files.map((file) => file.name));
      window.localStorage.setItem("crimelens-uploaded-crimes", JSON.stringify(parsed));
      setCsvStatus(parsed.length ? `${parsed.length} uploaded records converted from ${files.length} file(s)` : "CSV selected, but no readable crime records found");
    } catch {
      setCsvStatus("CSV upload failed. Check file format and try again.");
    }
  }

  async function handleCsvUpload(event) {
    await processCsvFiles(event.target.files);
    event.target.value = "";
  }

  function clearUploadedCsv() {
    setUploadedCrimes([]);
    setUploadedFileNames([]);
    setCsvStatus("No uploaded CSV");
    window.localStorage.removeItem("crimelens-uploaded-crimes");
  }

  return (
    <main className={`app-shell ${darkMode ? "dark-mode" : ""}`}>
      <section className="hero">
        <div>
          <p className="eyebrow">KSP Hackathon Prototype</p>
          <h1>CrimeLens AI</h1>
          <p className="hero-text">
            Advanced crime intelligence platform for hotspot mapping, explainable
            risk scoring, patrol planning, and command-center reporting.
          </p>
        </div>

        <div className="hero-badge">
          <Shield size={28} />
          <span>AI Crime Command Center</span>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><Activity className="stat-icon blue" /><p>Total Crimes</p><h2>{formatNumber(totalCases)}</h2></article>
        <article className="stat-card"><AlertTriangle className="stat-icon red" /><p>High Severity Crimes</p><h2>{formatNumber(highSeverityCases)}</h2></article>
        <article className="stat-card"><Target className="stat-icon amber" /><p>AI Risk Score</p><h2>{averageRisk}/100</h2></article>
        <article className="stat-card"><CheckCircle className="stat-icon green" /><p>Clearance Rate</p><h2>{clearanceRate}%</h2></article>
      </section>

      <section className="filter-panel">
        <div className="filter-title">
          <Filter size={18} />
          <strong>Smart Filters</strong>
        </div>

        <input
          className="search-input"
          type="text"
          placeholder="Search area, category, or district..."
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
        />

        <select value={filters.area} onChange={(event) => updateFilter("area", event.target.value)}>
          {areas.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>

        <select value={filters.crimeType} onChange={(event) => updateFilter("crimeType", event.target.value)}>
          {crimeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <select value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
          {severities.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
        </select>

        <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </section>

      <section className="source-panel">
        <div>
          <p className="eyebrow">Verified Dataset</p>
          <h3>Expanded Karnataka Crime Data 2021-2025</h3>
          <p>
            Statewide aggregate records and Bengaluru/KSP CSV tables are normalized into
            one crime intelligence schema for hotspot mapping and decision support.
          </p>
        </div>

        <div className="source-actions">
          <button type="button" className="mode-button" onClick={() => setDarkMode((current) => !current)}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? "Light Mode" : "Command Mode"}
          </button>
          <button type="button" className="report-button" onClick={() => setShowReport(!showReport)}>
            <FileText size={16} />
            {showReport ? "Hide Command Report" : "Generate Command Report"}
          </button>
        </div>
      </section>

      <section className="advanced-grid">
        <article className="advanced-card emergency-card">
          <div>
            <p className="eyebrow">Emergency Resource Allocation</p>
            <h3>{emergencyPlan.level} Response</h3>
          </div>
          <RadioTower size={24} />
          <p>{emergencyPlan.message}</p>
          <div className="resource-strip">
            <span>{emergencyPlan.units} patrol units</span>
            <span>{emergencyPlan.investigators} investigators</span>
            <span>{topProfile?.patrolWindow || "7 PM - 11 PM"}</span>
          </div>
        </article>

        <article className="advanced-card">
          <p className="eyebrow">Next Month Prediction</p>
          <h3>{formatNumber(nextMonthPrediction)} projected cases</h3>
          <p>Forecast uses recent month momentum from the selected dataset and applies a conservative trend continuation.</p>
        </article>

        <article className="advanced-card">
          <p className="eyebrow">Solved vs Pending</p>
          <h3>{clearanceRate}% clearance rate</h3>
          <div className="clearance-bar">
            <span style={{ width: `${clearanceRate}%` }} />
          </div>
          <p>{formatNumber(solvedCases)} solved against {formatNumber(activeCases)} active or pending cases.</p>
        </article>

        <article className="advanced-card upload-status-card">
          <p className="eyebrow">Data Integration</p>
          <h3>CSV ingestion ready</h3>
          <p>Upload files from the Data Pipeline panel below to convert records into the crimeData.js schema.</p>
        </article>
      </section>

      {showReport ? (
        <section className="report-panel">
          <div className="report-header">
            <div>
              <p className="eyebrow">Generated Report</p>
              <h3>Crime Intelligence Command Summary</h3>
            </div>
            <span>Auto-generated from selected filters</span>
          </div>

          <div className="report-grid">
            <article>
              <strong>Primary Hotspot</strong>
              <p>{topProfile?.name || topArea}</p>
            </article>
            <article>
              <strong>Risk Level</strong>
              <p>{topProfile?.riskLevel || "N/A"} - {topProfile?.riskScore || 0}/100</p>
            </article>
            <article>
              <strong>Dominant Category</strong>
              <p>{topProfile?.topCategory || topCrimeType}</p>
            </article>
            <article>
              <strong>Active Load</strong>
              <p>{formatNumber(activeCases)}</p>
            </article>
            <article>
              <strong>Clearance Rate</strong>
              <p>{clearanceRate}%</p>
            </article>
          </div>

          <div className="report-text">
            <strong>Executive action:</strong> {topProfile?.recommendation || "Apply selected filters to generate a focused patrol plan."}
          </div>

          <div className="report-list">
            {riskRanking.map((area, index) => (
              <span key={area.name}>{index + 1}. {area.name} - {area.riskScore}/100</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-grid">
        <article className="panel wide">
          <h3>Crime Hotspot Map</h3>
          <p>Risk-colored hotspot markers with operational popup intelligence</p>
          <CrimeMap crimes={filteredCrimes} />
        </article>

        <article className="panel">
          <h3>Area Risk Ranking</h3>
          <p>Explainable priority zones for preventive patrolling</p>
          <div className="risk-list">
            {riskRanking.map((item, index) => (
              <div className="risk-row" key={item.name}>
                <span>{index + 1}. {item.name}</span>
                <strong>{item.riskScore}/100</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel wide">
          <h3>District Comparison Lab</h3>
          <p>Compare two areas by risk, volume, unresolved load, and dominant category</p>
          <div className="compare-controls">
            <label>
              Area A
              <select value={compareLeftProfile?.name || ""} onChange={(event) => setCompareLeft(event.target.value)}>
                {allAreaProfiles.map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}
              </select>
            </label>
            <Scale size={24} />
            <label>
              Area B
              <select value={compareRightProfile?.name || ""} onChange={(event) => setCompareRight(event.target.value)}>
                {allAreaProfiles.map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}
              </select>
            </label>
          </div>
          <div className="compare-grid">
            {[compareLeftProfile, compareRightProfile].filter(Boolean).map((area) => (
              <article key={area.name}>
                <h4>{area.name}</h4>
                <dl>
                  <div><dt>Risk</dt><dd>{area.riskScore}/100</dd></div>
                  <div><dt>Total</dt><dd>{formatNumber(area.total)}</dd></div>
                  <div><dt>Active</dt><dd>{formatNumber(area.unresolvedCases)}</dd></div>
                  <div><dt>Top Category</dt><dd>{area.topCategory}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </article>

        <article className="panel wide">
          <h3>AI Risk Explanation</h3>
          <p>Why the current top hotspot needs command attention</p>
          {topProfile ? (
            <div className="explain-panel">
              <div className="risk-meter">
                <span>{topProfile.riskScore}</span>
                <small>{topProfile.riskLevel} Risk</small>
              </div>
              <div>
                <h4>{topProfile.name}</h4>
                <ul>
                  {topProfile.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                <p>{topProfile.recommendation}</p>
              </div>
            </div>
          ) : (
            <p>No records match the selected filters.</p>
          )}
        </article>

        <article className="panel">
          <h3>Patrol Route Planner</h3>
          <p>Generate a shift-wise deployment plan from risk-ranked zones</p>
          <div className="planner-controls">
            <label>
              Shift
              <select value={shift} onChange={(event) => setShift(event.target.value)}>
                <option>Morning</option>
                <option>Evening</option>
                <option>Night</option>
              </select>
            </label>
            <label>
              Patrol Units
              <select value={patrolUnits} onChange={(event) => setPatrolUnits(Number(event.target.value))}>
                <option value={2}>2 units</option>
                <option value={3}>3 units</option>
                <option value={4}>4 units</option>
                <option value={5}>5 units</option>
              </select>
            </label>
          </div>
          <div className="patrol-list">
            {patrolPlan.map((area, index) => (
              <article key={area.name}>
                <Route size={16} />
                <div>
                  <strong>Unit {index + 1}: {area.name}</strong>
                  <p>{shift} shift focus, {area.patrolWindow}. {area.topCategory} watchlist.</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel wide">
          <h3>Monthly Crime Projection</h3>
          <p>Estimated month-wise distribution based on selected public crime totals</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} tickFormatter={(value) => formatNumber(value)} />
              <Tooltip formatter={(value) => formatNumber(value)} />
              <Line type="monotone" dataKey="cases" stroke="#2563eb" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="panel">
          <h3>Crime Categories</h3>
          <p>Clean grouped categories by total crime count</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={crimeTypeData} layout="vertical" margin={{ top: 8, right: 24, left: 64, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => formatNumber(value)} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatNumber(value)} />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="chart-note">Grouped categories keep the visualization readable while detailed offences remain available in the table.</p>
        </article>

        <article className="panel wide">
          <h3>Area-wise Crime Count</h3>
          <p>Hotspot comparison across Karnataka units</p>
          <ResponsiveContainer width="100%" height={285}>
            <BarChart data={areaData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#dc2626" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel">
          <h3>Patrol Recommendation</h3>
          <p>AI-style operational suggestions</p>
          <div className="recommendation-list">
            <div className="recommendation">
              Increase focused patrolling in <strong>{topProfile?.name || topArea}</strong>, especially
              between <strong> {topProfile?.patrolWindow || "7 PM - 11 PM"}</strong>. Current pattern shows repeated
              <strong> {topProfile?.topCategory || topCrimeType}</strong> activity.
            </div>
            <div className="recommendation soft">
              Prioritize high-risk unresolved records and assign additional response capacity to the top-ranked units.
            </div>
            <div className="recommendation soft">
              Use the risk score, hotspot map, and patrol planner together for weekly deployment decisions.
            </div>
            <div className="recommendation soft">
              Set a checkpoint rotation for the top three areas and review the High Priority Case Queue every shift.
            </div>
            <div className="recommendation soft">
              Export uploaded CSV intelligence before briefing so the command team can archive the converted dataset.
            </div>
          </div>
        </article>

        <article className="panel dataset-panel">
          <div className="pipeline-header">
            <div>
              <h3>CSV Data Pipeline</h3>
              <p>Upload CSV files, convert them into crimeData.js format, and export the merged dataset.</p>
            </div>
            <Upload size={22} />
          </div>
          <div
            className="pipeline-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => csvInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") csvInputRef.current?.click();
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              processCsvFiles(event.dataTransfer.files);
            }}
          >
            <Upload size={18} />
            <strong>Drop CSV files here</strong>
            <span>or use the upload button below</span>
          </div>
          <input
            ref={csvInputRef}
            className="sr-only-input"
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={handleCsvUpload}
          />
          <div className="pipeline-actions">
            <button type="button" className="upload-button pipeline-upload" onClick={() => csvInputRef.current?.click()}>
              <Upload size={16} />
              Upload CSV Files
            </button>
            <button type="button" className="report-button pipeline-export" onClick={() => downloadCrimeDataFile(uploadedCrimes)}>
              <FileText size={16} />
              Export
            </button>
            <button type="button" className="mode-button pipeline-clear" onClick={clearUploadedCsv}>
              Clear Uploaded Data
            </button>
          </div>
          <div className="pipeline-status">
            <strong>{csvStatus}</strong>
            <span>{totalUploadedRecords ? "Converted and added to live dashboard data" : "Waiting for CSV upload"}</span>
          </div>
          {uploadedFileNames.length ? (
            <div className="file-list">
              {uploadedFileNames.slice(0, 4).map((name) => <span key={name}>{name}</span>)}
              {uploadedFileNames.length > 4 ? <span>+{uploadedFileNames.length - 4} more</span> : null}
            </div>
          ) : null}
          <div className="dataset-metrics">
            <article>
              <strong>{formatNumber(uploadedCases)}</strong>
              <span>uploaded total crimes</span>
            </article>
            <article>
              <strong>{formatNumber(uploadedHighSeverityCases)}</strong>
              <span>high severity crimes</span>
            </article>
            <article>
              <strong>{uploadedAverageRisk}/100</strong>
              <span>uploaded AI risk score</span>
            </article>
            <article>
              <strong>{uploadedClearanceRate}%</strong>
              <span>uploaded clearance rate</span>
            </article>
          </div>
          <div className="pipeline-note">
            {totalUploadedRecords
              ? `${formatNumber(totalUploadedRecords)} uploaded rows are now part of live dashboard analytics.`
              : `${formatNumber(totalSourceRecords)} source records are active. Upload CSV files to analyze new records here.`}
          </div>
          <div className="upload-suggestions">
            <strong>Upload intelligence suggestions</strong>
            <span>Use 2021-2023 reported/detected CSVs for trend-ready analysis.</span>
            <span>Export after upload and replace src/data/crimeData.js before final deployment.</span>
            <span>Recheck patrol recommendation after every uploaded dataset.</span>
          </div>
        </article>
      </section>

      <section className="panel table-panel">
        <h3>High Priority Case Queue</h3>
        <p>Risk-ranked records for faster investigation and senior officer review</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Category</th>
                <th>Area / Unit</th>
                <th>Total Crimes</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {priorityCases.map((crime) => (
                <tr key={crime.caseId}>
                  <td>{crime.caseId}</td>
                  <td>{crime.crimeType}</td>
                  <td>{crime.area}</td>
                  <td>{formatNumber(crime.totalCrimes || 0)}</td>
                  <td><span className={`pill ${crime.riskLevel.toLowerCase()}`}>{crime.riskScore}/100</span></td>
                  <td>{crime.status}</td>
                  <td>{crime.status === "Solved" ? "Monitor trend" : "Fast-track review"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="insights">
        <div>
          <p className="eyebrow">AI Insights</p>
          <h2>Recommended Actions</h2>
        </div>
        <div className="insight-grid">
          <article>
            <BrainCircuit size={20} />
            <h4>Risk score engine</h4>
            <p>Combines crime volume, severity, status, and time-of-day signals into a 0-100 priority score.</p>
          </article>
          <article>
            <Clock size={20} />
            <h4>Shift deployment</h4>
            <p>{shift} patrol plan prioritizes {patrolPlan[0]?.name || "the top hotspot"} based on current filters.</p>
          </article>
          <article>
            <MapPin size={20} />
            <h4>Command visibility</h4>
            <p>Hotspot map, risk ranking, and priority queue help teams move from analysis to field action.</p>
          </article>
        </div>
      </section>

      <section className="capabilities">
        <div>
          <p className="eyebrow">System Capabilities</p>
          <h2>Built For Scalable Crime Intelligence</h2>
        </div>
        <div className="capability-grid">
          <article>
            <h4>Predictive Hotspot Detection</h4>
            <p>Identifies high-risk districts and crime-heavy zones using historical patterns and severity indicators.</p>
          </article>
          <article>
            <h4>Explainable AI Scoring</h4>
            <p>Shows the reasons behind each hotspot score so officers can trust and verify recommendations.</p>
          </article>
          <article>
            <h4>Patrol Planning Support</h4>
            <p>Prioritizes resource allocation based on crime intensity, timing, location, and active case load.</p>
          </article>
          <article>
            <h4>Decision-ready Reports</h4>
            <p>Generates concise command summaries for officers, analysts, and control-room teams.</p>
          </article>
        </div>
      </section>

      <footer className="app-footer">
        CrimeLens AI | KSP Hackathon Prototype | Public Dataset Powered
      </footer>
    </main>
  );
}

export default Dashboard;
