const viewArea = document.getElementById("viewArea");
const dataArea = document.getElementById("dataArea");
const toggleModeButton = document.getElementById("modeButton");
const commandButton = document.getElementById("commandButton");
const toggleThemeButton = document.getElementById("themeButton");
const linkButton = document.getElementById("linkButton");
const infoButton = document.getElementById("infoButton");
const shareLink = document.getElementById("shareLink");
const registerSection = document.getElementById("registerSection");
const shareSection = document.getElementById("shareSection");
const editSection = document.getElementById("editSection");
const sourceUrl = document.getElementById("sourceUrl");
const sourceVisibility = document.getElementById("sourceVisibility");
const sourceInfo = document.getElementById("sourceInfo");
const linkMessage = document.getElementById("linkMessage");
const shareMessage = document.getElementById("shareMessage");
const registerButton = document.getElementById("registerButton");
const copyLinkButton = document.getElementById("copyLinkButton");
const editInfo = document.getElementById("editInfo");
const editFields = document.getElementById("editFields");
const editLink = document.getElementById("editLink");
const copyEditLinkButton = document.getElementById("copyEditLinkButton");
const editTitle = document.getElementById("editTitle");
const editSourceUrl = document.getElementById("editSourceUrl");
const editSourceVisibility = document.getElementById("editSourceVisibility");
const editMessage = document.getElementById("editMessage");
const updateButton = document.getElementById("updateButton");
const measurementPanel = document.getElementById("measurementPanel");
const measurementOutput = document.getElementById("measurementOutput");
const measurementOverlay = document.getElementById("measurementOverlay");
const measurementLine = document.getElementById("measurementLine");
const commandPalette = document.getElementById("commandPalette");
const commandInput = document.getElementById("commandInput");
const commandList = document.getElementById("commandList");

function createViewer(containerId) {
  const nativeAddEventListener = window.addEventListener;
  const nativeResizeObserver = window.ResizeObserver;

  window.addEventListener = function (type, listener, options) {
    if (type === "resize") return;
    nativeAddEventListener.call(this, type, listener, options);
  };
  window.ResizeObserver = undefined;

  try {
    return $3Dmol.createViewer(containerId);
  } finally {
    window.addEventListener = nativeAddEventListener;
    window.ResizeObserver = nativeResizeObserver;
  }
}

const viewer = createViewer("viewArea");
window.molxViewer = viewer;
viewer.setZoomLimits(10, 50);

let isDarkTheme = false;
let isViewMode = true;
let currentSourceUrl = "";
let currentTitle = "";
let currentKey = "";
let currentEditToken = "";
let canEditCurrentLink = false;
let currentSourceVisibility = "hidden";
let isDirectUrlMode = false;
let resizeTimerId = 0;
let lastViewerSize = "";
let selectedAtoms = [];
let measurementSelectMode = false;
let moleculeCenter = null;
let atomClickTimerId = 0;
let atomClickHandled = false;
let lastAtomClick = { id: null, time: 0 };
let suppressAtomSelectionUntil = 0;
let viewPointerStart = null;
let viewPointerPoint = null;
let backgroundClickTimerId = 0;

const baseStyle = { stick: {}, sphere: { scale: 0.3 } };
const styleSpecs = {
  "ball-stick": { stick: {}, sphere: { scale: 0.3 } },
  stick: { stick: {} },
  sphere: { sphere: { scale: 1.0 } },
  line: { line: {} },
  cartoon: { cartoon: {} },
};
const supportedFormats = ["xyz", "pdb", "sdf", "mol2", "cif", "cube"];
const styleValues = ["ball-stick", "stick", "sphere", "line", "cartoon"];
const colorValues = ["element", "chain", "residue", "single"];
const labelValues = ["off", "atom", "residue"];
const surfaceValues = ["off", "on"];
const motionValues = ["off", "on"];
const displaySettingKeys = ["style", "color", "label", "surface", "rotation", "animation"];
const colorPalette = ["#5898d4", "#ad1457", "#2e7d32", "#f4c542", "#6a4c93", "#ef6c00", "#00897b", "#5d4037", "#546e7a", "#c2185b"];
const singleColorByTheme = {
  light: "#7e878c",
  dark: "#d8dde1",
};
const atomClickDelay = 220;
const atomDoubleClickWindow = 320;
const backgroundClickDelay = 360;
const clickMoveTolerance = 5;
let currentFormat = "xyz";
let savedDisplaySettings = null;
let displaySettings = getDefaultDisplaySettings(currentFormat);
let commandPaletteOpen = false;
let filteredCommands = [];
let activeCommandIndex = 0;
let labelHandles = [];
let surfaceHandles = [];
let lastCommandActivationTime = 0;

viewer.setViewChangeCallback(updateMeasurementOverlay);

function isValidXyzData(data) {
  const lines = data.trim().split("\n");
  let index = 0;
  while (index < lines.length) {
    const atomCount = parseInt(lines[index].trim(), 10);
    if (isNaN(atomCount) || atomCount <= 0) return false;
    index += 2;
    if (index + atomCount > lines.length) return false;
    for (let i = 0; i < atomCount; i++) {
      const line = lines[index];
      if (!line) return false;
      const parts = line.trim().split(/\s+/);
      if (
        parts.length < 4 ||
        isNaN(parseFloat(parts[1])) ||
        isNaN(parseFloat(parts[2])) ||
        isNaN(parseFloat(parts[3]))
      ) {
        return false;
      }
      index += 1;
    }
  }
  return lines.length > 0;
}

function isNumeric(value) {
  return value !== "" && Number.isFinite(Number(value));
}

function isValidPdbData(data) {
  return data.split("\n").some((line) => {
    if (!line.startsWith("ATOM  ") && !line.startsWith("HETATM")) return false;
    if (
      line.length >= 54 &&
      [line.slice(30, 38), line.slice(38, 46), line.slice(46, 54)].every((value) => isNumeric(value.trim()))
    ) {
      return true;
    }
    const parts = line.trim().split(/\s+/);
    return parts.length >= 9 && parts.slice(6, 9).every(isNumeric);
  });
}

function parseSdfAtomCount(countsLine) {
  const fixedWidthCount = parseInt(countsLine.slice(0, 3), 10);
  if (!Number.isNaN(fixedWidthCount)) return fixedWidthCount;
  const firstToken = countsLine.trim().split(/\s+/)[0];
  const tokenCount = parseInt(firstToken, 10);
  return Number.isNaN(tokenCount) ? null : tokenCount;
}

function isValidSdfData(data) {
  return data.split("$$$$").some((record) => {
    const lines = record.split("\n");
    const atomBlockStart = lines.findIndex((line) => line.trim().toUpperCase() === "M  V30 BEGIN ATOM");
    if (atomBlockStart >= 0) {
      const atomLines = [];
      for (let index = atomBlockStart + 1; index < lines.length; index += 1) {
        if (lines[index].trim().toUpperCase() === "M  V30 END ATOM") break;
        atomLines.push(lines[index]);
      }
      return atomLines.some((line) => {
        const parts = line.trim().split(/\s+/);
        return parts.length >= 7 && parts.slice(4, 7).every(isNumeric);
      });
    }

    if (lines.length < 4) return false;
    const atomCount = parseSdfAtomCount(lines[3] || "");
    if (!atomCount || atomCount <= 0 || lines.length < 4 + atomCount) return false;
    return lines.slice(4, 4 + atomCount).every((line) => {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 4 && parts.slice(0, 3).every(isNumeric);
    });
  });
}

function isValidMol2Data(data) {
  const lines = data.split("\n");
  const atomStart = lines.findIndex((line) => line.trim().toUpperCase() === "@<TRIPOS>ATOM");
  if (atomStart < 0) return false;
  let atomEnd = lines.length;
  for (let index = atomStart + 1; index < lines.length; index += 1) {
    if (lines[index].trim().toUpperCase().startsWith("@<TRIPOS>")) {
      atomEnd = index;
      break;
    }
  }
  return lines.slice(atomStart + 1, atomEnd).some((line) => {
    const parts = line.trim().split(/\s+/);
    return parts.length >= 6 && parts.slice(2, 5).every(isNumeric);
  });
}

function isValidCifData(data) {
  const lowerData = data.toLowerCase();
  return (
    /(^|\n)\s*data_/.test(lowerData) &&
    lowerData.includes("_atom_site.") &&
    (lowerData.includes("_atom_site.cartn_x") || lowerData.includes("_atom_site.fract_x"))
  );
}

function isValidCubeData(data) {
  const lines = data.trimEnd().split("\n");
  if (lines.length < 6) return false;
  const atomCount = Math.abs(parseInt((lines[2] || "").trim().split(/\s+/)[0], 10));
  const voxelCounts = [3, 4, 5].map((index) => parseInt((lines[index] || "").trim().split(/\s+/)[0], 10));
  if (!atomCount || voxelCounts.some((count) => Number.isNaN(count)) || lines.length < 6 + atomCount) return false;
  return lines.slice(6, 6 + atomCount).every((line) => {
    const parts = line.trim().split(/\s+/);
    return parts.length >= 5 && parts.slice(0, 5).every(isNumeric);
  });
}

const formatValidators = {
  xyz: isValidXyzData,
  pdb: isValidPdbData,
  sdf: isValidSdfData,
  mol2: isValidMol2Data,
  cif: isValidCifData,
  cube: isValidCubeData,
};

function detectStructureFormat(data, preferredFormat = "") {
  const candidates = preferredFormat && supportedFormats.includes(preferredFormat)
    ? [preferredFormat, ...supportedFormats.filter((format) => format !== preferredFormat)]
    : supportedFormats;
  return candidates.find((format) => formatValidators[format](data)) || "";
}

function getFormatDefaultDisplaySettings(format = currentFormat) {
  return {
    style: format === "pdb" ? "cartoon" : "ball-stick",
    color: "element",
    label: "off",
    surface: "off",
    rotation: "off",
    animation: "on",
  };
}

function getDefaultDisplaySettings(format = currentFormat) {
  return savedDisplaySettings ? { ...savedDisplaySettings } : getFormatDefaultDisplaySettings(format);
}

function normalizeDisplaySettings(settings = {}, format = currentFormat, defaults = getDefaultDisplaySettings(format)) {
  return {
    style: styleValues.includes(settings.style) ? settings.style : defaults.style,
    color: colorValues.includes(settings.color) ? settings.color : defaults.color,
    label: labelValues.includes(settings.label) ? settings.label : defaults.label,
    surface: surfaceValues.includes(settings.surface) ? settings.surface : defaults.surface,
    rotation: motionValues.includes(settings.rotation) ? settings.rotation : defaults.rotation,
    animation: motionValues.includes(settings.animation) ? settings.animation : defaults.animation,
  };
}

function readDisplaySettingsFromUrl(format = currentFormat) {
  const params = new URLSearchParams(window.location.search);
  displaySettings = normalizeDisplaySettings({
    style: params.get("style") || "",
    color: params.get("color") || "",
    label: params.get("label") || "",
    surface: params.get("surface") || "",
    rotation: params.get("rotation") || "",
    animation: params.get("animation") || "",
  }, format);
}

function cloneStyleSpec(styleSpec) {
  if (typeof structuredClone === "function") return structuredClone(styleSpec);
  return JSON.parse(JSON.stringify(styleSpec));
}

function getSingleColor() {
  return isDarkTheme ? singleColorByTheme.dark : singleColorByTheme.light;
}

function renderViewer({ updateOverlay = true } = {}) {
  viewer.render();
  if (updateOverlay) updateMeasurementOverlay();
}

function getStyleSpec(styleName = displaySettings.style, color = "") {
  const styleSpec = styleSpecs[styleName] || baseStyle;

  const nextStyle = cloneStyleSpec(styleSpec);
  if (color) {
    Object.values(nextStyle).forEach((part) => {
      part.color = color;
    });
  }
  return nextStyle;
}

function getAllAtoms() {
  try {
    if (typeof viewer.selectedAtoms === "function") {
      return viewer.selectedAtoms({}) || [];
    }
  } catch (error) {
    console.warn("Could not read atoms:", error);
  }
  return [];
}

function getFiniteAtomPoint(atom) {
  if (!atom || !Number.isFinite(atom.x) || !Number.isFinite(atom.y) || !Number.isFinite(atom.z)) return null;
  return { x: atom.x, y: atom.y, z: atom.z };
}

function computeMoleculeCenter(atoms = getAllAtoms()) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  let count = 0;

  atoms.forEach((atom) => {
    const point = getFiniteAtomPoint(atom);
    if (!point) return;
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
    count += 1;
  });

  if (!count) return null;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

function getGroupKey(atom, colorMode) {
  if (colorMode === "chain") return atom.chain || atom.chainid || atom.chainID || "none";
  if (colorMode === "residue") return `${atom.chain || ""}:${atom.resi ?? atom.residueIndex ?? atom.resn ?? atom.atom ?? "none"}`;
  return "";
}

function getGroupSelection(atom, colorMode) {
  if (colorMode === "chain") {
    const chain = atom.chain || atom.chainid || atom.chainID || "";
    return chain ? { chain } : { predicate: (candidate) => getGroupKey(candidate, colorMode) === getGroupKey(atom, colorMode) };
  }
  if (colorMode === "residue") {
    const chain = atom.chain || "";
    const resi = atom.resi ?? atom.residueIndex;
    if (resi !== undefined) return chain ? { chain, resi } : { resi };
    return { predicate: (candidate) => getGroupKey(candidate, colorMode) === getGroupKey(atom, colorMode) };
  }
  return {};
}

function applyStyleSettings() {
  if (displaySettings.color === "single") {
    viewer.setStyle({}, getStyleSpec(displaySettings.style, getSingleColor()));
    applyPdbHeteroStyle();
    return;
  }

  viewer.setStyle({}, getStyleSpec(displaySettings.style));
  if (!["chain", "residue"].includes(displaySettings.color) || typeof viewer.addStyle !== "function") {
    applyPdbHeteroStyle();
    return;
  }

  const seenGroups = new Set();
  getAllAtoms().forEach((atom) => {
    const groupKey = getGroupKey(atom, displaySettings.color);
    if (seenGroups.has(groupKey)) return;
    const color = colorPalette[seenGroups.size % colorPalette.length];
    seenGroups.add(groupKey);
    viewer.addStyle(getGroupSelection(atom, displaySettings.color), getStyleSpec(displaySettings.style, color));
  });
  applyPdbHeteroStyle();
}

function applyPdbHeteroStyle() {
  if (currentFormat !== "pdb" || displaySettings.style !== "cartoon" || typeof viewer.addStyle !== "function") return;
  const color = displaySettings.color === "single" ? getSingleColor() : "";
  viewer.addStyle({ hetflag: true }, getStyleSpec("ball-stick", color));
}

function clearDisplayLabels() {
  if (typeof viewer.removeAllLabels === "function") {
    viewer.removeAllLabels();
  } else if (typeof viewer.removeLabel === "function") {
    labelHandles.forEach((label) => viewer.removeLabel(label));
  }
  labelHandles = [];
}

function getAtomDisplayName(atom, fallbackIndex = 0) {
  const element = getElementSymbol(atom);
  const number = Number.isInteger(atom.index)
    ? atom.index + 1
    : Number.isInteger(atom.serial)
      ? atom.serial
      : fallbackIndex + 1;
  return `${element}${number}`;
}

function getResidueDisplayName(atom) {
  const resn = atom.resn || atom.resName || atom.group || "RES";
  const resi = atom.resi ?? atom.residueIndex ?? "";
  const chain = atom.chain ? `${atom.chain}:` : "";
  return `${chain}${resn}${resi}`;
}

function addDisplayLabel(text, atom) {
  if (typeof viewer.addLabel !== "function") return;
  const label = viewer.addLabel(text, {
    position: { x: atom.x, y: atom.y, z: atom.z },
    fontSize: 14,
    fontColor: isDarkTheme ? "#ffffff" : "#111820",
    backgroundColor: isDarkTheme ? "#000000" : "#ffffff",
    backgroundOpacity: 0.78,
    borderColor: isDarkTheme ? "#ffffff" : "#111820",
    borderThickness: 0.5,
    inFront: true,
  });
  labelHandles.push(label);
}

function applyLabelSettings() {
  clearDisplayLabels();
  if (displaySettings.label === "off") return;

  const atoms = getAllAtoms();
  if (displaySettings.label === "atom") {
    atoms.slice(0, 300).forEach((atom, index) => addDisplayLabel(getAtomDisplayName(atom, index), atom));
    return;
  }

  const seenResidues = new Set();
  atoms.forEach((atom) => {
    const residueKey = getGroupKey(atom, "residue");
    if (seenResidues.has(residueKey) || seenResidues.size >= 300) return;
    seenResidues.add(residueKey);
    addDisplayLabel(getResidueDisplayName(atom), atom);
  });
}

function clearDisplaySurfaces() {
  if (typeof viewer.removeAllSurfaces === "function") {
    viewer.removeAllSurfaces();
  } else if (typeof viewer.removeSurface === "function") {
    surfaceHandles.forEach((surface) => viewer.removeSurface(surface));
  }
  surfaceHandles = [];
}

function applySurfaceSettings() {
  clearDisplaySurfaces();
  if (displaySettings.surface !== "on" || typeof viewer.addSurface !== "function" || !$3Dmol.SurfaceType) return;

  const surfaceStyle = {
    opacity: 0.42,
    color: isDarkTheme ? "#d8dde1" : "#7e878c",
  };
  const surface = viewer.addSurface($3Dmol.SurfaceType.VDW, surfaceStyle, {});
  if (surface && typeof surface.then === "function") {
    surface.then((handle) => {
      surfaceHandles.push(handle);
      renderViewer();
    });
  } else {
    surfaceHandles.push(surface);
  }
}

function stopMotionSettings() {
  if (typeof viewer.stopAnimate === "function") viewer.stopAnimate();
  if (typeof viewer.spin === "function") viewer.spin(false);
}

function hasMultipleFrames() {
  return typeof viewer.getNumFrames === "function" && viewer.getNumFrames() > 1;
}

function applyMotionSettings({ render = true } = {}) {
  if (typeof viewer.stopAnimate === "function") viewer.stopAnimate();

  if (typeof viewer.spin === "function") {
    viewer.spin(false);
    if (displaySettings.rotation === "on") viewer.spin("y", 1, true);
  }

  if (displaySettings.animation === "on" && hasMultipleFrames() && typeof viewer.animate === "function") {
    viewer.animate({ loop: "forward" });
    return;
  }

  if (render) renderViewer();
}

function applyDisplaySettings({ render = true } = {}) {
  displaySettings = normalizeDisplaySettings(displaySettings, currentFormat);
  clearDisplayLabels();
  clearDisplaySurfaces();
  applyStyleSettings();
  applyLabelSettings();
  applySurfaceSettings();
  applyMotionSettings({ render });
  updateCommandState();
}

function getStructureComment(data, format) {
  const lines = data.trim().split("\n");
  if (format === "xyz") return lines[1] || "";
  if (format === "pdb") {
    const title = lines.find((line) => line.startsWith("TITLE"));
    const header = lines.find((line) => line.startsWith("HEADER"));
    return (title || header || "").trim();
  }
  return "";
}

function icon(name) {
  const icons = {
    sun: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    moon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    eye: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
    grip: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip"><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/></svg>',
  };
  return icons[name];
}

function toggleTheme() {
  if (isDarkTheme) {
    toggleThemeButton.innerHTML = icon("sun");
    viewer.setBackgroundColor("white", 1);
    document.body.classList.remove("dark-mode");
    isDarkTheme = false;
  } else {
    toggleThemeButton.innerHTML = icon("moon");
    viewer.setBackgroundColor("black", 1);
    document.body.classList.add("dark-mode");
    isDarkTheme = true;
  }
  renderViewer();
}

function resetMeasurementState() {
  window.clearTimeout(atomClickTimerId);
  window.clearTimeout(backgroundClickTimerId);
  atomClickTimerId = 0;
  backgroundClickTimerId = 0;
  selectedAtoms = [];
  measurementSelectMode = false;
  viewPointerPoint = null;
  lastAtomClick = { id: null, time: 0 };
}

function hideMeasurementUi() {
  hideMeasurementOverlay();
  measurementPanel.style.display = "none";
}

function enableViewMode(title = "") {
  const data = dataArea.value;
  const detectedFormat = detectStructureFormat(data, currentFormat);
  if (!detectedFormat) {
    alert("Invalid or unsupported structure data.");
    return;
  }
  const previousDefaults = getDefaultDisplaySettings(currentFormat);
  const wasUsingDefaults = displaySettingKeys.every((name) => displaySettings[name] === previousDefaults[name]);
  currentFormat = detectedFormat;
  displaySettings = wasUsingDefaults
    ? getDefaultDisplaySettings(currentFormat)
    : normalizeDisplaySettings(displaySettings, currentFormat);
  stopMotionSettings();
  viewer.clear();
  viewArea.style.display = "block";
  dataArea.style.display = "none";
  hideMeasurementUi();
  isViewMode = true;
  openViewer(data, detectedFormat, title);
  toggleModeButton.innerHTML = icon("grip");
}

function enableEditMode() {
  stopMotionSettings();
  viewer.clear();
  resetMeasurementState();
  updateMeasurementDisplay();
  document.getElementById("commentArea").textContent = "";
  viewArea.style.display = "none";
  dataArea.style.display = "block";
  hideMeasurementUi();
  toggleModeButton.innerHTML = icon("eye");
  isViewMode = false;
}

function toggleMode() {
  if (isViewMode) {
    enableEditMode();
  } else {
    enableViewMode();
  }
}

function openViewer(structureData, format = currentFormat, title = "") {
  currentFormat = format;
  document.getElementById("commentArea").textContent = title || getStructureComment(structureData, format);
  viewer.clear();
  resetMeasurementState();
  moleculeCenter = null;
  updateMeasurementDisplay();
  viewer.addModelsAsFrames(structureData, format);
  moleculeCenter = computeMoleculeCenter();
  applyDisplaySettings({ render: false });
  viewer.setClickable({}, true, handleAtomClick);
  viewer.zoomTo();

  resizeViewer(true);
  applyMotionSettings();
}

function getAtomId(atom) {
  if (Number.isInteger(atom.index)) return atom.index;
  if (Number.isInteger(atom.serial)) return atom.serial;
  return `${getElementSymbol(atom)}:${atom.x}:${atom.y}:${atom.z}`;
}

function getAtomLabel(atom) {
  return getAtomDisplayName(atom, selectedAtoms.indexOf(atom));
}

function formatAtom(atom) {
  return `${getAtomLabel(atom)}  (${formatNumber(atom.x)}, ${formatNumber(atom.y)}, ${formatNumber(atom.z)})`;
}

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function vector(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v) {
  const length = norm(v);
  if (!length) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / length,
    y: v.y / length,
    z: v.z / length,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  return norm(vector(a, b));
}

function angle(a, b, c) {
  const ba = vector(b, a);
  const bc = vector(b, c);
  const denominator = norm(ba) * norm(bc);
  if (!denominator) return NaN;
  return Math.acos(clamp(dot(ba, bc) / denominator, -1, 1)) * 180 / Math.PI;
}

function dihedral(a, b, c, d) {
  const b1 = vector(a, b);
  const b2 = vector(b, c);
  const b3 = vector(c, d);
  const n1 = normalize(cross(b1, b2));
  const n2 = normalize(cross(b2, b3));
  const m1 = cross(n1, normalize(b2));
  return Math.atan2(dot(m1, n2), dot(n1, n2)) * 180 / Math.PI;
}

function getElementSymbol(atom) {
  return (atom.elem || atom.atom || "?").toString();
}

function handleAtomClick(atom) {
  markAtomClickHandled();
  window.clearTimeout(backgroundClickTimerId);
  backgroundClickTimerId = 0;

  const atomId = getAtomId(atom);
  const now = Date.now();
  if (now < suppressAtomSelectionUntil) return;

  if (selectedAtoms.length && !measurementSelectMode) {
    clearFinalizedMeasurement();
    return;
  }

  if (lastAtomClick.id === atomId && now - lastAtomClick.time <= atomDoubleClickWindow) {
    window.clearTimeout(atomClickTimerId);
    atomClickTimerId = 0;
    lastAtomClick = { id: atomId, time: now };
    return;
  }

  lastAtomClick = { id: atomId, time: now };
  window.clearTimeout(atomClickTimerId);
  const selectionDelay = measurementSelectMode ? atomDoubleClickWindow : atomClickDelay;
  atomClickTimerId = window.setTimeout(() => {
    selectAtom(atom);
    atomClickTimerId = 0;
  }, selectionDelay);
}

function selectAtom(atom) {
  if (selectedAtoms.length && !measurementSelectMode) {
    clearFinalizedMeasurement();
    return;
  }

  const atomId = getAtomId(atom);
  const existingIndex = selectedAtoms.findIndex((item) => getAtomId(item) === atomId);

  if (selectedAtoms.length >= 4 && existingIndex < 0) {
    clearMeasurement();
    return;
  }

  if (existingIndex >= 0) {
    selectedAtoms.splice(existingIndex, 1);
  } else {
    selectedAtoms.push(atom);
  }

  measurementSelectMode = selectedAtoms.length > 0 && selectedAtoms.length < 4;
  applyMeasurementStyles();
  updateMeasurementDisplay();
}

function getEventPoint(event) {
  const source = event.changedTouches?.[0] || event.touches?.[0] || event;
  if (typeof source.clientX !== "number" || typeof source.clientY !== "number") return null;
  return { x: source.clientX, y: source.clientY };
}

function recordViewerPointerStart(event) {
  const point = getEventPoint(event);
  if (!point) return;
  viewPointerStart = { ...point, time: Date.now() };
  updateViewerPointerPoint(event);
}

function updateViewerPointerPoint(event) {
  const point = getEventPoint(event);
  if (!point) return;
  const rect = viewArea.getBoundingClientRect();
  viewPointerPoint = {
    x: point.x - rect.left,
    y: point.y - rect.top,
  };
  updateMeasurementOverlay();
}

function clearViewerPointerPoint() {
  viewPointerPoint = null;
  updateMeasurementOverlay();
}

function isClickGesture(event) {
  const point = getEventPoint(event);
  if (!point || !viewPointerStart) return true;
  return Math.hypot(point.x - viewPointerStart.x, point.y - viewPointerStart.y) <= clickMoveTolerance;
}

function markAtomClickHandled() {
  atomClickHandled = true;
  window.setTimeout(() => {
    atomClickHandled = false;
  }, atomClickDelay + 80);
}

function centerModelPoint(point, fallbackSelection = {}) {
  const target = getFiniteAtomPoint(point);
  if (!target) return;

  if (typeof viewer.getView === "function" && typeof viewer.setView === "function") {
    const view = viewer.getView();
    if (Array.isArray(view) && view.length >= 8) {
      view[0] = -target.x;
      view[1] = -target.y;
      view[2] = -target.z;
      viewer.setView(view);
    } else {
      viewer.center(fallbackSelection);
    }
  } else {
    viewer.center(fallbackSelection);
  }

  renderViewer();
}

function centerMolecule() {
  centerModelPoint(moleculeCenter || computeMoleculeCenter());
}

function handleViewerBackgroundClick(event) {
  if (!isClickGesture(event)) return;

  window.clearTimeout(backgroundClickTimerId);
  backgroundClickTimerId = window.setTimeout(() => {
    const recentAtomClick = Date.now() - lastAtomClick.time < atomClickDelay + 160;
    if (atomClickHandled || atomClickTimerId || recentAtomClick) return;

    if (selectedAtoms.length) {
      if (measurementSelectMode) {
        finalizeMeasurementSelection();
      } else {
        clearMeasurement();
      }
    }
    backgroundClickTimerId = 0;
  }, backgroundClickDelay);
}

function finalizeMeasurementSelection() {
  measurementSelectMode = false;
  viewPointerPoint = null;
  window.clearTimeout(atomClickTimerId);
  window.clearTimeout(backgroundClickTimerId);
  atomClickTimerId = 0;
  backgroundClickTimerId = 0;
  lastAtomClick = { id: null, time: 0 };
  updateMeasurementDisplay();
  updateMeasurementOverlay();
}

function clearFinalizedMeasurement() {
  suppressAtomSelectionUntil = Date.now() + atomDoubleClickWindow + 80;
  clearMeasurement();
}

function clearMeasurement() {
  resetMeasurementState();
  applyMeasurementStyles();
  updateMeasurementDisplay();
}

function applyMeasurementStyles() {
  applyDisplaySettings({ render: false });
  viewer.setClickable({}, true, handleAtomClick);
  renderViewer();
}

function hideMeasurementOverlay() {
  measurementLine.setAttribute("points", "");
  measurementOverlay.style.display = "none";
}

function atomToOverlayPoint(atom, viewRect) {
  const screenPoint = viewer.modelToScreen({ x: atom.x, y: atom.y, z: atom.z });
  return {
    x: screenPoint.x - viewRect.left,
    y: screenPoint.y - viewRect.top,
  };
}

function updateMeasurementOverlay() {
  if (!measurementOverlay || !measurementLine) return;

  if (!isViewMode || !selectedAtoms.length || typeof viewer.modelToScreen !== "function") {
    hideMeasurementOverlay();
    return;
  }

  const viewRect = viewArea.getBoundingClientRect();
  const points = selectedAtoms.map((atom) => atomToOverlayPoint(atom, viewRect));
  if (measurementSelectMode && selectedAtoms.length < 4 && viewPointerPoint) {
    points.push(viewPointerPoint);
  }

  if (points.length < 2) {
    hideMeasurementOverlay();
    return;
  }

  measurementLine.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  measurementOverlay.style.display = "block";
}

function getMeasurementLines() {
  const lines = [`Selected: ${selectedAtoms.map(getAtomLabel).join(" - ")}`];
  lines.push(`Atom: ${formatAtom(selectedAtoms[selectedAtoms.length - 1])}`);

  if (selectedAtoms.length >= 2) {
    const [a, b] = selectedAtoms;
    lines.push(`Bond length ${getAtomLabel(a)}-${getAtomLabel(b)}: ${formatNumber(distance(a, b))} Å`);
  }

  if (selectedAtoms.length >= 3) {
    const [a, b, c] = selectedAtoms;
    lines.push(`Bond angle ${getAtomLabel(a)}-${getAtomLabel(b)}-${getAtomLabel(c)}: ${formatNumber(angle(a, b, c), 2)}°`);
  }

  if (selectedAtoms.length >= 4) {
    const [a, b, c, d] = selectedAtoms;
    lines.push(`Dihedral ${getAtomLabel(a)}-${getAtomLabel(b)}-${getAtomLabel(c)}-${getAtomLabel(d)}: ${formatNumber(dihedral(a, b, c, d), 2)}°`);
  }

  return lines;
}

function updateMeasurementDisplay() {
  if (!measurementOutput) return;

  if (!selectedAtoms.length) {
    measurementOutput.textContent = "";
    measurementPanel.style.display = "none";
    return;
  }

  measurementPanel.style.display = "block";
  measurementOutput.textContent = getMeasurementLines().join("\n");
}

function resizeViewer(force = false) {
  if (!isViewMode) return;

  const rect = viewArea.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) return;

  const size = `${width}x${height}`;
  if (!force && size === lastViewerSize) return;

  lastViewerSize = size;
  viewer.resize();
  renderViewer();
}

function scheduleViewerResize() {
  window.clearTimeout(resizeTimerId);
  resizeTimerId = window.setTimeout(() => resizeViewer(), 120);
}

function getEditUrl() {
  if (!currentKey || !currentEditToken) return "";
  return `${window.location.origin}/${currentKey}?edit=${encodeURIComponent(currentEditToken)}`;
}

function openModal(name) {
  const modal = document.getElementById(name);
  modal.style.display = "flex";
  const closeModalOnClickOutside = (event) => {
    if (event.target === modal) {
      closeModal(name);
      modal.removeEventListener("click", closeModalOnClickOutside);
    }
  };
  modal.addEventListener("click", closeModalOnClickOutside);
}

function closeModal(name) {
  document.getElementById(name).style.display = "none";
}

function getDisplayUrlSearch() {
  const params = new URLSearchParams(window.location.search);
  const defaults = getDefaultDisplaySettings(currentFormat);
  displaySettingKeys.forEach((name) => {
    if (displaySettings[name] === defaults[name]) {
      params.delete(name);
    } else {
      params.set(name, displaySettings[name]);
    }
  });
  const search = params.toString();
  return search ? `?${search}` : "";
}

function getPublicDisplayUrlSearch() {
  const params = new URLSearchParams(window.location.search);
  params.delete("edit");
  const search = params.toString();
  return search ? `?${search}` : "";
}

function getEditQuery() {
  return currentEditToken ? `?edit=${encodeURIComponent(currentEditToken)}` : "";
}

function updateDisplayUrl() {
  if (!isViewMode) return;
  const nextSearch = getDisplayUrlSearch();
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
  syncShareLink();
}

function syncShareLink() {
  if (currentKey) {
    shareLink.value = `${window.location.origin}/${currentKey}${getPublicDisplayUrlSearch()}`;
  } else if (isDirectUrlMode) {
    shareLink.value = `${window.location.origin}${window.location.pathname}${getPublicDisplayUrlSearch()}`;
  } else {
    shareLink.value = "";
  }
  if (editLink) editLink.value = getEditUrl();
}

function setDisplaySetting(name, value) {
  displaySettings = normalizeDisplaySettings({ ...displaySettings, [name]: value }, currentFormat);
  applyMeasurementStyles();
  updateDisplayUrl();
}

function resetDisplaySettings() {
  displaySettings = getDefaultDisplaySettings(currentFormat);
  applyMeasurementStyles();
  updateDisplayUrl();
}

function getDisplaySettingsPayload(settings = displaySettings) {
  return normalizeDisplaySettings(settings, currentFormat, getFormatDefaultDisplaySettings(currentFormat));
}

async function saveCurrentDisplayAsDefault() {
  if (!currentKey) return;
  if (!canEditCurrentLink) {
    throw new Error("This link is view-only. Use the edit URL to save defaults.");
  }
  const payload = getDisplaySettingsPayload();
  const response = await fetch(`/api/links/${currentKey}/display${getEditQuery()}`, {
    method: "PATCH",
    headers: {
      "accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to save display: ${response.status}`);
  }
  const data = await response.json();
  savedDisplaySettings = data.display_settings
    ? normalizeDisplaySettings(data.display_settings, currentFormat, getFormatDefaultDisplaySettings(currentFormat))
    : null;
  displaySettings = normalizeDisplaySettings(displaySettings, currentFormat);
  updateDisplayUrl();
  updateCommandState();
}

async function clearSavedDisplayDefault() {
  if (!currentKey) return;
  if (!canEditCurrentLink) {
    throw new Error("This link is view-only. Use the edit URL to clear defaults.");
  }
  const response = await fetch(`/api/links/${currentKey}/display${getEditQuery()}`, { method: "DELETE" });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to clear display: ${response.status}`);
  }
  savedDisplaySettings = null;
  displaySettings = normalizeDisplaySettings(displaySettings, currentFormat, getFormatDefaultDisplaySettings(currentFormat));
  updateDisplayUrl();
  updateCommandState();
}

function getCommandDefinitions() {
  return [
    { id: "style-ball-stick", title: "Style: Ball & Stick", group: "Style", keywords: "ball stick sphere", run: () => setDisplaySetting("style", "ball-stick") },
    { id: "style-stick", title: "Style: Stick", group: "Style", keywords: "bond", run: () => setDisplaySetting("style", "stick") },
    { id: "style-sphere", title: "Style: Sphere", group: "Style", keywords: "space fill vdw", run: () => setDisplaySetting("style", "sphere") },
    { id: "style-line", title: "Style: Line", group: "Style", keywords: "wire thin", run: () => setDisplaySetting("style", "line") },
    { id: "style-cartoon", title: "Style: Cartoon", group: "Style", keywords: "protein ribbon pdb", run: () => setDisplaySetting("style", "cartoon") },
    { id: "color-element", title: "Color: Element", group: "Color", keywords: "atom default jmol", run: () => setDisplaySetting("color", "element") },
    { id: "color-chain", title: "Color: Chain", group: "Color", keywords: "protein pdb", run: () => setDisplaySetting("color", "chain") },
    { id: "color-residue", title: "Color: Residue", group: "Color", keywords: "residue amino acid", run: () => setDisplaySetting("color", "residue") },
    { id: "color-single", title: "Color: Single", group: "Color", keywords: "mono gray grey", run: () => setDisplaySetting("color", "single") },
    { id: "label-off", title: "Labels: Off", group: "Label", keywords: "hide clear", run: () => setDisplaySetting("label", "off") },
    { id: "label-atom", title: "Label: Atom", group: "Label", keywords: "atom name serial", run: () => setDisplaySetting("label", "atom") },
    { id: "label-residue", title: "Label: Residue", group: "Label", keywords: "residue protein", run: () => setDisplaySetting("label", "residue") },
    { id: "surface-off", title: "Surface: Off", group: "Surface", keywords: "hide clear", run: () => setDisplaySetting("surface", "off") },
    { id: "surface-on", title: "Surface: VDW", group: "Surface", keywords: "transparent molecular surface", run: () => setDisplaySetting("surface", "on") },
    { id: "rotation-off", title: "Rotation: Off", group: "Motion", keywords: "spin rotate stop", run: () => setDisplaySetting("rotation", "off") },
    { id: "rotation-on", title: "Rotation: On", group: "Motion", keywords: "spin rotate auto", run: () => setDisplaySetting("rotation", "on") },
    { id: "animation-off", title: "Animation: Off", group: "Motion", keywords: "frames trajectory stop", run: () => setDisplaySetting("animation", "off") },
    { id: "animation-on", title: "Animation: On", group: "Motion", keywords: "frames trajectory play", run: () => setDisplaySetting("animation", "on") },
    { id: "view-center", title: "View: Center Molecule", group: "View", keywords: "move focus", run: centerMolecule },
    { id: "view-reset", title: "View: Reset Zoom", group: "View", keywords: "zoom fit", run: () => { viewer.zoomTo(); renderViewer(); } },
    { id: "measure-clear", title: "Selection: Clear", group: "Selection", keywords: "measure measurement", run: clearMeasurement },
    { id: "display-reset", title: "Display: Reset", group: "Display", keywords: "style color label surface rotation animation default", run: resetDisplaySettings },
    { id: "display-save-default", title: "Display: Save as Default", group: "Display", keywords: "db save share clean url default", run: saveCurrentDisplayAsDefault },
    { id: "display-clear-default", title: "Display: Clear Saved Default", group: "Display", keywords: "db remove reset saved", run: clearSavedDisplayDefault },
  ];
}

function commandIsActive(command) {
  const [, value] = command.id.split("-");
  if (command.id.startsWith("style-")) return displaySettings.style === command.id.replace("style-", "");
  if (command.id.startsWith("color-")) return displaySettings.color === value;
  if (command.id.startsWith("label-")) return displaySettings.label === value;
  if (command.id.startsWith("surface-")) return displaySettings.surface === value;
  if (command.id.startsWith("rotation-")) return displaySettings.rotation === value;
  if (command.id.startsWith("animation-")) return displaySettings.animation === value;
  return false;
}

function bindCommandActivation(element, action, options = {}) {
  let pointerActivated = false;
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    pointerActivated = true;
    action();
    window.setTimeout(() => {
      pointerActivated = false;
    }, 0);
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (pointerActivated) return;
    if (!options.keepOpen && !commandPaletteOpen) return;
    action();
  });
}

function renderCommandPalette() {
  if (!commandList) return;
  const query = (commandInput?.value || "").trim().toLowerCase();
  const commands = getCommandDefinitions();
  filteredCommands = commands.filter((command) => {
    const haystack = `${command.title} ${command.group} ${command.keywords}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  activeCommandIndex = Math.min(activeCommandIndex, Math.max(filteredCommands.length - 1, 0));

  commandList.textContent = "";
  if (!filteredCommands.length) {
    const empty = document.createElement("div");
    empty.className = "command-empty";
    empty.textContent = "No commands";
    commandList.append(empty);
    return;
  }

  filteredCommands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-item";
    button.dataset.commandIndex = String(index);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === activeCommandIndex));
    if (commandIsActive(command)) button.dataset.active = "true";

    const title = document.createElement("span");
    title.className = "command-title";
    title.textContent = command.title;
    const group = document.createElement("span");
    group.className = "command-group";
    group.textContent = commandIsActive(command) ? "ON" : command.group;
    button.append(title, group);
    button.addEventListener("mouseenter", () => {
      activeCommandIndex = index;
      updateCommandSelection();
    });
    bindCommandActivation(button, () => runCommand(index));
    commandList.append(button);
  });
}

function updateCommandSelection() {
  commandList?.querySelectorAll(".command-item").forEach((item, index) => {
    item.setAttribute("aria-selected", String(index === activeCommandIndex));
  });
}

function openCommandPalette() {
  if (!commandPalette) return;
  commandPaletteOpen = true;
  activeCommandIndex = 0;
  commandPalette.style.display = "flex";
  document.body.classList.add("palette-open");
  renderCommandPalette();
  window.requestAnimationFrame(() => {
    commandInput?.focus();
    commandInput?.select();
  });
}

function closeCommandPalette() {
  if (!commandPalette) return;
  commandPaletteOpen = false;
  commandPalette.style.display = "none";
  document.body.classList.remove("palette-open");
  if (commandInput) commandInput.value = "";
}

async function runCommand(index = activeCommandIndex) {
  const command = filteredCommands[index];
  if (!command) return;
  try {
    await command.run();
    closeCommandPalette();
  } catch (error) {
    console.error(error);
    alert(error.message || "Command failed.");
  }
}

function updateCommandState() {
  if (commandPaletteOpen) renderCommandPalette();
}

function handleCommandPointerActivation(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const commandButton = target.closest("[data-command-index]");
  if (!commandButton || !commandPalette?.contains(commandButton)) return;
  event.preventDefault();
  event.stopPropagation();
  lastCommandActivationTime = Date.now();
  runCommand(Number(commandButton.dataset.commandIndex));
}

function handleCommandClickActivation(event) {
  if (Date.now() - lastCommandActivationTime < 120) return;
  handleCommandPointerActivation(event);
}

async function getStructureData(key) {
  const response = await fetch(`/api/structure/${key}${getEditQuery()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch: ${response.status}`);
  }
  return response.json();
}

async function getStructureDataFromUrl(url) {
  const response = await fetch(`/api/structure-url?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch URL: ${response.status}`);
  }
  return response.json();
}

function updateLinkPanels() {
  const hasLink = Boolean(currentKey);
  const hasShareableUrl = hasLink || isDirectUrlMode;
  if (registerSection) registerSection.hidden = hasLink;
  if (shareSection) shareSection.hidden = !hasShareableUrl;
  if (editSection) editSection.hidden = !hasLink;

  if (!hasLink) {
    if (sourceVisibility) sourceVisibility.checked = false;
    if (linkMessage) linkMessage.textContent = "";
    if (sourceInfo) {
      sourceInfo.textContent = isDirectUrlMode
        ? "This direct URL can be shared as-is, or registered as a short molx link."
        : "Register a public structure file URL to create a short molx link.";
    }
    return;
  }

  if (editTitle) editTitle.value = currentTitle;
  if (editLink) editLink.value = getEditUrl();
  if (editSourceUrl) editSourceUrl.value = currentSourceUrl;
  if (editSourceVisibility) editSourceVisibility.checked = currentSourceVisibility === "public";
  if (editFields) editFields.hidden = !canEditCurrentLink;
  if (editInfo) {
    editInfo.textContent = canEditCurrentLink
      ? "Keep this private edit URL. It is required to change the title, source visibility, or saved display settings later."
      : "View-only. Open the private edit URL to update this link.";
  }
  if (editMessage) editMessage.textContent = "";
}

function updateSourceControls() {
  if (sourceVisibility) sourceVisibility.checked = currentSourceVisibility === "public";
  if (sourceUrl) {
    sourceUrl.readOnly = false;
    sourceUrl.value = currentSourceUrl;
  }
  if (sourceVisibility) sourceVisibility.disabled = false;
  if (registerButton) {
    registerButton.textContent = "Register";
  }
}

function updateShareState({
  key,
  url,
  format,
  title,
  source_visibility: sourceVisibilityValue,
  can_edit: canEdit,
  created_at: createdAt,
}) {
  currentKey = key || "";
  if (!currentKey) currentEditToken = "";
  currentSourceUrl = url || "";
  currentTitle = title || "";
  canEditCurrentLink = Boolean(canEdit);
  currentSourceVisibility = sourceVisibilityValue === "public" ? "public" : "hidden";
  if (format && supportedFormats.includes(format)) currentFormat = format;
  syncShareLink();
  updateSourceControls();
  updateLinkPanels();

  sourceInfo.textContent = "";
  if (currentSourceVisibility === "public" && currentSourceUrl) {
    const text = document.createTextNode("Source URL is visible to viewers: ");
    const link = document.createElement("a");
    link.href = currentSourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = currentSourceUrl;
    sourceInfo.append(text, link);
  } else if (currentKey) {
    sourceInfo.textContent = "Source URL is hidden from viewers.";
  } else if (isDirectUrlMode) {
    sourceInfo.textContent = "This direct URL can be shared as-is, or registered as a short molx link.";
  } else {
    sourceInfo.textContent = "Register a public structure file URL to create a short molx link.";
  }
  if (createdAt && currentKey) {
    const date = new Date(createdAt).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).replace(/\//g, "-");
    sourceInfo.append(document.createTextNode(` Registered at ${date}.`));
  }
}

async function loadKey(key) {
  isDirectUrlMode = false;
  currentEditToken = new URLSearchParams(window.location.search).get("edit") || "";
  const data = await getStructureData(key);
  const structureData = data.data || data.xyz || "";
  const detectedFormat = detectStructureFormat(structureData, data.format || currentFormat);
  if (!detectedFormat) {
    throw new Error("Invalid or unsupported structure data.");
  }
  currentFormat = detectedFormat;
  savedDisplaySettings = data.display_settings
    ? normalizeDisplaySettings(data.display_settings, detectedFormat, getFormatDefaultDisplaySettings(detectedFormat))
    : null;
  readDisplaySettingsFromUrl(detectedFormat);
  dataArea.value = structureData;
  updateShareState({ ...data, data: structureData, format: detectedFormat });
  enableViewMode(currentTitle);
}

async function loadSourceUrl(url) {
  isDirectUrlMode = true;
  currentEditToken = "";
  const data = await getStructureDataFromUrl(url);
  const structureData = data.data || data.xyz || "";
  const detectedFormat = detectStructureFormat(structureData, data.format || currentFormat);
  if (!detectedFormat) {
    throw new Error("Invalid or unsupported structure data.");
  }
  currentFormat = detectedFormat;
  savedDisplaySettings = null;
  readDisplaySettingsFromUrl(detectedFormat);
  dataArea.value = structureData;
  updateShareState({ ...data, key: "", data: structureData, format: detectedFormat, source_visibility: "hidden" });
  if (data.title) document.title = `molx | ${data.title}`;
  enableViewMode(currentTitle);
}

async function loadDefaultStructure() {
  isDirectUrlMode = false;
  currentEditToken = "";
  const response = await fetch("/static/caffeine.xyz");
  if (!response.ok) {
    throw new Error(`Failed to load default structure: ${response.status}`);
  }
  const structureData = await response.text();
  const detectedFormat = detectStructureFormat(structureData, "xyz");
  if (!detectedFormat) {
    throw new Error("Invalid or unsupported default structure data.");
  }
  currentFormat = detectedFormat;
  savedDisplaySettings = null;
  readDisplaySettingsFromUrl(detectedFormat);
  dataArea.value = structureData;
  updateShareState({
    key: "",
    url: "",
    format: detectedFormat,
    title: "Caffeine",
    source_visibility: "hidden",
    can_edit: false,
    created_at: null,
  });
  document.title = "molx | Caffeine";
  enableViewMode(currentTitle);
}

async function registerUrl() {
  const url = sourceUrl.value.trim();
  const showSource = Boolean(sourceVisibility?.checked);
  if (!url) {
    linkMessage.textContent = "Please enter a public structure file URL.";
    return;
  }

  linkMessage.textContent = "Registering...";
  registerButton.disabled = true;
  try {
    const response = await fetch("/api/links/", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, title: null, show_source: showSource }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Error: ${response.statusText}`);
    }
    const data = await response.json();
    currentEditToken = data.edit_token || "";
    const editSearch = currentEditToken ? `?edit=${encodeURIComponent(currentEditToken)}` : "";
    window.history.pushState({}, "", `/${data.key}${editSearch}`);
    await loadKey(data.key);
    linkMessage.textContent = "";
    if (editMessage) editMessage.textContent = "Registered. Keep the edit URL private. You need it to change the title or saved display settings later.";
    shareLink.select();
    const copied = await copyTextToClipboard(shareLink.value);
    if (!copied) {
      if (shareMessage) shareMessage.textContent = "Use the Copy button or copy the public URL above.";
    }
  } catch (error) {
    console.error("Error:", error);
    linkMessage.textContent = `Failed to register URL. ${error.message}`;
  } finally {
    registerButton.disabled = false;
  }
}

async function saveLinkMetadata() {
  const title = editTitle.value.trim();
  const showSource = Boolean(editSourceVisibility?.checked);
  editMessage.textContent = "Updating...";
  updateButton.disabled = true;
  try {
    const response = await fetch(`/api/links/${currentKey}${getEditQuery()}`, {
      method: "PATCH",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: title || null, show_source: showSource }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to update: ${response.status}`);
    }
    const data = await response.json();
    currentSourceVisibility = data.source_visibility || (showSource ? "public" : "hidden");
    editMessage.textContent = "Updated.";
    await loadKey(currentKey);
  } catch (error) {
    console.error("Error:", error);
    editMessage.textContent = `Failed to update. ${error.message}`;
  } finally {
    updateButton.disabled = false;
  }
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Clipboard write failed:", error);
    return false;
  }
}

async function copyLink() {
  if (!shareLink.value) {
    if (shareMessage) shareMessage.textContent = "No molx link has been created yet.";
    return;
  }
  shareLink.select();
  const copied = await copyTextToClipboard(shareLink.value);
  copyLinkButton.textContent = copied ? "Copied!" : "Selected";
  if (shareMessage) shareMessage.textContent = copied ? "Copied." : "";
  if (!copied) {
    if (shareMessage) shareMessage.textContent = "Clipboard access is blocked. The public URL is selected for manual copy.";
  }
  setTimeout(() => {
    copyLinkButton.textContent = "Copy";
  }, 1000);
}

async function copyEditLink() {
  if (!editLink?.value) {
    if (editMessage) editMessage.textContent = "No edit URL is available.";
    return;
  }
  editLink.select();
  const copied = await copyTextToClipboard(editLink.value);
  copyEditLinkButton.textContent = copied ? "Copied!" : "Selected";
  if (editMessage) {
    editMessage.textContent = copied
      ? "Copied. Keep it private."
      : "Clipboard access is blocked. The edit URL is selected for manual copy.";
  }
  setTimeout(() => {
    copyEditLinkButton.textContent = "Copy";
  }, 1000);
}

window.onload = async () => {
  const key = window.location.pathname.split("/").filter(Boolean)[0];
  const params = new URLSearchParams(window.location.search);
  const directUrl = params.get("url") || params.get("src") || params.get("source") || "";
  try {
    if (key) {
      await loadKey(key);
    } else if (directUrl) {
      await loadSourceUrl(directUrl);
    } else {
      await loadDefaultStructure();
    }
  } catch (error) {
    console.error("Error loading molecular structure:", error);
    alert(error.message);
    savedDisplaySettings = null;
    isDirectUrlMode = false;
    updateShareState({});
    enableEditMode();
  }
};

window.addEventListener("resize", scheduleViewerResize, { passive: true });
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (event.key === "Escape" && commandPaletteOpen) {
    event.preventDefault();
    closeCommandPalette();
  }
});
toggleModeButton?.addEventListener("click", toggleMode);
commandButton?.addEventListener("click", openCommandPalette);
toggleThemeButton?.addEventListener("click", toggleTheme);
linkButton?.addEventListener("click", () => openModal("shareModal"));
infoButton?.addEventListener("click", () => openModal("infoModal"));
registerButton?.addEventListener("click", registerUrl);
updateButton?.addEventListener("click", saveLinkMetadata);
copyLinkButton?.addEventListener("click", copyLink);
copyEditLinkButton?.addEventListener("click", copyEditLink);
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.closeModal));
});
viewArea.addEventListener("pointerdown", recordViewerPointerStart, true);
viewArea.addEventListener("pointermove", updateViewerPointerPoint, { passive: true });
viewArea.addEventListener("pointerleave", clearViewerPointerPoint, { passive: true });
viewArea.addEventListener("click", handleViewerBackgroundClick, true);
commandPalette?.addEventListener("click", (event) => {
  if (event.target === commandPalette) closeCommandPalette();
});
commandPalette?.addEventListener("pointerdown", handleCommandPointerActivation, true);
commandPalette?.addEventListener("mousedown", handleCommandPointerActivation, true);
commandPalette?.addEventListener("click", handleCommandClickActivation, true);
commandInput?.addEventListener("input", () => {
  activeCommandIndex = 0;
  renderCommandPalette();
});
commandInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeCommandIndex = Math.min(activeCommandIndex + 1, Math.max(filteredCommands.length - 1, 0));
    updateCommandSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeCommandIndex = Math.max(activeCommandIndex - 1, 0);
    updateCommandSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    runCommand();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
  }
});

if (window.ResizeObserver) {
  const resizeObserver = new ResizeObserver(scheduleViewerResize);
  resizeObserver.observe(viewArea);
}
