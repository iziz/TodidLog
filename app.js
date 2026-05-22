import Dexie from "dexie";
import { Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { computeDailyFortune, computeNatalSummary, resolveBirthplace, searchBirthplaces } from "./src/fortune-engine.js";

const DATABASE_NAME = "todidlog";
const STORAGE_KEY = "daily-work-log.sessions.v1";
const GROUPS_KEY = "daily-work-log.groups.v1";
const ACTIVE_KEY = "daily-work-log.active.v1";
const FORTUNE_PROFILE_KEY = "daily-work-log.fortune-profile.v1";
const ACTIVE_META_KEY = "active";
const FORTUNE_PROFILE_META_KEY = "fortuneProfile";
const FORTUNE_AI_CACHE_META_PREFIX = "fortuneAiDetails:v1:";
const LOCAL_STORAGE_MIGRATION_META_KEY = "localStorageMigration.v1";
const LEGACY_DEFAULT_TITLE = "\uC791\uC5C5 \uAE30\uB85D";
const LEGACY_MERGED_TITLE = "\uBCD1\uD569 \uC791\uC5C5";
const GEMINI_PROXY_URL = "/api/gemini/generate";
const GEMINI_TIMEOUT_MS = 7000;
const GEMINI_CACHE_LIMIT = 30;
const GEMINI_DETAILS_CACHE_SCHEMA = "gemini-details-v2";
const GEMINI_DETAILS_CACHE_MIGRATION_SCHEMAS = [GEMINI_DETAILS_CACHE_SCHEMA, "gemini-details-v1", "gemini"];
let fortuneRenderId = 0;
let fortuneSettingsPreviewId = 0;
let fortuneClockRefreshKey = "";
let detailsEditor = null;
let persistQueue = Promise.resolve();
const fortuneAiCache = new Map();
let fortuneAiProxyDisabled = false;
let fortuneAiLastErrorStatus = 0;

const db = new Dexie(DATABASE_NAME);
db.version(1).stores({
  sessions: "id,date,createdAt",
  groups: "id,date,createdAt",
  meta: "key",
});

const state = {
  selectedDate: toDateKey(new Date()),
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  sessions: [],
  groups: [],
  active: null,
  fortuneProfile: null,
  selectedIds: new Set(),
  isCalendarOpen: false,
  calendarAnimating: false,
  isFortuneDetailsOpen: false,
  modal: null,
};

const els = {
  calendarSurface: document.querySelector("#calendarSurface"),
  calendarBody: document.querySelector("#calendarBody"),
  calendarContextTitle: document.querySelector("#calendarContextTitle"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  fortuneSummary: document.querySelector("#fortuneSummary"),
  goTodayBtn: document.querySelector("#goTodayBtn"),
  openFortuneSettingsBtn: document.querySelector("#openFortuneSettingsBtn"),
  calendarWeekdays: document.querySelector("#calendarWeekdays"),
  weekNav: document.querySelector("#weekNav"),
  weekStrip: document.querySelector("#weekStrip"),
  prevCalendarBtn: document.querySelector("#prevCalendarBtn"),
  nextCalendarBtn: document.querySelector("#nextCalendarBtn"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerStatus: document.querySelector("#timerStatus"),
  startTimerBtn: document.querySelector("#startTimerBtn"),
  stopTimerBtn: document.querySelector("#stopTimerBtn"),
  dailyTotal: document.querySelector("#dailyTotal"),
  calendarTotalLabel: document.querySelector("#calendarTotalLabel"),
  calendarTotalValue: document.querySelector("#calendarTotalValue"),
  monthReportBtn: document.querySelector("#monthReportBtn"),
  taskList: document.querySelector("#taskList"),
  emptyMessage: document.querySelector("#emptyMessage"),
  selectionCount: document.querySelector("#selectionCount"),
  groupSelectedBtn: document.querySelector("#groupSelectedBtn"),
  deleteSelectedBtn: document.querySelector("#deleteSelectedBtn"),
  openQuickModalBtn: document.querySelector("#openQuickModalBtn"),
  calendarToggleBtn: document.querySelector("#calendarToggleBtn"),
  monthInline: document.querySelector("#monthInline"),
  monthGrid: document.querySelector("#monthGrid"),
  recordModal: document.querySelector("#recordModal"),
  recordForm: document.querySelector("#recordForm"),
  modalKicker: document.querySelector("#modalKicker"),
  modalTime: document.querySelector("#modalTime"),
  modalTimeEditor: document.querySelector("#modalTimeEditor"),
  recordStart: document.querySelector("#recordStart"),
  recordEnd: document.querySelector("#recordEnd"),
  recordTitle: document.querySelector("#recordTitle"),
  recordTags: document.querySelector("#recordTags"),
  recordTagChips: document.querySelector("#recordTagChips"),
  recordDetailsEditor: document.querySelector("#recordDetailsEditor"),
  recordDetailsToolbar: document.querySelector("#recordDetailsToolbar"),
  modalError: document.querySelector("#modalError"),
  deleteRecordBtn: document.querySelector("#deleteRecordBtn"),
  closeModalBtn: document.querySelector("#closeModalBtn"),
  fortuneSettingsModal: document.querySelector("#fortuneSettingsModal"),
  fortuneSettingsForm: document.querySelector("#fortuneSettingsForm"),
  closeFortuneSettingsBtn: document.querySelector("#closeFortuneSettingsBtn"),
  fortuneBirthDate: document.querySelector("#fortuneBirthDate"),
  fortuneBirthTime: document.querySelector("#fortuneBirthTime"),
  fortuneBirthplace: document.querySelector("#fortuneBirthplace"),
  fortuneBirthplaceOptions: document.querySelector("#fortuneBirthplaceOptions"),
  fortuneNatalPreview: document.querySelector("#fortuneNatalPreview"),
  fortuneGender: document.querySelector("#fortuneGender"),
  fortuneLanguage: document.querySelector("#fortuneLanguage"),
  fortuneUnknownTime: document.querySelector("#fortuneUnknownTime"),
  fortuneSettingsError: document.querySelector("#fortuneSettingsError"),
  deleteFortuneProfileBtn: document.querySelector("#deleteFortuneProfileBtn"),
};

init().catch((error) => {
  console.error("Failed to initialize TodidLog.", error);
});

async function init() {
  initDetailsEditor();
  await loadStoredState();
  cleanupGroups();
  wireEvents();
  render();
  setInterval(tickTimer, 1000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => registration.update())
      .catch(() => {});
  }
}

function wireEvents() {
  els.prevCalendarBtn.addEventListener("click", () => moveCalendar(-1));
  els.nextCalendarBtn.addEventListener("click", () => moveCalendar(1));
  els.goTodayBtn.addEventListener("click", goToToday);
  els.startTimerBtn.addEventListener("click", startTimer);
  els.stopTimerBtn.addEventListener("click", stopTimer);
  els.groupSelectedBtn.addEventListener("click", openGroupModal);
  els.deleteSelectedBtn.addEventListener("click", deleteSelectedItems);
  els.openQuickModalBtn.addEventListener("click", openQuickModal);
  els.calendarToggleBtn.addEventListener("click", toggleCalendarPanel);
  els.monthReportBtn.addEventListener("click", copyMonthReport);
  els.openFortuneSettingsBtn.addEventListener("click", openFortuneSettings);
  els.fortuneSettingsForm.addEventListener("submit", saveFortuneSettings);
  els.fortuneSettingsModal.addEventListener("click", closeFortuneSettingsFromBackdrop);
  els.fortuneSettingsModal.addEventListener("cancel", closeFortuneSettings);
  els.closeFortuneSettingsBtn.addEventListener("click", closeFortuneSettings);
  els.deleteFortuneProfileBtn.addEventListener("click", deleteFortuneProfile);
  els.fortuneUnknownTime.addEventListener("change", updateFortuneTimeState);
  els.fortuneBirthplace.addEventListener("input", updateBirthplaceSuggestions);
  els.fortuneBirthDate.addEventListener("input", renderFortuneSettingsNatalPreview);
  els.fortuneBirthTime.addEventListener("input", renderFortuneSettingsNatalPreview);
  els.fortuneBirthplace.addEventListener("input", renderFortuneSettingsNatalPreview);
  els.fortuneGender.addEventListener("change", renderFortuneSettingsNatalPreview);
  els.fortuneLanguage.addEventListener("change", renderFortuneSettingsNatalPreview);
  els.fortuneUnknownTime.addEventListener("change", renderFortuneSettingsNatalPreview);
  els.recordForm.addEventListener("submit", saveModal);
  els.recordModal.addEventListener("click", confirmBackdropClose);
  els.recordModal.addEventListener("cancel", confirmDialogCancel);
  els.closeModalBtn.addEventListener("click", closeModal);
  els.deleteRecordBtn.addEventListener("click", deleteModalTarget);
  els.recordTags.addEventListener("keydown", handleTagInputKeydown);
  els.recordTags.addEventListener("blur", commitTagInput);
  els.recordDetailsToolbar.addEventListener("click", handleDetailsToolbarClick);
  els.recordStart.addEventListener("blur", normalizeModalTimeInputs);
  els.recordEnd.addEventListener("blur", normalizeModalTimeInputs);
}

function initDetailsEditor() {
  detailsEditor = new Editor({
    element: els.recordDetailsEditor,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: false,
        horizontalRule: false,
      }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder: "Task details",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "details-editor-content",
        "aria-label": "Details",
      },
    },
    onSelectionUpdate: updateDetailsToolbarState,
    onTransaction: updateDetailsToolbarState,
    onUpdate: updateDetailsToolbarState,
  });
  updateDetailsToolbarState();
}

function handleDetailsToolbarClick(event) {
  const button = event.target.closest("[data-editor-command]");
  if (!button || !detailsEditor) return;
  const command = button.dataset.editorCommand;
  const chain = detailsEditor.chain().focus();

  if (command === "bold") chain.toggleBold().run();
  if (command === "italic") chain.toggleItalic().run();
  if (command === "bulletList") chain.toggleBulletList().run();
  if (command === "orderedList") chain.toggleOrderedList().run();
  if (command === "link") {
    toggleDetailsLink();
    return;
  }

  updateDetailsToolbarState();
}

function toggleDetailsLink() {
  if (!detailsEditor) return;
  const currentHref = detailsEditor.getAttributes("link").href || "";
  const value = prompt("Enter link URL", currentHref);
  if (value === null) return;

  const href = normalizeDetailsLink(value);
  if (!value.trim()) {
    detailsEditor.chain().focus().extendMarkRange("link").unsetLink().run();
    updateDetailsToolbarState();
    return;
  }

  if (!href) {
    els.modalError.textContent = "Enter a valid http, https, or mailto link.";
    return;
  }

  els.modalError.textContent = "";
  detailsEditor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  updateDetailsToolbarState();
}

function updateDetailsToolbarState() {
  if (!els.recordDetailsToolbar || !detailsEditor) return;
  const activeByCommand = {
    bold: detailsEditor.isActive("bold"),
    italic: detailsEditor.isActive("italic"),
    bulletList: detailsEditor.isActive("bulletList"),
    orderedList: detailsEditor.isActive("orderedList"),
    link: detailsEditor.isActive("link"),
  };

  for (const button of els.recordDetailsToolbar.querySelectorAll("[data-editor-command]")) {
    const isActive = Boolean(activeByCommand[button.dataset.editorCommand]);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function render() {
  renderHeader();
  renderWeekStrip();
  renderTimer();
  renderSummaries();
  renderTasks();
  renderMonth();
  renderCalendarPanel();
  persist();
}

function renderHeader() {
  const selected = parseDateKey(state.selectedDate);
  const isToday = state.selectedDate === toDateKey(new Date());
  els.selectedDateLabel.textContent = `${selected.toLocaleString("en", { month: "long" }).toUpperCase()} ${selected.getDate()}, ${selected.getFullYear()}`;
  els.goTodayBtn.disabled = isToday;
  els.goTodayBtn.setAttribute("aria-current", isToday ? "date" : "false");
  renderFortuneSummary();
}

async function renderFortuneSummary() {
  const renderId = ++fortuneRenderId;
  if (!state.fortuneProfile) {
    els.fortuneSummary.classList.add("hidden");
    els.fortuneSummary.textContent = "";
    return;
  }

  try {
    const profile = normalizedFortuneProfile(state.fortuneProfile);
    const context = fortuneTaskContext(state.selectedDate);
    if (state.selectedDate === toDateKey(new Date())) fortuneClockRefreshKey = fortuneClockKey(new Date());
    const fortune = await computeDailyFortune(profile, state.selectedDate, context);
    if (renderId !== fortuneRenderId) return;
    renderFortuneSummaryContent(fortune, profile, context, state.selectedDate);
    els.fortuneSummary.classList.remove("hidden");
  } catch {
    if (renderId !== fortuneRenderId) return;
    els.fortuneSummary.classList.add("hidden");
    els.fortuneSummary.textContent = "";
  }
}

function fortuneTaskContext(dateKey) {
  const items = visibleTimelineItemsForDate(dateKey);
  const activeItem = dateKey === state.selectedDate ? activeSessionForSelectedDate() : null;
  const tagCounts = new Map();
  let totalMinutes = 0;
  let longestMinutes = 0;
  let crossDayCount = 0;
  let continuationCount = 0;
  let lateTaskCount = 0;

  for (const item of items) {
    const includedMinutes = Number.isFinite(item.includedMinutes) ? item.includedMinutes : item.duration;
    totalMinutes += includedMinutes;
    longestMinutes = Math.max(longestMinutes, includedMinutes);
    if (item.isCrossDay) crossDayCount += 1;
    if (item.isContinuation) continuationCount += 1;
    if (isLateTimelineItem(item, dateKey)) lateTaskCount += 1;

    for (const tag of reportItemDetails(item).tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  if (activeItem) {
    totalMinutes += activeItem.includedMinutes || 0;
    longestMinutes = Math.max(longestMinutes, activeItem.includedMinutes || 0);
    if (activeItem.crossDay) crossDayCount += 1;
    if (state.active?.date && state.active.date !== dateKey) continuationCount += 1;
    if (timeToMinutes(activeItem.start) >= 18 * 60) lateTaskCount += 1;
  }

  return {
    taskCount: items.length + (activeItem ? 1 : 0),
    totalMinutes,
    longestMinutes,
    crossDayCount,
    continuationCount,
    lateTaskCount,
    active: Boolean(activeItem),
    topTag: topTagFromCounts(tagCounts),
    signalMinute: fortuneSignalMinute(dateKey, items, activeItem),
  };
}

function fortuneSignalMinute(dateKey, items, activeItem) {
  const now = new Date();
  if (dateKey === toDateKey(now)) return timeToMinutes(toTimeValue(now));

  if (activeItem) return activeFortuneSignalMinute(dateKey);

  const item = items
    .filter((entry) => Number.isFinite(entry.includedMinutes) && entry.includedMinutes > 0)
    .sort((a, b) => b.includedMinutes - a.includedMinutes || b.sortValue - a.sortValue)[0];
  if (!item) return 12 * 60;

  return timelineItemFortuneSignalMinute(item, dateKey);
}

function activeFortuneSignalMinute(dateKey) {
  if (!state.active) return 12 * 60;
  const offset = dateOffsetMinutes(state.active.date, dateKey);
  const start = clamp(offset + timeToMinutes(state.active.start), 0, 1439);
  const end = clamp(offset + activeEndMinute(), 0, 1440);
  return clamp(Math.floor((start + Math.max(start, end)) / 2), 0, 1439);
}

function timelineItemFortuneSignalMinute(item, dateKey) {
  const offset = dateOffsetMinutes(item.ownerDate, dateKey);
  const start = clamp(offset + item.startMinute, 0, 1439);
  const end = clamp(offset + item.endMinute, 0, 1440);
  return clamp(Math.floor((start + Math.max(start, end)) / 2), 0, 1439);
}

function isLateTimelineItem(item, dateKey) {
  const offset = dateOffsetMinutes(item.ownerDate, dateKey);
  const start = clamp(offset + item.startMinute, 0, 1440);
  const end = clamp(offset + item.endMinute, 0, 1440);
  return start >= 18 * 60 || end >= 22 * 60;
}

function topTagFromCounts(tagCounts) {
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

async function loadFortuneDetailsWithGemini(fortune, profile, dateKey, context, options = {}) {
  const proxyUrl = geminiProxyUrl();
  if (!proxyUrl) return [];

  const cacheKey = fortuneAiCacheKey(fortune, profile, dateKey, context, proxyUrl);
  const cacheContext = { dateKey, profile, proxyUrl };
  if (options.refresh) await clearFortuneDetailsCache(cacheKey, cacheContext);

  const cached = fortuneAiCache.get(cacheKey);
  if (!options.refresh && cached) return cached;

  if (!options.refresh) await migrateStoredFortuneDetailsCache(cacheKey, cacheContext);

  const stored = options.refresh ? [] : await readStoredFortuneDetails(cacheKey, cacheContext);
  if (!options.refresh && stored.length > 0) {
    fortuneAiLastErrorStatus = 0;
    rememberFortuneAiCache(cacheKey, stored);
    return stored;
  }

  if (fortuneAiProxyDisabled) return [];

  const detailsPromise = generateFortuneDetailsWithGemini(fortune, profile, dateKey, context, proxyUrl)
    .then(async (details) => {
      fortuneAiLastErrorStatus = 0;
      if (details.length > 0) {
        await saveStoredFortuneDetails(cacheKey, details).catch((error) => {
          console.warn("Failed to store Gemini fortune details.", error);
        });
      }
      return details;
    })
    .catch((error) => {
      fortuneAiCache.delete(cacheKey);
      fortuneAiLastErrorStatus = Number(error?.status) || 0;
      if ([404, 503].includes(error?.status)) fortuneAiProxyDisabled = true;
      console.warn("Failed to rewrite fortune with Gemini.", error);
      return [];
    });
  rememberFortuneAiCache(cacheKey, detailsPromise);

  const details = await detailsPromise;
  rememberFortuneAiCache(cacheKey, details);
  return details;
}

async function clearFortuneDetailsCache(cacheKey, cacheContext = {}) {
  fortuneAiCache.delete(cacheKey);
  try {
    const keys = [persistentFortuneAiCacheKey(cacheKey), ...(await storedFortuneDetailsMigrationKeys(cacheKey, cacheContext))];
    await db.meta.bulkDelete([...new Set(keys)]);
  } catch (error) {
    console.warn("Failed to clear stored Gemini fortune details.", error);
  }
}

function geminiProxyUrl() {
  const config = window.TODIDLOG_CONFIG || {};
  return String(config.geminiProxyUrl || GEMINI_PROXY_URL).trim();
}

function fortuneAiCacheKey(fortune, profile, dateKey, context, proxyUrl) {
  return [
    GEMINI_DETAILS_CACHE_SCHEMA,
    dateKey,
    profile?.language || "en",
    hashString(proxyUrl),
    hashString(JSON.stringify(redactedFortuneInput(fortune, profile, dateKey, context))),
  ].join(":");
}

function rememberFortuneAiCache(key, value) {
  if (fortuneAiCache.size >= GEMINI_CACHE_LIMIT) {
    fortuneAiCache.delete(fortuneAiCache.keys().next().value);
  }
  fortuneAiCache.set(key, value);
}

async function readStoredFortuneDetails(cacheKey, cacheContext = {}) {
  try {
    const entry = await db.meta.get(persistentFortuneAiCacheKey(cacheKey));
    return normalizeStoredFortuneDetails(entry?.value, cacheContext?.profile?.language);
  } catch (error) {
    console.warn("Failed to read stored Gemini fortune details.", error);
    return [];
  }
}

async function migrateStoredFortuneDetailsCache(cacheKey, cacheContext = {}) {
  try {
    const targetKey = persistentFortuneAiCacheKey(cacheKey);
    const targetEntry = await db.meta.get(targetKey);
    if (normalizeStoredFortuneDetails(targetEntry?.value, cacheContext?.profile?.language).length > 0) return;

    const source = await findStoredFortuneDetailsMigrationSource(cacheKey, cacheContext);
    if (!source) return;

    const details = normalizeStoredFortuneDetails(source.value, cacheContext?.profile?.language);
    const createdAt = source.value?.createdAt || new Date().toISOString();
    await db.meta.put({
      key: targetKey,
      value: {
        details,
        createdAt,
        migratedAt: new Date().toISOString(),
        migratedFrom: source.key,
      },
    });
    await db.meta.delete(source.key);
  } catch (error) {
    console.warn("Failed to migrate stored Gemini fortune details.", error);
  }
}

async function findStoredFortuneDetailsMigrationSource(cacheKey, cacheContext = {}) {
  const entries = await storedFortuneDetailsMigrationEntries(cacheKey, cacheContext);

  return entries
    .map((entry) => ({
      entry,
      details: normalizeStoredFortuneDetails(entry?.value, cacheContext?.profile?.language),
    }))
    .filter((item) => item.details.length > 0)
    .sort((a, b) => String(b.entry.value?.createdAt || "").localeCompare(String(a.entry.value?.createdAt || "")))[0]?.entry;
}

async function storedFortuneDetailsMigrationKeys(cacheKey, cacheContext = {}) {
  const entries = await storedFortuneDetailsMigrationEntries(cacheKey, cacheContext);
  return entries.map((entry) => entry.key);
}

async function storedFortuneDetailsMigrationEntries(cacheKey, cacheContext = {}) {
  const targetKey = persistentFortuneAiCacheKey(cacheKey);
  const keyPrefixes = fortuneDetailsCacheMigrationPrefixes(cacheContext);
  if (keyPrefixes.length === 0) return [];

  return db.meta
    .toArray()
    .then((items) =>
      items.filter((item) => {
        const key = String(item.key || "");
        return item.key !== targetKey && keyPrefixes.some((prefix) => key.startsWith(prefix));
      }),
    );
}

function fortuneDetailsCacheMigrationPrefixes({ dateKey, profile } = {}) {
  if (!dateKey) return [];
  const language = profile?.language || "en";
  return GEMINI_DETAILS_CACHE_MIGRATION_SCHEMAS.map((schema) =>
    `${FORTUNE_AI_CACHE_META_PREFIX}${[schema, dateKey, language, ""].join(":")}`,
  );
}

async function saveStoredFortuneDetails(cacheKey, details) {
  await db.meta.put({
    key: persistentFortuneAiCacheKey(cacheKey),
    value: {
      details,
      createdAt: new Date().toISOString(),
    },
  });
  await pruneStoredFortuneDetails();
}

async function pruneStoredFortuneDetails() {
  const entries = await db.meta
    .toArray()
    .then((items) => items.filter((item) => String(item.key || "").startsWith(FORTUNE_AI_CACHE_META_PREFIX)));

  if (entries.length <= GEMINI_CACHE_LIMIT) return;

  const staleKeys = entries
    .sort((a, b) => String(b.value?.createdAt || "").localeCompare(String(a.value?.createdAt || "")))
    .slice(GEMINI_CACHE_LIMIT)
    .map((item) => item.key);

  if (staleKeys.length > 0) await db.meta.bulkDelete(staleKeys);
}

function persistentFortuneAiCacheKey(cacheKey) {
  return `${FORTUNE_AI_CACHE_META_PREFIX}${cacheKey}`;
}

async function generateFortuneDetailsWithGemini(fortune, profile, dateKey, context, proxyUrl) {
  const payload = await fetchGeminiJson(proxyUrl, geminiFortunePrompt(fortune, profile, dateKey, context));
  return normalizeAiFortuneDetails(payload?.details);
}

function geminiFortunePrompt(fortune, profile, dateKey, context) {
  const languageName = profile?.language === "ko" ? "Korean" : "English";
  return [
    "Write detail rows for TodidLog's daily fortune, a compact local task timer app.",
    `Output language: ${languageName}.`,
    "Keep the tone practical, concise, and natural. Avoid heavy mystical phrasing.",
    "Use the reference signals as background context. Do not expose raw signal names, counters, birth details, task names, memos, URLs, or private information.",
    "Do not mention Gemini, AI, API, astrology engines, Ziwei, Saju, pillars, relations, or implementation details.",
    "Do not copy old detail wording or use fixed detail labels such as Flow, Action, or Care.",
    "Generate the detail rows from the reference signals and work context. If the references are sparse, keep the details general and practical.",
    "When adjacent dates have similar primary signals, use auxiliary signals to make the daily emphasis distinct.",
    "Return strict JSON only. Do not wrap it in markdown.",
    "Required JSON shape:",
    '{"details":[{"label":"1-3 word label","text":"one useful sentence"}]}',
    "Return exactly 3 detail rows. Each label must be natural for the output language and each text must be one sentence.",
    "Source data:",
    JSON.stringify(redactedFortuneInput(fortune, profile, dateKey, context), null, 2),
  ].join("\n");
}

function redactedFortuneInput(fortune, profile, dateKey, context) {
  return {
    date: dateKey,
    language: profile?.language || "en",
    headline: redactFortuneText(fortune?.headline),
    body: redactFortuneText(fortune?.body),
    references: redactedFortuneReferences(fortune?.references),
    workContext: redactedFortuneTaskContext(context),
  };
}

function redactedFortuneReferences(references = {}) {
  return {
    dayPillar: references.dayPillar || "",
    hourPillar: references.hourPillar || "",
    relationCount: Number(references.relationCount) || 0,
    primarySignal: redactedFortuneSignal(references.primarySignal),
    secondarySignal: redactedFortuneSignal(references.secondarySignal),
    auxiliarySignal: redactedAuxiliarySignal(references.auxiliarySignal),
    workSignal: {
      type: references.workSignal?.type || "",
      taskCount: Number(references.workSignal?.taskCount) || 0,
      totalMinutes: Number(references.workSignal?.totalMinutes) || 0,
      longestMinutes: Number(references.workSignal?.longestMinutes) || 0,
      crossDayCount: Number(references.workSignal?.crossDayCount) || 0,
      continuationCount: Number(references.workSignal?.continuationCount) || 0,
      lateTaskCount: Number(references.workSignal?.lateTaskCount) || 0,
      active: Boolean(references.workSignal?.active),
      hasTopTag: Boolean(references.workSignal?.hasTopTag),
    },
    ziweiSignal: references.ziweiSignal
      ? {
          monthlyFocus: references.ziweiSignal.monthlyFocus || "",
          longFocus: references.ziweiSignal.longFocus || "",
          positiveFocus: references.ziweiSignal.positiveFocus || "",
          positiveTone: references.ziweiSignal.positiveTone || "",
          cautionFocus: references.ziweiSignal.cautionFocus || "",
          cautionTone: references.ziweiSignal.cautionTone || "",
          unknownTime: Boolean(references.ziweiSignal.unknownTime),
        }
      : null,
  };
}

function redactedAuxiliarySignal(signal) {
  if (!signal) return null;
  return {
    selectedFocus: signal.selectedFocus || "",
    dayStemFocus: signal.dayStemRole?.focus || "",
    branchStageFocus: signal.branchStage?.focus || "",
    branchSpiritFocus: signal.branchSpirit?.focus || "",
    hiddenStemFocus: signal.hiddenStemRole?.focus || "",
    elementFocus: signal.elementFocus || "",
    voidFocus: signal.voidFocus || "",
    hourStemFocus: signal.hourStemRole?.focus || "",
    hourBranchStageFocus: signal.hourBranchStage?.focus || "",
    hourBranchSpiritFocus: signal.hourBranchSpirit?.focus || "",
    hourElementFocus: signal.hourElementFocus || "",
    dayStemElement: signal.dayStemElement || "",
    dayBranchElement: signal.dayBranchElement || "",
    hourStemElement: signal.hourStemElement || "",
    hourBranchElement: signal.hourBranchElement || "",
    voidBranch: Boolean(signal.voidBranch),
  };
}

function redactedFortuneSignal(signal) {
  if (!signal) return null;
  return {
    type: signal.type || "",
    detail: signal.detail || "",
    natalPillar: signal.natalPillar || "",
    channel: signal.channel || "",
  };
}

function redactedFortuneTaskContext(context = {}) {
  return {
    taskCount: Number(context.taskCount) || 0,
    totalMinutes: Number(context.totalMinutes) || 0,
    longestMinutes: Number(context.longestMinutes) || 0,
    crossDayCount: Number(context.crossDayCount) || 0,
    continuationCount: Number(context.continuationCount) || 0,
    lateTaskCount: Number(context.lateTaskCount) || 0,
    active: Boolean(context.active),
    hasTopTag: Boolean(context.topTag),
  };
}

function redactFortuneText(value) {
  return String(value || "").replace(/#[\p{L}\p{N}_-]+/gu, "#tag");
}

async function fetchGeminiJson(proxyUrl, prompt) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = new Error(`Gemini proxy request failed with ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const text = String(data.text || "").trim();
    if (!text) throw new Error("Gemini proxy returned an empty response.");
    return parseGeminiJsonText(text);
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseGeminiJsonText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function normalizeAiFortuneText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > maxLength) return "";
  return text;
}

function normalizeStoredFortuneDetails(value, language) {
  const source = value?.details || value?.fortune?.details || value?.rewrite?.details || value;
  const details = normalizeAiFortuneDetails(source);
  if (details.length > 0) return details;
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];

  const labels = fortuneStoredDetailLabels(language);
  return normalizeAiFortuneDetails([
    { label: labels.flow, text: source.flow || source[0] },
    { label: labels.action, text: source.action || source[1] },
    { label: labels.care, text: source.care || source[2] },
  ]);
}

function fortuneStoredDetailLabels(language) {
  if (language === "ko") {
    return {
      flow: "흐름",
      action: "실행",
      care: "주의",
    };
  }
  return {
    flow: "Flow",
    action: "Action",
    care: "Care",
  };
}

function normalizeAiFortuneDetails(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => ({
      label: normalizeAiFortuneText(item?.label, 24),
      text: normalizeAiFortuneText(item?.text, 220),
    }))
    .filter((item) => item.label && item.text)
    .slice(0, 3);
}

function hashString(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function renderFortuneSummaryContent(fortune, profile, context, dateKey) {
  els.fortuneSummary.replaceChildren();

  const titleRow = document.createElement("div");
  titleRow.className = "fortune-summary-title-row";

  const titleMeta = document.createElement("span");
  titleMeta.className = "fortune-summary-title-meta";

  const title = document.createElement("span");
  title.className = "fortune-summary-title";
  title.textContent = fortune.title;

  const separator = document.createElement("span");
  separator.className = "fortune-summary-separator";
  separator.textContent = "·";

  const date = document.createElement("span");
  date.className = "fortune-summary-date";
  date.textContent = formatFortuneSummaryDate(state.selectedDate, fortune.language);

  titleMeta.append(title, separator, date);
  titleRow.append(titleMeta);

  const copy = document.createElement("div");
  copy.className = "fortune-summary-copy";
  const detailItems = (fortune.details || []).filter((item) => item?.label && item?.text);
  const canLoadDetails = Boolean(fortune.references);
  copy.classList.toggle("has-details", canLoadDetails || detailItems.length > 0);

  const headline = document.createElement("strong");
  headline.className = "fortune-summary-headline";
  headline.textContent = fortune.headline;

  const body = document.createElement("span");
  body.className = "fortune-summary-body";
  body.textContent = fortune.body;

  copy.append(headline, body);

  if (canLoadDetails || detailItems.length > 0) {
    const toggleRow = document.createElement("div");
    toggleRow.className = "fortune-summary-toggle-row";

    const toggle = document.createElement("button");
    toggle.className = "fortune-summary-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "fortuneSummaryDetails");
    toggle.addEventListener("click", () => {
      handleFortuneDetailsToggle({
        toggle,
        details,
        fortune,
        profile,
        context,
        dateKey,
      });
    });

    toggleRow.append(toggle);
    titleRow.append(toggleRow);

    const details = document.createElement("span");
    details.className = "fortune-summary-details";
    details.id = "fortuneSummaryDetails";
    details.dataset.language = fortune.language;

    renderFortuneDetailItems(details, detailItems);
    renderFortuneDetailsRefresh(details, { toggle, fortune, profile, context, dateKey });

    updateFortuneDetailsToggle(toggle, details);
    copy.append(details);
  }

  els.fortuneSummary.append(titleRow, copy);
}

async function handleFortuneDetailsToggle({ toggle, details, fortune, profile, context, dateKey }) {
  state.isFortuneDetailsOpen = !state.isFortuneDetailsOpen;
  updateFortuneDetailsToggle(toggle, details);

  if (!state.isFortuneDetailsOpen || details.dataset.loaded === "true" || details.dataset.loading === "true") return;

  details.dataset.loading = "true";
  toggle.disabled = true;
  renderFortuneDetailsMessage(details, fortune.language, "loading");
  updateFortuneDetailsRefreshState(details);

  const detailItems = await loadFortuneDetailsWithGemini(fortune, profile, dateKey, context);
  if (dateKey !== state.selectedDate) return;

  details.dataset.loading = "false";
  toggle.disabled = false;

  if (detailItems.length > 0) {
    renderFortuneDetailItems(details, detailItems);
    renderFortuneDetailsRefresh(details, { toggle, fortune, profile, context, dateKey });
    details.dataset.loaded = "true";
  } else {
    renderFortuneDetailsMessage(details, fortune.language, fortuneDetailsUnavailableStatus());
    renderFortuneDetailsRefresh(details, { toggle, fortune, profile, context, dateKey });
    details.dataset.loaded = "true";
  }

  updateFortuneDetailsToggle(toggle, details);
}

function renderFortuneDetailItems(details, items) {
  const action = details.querySelector(".fortune-summary-detail-actions");
  details.replaceChildren();

  for (const item of items) {
    const row = document.createElement("span");
    row.className = "fortune-summary-detail";

    const label = document.createElement("span");
    label.className = "fortune-summary-detail-label";
    label.textContent = item.label;

    const text = document.createElement("span");
    text.className = "fortune-summary-detail-text";
    text.textContent = item.text;

    row.append(label, text);
    details.append(row);
  }

  if (action) details.append(action);
}

function renderFortuneDetailsMessage(details, language, status) {
  const action = details.querySelector(".fortune-summary-detail-actions");
  const row = document.createElement("span");
  row.className = "fortune-summary-detail-message";
  if (["loading", "refreshing"].includes(status)) {
    const spinner = document.createElement("span");
    spinner.className = "fortune-summary-detail-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = fortuneDetailsStatusText(language, status);

    row.append(spinner, text);
  } else {
    row.textContent = fortuneDetailsStatusText(language, status);
  }
  details.replaceChildren(row);
  if (action) details.append(action);
}

function renderFortuneDetailsRefresh(details, payload) {
  const host = fortuneDetailsActionsHost(details);
  const existing = host.querySelector(".fortune-summary-detail-actions") || details.querySelector(".fortune-summary-detail-actions");
  if (existing) existing.remove();

  if (!payload.fortune?.references || fortuneAiProxyDisabled) return;

  const actions = document.createElement("span");
  actions.className = "fortune-summary-detail-actions";

  const button = document.createElement("button");
  button.className = "fortune-summary-detail-refresh";
  button.type = "button";
  button.setAttribute("aria-label", payload.fortune.language === "ko" ? "상세 정보 새로 생성" : "Refresh details");
  button.disabled = details.dataset.loading === "true";
  button.addEventListener("click", () => refreshFortuneDetails({ ...payload, details, refreshButton: button }));

  const icon = document.createElement("span");
  icon.className = "fortune-summary-detail-refresh-icon";
  icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = payload.fortune.language === "ko" ? "다시보기" : "Refresh";

  button.append(icon, label);
  actions.append(button);
  actions.hidden = !state.isFortuneDetailsOpen;
  host.prepend(actions);
}

function fortuneDetailsActionsHost(details) {
  return details.closest(".fortune-summary")?.querySelector(".fortune-summary-toggle-row") || details;
}

function updateFortuneDetailsRefreshState(details) {
  const actions = fortuneDetailsActionsHost(details).querySelector(".fortune-summary-detail-actions");
  if (!actions) return;

  actions.hidden = details.hidden;
  const button = actions.querySelector(".fortune-summary-detail-refresh");
  if (button) button.disabled = details.dataset.loading === "true";
}

async function refreshFortuneDetails({ toggle, details, fortune, profile, context, dateKey, refreshButton }) {
  if (details.dataset.loading === "true") return;

  details.dataset.loading = "true";
  details.dataset.loaded = "false";
  toggle.disabled = true;
  refreshButton.disabled = true;
  renderFortuneDetailsMessage(details, fortune.language, "refreshing");
  renderFortuneDetailsRefresh(details, { toggle, fortune, profile, context, dateKey });

  const detailItems = await loadFortuneDetailsWithGemini(fortune, profile, dateKey, context, { refresh: true });
  if (dateKey !== state.selectedDate) return;

  details.dataset.loading = "false";
  toggle.disabled = false;

  if (detailItems.length > 0) {
    renderFortuneDetailItems(details, detailItems);
    details.dataset.loaded = "true";
  } else {
    renderFortuneDetailsMessage(details, fortune.language, fortuneDetailsUnavailableStatus());
    details.dataset.loaded = "true";
  }

  renderFortuneDetailsRefresh(details, { toggle, fortune, profile, context, dateKey });
  updateFortuneDetailsToggle(toggle, details);
}

function fortuneDetailsStatusText(language, status) {
  if (status === "loading") return language === "ko" ? "세부 흐름을 불러오는 중입니다." : "Loading details.";
  if (status === "refreshing") return language === "ko" ? "세부 흐름을 새로 생성하는 중입니다." : "Refreshing details.";
  if (status === "quota") return language === "ko" ? "Gemini 사용 한도에 도달했습니다. 캐시된 상세 정보가 없습니다." : "Gemini quota was reached and no cached details are available.";
  return language === "ko" ? "세부 흐름을 불러오지 못했습니다." : "Details are unavailable.";
}

function fortuneDetailsUnavailableStatus() {
  return fortuneAiLastErrorStatus === 429 ? "quota" : "unavailable";
}

function updateFortuneDetailsToggle(toggle, details) {
  const isOpen = state.isFortuneDetailsOpen;
  const icon = document.createElement("span");
  icon.className = "fortune-summary-toggle-icon";
  icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = details.dataset.language === "ko" ? (isOpen ? "접기" : "상세") : isOpen ? "Hide" : "Details";

  toggle.replaceChildren(icon, label);
  toggle.classList.toggle("expanded", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  details.hidden = !isOpen;
  updateFortuneDetailsRefreshState(details);
}

function formatFortuneSummaryDate(dateKey, language) {
  const date = parseDateKey(dateKey);
  if (language === "ko") return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function renderWeekStrip() {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  els.weekStrip.innerHTML = "";

  for (const day of days) {
    const dateKey = toDateKey(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = classNames("date-chip", {
      active: dateKey === state.selectedDate,
      today: dateKey === toDateKey(new Date()),
    });
    button.dataset.date = dateKey;
    button.innerHTML = `
      <strong>${day.getDate()}</strong>
      <small>${dotTextForDate(dateKey)}</small>
    `;
    button.addEventListener("click", () => selectDate(dateKey));
    els.weekStrip.append(button);
  }
}

function renderTimer() {
  const active = state.active;
  const isToday = isSelectedDateToday();
  els.startTimerBtn.classList.toggle("hidden", Boolean(active));
  els.stopTimerBtn.classList.toggle("hidden", !active);
  els.startTimerBtn.disabled = !isToday || Boolean(active);
  els.stopTimerBtn.disabled = !active;
  els.timerDisplay.classList.toggle("disabled", !isToday && !active);
  els.timerStatus.classList.toggle("hidden", !isToday && !active);

  if (!active) {
    els.timerDisplay.textContent = "00:00:00";
    els.timerStatus.textContent = isToday ? "Ready" : "";
    return;
  }

  const elapsed = Math.max(0, Math.floor((Date.now() - active.startedAt) / 1000));
  els.timerDisplay.textContent = formatSeconds(elapsed);
  els.timerStatus.textContent = isToday ? "Recording" : "";
}

function renderSummaries() {
  const weekDates = rangeDates(state.weekStart, addDays(state.weekStart, 6));
  const monthStart = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
  const monthEnd = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 0);
  const weekTotal = totalMinutesForDates(weekDates);
  const monthTotal = totalMinutesForDates(rangeDates(monthStart, monthEnd));

  els.dailyTotal.textContent = formatDuration(totalMinutesForDate(state.selectedDate));
  els.calendarTotalLabel.textContent = state.isCalendarOpen ? "Month" : "Week";
  els.calendarTotalValue.textContent = formatDuration(state.isCalendarOpen ? monthTotal : weekTotal);
}

function renderTasks() {
  const visibleItems = visibleTimelineItemsForDate(state.selectedDate);
  const activeItem = activeSessionForSelectedDate();
  const timelineItems = [];

  els.taskList.innerHTML = "";
  els.emptyMessage.classList.toggle("hidden", Boolean(visibleItems.length || activeItem));

  if (activeItem) {
    timelineItems.push({
      type: "session",
      session: activeItem,
      active: true,
      sortValue: Number.MAX_SAFE_INTEGER,
      crossDay: activeItem.crossDay,
      accentAlpha: activeItem.accentAlpha,
      railTimeMinute: activeItem.railTimeMinute,
    });
  }

  for (const item of visibleItems) {
    if (item.type === "group") {
      const group = groupById(item.id);
      const sessions = group?.sessionIds.map((id) => sessionById(id)).filter(Boolean) || [];
      if (group && sessions.length) {
        timelineItems.push({
          ...item,
          group,
          sessions,
          active: false,
          crossDay: item.isCrossDay,
          sameDay: isSameDayItem(item),
          accentAlpha: item.accentAlpha,
          includedMinutes: item.includedMinutes,
          totalMinutes: item.duration,
          railTimeMinute: item.railTimeMinute,
        });
      }
    } else {
      const session = sessionById(item.id);
      if (session) {
        timelineItems.push({
          ...item,
          session,
          active: false,
          crossDay: item.isCrossDay,
          sameDay: isSameDayItem(item),
          accentAlpha: item.accentAlpha,
          includedMinutes: item.includedMinutes,
          totalMinutes: item.duration,
          railTimeMinute: item.railTimeMinute,
        });
      }
    }
  }

  timelineItems.sort((a, b) => b.sortValue - a.sortValue);

  for (const item of timelineItems) {
    if (item.type === "group") {
      els.taskList.append(renderGroupCard(item.group, item.sessions, {
        crossDay: item.crossDay,
        sameDay: item.sameDay,
        accentAlpha: item.accentAlpha,
        includedMinutes: item.includedMinutes,
        totalMinutes: item.totalMinutes,
        displayDate: state.selectedDate,
        railTimeMinute: item.railTimeMinute,
      }));
    } else {
      els.taskList.append(renderTaskCard(item.session, {
        active: item.active,
        crossDay: item.crossDay,
        sameDay: item.sameDay,
        accentAlpha: item.accentAlpha,
        includedMinutes: item.includedMinutes,
        totalMinutes: item.totalMinutes,
        displayDate: state.selectedDate,
        railTimeMinute: item.railTimeMinute,
      }));
    }
  }

  updateSelectionActions();
}

function renderTaskCard(session, options) {
  const card = document.createElement("article");
  const selected = state.selectedIds.has(session.id);
  card.className = classNames("task-card", {
    selected,
    active: options.active,
    "cross-day": options.crossDay,
    "same-day": options.sameDay,
  });
  applyTaskAccent(card, options);

  card.innerHTML = `
    ${taskRailTimeTickHtml(options)}
    <button class="task-check" type="button" aria-label="Select task">${selected ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-main">
          <button class="card-icon" type="button" aria-label="Edit task"><img src="./assets/task_title_icon.png" alt="" aria-hidden="true" /></button>
          <strong>${escapeHtml(taskTitleText(session.title))}</strong>
        </div>
        ${tagChipsHtml(session.tags || [])}
        ${taskMemoHtml(session)}
        ${taskMetaHtml(sessionMeta(session, options))}
    </div>
  `;

  card.addEventListener("click", () => {
    if (!options.active) openSessionModal(session.id);
  });
  card.querySelector(".task-check").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSessionSelection(session.id);
  });
  card.querySelector(".card-icon").addEventListener("click", (event) => {
    event.stopPropagation();
    if (!options.active) openSessionModal(session.id);
  });
  card.querySelectorAll(".task-details a").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  if (options.active) {
    card.querySelector(".task-check").disabled = true;
    card.querySelector(".card-icon").disabled = true;
  }

  return card;
}

function renderGroupCard(group, sessions, options = {}) {
  const card = document.createElement("article");
  const selected = state.selectedIds.has(group.id);
  card.className = classNames("task-card merged-task", {
    selected,
    "cross-day": options.crossDay,
    "same-day": options.sameDay,
  });
  applyTaskAccent(card, options);
  const start = groupStartMinutes(group, sessions);
  const end = groupEndMinutes(group, sessions);
  const minutes = groupDurationMinutes(group, sessions);

  card.innerHTML = `
    ${taskRailTimeTickHtml(options)}
    <button class="task-check" type="button" aria-label="Select task">${selected ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-main">
          <button class="card-icon" type="button" aria-label="Edit task"><img src="./assets/task_title_icon.png" alt="" aria-hidden="true" /></button>
          <strong>${escapeHtml(mergedTaskTitle(group, sessions))}</strong>
        </div>
        ${tagChipsHtml(group.tags || [])}
        ${taskDetailsHtml(mergedTaskMemo(group, sessions))}
        ${taskMetaHtml(taskMetaParts(start, end, minutes, options))}
    </div>
  `;

  card.addEventListener("click", () => openExistingGroupModal(group.id));
  card.querySelector(".task-check").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleGroupSelection(group.id);
  });
  card.querySelector(".card-icon").addEventListener("click", (event) => {
    event.stopPropagation();
    openExistingGroupModal(group.id);
  });
  card.querySelectorAll(".task-details a").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  return card;
}

function applyTaskAccent(card, options = {}) {
  if (!options.crossDay) return;
  if (!Number.isFinite(options.accentAlpha)) return;
  card.style.setProperty("--task-accent-alpha", String(options.accentAlpha));
}

function renderMonth() {
  const monthTitle = state.monthCursor.toLocaleString("en", { month: "long", year: "numeric" });
  els.calendarContextTitle.textContent = monthTitle;
  els.monthGrid.innerHTML = "";
  const first = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
  const gridStart = startOfCalendarWeek(first);
  const activeWeekDates = new Set(rangeDates(state.weekStart, addDays(state.weekStart, 6)));

  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index);
    const dateKey = toDateKey(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = classNames("month-day", {
      muted: day.getMonth() !== state.monthCursor.getMonth(),
      selected: dateKey === state.selectedDate,
      today: dateKey === toDateKey(new Date()),
      "week-selected": activeWeekDates.has(dateKey),
      "week-start": dateKey === toDateKey(state.weekStart),
      "week-end": dateKey === toDateKey(addDays(state.weekStart, 6)),
    });
    button.dataset.date = dateKey;
    button.innerHTML = `<strong>${day.getDate()}</strong><small aria-hidden="true">${dotTextForDate(dateKey)}</small>`;
    button.addEventListener("click", () => selectDate(dateKey));
    els.monthGrid.append(button);
  }
}

function renderCalendarPanel() {
  if (!state.calendarAnimating) {
    withCalendarTransitionsDisabled(updateCalendarPanelState);
    return;
  }

  updateCalendarPanelState();
}

function updateCalendarPanelState() {
  els.calendarSurface.classList.toggle("calendar-expanded", state.isCalendarOpen);
  els.weekNav.classList.add("calendar-view-hidden");
  els.weekNav.setAttribute("aria-hidden", "true");
  els.monthInline.classList.remove("calendar-view-hidden");
  els.monthInline.setAttribute("aria-hidden", "false");
  els.prevCalendarBtn.setAttribute("aria-label", state.isCalendarOpen ? "Previous month" : "Previous week");
  els.nextCalendarBtn.setAttribute("aria-label", state.isCalendarOpen ? "Next month" : "Next week");
  els.calendarToggleBtn.setAttribute("aria-expanded", String(state.isCalendarOpen));
  renderCalendarToggleButton();
  els.monthReportBtn.classList.toggle("hidden", !state.isCalendarOpen);
  updateCalendarWeekOffset();
}

function renderCalendarToggleButton() {
  const label = document.createElement("span");
  label.textContent = state.isCalendarOpen ? "Week" : "Month";

  const icon = document.createElement("span");
  icon.className = "calendar-toggle-icon";
  icon.setAttribute("aria-hidden", "true");

  els.calendarToggleBtn.replaceChildren(icon, label);
}

function withCalendarTransitionsDisabled(callback) {
  const elements = [
    els.calendarBody,
    els.monthInline,
    els.monthGrid,
    ...els.monthGrid.querySelectorAll(".month-day, .month-day strong, .month-day small"),
  ].filter(Boolean);
  const previousTransitions = elements.map((element) => element.style.transition);

  elements.forEach((element) => {
    element.style.transition = "none";
  });
  callback();
  void els.monthGrid.offsetHeight;
  requestAnimationFrame(() => {
    elements.forEach((element, index) => {
      element.style.transition = previousTransitions[index];
    });
  });
}

async function copyMonthReport() {
  const report = buildMonthReport();
  const label = els.monthReportBtn.querySelector(".report-button-label");
  const originalText = label?.textContent || "Report";
  els.monthReportBtn.disabled = true;

  try {
    await writeClipboardText(report);
    setMonthReportButtonLabel("Copied");
  } catch (error) {
    console.error("Failed to copy monthly report.", error);
    setMonthReportButtonLabel("Copy failed");
  } finally {
    window.setTimeout(() => {
      setMonthReportButtonLabel(originalText);
      els.monthReportBtn.disabled = false;
    }, 1200);
  }
}

function setMonthReportButtonLabel(text) {
  const label = els.monthReportBtn.querySelector(".report-button-label");
  if (label) {
    label.textContent = text;
    return;
  }
  els.monthReportBtn.textContent = text;
}

function buildMonthReport() {
  const monthStart = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
  const monthEnd = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 0);
  const dateKeys = rangeDates(monthStart, monthEnd);
  const reportByDate = dateKeys.map((dateKey) => ({ dateKey, items: reportItemsForDate(dateKey) }));
  const total = reportByDate.reduce((sum, reportDay) => sum + reportDay.items.reduce((daySum, item) => daySum + item.minutes, 0), 0);
  const lines = [
    `${state.monthCursor.toLocaleString("en", { month: "long", year: "numeric" })} Report`,
    `Range: ${toDateKey(monthStart)} ~ ${toDateKey(monthEnd)}`,
    `Monthly total: ${formatDuration(total)}`,
    "",
  ];

  let hasWork = false;
  for (const { dateKey, items } of reportByDate) {
    const dayTotal = items.reduce((sum, item) => sum + item.minutes, 0);
    if (!items.length) continue;
    hasWork = true;
    lines.push(`${dateKey} (${weekdayShort(parseDateKey(dateKey))}) · Total ${formatDuration(dayTotal)}`);

    for (const item of items) {
      lines.push(`- ${item.title} · ${formatDuration(item.minutes)} (${item.range})`);
      if (item.tags.length) lines.push(`  Tags: ${item.tags.join(", ")}`);
      if (item.memo) lines.push(...indentReportMemo(item.memo));
    }

    lines.push("");
  }

  if (!hasWork) lines.push("No records");
  return lines.join("\n").trimEnd();
}

function reportItemsForDate(dateKey) {
  return visibleTimelineItemsForDate(dateKey)
    .map((item) => ({
      ...reportItemDetails(item),
      minutes: item.duration,
      range: formatTimeRangeFromMinutes(item.startMinute, item.endMinute, item.ownerDate, dateKey),
      sortValue: item.sortValue,
    }))
    .sort((a, b) => b.sortValue - a.sortValue);
}

function reportItemDetails(item) {
  if (item.type === "group") {
    const group = groupById(item.id);
    const sessions = group?.sessionIds.map((id) => sessionById(id)).filter(Boolean) || [];
    return {
      title: mergedTaskTitle(group, sessions),
      memo: group?.memo || mergedTaskMemo(group, sessions),
      tags: mergedTaskTags(sessions, group),
    };
  }

  const session = sessionById(item.id);
  return {
    title: taskTitleText(session?.title),
    memo: String(session?.memo || "").trim(),
    tags: session?.tags || [],
  };
}

function indentReportMemo(memo) {
  return memoToPlainText(memo)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `  Details: ${line}`);
}

async function writeClipboardText(text) {
  let clipboardError = null;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw clipboardError || new Error("Clipboard copy was not available.");
}

function openFortuneSettings() {
  const profile = normalizedFortuneProfile(state.fortuneProfile || {});
  els.fortuneBirthDate.value = profile.birthDate || "";
  els.fortuneBirthTime.value = profile.birthTime || "12:00";
  els.fortuneBirthplace.value = profile.birthplace?.label || "";
  els.fortuneGender.value = profile.gender || "M";
  els.fortuneLanguage.value = profile.language;
  els.fortuneUnknownTime.checked = Boolean(profile.unknownTime);
  els.fortuneSettingsError.textContent = "";
  els.deleteFortuneProfileBtn.classList.toggle("hidden", !state.fortuneProfile);
  updateBirthplaceSuggestions();
  updateFortuneTimeState();
  renderFortuneSettingsNatalPreview();
  els.fortuneSettingsModal.showModal();
}

function saveFortuneSettings(event) {
  event.preventDefault();
  const { profile, birthplaceText } = fortuneProfileFromSettingsForm();

  const error = validateFortuneProfile(profile, birthplaceText);
  if (error) {
    els.fortuneSettingsError.textContent = error;
    return;
  }

  state.fortuneProfile = profile;
  closeFortuneSettings();
  render();
}

function deleteFortuneProfile() {
  state.fortuneProfile = null;
  closeFortuneSettings();
  render();
}

function closeFortuneSettings() {
  fortuneSettingsPreviewId += 1;
  els.fortuneSettingsModal.close();
}

function closeFortuneSettingsFromBackdrop(event) {
  if (event.target === els.fortuneSettingsModal) closeFortuneSettings();
}

function updateFortuneTimeState() {
  els.fortuneBirthTime.disabled = els.fortuneUnknownTime.checked;
}

function updateBirthplaceSuggestions() {
  const places = searchBirthplaces(els.fortuneBirthplace.value);
  els.fortuneBirthplaceOptions.replaceChildren(
    ...places.map((place) => {
      const option = document.createElement("option");
      option.value = place.label;
      option.label = place.label;
      return option;
    }),
  );
}

async function renderFortuneSettingsNatalPreview() {
  const previewId = ++fortuneSettingsPreviewId;
  els.fortuneNatalPreview.classList.add("hidden");
  els.fortuneNatalPreview.replaceChildren();

  const { profile, birthplaceText } = fortuneProfileFromSettingsForm();
  if (validateFortuneProfile(profile, birthplaceText)) return;

  try {
    const summary = await computeNatalSummary(profile);
    if (previewId !== fortuneSettingsPreviewId || !summary) return;
    renderFortuneSettingsNatalSummary(summary);
    els.fortuneNatalPreview.classList.remove("hidden");
  } catch {
    if (previewId !== fortuneSettingsPreviewId) return;
    els.fortuneNatalPreview.classList.add("hidden");
    els.fortuneNatalPreview.replaceChildren();
  }
}

function renderFortuneSettingsNatalSummary(summary) {
  const title = document.createElement("span");
  title.className = "fortune-natal-title";
  title.textContent = summary.title;

  const list = document.createElement("span");
  list.className = "fortune-natal-list";

  for (const item of summary.items || []) {
    const row = document.createElement("span");
    row.className = "fortune-natal-row";

    const label = document.createElement("span");
    label.className = "fortune-natal-label";
    label.textContent = item.label;

    const text = document.createElement("span");
    text.className = "fortune-natal-text";
    text.textContent = item.text;

    row.append(label, text);
    list.append(row);
  }

  els.fortuneNatalPreview.replaceChildren(title, list);
}

function fortuneProfileFromSettingsForm() {
  const birthplaceText = els.fortuneBirthplace.value.trim();
  const birthplace = birthplaceText ? resolveBirthplace(birthplaceText) : null;
  return {
    birthplaceText,
    profile: {
      birthDate: els.fortuneBirthDate.value,
      birthTime: els.fortuneBirthTime.value || "12:00",
      birthplace,
      gender: els.fortuneGender.value === "F" ? "F" : "M",
      language: els.fortuneLanguage.value === "ko" ? "ko" : "en",
      unknownTime: els.fortuneUnknownTime.checked,
    },
  };
}

function validateFortuneProfile(profile, birthplaceText = "") {
  if (!profile.birthDate) return "Enter your birth date.";
  const [year, month, day] = profile.birthDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "Enter a valid birth date.";
  if (!profile.unknownTime && !isValidTimeValue(normalizeTimeValue(profile.birthTime))) return "Enter a valid birth time.";
  if (birthplaceText && !profile.birthplace) return "Select a birthplace from the list or leave it blank.";
  return "";
}

function normalizedFortuneProfile(profile) {
  if (!profile) return null;
  return {
    ...profile,
    birthplace: normalizedBirthplace(profile.birthplace),
    language: profile.language === "ko" || profile.language === "en" ? profile.language : defaultFortuneLanguage(),
  };
}

function normalizedBirthplace(place) {
  if (!place) return null;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    label: String(place.label || place.name || "").trim(),
    name: String(place.name || "").trim(),
    country: String(place.country || "").trim(),
    region: String(place.region || "").trim(),
    lat,
    lon,
  };
}

function defaultFortuneLanguage() {
  return navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function toggleCalendarPanel() {
  const nextOpen = !state.isCalendarOpen;
  if (state.calendarAnimating) return;
  const didSyncWeek = !nextOpen && ensureWeekSelectionForMonth();

  if (didSyncWeek) {
    renderHeader();
    renderWeekStrip();
    renderTasks();
    renderMonth();
  }

  if (canAnimateCalendarTransition()) {
    animateCalendarTransition(nextOpen);
    return;
  }

  state.isCalendarOpen = nextOpen;
  renderSummaries();
  renderCalendarPanel();
}

function ensureWeekSelectionForMonth() {
  if (isSelectedDateInCalendarMonth(state.selectedDate, state.monthCursor)) return false;

  const fallbackDate = fallbackWeekDateForMonth(state.monthCursor);
  state.selectedDate = toDateKey(fallbackDate);
  state.weekStart = startOfWeek(fallbackDate);
  state.isFortuneDetailsOpen = false;
  clearSelection(false);
  return true;
}

function isSelectedDateInCalendarMonth(dateKey, monthCursor) {
  const selected = parseDateKey(dateKey);
  return selected.getFullYear() === monthCursor.getFullYear() && selected.getMonth() === monthCursor.getMonth();
}

function fallbackWeekDateForMonth(monthCursor) {
  const today = new Date();
  if (today.getFullYear() === monthCursor.getFullYear() && today.getMonth() === monthCursor.getMonth()) {
    return today;
  }
  return new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
}

function canAnimateCalendarTransition() {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return Boolean(!reducedMotion && els.monthGrid && els.calendarSurface && els.calendarBody);
}

function animateCalendarTransition(nextOpen) {
  const timing = calendarTransitionTiming();
  state.calendarAnimating = true;
  state.isCalendarOpen = nextOpen;
  renderSummaries();
  renderCalendarPanel();

  window.setTimeout(() => {
    state.calendarAnimating = false;
  }, timing.duration);
}

function calendarTransitionTiming() {
  return {
    duration: 220,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  };
}

function cssNumber(element, property, fallback) {
  if (!element) return fallback;
  const value = Number.parseFloat(getComputedStyle(element)[property]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function updateCalendarWeekOffset() {
  const firstWeekDay = els.monthGrid.querySelector(".month-day.week-selected");
  if (!firstWeekDay) return;
  const days = Array.from(els.monthGrid.children);
  const rowIndex = Math.floor(days.indexOf(firstWeekDay) / 7);
  const referenceDay = els.monthGrid.querySelector(".month-day:not(.week-selected)") || firstWeekDay;
  const rowHeight = referenceDay.getBoundingClientRect().height || 30;
  const rowGap = cssNumber(els.monthGrid, "rowGap", 4);
  const rowCount = Math.ceil(days.length / 7);
  const monthHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;

  els.monthGrid.style.setProperty("--selected-week-offset", `${rowIndex * (rowHeight + rowGap)}px`);
  els.monthInline.style.setProperty("--calendar-month-height", `${monthHeight}px`);
}

function startTimer() {
  if (state.active) return;

  const now = new Date();
  const date = toDateKey(now);
  if (state.selectedDate !== date) return;

  state.selectedDate = date;
  state.weekStart = startOfWeek(now);
  state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  state.isFortuneDetailsOpen = false;
  state.active = {
    date,
    start: toTimeValue(now),
    startedAt: now.getTime(),
  };
  clearSelection(false);
  render();
}

function stopTimer() {
  if (!state.active) return;
  const active = state.active;

  if (!active.date || !active.start || !active.startedAt) {
    console.warn("Discarding invalid active timer state.", active);
    state.active = null;
    render();
    return;
  }

  const now = new Date();
  const end = normalizedStopTime(active.start, now);
  const session = {
    id: createId(),
    date: active.date,
    title: "",
    start: active.start,
    end,
    tags: [],
    memo: "",
    createdAt: new Date().toISOString(),
  };

  const error = validateSession(session);
  if (!error) {
    state.sessions.push(session);
    state.selectedIds = new Set([session.id]);
  }

  state.active = null;
  render();
}

function openQuickModal() {
  const start = toTimeValue(new Date());
  state.modal = { type: "note" };
  els.modalKicker.textContent = "Task";
  els.modalTime.textContent = `${state.selectedDate} · New task`;
  setModalTimeEditor(start, start, true);
  els.recordTitle.value = "";
  setModalTags([]);
  setRecordDetails("");
  els.modalError.textContent = "";
  els.deleteRecordBtn.classList.add("hidden");
  rememberModalDraft();
  els.recordModal.showModal();
}

function openSessionModal(id) {
  const session = sessionById(id);
  if (!session) return;
  state.modal = { type: "session", id };
  els.modalKicker.textContent = "Task";
  els.modalTime.textContent = `${formatTimeRange(session.start, session.end)} · ${formatDuration(durationMinutes(session))}`;
  setModalTimeEditor(session.start, session.end, true);
  els.recordTitle.value = session.title || "";
  setModalTags(session.tags || []);
  setRecordDetails(session.memo || "");
  els.modalError.textContent = "";
  els.deleteRecordBtn.textContent = "Delete";
  els.deleteRecordBtn.classList.remove("hidden");
  rememberModalDraft();
  els.recordModal.showModal();
}

function openGroupModal() {
  const items = connectedSelectedItems();
  if (items.length < 2) return;
  const ids = uniqueNonEmpty(items.flatMap((item) => (item.type === "group" ? groupById(item.id)?.sessionIds || [] : [item.id])));
  const sourceGroupIds = items.filter((item) => item.type === "group").map((item) => item.id);
  const startMinute = Math.min(...items.map((item) => item.startMinute ?? timeToMinutes(item.start)));
  const endMinute = Math.max(...items.map((item) => item.endMinute ?? absoluteEndMinutes(item.start, item.end)));
  const start = minutesToTime(startMinute);
  const end = minutesToTime(endMinute);
  state.modal = { type: "newGroup", ids, sourceGroupIds };
  const sessions = ids.map((id) => sessionById(id)).filter(Boolean);
  els.modalKicker.textContent = "Merge";
  els.modalTime.textContent = `${sessions.length} records · ${formatDuration(endMinute - startMinute)}`;
  setModalTimeEditor(start, end, true);
  els.recordTitle.value = mergedTaskTitle(null, sessions);
  setModalTags(mergedTaskTags(sessions));
  setRecordDetails(mergedTaskMemo(null, sessions));
  els.modalError.textContent = "";
  els.deleteRecordBtn.classList.add("hidden");
  rememberModalDraft();
  els.recordModal.showModal();
}

function openExistingGroupModal(id) {
  const group = state.groups.find((item) => item.id === id);
  if (!group) return;
  const sessions = group.sessionIds.map((sessionId) => sessionById(sessionId)).filter(Boolean);
  state.modal = { type: "group", id };
  els.modalKicker.textContent = "Task";
  const start = minutesToTime(groupStartMinutes(group, sessions));
  const end = minutesToTime(groupEndMinutes(group, sessions));
  els.modalTime.textContent = `${formatTimeRange(start, end)} · ${formatDuration(groupDurationMinutes(group, sessions))}`;
  setModalTimeEditor(start, end, true);
  els.recordTitle.value = mergedTaskTitle(group, sessions);
  setModalTags(mergedTaskTags(sessions, group));
  setRecordDetails(mergedTaskMemo(group, sessions));
  els.modalError.textContent = "";
  els.deleteRecordBtn.textContent = "Ungroup";
  els.deleteRecordBtn.classList.remove("hidden");
  rememberModalDraft();
  els.recordModal.showModal();
}

function saveModal(event) {
  event.preventDefault();
  if (!state.modal) return;

  const title = els.recordTitle.value.trim();
  commitTagInput();
  const tags = readModalTags();
  const memo = readRecordDetails();
  const timeRange = readModalTimeRange();

  if (state.modal.type === "note") {
    const timeError = validateEditableTimeRange(timeRange, {
      date: state.selectedDate,
      exclude: [],
    });
    if (timeError) {
      els.modalError.textContent = timeError;
      return;
    }

    state.sessions.push({
      id: createId(),
      date: state.selectedDate,
      title,
      start: timeRange.start,
      end: timeRange.end,
      tags,
      memo,
      createdAt: new Date().toISOString(),
    });
    clearSelection(false);
  }

  if (state.modal.type === "session") {
    const currentSession = sessionById(state.modal.id);
    if (!currentSession) return;
    let nextStart = currentSession.start;
    let nextEnd = currentSession.end;

    const timeError = validateEditableTimeRange(timeRange, {
      date: currentSession.date,
      exclude: [{ type: "session", id: currentSession.id }],
    });
    if (timeError) {
      els.modalError.textContent = timeError;
      return;
    }
    nextStart = timeRange.start;
    nextEnd = timeRange.end;

    state.sessions = state.sessions.map((session) => {
      if (session.id !== state.modal.id) return session;
      const nextSession = {
        ...session,
        title,
        start: nextStart,
        end: nextEnd,
        tags,
        memo,
      };
      delete nextSession.kind;
      return nextSession;
    });
  }

  if (state.modal.type === "newGroup") {
    const groupSessions = state.modal.ids.map((id) => sessionById(id)).filter(Boolean);
    const timeError = validateEditableTimeRange(timeRange, {
      date: state.selectedDate,
      exclude: [
        ...state.modal.ids.map((id) => ({ type: "session", id })),
        ...(state.modal.sourceGroupIds || []).map((id) => ({ type: "group", id })),
      ],
    });
    if (timeError) {
      els.modalError.textContent = timeError;
      return;
    }

    const id = createId();
    const sourceGroupIds = new Set(state.modal.sourceGroupIds || []);
    state.groups = state.groups.filter((group) => !sourceGroupIds.has(group.id));
    state.groups.push({
      id,
      date: state.selectedDate,
      title: title || mergedTaskTitle(null, groupSessions),
      start: timeRange.start,
      end: timeRange.end,
      sessionIds: state.modal.ids,
      tags,
      memo: memo || mergedTaskMemo(null, groupSessions),
      createdAt: new Date().toISOString(),
    });
    state.sessions = state.sessions.map((session) =>
      state.modal.ids.includes(session.id) ? { ...session, groupId: id } : session,
    );
    clearSelection(false);
  }

  if (state.modal.type === "group") {
    const currentGroup = state.groups.find((group) => group.id === state.modal.id);
    if (!currentGroup) return;
    const sessions = currentGroup.sessionIds.map((id) => sessionById(id)).filter(Boolean);
    const timeError = validateEditableTimeRange(timeRange, {
      date: currentGroup.date,
      exclude: [{ type: "group", id: currentGroup.id }],
    });
    if (timeError) {
      els.modalError.textContent = timeError;
      return;
    }

    state.groups = state.groups.map((group) =>
      group.id === state.modal.id
        ? { ...group, title: title || mergedTaskTitle(null, sessions), start: timeRange.start, end: timeRange.end, tags, memo: memo || mergedTaskMemo(null, sessions) }
        : group,
    );
  }

  closeModal();
  render();
}

function deleteModalTarget() {
  if (!state.modal) return;

  if (state.modal.type === "session") {
    state.sessions = state.sessions.filter((session) => session.id !== state.modal.id);
    state.groups = state.groups
      .map((group) => ({ ...group, sessionIds: group.sessionIds.filter((id) => id !== state.modal.id) }))
      .filter((group) => group.sessionIds.length);
    state.selectedIds.delete(state.modal.id);
  }

  if (state.modal.type === "group") {
    state.sessions = state.sessions.map((session) =>
      session.groupId === state.modal.id ? { ...session, groupId: null } : session,
    );
    state.groups = state.groups.filter((group) => group.id !== state.modal.id);
  }

  closeModal();
  render();
}

function closeModal() {
  state.modal = null;
  els.recordModal.close();
}

function confirmBackdropClose(event) {
  if (event.target !== els.recordModal) return;
  if (canCloseModal()) closeModal();
}

function confirmDialogCancel(event) {
  event.preventDefault();
  if (canCloseModal()) closeModal();
}

function canCloseModal() {
  if (!hasModalDraftChanged()) return true;
  return confirm("Discard unsaved changes?");
}

function rememberModalDraft() {
  if (!state.modal) return;
  state.modal.initialDraft = readModalDraft();
}

function hasModalDraftChanged() {
  if (!state.modal?.initialDraft) return false;
  return JSON.stringify(state.modal.initialDraft) !== JSON.stringify(readModalDraft());
}

function readModalDraft() {
  return {
    start: els.recordStart.value,
    end: els.recordEnd.value,
    title: els.recordTitle.value,
    tags: readModalTags().join(", "),
    memo: readRecordDetails(),
  };
}

function setRecordDetails(value) {
  if (!detailsEditor) return;
  detailsEditor.commands.setContent(detailsToEditorContent(value || ""));
  updateDetailsToolbarState();
}

function readRecordDetails() {
  if (!detailsEditor) return "";
  if (!detailsEditor.getText().trim()) return "";
  return sanitizeDetailsHtml(detailsEditor.getHTML());
}

function detailsToEditorContent(value) {
  const details = String(value || "").trim();
  if (!details) return "";
  if (isHtmlLike(details)) return sanitizeDetailsHtml(details);
  return plainTextToDetailsHtml(details);
}

function plainTextToDetailsHtml(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function memoToPlainText(value) {
  const details = String(value || "").trim();
  if (!details) return "";
  if (!isHtmlLike(details)) return details;
  const template = document.createElement("template");
  template.innerHTML = sanitizeDetailsHtml(details);
  return (template.content.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function isHtmlLike(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function sanitizeDetailsHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "S", "UL", "OL", "LI", "BLOCKQUOTE", "CODE", "A"]);

  const cleanNode = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      cleanNode(child);
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }

      if (child.tagName === "A") {
        const href = normalizeDetailsLink(child.getAttribute("href") || "");
        if (!href) {
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }

        for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
        child.setAttribute("href", href);
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
        continue;
      }

      for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
    }
  };

  cleanNode(template.content);
  return template.innerHTML.trim();
}

function normalizeDetailsLink(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const href = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(href);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return "";
    return href;
  } catch {
    return "";
  }
}

function setModalTimeEditor(start, end, isVisible) {
  els.modalTimeEditor.classList.toggle("hidden", !isVisible);
  els.recordStart.value = start || "";
  els.recordEnd.value = end || "";
}

function readModalTimeRange() {
  normalizeModalTimeInputs();
  return {
    start: els.recordStart.value,
    end: els.recordEnd.value,
  };
}

function normalizeModalTimeInputs() {
  els.recordStart.value = normalizeTimeValue(els.recordStart.value);
  els.recordEnd.value = normalizeTimeValue(els.recordEnd.value);
}

function setModalTags(tags) {
  if (!state.modal) return;
  state.modal.tags = uniqueNonEmpty(tags);
  els.recordTags.value = "";
  renderModalTagChips();
}

function readModalTags() {
  return uniqueNonEmpty([...(state.modal?.tags || []), ...parseTags(els.recordTags.value)]);
}

function handleTagInputKeydown(event) {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    commitTagInput();
    return;
  }

  if (event.key === "Backspace" && !els.recordTags.value && state.modal?.tags?.length) {
    state.modal.tags.pop();
    renderModalTagChips();
  }
}

function commitTagInput() {
  if (!state.modal) return;
  const tags = parseTags(els.recordTags.value);
  if (!tags.length) return;
  state.modal.tags = uniqueNonEmpty([...(state.modal.tags || []), ...tags]);
  els.recordTags.value = "";
  renderModalTagChips();
}

function renderModalTagChips() {
  const tags = state.modal?.tags || [];
  els.recordTagChips.innerHTML = "";

  for (const tag of tags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip";
    button.setAttribute("aria-label", `Remove ${tag} tag`);
    button.innerHTML = `<span><img src="./assets/tag_icon.png" alt="" aria-hidden="true" />${escapeHtml(tag)}</span><b aria-hidden="true">×</b>`;
    button.addEventListener("click", () => removeModalTag(tag));
    els.recordTagChips.append(button);
  }
}

function removeModalTag(tag) {
  if (!state.modal) return;
  state.modal.tags = (state.modal.tags || []).filter((item) => item !== tag);
  renderModalTagChips();
}

function toggleSessionSelection(id) {
  const session = sessionById(id);
  if (!session || !isSessionVisibleOnDate(session, state.selectedDate)) return;

  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderTasks();
}

function toggleGroupSelection(id) {
  const group = groupById(id);
  if (!group || !isGroupVisibleOnDate(group, state.selectedDate)) return;

  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderTasks();
}

function clearSelection(shouldRender = true) {
  state.selectedIds.clear();
  if (shouldRender) renderTasks();
}

function updateSelectionActions() {
  const count = state.selectedIds.size;
  const canMerge = canMergeSelectedItems();
  els.selectionCount.textContent = count > 1 && !canMerge ? `${count} selected · adjacent only` : `${count} selected`;
  els.groupSelectedBtn.classList.toggle("hidden", !canMerge);
  els.deleteSelectedBtn.classList.toggle("hidden", count === 0);
}

function deleteSelectedItems() {
  const selected = new Set(state.selectedIds);
  if (!selected.size) return;

  const sessionIdsToDelete = new Set();
  const groupIdsToDelete = new Set();

  for (const id of selected) {
    const group = groupById(id);
    if (group && isGroupVisibleOnDate(group, state.selectedDate)) {
      groupIdsToDelete.add(group.id);
      for (const sessionId of group.sessionIds) sessionIdsToDelete.add(sessionId);
      continue;
    }

    const session = sessionById(id);
    if (session && isSessionVisibleOnDate(session, state.selectedDate)) sessionIdsToDelete.add(session.id);
  }

  state.sessions = state.sessions.filter((session) => !sessionIdsToDelete.has(session.id));
  state.groups = state.groups
    .filter((group) => !groupIdsToDelete.has(group.id))
    .map((group) => ({ ...group, sessionIds: group.sessionIds.filter((id) => !sessionIdsToDelete.has(id)) }))
    .filter((group) => group.sessionIds.length);
  clearSelection(false);
  render();
}

function canMergeSelectedItems() {
  return connectedSelectedItems().length >= 2;
}

function connectedSelectedItems() {
  const selected = new Set(state.selectedIds);
  if (selected.size < 2) return [];

  const positions = visibleTimelineItemsForDate(state.selectedDate)
    .map((item, index) => ({ ...item, index }))
    .filter((item) => selected.has(item.id));

  if (positions.length < 2) return [];
  if (positions.some((item) => item.isContinuation)) return [];

  const first = positions[0].index;
  const last = positions[positions.length - 1].index;
  if (last - first + 1 !== positions.length) return [];

  return positions;
}

function selectDate(dateKey) {
  state.selectedDate = dateKey;
  state.weekStart = startOfWeek(parseDateKey(dateKey));
  state.monthCursor = new Date(parseDateKey(dateKey).getFullYear(), parseDateKey(dateKey).getMonth(), 1);
  state.isFortuneDetailsOpen = false;
  clearSelection(false);
  render();
}

function moveWeek(direction) {
  const nextWeekStart = addDays(state.weekStart, direction * 7);
  state.weekStart = nextWeekStart;
  state.selectedDate = toDateKey(nextWeekStart);
  state.monthCursor = new Date(nextWeekStart.getFullYear(), nextWeekStart.getMonth(), 1);
  state.isFortuneDetailsOpen = false;
  clearSelection(false);
  render();
}

function goToToday() {
  selectDate(toDateKey(new Date()));
}

function isSelectedDateToday() {
  return state.selectedDate === toDateKey(new Date());
}

function moveCalendar(direction) {
  if (state.isCalendarOpen) moveMonth(direction);
  else moveWeek(direction);
}

function moveMonth(direction) {
  state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + direction, 1);
  render();
}

function tickTimer() {
  if (state.active) {
    renderTimer();
    renderTasks();
  }
  refreshFortuneForClockTick();
}

function refreshFortuneForClockTick() {
  if (!state.fortuneProfile) return;
  const now = new Date();
  if (state.selectedDate !== toDateKey(now)) return;

  const clockKey = fortuneClockKey(now);
  if (clockKey === fortuneClockRefreshKey) return;

  fortuneClockRefreshKey = clockKey;
  state.isFortuneDetailsOpen = false;
  renderFortuneSummary();
}

function fortuneClockKey(date) {
  return `${toDateKey(date)}:${String(date.getHours()).padStart(2, "0")}`;
}

function validateSession(session) {
  if (!session.date || !session.start || !session.end) return "The time record is invalid.";
  return "";
}

function validateEditableTimeRange(timeRange, options) {
  const start = timeToMinutes(timeRange.start || "");
  const end = absoluteEndMinutes(timeRange.start || "", timeRange.end || "");
  if (!timeRange.start || !timeRange.end || Number.isNaN(start) || Number.isNaN(end)) return "Enter start and end times.";

  const excluded = new Set(options.exclude.map((item) => `${item.type}:${item.id}`));
  const conflict = visibleIntervalsForDate(options.date).find((item) => {
    if (excluded.has(`${item.type}:${item.id}`)) return false;
    return start < item.end && end > item.start;
  });

  if (conflict) return `This time overlaps ${conflict.label}.`;
  return "";
}

function visibleIntervalsForDate(dateKey) {
  const baseDate = parseDateKey(dateKey);
  const candidateDates = [addDays(baseDate, -1), baseDate, addDays(baseDate, 1)];
  const items = candidateDates.flatMap((date) => {
    const offset = Math.round((date - baseDate) / 86400000) * 1440;
    return timelineItemsForDate(toDateKey(date)).map((item) => ({
      ...item,
      start: offset + item.startMinute,
      end: offset + item.endMinute,
      label: item.type === "group" ? "Merged task" : sessionById(item.id)?.title || "Task",
    }));
  });

  if (state.active) {
    const activeOffset = Math.round((parseDateKey(state.active.date) - baseDate) / 86400000) * 1440;
    items.push({
      type: "active",
      id: "active",
      start: activeOffset + timeToMinutes(state.active.start),
      end: activeOffset + activeEndMinute(),
      label: "Active task",
    });
  }

  return items.filter((item) => item.end > item.start);
}

function activeSessionForSelectedDate() {
  if (!state.active || !isActiveTimerVisibleOnDate(state.selectedDate)) return null;
  const endMinute = activeEndMinute();
  const startMinute = timeToMinutes(state.active.start);
  const offset = dateOffsetMinutes(state.active.date, state.selectedDate);
  const includedMinutes = overlapMinutes(offset + startMinute, offset + endMinute, 0, 1440);
  const totalMinutes = Math.max(0, endMinute - startMinute);
  const crossDay = state.active.date !== state.selectedDate || endMinute > 1440;
  return {
    id: "active",
    date: state.active.date,
    title: "Active task",
    start: state.active.start,
    end: toTimeValue(new Date()),
    tags: [],
    memo: "Timer is running.",
    isActive: true,
    crossDay,
    accentAlpha: crossDay ? taskAccentAlpha(includedMinutes, totalMinutes) : 1,
    includedMinutes,
    totalMinutes,
    railTimeMinute: clamp(offset + endMinute, 0, 1440),
  };
}

function cleanupGroups() {
  const validSessionIds = new Set(state.sessions.map((session) => session.id));
  state.groups = state.groups
    .map((group) => ({ ...group, sessionIds: group.sessionIds.filter((id) => validSessionIds.has(id)) }))
    .filter((group) => group.sessionIds.length);
}

function persist() {
  const snapshot = {
    sessions: structuredClone(state.sessions),
    groups: structuredClone(state.groups),
    active: state.active ? structuredClone(state.active) : null,
    fortuneProfile: state.fortuneProfile ? structuredClone(state.fortuneProfile) : null,
  };

  persistQueue = persistQueue
    .catch(() => {})
    .then(() => persistSnapshot(snapshot))
    .catch((error) => console.error("Failed to persist TodidLog state.", error));
}

async function loadStoredState() {
  await migrateLocalStorageToIndexedDb();
  const [sessions, groups, activeEntry, fortuneProfileEntry] = await Promise.all([
    db.sessions.toArray(),
    db.groups.toArray(),
    db.meta.get(ACTIVE_META_KEY),
    db.meta.get(FORTUNE_PROFILE_META_KEY),
  ]);

  state.sessions = sessions;
  state.groups = groups;
  state.active = activeEntry?.value || null;
  state.fortuneProfile = fortuneProfileEntry?.value || null;
}

async function migrateLocalStorageToIndexedDb() {
  const migration = await db.meta.get(LOCAL_STORAGE_MIGRATION_META_KEY);
  if (migration?.value?.completedAt) return;

  const sessions = loadJson(STORAGE_KEY, []);
  const groups = loadJson(GROUPS_KEY, []);
  const active = loadJson(ACTIVE_KEY, null);
  const fortuneProfile = loadJson(FORTUNE_PROFILE_KEY, null);
  const hasLocalData = sessions.length || groups.length || active || fortuneProfile;

  await db.transaction("rw", db.sessions, db.groups, db.meta, async () => {
    if (hasLocalData) {
      const [sessionCount, groupCount] = await Promise.all([db.sessions.count(), db.groups.count()]);
      if (!sessionCount && sessions.length) await db.sessions.bulkPut(sessions);
      if (!groupCount && groups.length) await db.groups.bulkPut(groups);
      if (active && !(await db.meta.get(ACTIVE_META_KEY))) await db.meta.put({ key: ACTIVE_META_KEY, value: active });
      if (fortuneProfile && !(await db.meta.get(FORTUNE_PROFILE_META_KEY))) {
        await db.meta.put({ key: FORTUNE_PROFILE_META_KEY, value: fortuneProfile });
      }
    }

    await db.meta.put({
      key: LOCAL_STORAGE_MIGRATION_META_KEY,
      value: {
        completedAt: new Date().toISOString(),
        hadLocalData: Boolean(hasLocalData),
      },
    });
  });
}

async function persistSnapshot(snapshot) {
  await db.transaction("rw", db.sessions, db.groups, db.meta, async () => {
    await db.sessions.clear();
    if (snapshot.sessions.length) await db.sessions.bulkPut(snapshot.sessions);

    await db.groups.clear();
    if (snapshot.groups.length) await db.groups.bulkPut(snapshot.groups);

    if (snapshot.active) await db.meta.put({ key: ACTIVE_META_KEY, value: snapshot.active });
    else await db.meta.delete(ACTIVE_META_KEY);

    if (snapshot.fortuneProfile) await db.meta.put({ key: FORTUNE_PROFILE_META_KEY, value: snapshot.fortuneProfile });
    else await db.meta.delete(FORTUNE_PROFILE_META_KEY);
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sessionById(id) {
  return state.sessions.find((session) => session.id === id);
}

function sessionsForDate(dateKey) {
  return state.sessions.filter((session) => session.date === dateKey);
}

function groupsForDate(dateKey) {
  return state.groups.filter((group) => group.date === dateKey);
}

function groupById(id) {
  return state.groups.find((group) => group.id === id);
}

function sessionsForDateRange(start, end) {
  const dates = new Set(rangeDates(start, end));
  return state.sessions.filter((session) => dates.has(session.date));
}

function totalMinutesForDate(dateKey) {
  const targetDate = parseDateKey(dateKey);
  const ownerDates = [addDays(targetDate, -1), targetDate];

  return ownerDates.reduce((sum, ownerDate) => {
    const ownerOffset = Math.round((ownerDate - targetDate) / 86400000) * 1440;
    const ownedMinutes = timelineItemsForDate(toDateKey(ownerDate)).reduce((dateSum, item) => {
      return dateSum + overlapMinutes(ownerOffset + item.startMinute, ownerOffset + item.endMinute, 0, 1440);
    }, 0);
    return sum + ownedMinutes;
  }, 0);
}

function totalMinutesForDates(dateKeys) {
  return dateKeys.reduce((sum, dateKey) => sum + totalMinutesForDate(dateKey), 0);
}

function hasRecordsForDate(dateKey) {
  return visibleTimelineItemsForDate(dateKey).length > 0;
}

function durationMinutes(session) {
  return rangeDurationMinutes(session.start, session.end);
}

function taskSortValue(session) {
  const minutes = session.end ? absoluteEndMinutes(session.start, session.end) : timeToMinutes(session.start || "00:00");
  const createdAt = Date.parse(session.createdAt || "");
  const tieBreaker = Number.isNaN(createdAt) ? 0 : createdAt % 60000;
  return minutes * 60000 + tieBreaker;
}

function groupSortValue(group, sessions) {
  return groupEndMinutes(group, sessions) * 60000;
}

function groupStartMinutes(group, sessions) {
  if (group?.start) return timeToMinutes(group.start);
  return sessions.reduce((earliest, session) => Math.min(earliest, timeToMinutes(session.start)), Infinity);
}

function groupEndMinutes(group, sessions) {
  if (group?.start && group?.end) return absoluteEndMinutes(group.start, group.end);
  if (group?.end) return timeToMinutes(group.end);
  return sessions.reduce((latest, session) => Math.max(latest, absoluteEndMinutes(session.start, session.end)), 0);
}

function groupDurationMinutes(group, sessions) {
  return Math.max(0, groupEndMinutes(group, sessions) - groupStartMinutes(group, sessions));
}

function taskTitleText(title) {
  const value = String(title || "").trim();
  if (!value || value === LEGACY_DEFAULT_TITLE) return "Untitled";
  return value;
}

function mergedTaskTitle(group, sessions) {
  if (group?.title && group.title !== LEGACY_MERGED_TITLE) return taskTitleText(group.title);
  const titles = uniqueNonEmpty(sessions.map((session) => taskTitleText(session.title)).filter((title) => title !== "Untitled"));
  return titles.join(" / ") || "Untitled";
}

function mergedTaskMemo(group, sessions) {
  if (group?.memo) return group.memo;
  const parts = sessions.map((session) => {
    const title = taskTitleText(session.title);
    const memo = memoToPlainText(session.memo || "").trim();
    return memo ? `${title}: ${memo}` : title;
  });
  return uniqueNonEmpty(parts).join(" / ") || "No details";
}

function mergedTaskTags(sessions, group = null) {
  if (group?.tags?.length) return group.tags;
  return uniqueNonEmpty(sessions.flatMap((session) => session.tags || []));
}

function uniqueNonEmpty(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function timelineItemsForDate(dateKey) {
  const daySessions = sessionsForDate(dateKey);
  const dayGroups = groupsForDate(dateKey);
  const groupedIds = new Set(dayGroups.flatMap((group) => group.sessionIds));
  const items = [];

  for (const group of dayGroups) {
    const groupSessions = group.sessionIds.map((id) => sessionById(id)).filter(Boolean);
    if (groupSessions.length) {
      const start = minutesToTime(groupStartMinutes(group, groupSessions));
      const startMinute = groupStartMinutes(group, groupSessions);
      const endMinute = groupEndMinutes(group, groupSessions);
      const end = minutesToTime(endMinute);
      items.push({
        type: "group",
        id: group.id,
        start,
        end,
        startMinute,
        endMinute,
        duration: groupDurationMinutes(group, groupSessions),
        sortValue: groupSortValue(group, groupSessions),
      });
    }
  }

  for (const session of daySessions) {
    if (!groupedIds.has(session.id)) {
      items.push({
        type: "session",
        id: session.id,
        start: session.start,
        end: session.end,
        startMinute: timeToMinutes(session.start),
        endMinute: absoluteEndMinutes(session.start, session.end),
        duration: durationMinutes(session),
        sortValue: taskSortValue(session),
      });
    }
  }

  return items.sort((a, b) => b.sortValue - a.sortValue);
}

function visibleTimelineItemsForDate(dateKey) {
  const targetDate = parseDateKey(dateKey);
  const ownerDates = [addDays(targetDate, -1), targetDate].map(toDateKey);
  const items = ownerDates.flatMap((ownerDate) =>
    timelineItemsForDate(ownerDate)
      .filter((item) => itemOverlapsDate(item, ownerDate, dateKey))
      .map((item) => {
        const offset = dateOffsetMinutes(ownerDate, dateKey);
        const displayEndMinute = clamp(offset + item.endMinute, 0, 1440);
        const includedMinutes = overlapMinutes(offset + item.startMinute, offset + item.endMinute, 0, 1440);
        const isContinuation = ownerDate !== dateKey;
        const isCrossDay = includedMinutes < item.duration;
        return {
          ...item,
          ownerDate,
          displayDate: dateKey,
          isCrossDay,
          isContinuation,
          includedMinutes,
          accentAlpha: isCrossDay ? taskAccentAlpha(includedMinutes, item.duration) : 1,
          railTimeMinute: displayEndMinute,
          sortValue: displayEndMinute * 60000,
        };
      }),
  );
  return items.sort((a, b) => b.sortValue - a.sortValue);
}

function taskAccentAlpha(includedMinutes, totalMinutes) {
  if (!Number.isFinite(includedMinutes) || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return 1;
  return Number(clamp(includedMinutes / totalMinutes, 0, 1).toFixed(2));
}

function itemOverlapsDate(item, ownerDate, dateKey) {
  const offset = dateOffsetMinutes(ownerDate, dateKey);
  const start = offset + item.startMinute;
  const end = offset + item.endMinute;
  if (end === start) return start >= 0 && start < 1440;
  return overlapMinutes(start, end, 0, 1440) > 0;
}

function isSameDayItem(item) {
  return Boolean(!item?.isCrossDay && item?.endMinute <= 1440);
}

function isSessionVisibleOnDate(session, dateKey) {
  if (!session?.date || !session.start || !session.end) return false;
  return itemOverlapsDate(
    {
      startMinute: timeToMinutes(session.start),
      endMinute: absoluteEndMinutes(session.start, session.end),
    },
    session.date,
    dateKey,
  );
}

function isGroupVisibleOnDate(group, dateKey) {
  if (!group?.date) return false;
  const sessions = group.sessionIds.map((id) => sessionById(id)).filter(Boolean);
  if (!sessions.length) return false;
  return itemOverlapsDate(
    {
      startMinute: groupStartMinutes(group, sessions),
      endMinute: groupEndMinutes(group, sessions),
    },
    group.date,
    dateKey,
  );
}

function isActiveTimerVisibleOnDate(dateKey) {
  if (!state.active?.date || !state.active.start || !state.active.startedAt) return false;
  const startMinute = timeToMinutes(state.active.start);
  const endMinute = activeEndMinute();
  if (Number.isNaN(startMinute) || Number.isNaN(endMinute)) return false;
  return itemOverlapsDate({ startMinute, endMinute }, state.active.date, dateKey);
}

function sessionMeta(session, options = {}) {
  if (session.isActive) {
    return [
      { className: "task-meta-status", text: "Recording" },
      { className: "task-meta-range", text: currentTimeText(session.start) },
    ];
  }

  return taskMetaParts(timeToMinutes(session.start), absoluteEndMinutes(session.start, session.end), durationMinutes(session), options);
}

function taskMetaParts(startMinute, endMinute, minutes, options = {}) {
  const displayMinutes = options.crossDay && Number.isFinite(options.includedMinutes) ? options.includedMinutes : minutes;
  const totalMinutes = Number.isFinite(options.totalMinutes) ? options.totalMinutes : minutes;
  const parts = [
    { className: "task-meta-range", text: `${minutesToTime(startMinute)} → ${minutesToTime(endMinute)}` },
    { className: "task-meta-duration", text: formatDuration(displayMinutes) },
  ];

  if (endMinute > 1440) {
    parts.splice(1, 0, { className: "task-meta-offset", text: `+${Math.floor(endMinute / 1440)}d` });
  }

  if (options.crossDay) {
    parts.push({ className: "task-meta-total", text: `${formatDuration(totalMinutes)} total` });
  }

  return parts;
}

function taskMetaHtml(parts) {
  return `<div class="task-meta">${parts
    .map((part) => `<span class="${part.className}">${escapeHtml(part.text)}</span>`)
    .join("")}</div>`;
}

function taskRailTimeTickHtml(options = {}) {
  if (!Number.isFinite(options.railTimeMinute)) return "";
  return `<span class="task-time-tick" aria-hidden="true">${escapeHtml(minutesToTime(options.railTimeMinute))}</span>`;
}

function taskMemoHtml(session) {
  const memo = String(session.memo || "").trim();
  if (!memo) return "";
  return taskDetailsHtml(memo);
}

function taskDetailsHtml(details) {
  const value = String(details || "").trim();
  if (!value) return "";
  return `<div class="task-details">${detailsToEditorContent(value)}</div>`;
}

function tagChipsHtml(tags) {
  const values = uniqueNonEmpty(tags);
  if (!values.length) return "";
  return `<div class="task-tags">${values.map((tag) => `<span><img src="./assets/tag_icon.png" alt="" aria-hidden="true" />${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function dotTextForDate(dateKey) {
  const count = visibleTimelineItemsForDate(dateKey).length;
  if (!count) return "";
  return "•".repeat(Math.min(count, 3));
}

function currentTimeText(start, ownerDate, displayDate = ownerDate) {
  return `${timeRangeStartPrefix(ownerDate, displayDate)}${start}~`;
}

function parseTags(value) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean)));
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
}

function startOfCalendarWeek(date) {
  return startOfWeek(date);
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateOffsetMinutes(ownerDateKey, targetDateKey) {
  return Math.round((parseDateKey(ownerDateKey) - parseDateKey(targetDateKey)) / 86400000) * 1440;
}

function rangeDates(start, end) {
  const dates = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toTimeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizedStopTime(start, date) {
  return toTimeValue(date);
}

function activeEndMinute() {
  if (!state.active?.startedAt) return NaN;
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - state.active.startedAt) / 60000));
  return timeToMinutes(state.active.start) + elapsedMinutes;
}

function timeToMinutes(value) {
  const time = normalizeTimeValue(value);
  if (!isValidTimeValue(time)) return NaN;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeTimeValue(value) {
  const trimmed = String(value || "").trim();
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  const compactMatch = trimmed.match(/^(\d{3,4})$/);
  const parts = colonMatch
    ? [colonMatch[1], colonMatch[2]]
    : compactMatch
      ? [trimmed.slice(0, -2), trimmed.slice(-2)]
      : null;
  if (!parts) return trimmed;

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return trimmed;
  if (hour === 24 && minute !== 0) return trimmed;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isValidTimeValue(value) {
  return /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/.test(String(value || ""));
}

function absoluteEndMinutes(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return NaN;
  return endMinutes < startMinutes ? endMinutes + 1440 : endMinutes;
}

function rangeDurationMinutes(start, end) {
  return Math.max(0, absoluteEndMinutes(start, end) - timeToMinutes(start));
}

function overlapMinutes(start, end, windowStart, windowEnd) {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

function formatTimeRange(start, end, ownerDate, displayDate = ownerDate) {
  const endMinute = absoluteEndMinutes(start, end);
  return `${timeRangeStartPrefix(ownerDate, displayDate)}${start}~${timeRangeEndPrefix(endMinute, ownerDate, displayDate)}${minutesToTime(endMinute)}`;
}

function formatTimeRangeFromMinutes(start, end, ownerDate, displayDate = ownerDate) {
  return `${timeRangeStartPrefix(ownerDate, displayDate)}${minutesToTime(start)}~${timeRangeEndPrefix(end, ownerDate, displayDate)}${minutesToTime(end)}`;
}

function timeRangeStartPrefix(ownerDate, displayDate) {
  if (!ownerDate || !displayDate) return "";
  return parseDateKey(ownerDate) < parseDateKey(displayDate) ? "previous day " : "";
}

function timeRangeEndPrefix(endMinute, ownerDate, displayDate) {
  if (!ownerDate || !displayDate) return endMinute > 1440 ? "next day " : "";
  if (parseDateKey(ownerDate) < parseDateKey(displayDate)) return "";
  return endMinute > 1440 ? "next day " : "";
}

function minutesToTime(minutes) {
  if (minutes === 1440) return "24:00";
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatSeconds(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function weekdayShort(date) {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
}

function classNames(base, modifiers) {
  const names = [base];
  for (const [name, enabled] of Object.entries(modifiers)) {
    if (enabled) names.push(name);
  }
  return names.join(" ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
