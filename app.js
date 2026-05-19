const STORAGE_KEY = "daily-work-log.sessions.v1";
const GROUPS_KEY = "daily-work-log.groups.v1";
const ACTIVE_KEY = "daily-work-log.active.v1";
const LEGACY_DEFAULT_TITLE = "\uC791\uC5C5 \uAE30\uB85D";
const LEGACY_MERGED_TITLE = "\uBCD1\uD569 \uC791\uC5C5";

const state = {
  selectedDate: toDateKey(new Date()),
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  sessions: loadJson(STORAGE_KEY, []),
  groups: loadJson(GROUPS_KEY, []),
  active: loadJson(ACTIVE_KEY, null),
  selectedIds: new Set(),
  isCalendarOpen: false,
  calendarAnimating: false,
  modal: null,
};

const els = {
  calendarSurface: document.querySelector("#calendarSurface"),
  calendarBody: document.querySelector("#calendarBody"),
  calendarContextTitle: document.querySelector("#calendarContextTitle"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  goTodayBtn: document.querySelector("#goTodayBtn"),
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
  recordMemo: document.querySelector("#recordMemo"),
  modalError: document.querySelector("#modalError"),
  deleteRecordBtn: document.querySelector("#deleteRecordBtn"),
  closeModalBtn: document.querySelector("#closeModalBtn"),
};

init();

function init() {
  cleanupGroups();
  wireEvents();
  render();
  setInterval(tickTimer, 1000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
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
  els.recordForm.addEventListener("submit", saveModal);
  els.recordModal.addEventListener("click", confirmBackdropClose);
  els.recordModal.addEventListener("cancel", confirmDialogCancel);
  els.closeModalBtn.addEventListener("click", closeModal);
  els.deleteRecordBtn.addEventListener("click", deleteModalTarget);
  els.recordTags.addEventListener("keydown", handleTagInputKeydown);
  els.recordTags.addEventListener("blur", commitTagInput);
  els.recordStart.addEventListener("blur", normalizeModalTimeInputs);
  els.recordEnd.addEventListener("blur", normalizeModalTimeInputs);
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
    button.innerHTML = `
      <span>${weekdayShort(day)}</span>
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
  els.stopTimerBtn.disabled = !isToday || !active;
  els.timerDisplay.classList.toggle("disabled", !isToday);
  els.timerStatus.classList.toggle("hidden", !isToday);

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
  const daySessions = sessionsForDate(state.selectedDate);
  const dayGroups = groupsForDate(state.selectedDate);
  const groupedIds = new Set(dayGroups.flatMap((group) => group.sessionIds));
  const ungrouped = daySessions.filter((session) => !groupedIds.has(session.id));
  const activeItem = activeSessionForSelectedDate();
  const timelineItems = [];

  els.taskList.innerHTML = "";
  els.emptyMessage.classList.toggle("hidden", Boolean(daySessions.length || activeItem));

  if (activeItem) {
    timelineItems.push({ type: "session", session: activeItem, active: true, sortValue: Number.MAX_SAFE_INTEGER });
  }

  for (const group of dayGroups) {
    const groupSessions = group.sessionIds.map((id) => sessionById(id)).filter(Boolean);
    if (groupSessions.length) {
      timelineItems.push({ type: "group", group, sessions: groupSessions, sortValue: groupSortValue(group, groupSessions) });
    }
  }

  for (const session of ungrouped) {
    timelineItems.push({ type: "session", session, active: false, sortValue: taskSortValue(session) });
  }

  timelineItems.sort((a, b) => b.sortValue - a.sortValue);

  for (const item of timelineItems) {
    if (item.type === "group") {
      els.taskList.append(renderGroupCard(item.group, item.sessions));
    } else {
      els.taskList.append(renderTaskCard(item.session, { active: item.active }));
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
  });

  card.innerHTML = `
    <button class="task-check" type="button" aria-label="Select task">${selected ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-main">
          <button class="card-icon" type="button" aria-label="Edit task">✎</button>
          <strong>${escapeHtml(taskTitleText(session.title))}</strong>
        </div>
        ${taskMemoHtml(session)}
        ${tagChipsHtml(session.tags || [])}
      <small>${escapeHtml(activityMeta(session))}</small>
    </div>
  `;

  card.querySelector(".task-check").addEventListener("click", () => toggleSessionSelection(session.id));
  card.querySelector(".card-icon").addEventListener("click", () => {
    if (!options.active) openSessionModal(session.id);
  });
  if (options.active) {
    card.querySelector(".task-check").disabled = true;
    card.querySelector(".card-icon").disabled = true;
  }

  return card;
}

function renderGroupCard(group, sessions) {
  const card = document.createElement("article");
  const selected = state.selectedIds.has(group.id);
  card.className = classNames("task-card merged-task", {
    selected,
  });
  const start = groupStartMinutes(group, sessions);
  const end = groupEndMinutes(group, sessions);
  const minutes = groupDurationMinutes(group, sessions);

  card.innerHTML = `
    <button class="task-check" type="button" aria-label="Select task">${selected ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-main">
          <button class="card-icon" type="button" aria-label="Edit task">✎</button>
          <strong>${escapeHtml(mergedTaskTitle(group, sessions))}</strong>
        </div>
        <p>${escapeHtml(mergedTaskMemo(group, sessions))}</p>
        ${tagChipsHtml(group.tags || [])}
      <small>${escapeHtml(groupFooterMeta(start, end, minutes))}</small>
    </div>
  `;

  card.querySelector(".task-check").addEventListener("click", () => toggleGroupSelection(group.id));
  card.querySelector(".card-icon").addEventListener("click", () => openExistingGroupModal(group.id));
  return card;
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
    const hasRecords = hasRecordsForDate(dateKey);
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
    button.innerHTML = `<strong>${day.getDate()}</strong><small aria-hidden="true">${hasRecords ? "•" : ""}</small>`;
    button.addEventListener("click", () => selectDate(dateKey));
    els.monthGrid.append(button);
  }
}

function renderCalendarPanel() {
  els.calendarSurface.classList.toggle("calendar-expanded", state.isCalendarOpen);
  els.weekNav.classList.toggle("calendar-view-hidden", state.isCalendarOpen);
  els.weekNav.setAttribute("aria-hidden", String(state.isCalendarOpen));
  els.monthInline.classList.toggle("calendar-view-hidden", !state.isCalendarOpen);
  els.monthInline.setAttribute("aria-hidden", String(!state.isCalendarOpen));
  els.prevCalendarBtn.setAttribute("aria-label", state.isCalendarOpen ? "Previous month" : "Previous week");
  els.nextCalendarBtn.setAttribute("aria-label", state.isCalendarOpen ? "Next month" : "Next week");
  els.calendarToggleBtn.setAttribute("aria-expanded", String(state.isCalendarOpen));
  els.calendarToggleBtn.textContent = state.isCalendarOpen ? "Week View" : "Month View";
  els.monthReportBtn.classList.toggle("hidden", !state.isCalendarOpen);
}

async function copyMonthReport() {
  const report = buildMonthReport();
  const originalText = els.monthReportBtn.textContent;
  els.monthReportBtn.disabled = true;

  try {
    await writeClipboardText(report);
    els.monthReportBtn.textContent = "Copied";
  } catch (error) {
    console.error("Failed to copy monthly report.", error);
    els.monthReportBtn.textContent = "Copy failed";
  } finally {
    window.setTimeout(() => {
      els.monthReportBtn.textContent = originalText;
      els.monthReportBtn.disabled = false;
    }, 1200);
  }
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
  return timelineItemsForDate(dateKey)
    .map((item) => ({
      ...reportItemDetails(item),
      minutes: item.duration,
      range: formatTimeRangeFromMinutes(item.startMinute, item.endMinute),
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
  return String(memo)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `  Memo: ${line}`);
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

function toggleCalendarPanel() {
  const nextOpen = !state.isCalendarOpen;
  if (state.calendarAnimating) return;

  if (canAnimateCalendarMorph()) {
    animateCalendarMorph(nextOpen);
    return;
  }

  state.isCalendarOpen = nextOpen;
  render();
}

function canAnimateCalendarMorph() {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return Boolean(
    !reducedMotion &&
      els.weekStrip &&
      els.monthGrid &&
      els.calendarSurface &&
      typeof els.weekStrip.animate === "function",
  );
}

function animateCalendarMorph(nextOpen) {
  const sourceRect = nextOpen ? els.weekStrip.getBoundingClientRect() : selectedMonthWeekRect();
  const sourceBodyHeight = els.calendarBody.getBoundingClientRect().height;
  if (!isUsableRect(sourceRect)) {
    state.isCalendarOpen = nextOpen;
    render();
    return;
  }

  state.calendarAnimating = true;
  els.calendarBody.style.height = `${sourceBodyHeight}px`;
  const ghost = buildCalendarWeekGhost(sourceRect);
  const weekdayGhost = buildCalendarWeekdayGhost(nextOpen ? weekWeekdayMetrics() : monthWeekdayMetrics());
  els.calendarSurface.classList.add("calendar-morphing", nextOpen ? "calendar-opening" : "calendar-closing");
  state.isCalendarOpen = nextOpen;
  render();

  requestAnimationFrame(() => {
    const targetRect = nextOpen ? selectedMonthWeekRect() : els.weekStrip.getBoundingClientRect();
    const targetBodyHeight = calendarBodyTargetHeight(nextOpen);
    if (!isUsableRect(targetRect)) {
      cleanupCalendarMorph(ghost, weekdayGhost);
      return;
    }

    const deltaX = targetRect.left - sourceRect.left;
    const deltaY = targetRect.top - sourceRect.top;
    const scaleX = targetRect.width / sourceRect.width;
    const scaleY = targetRect.height / sourceRect.height;
    const duration = nextOpen ? 300 : 280;
    const ghostTiming = {
      duration,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    };
    const bodyTiming = {
      duration,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    };
    const ghostAnimation = ghost.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1, 1)" },
        { opacity: 1, transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})` },
      ],
      ghostTiming,
    );
    animateCalendarGhostContent(ghost, scaleX, scaleY, ghostTiming, nextOpen);
    const weekdayAnimations = animateCalendarWeekdayGhost(weekdayGhost, nextOpen ? monthWeekdayMetrics() : weekWeekdayMetrics(), ghostTiming);
    const bodyAnimation = els.calendarBody.animate(
      [
        { height: `${sourceBodyHeight}px` },
        { height: `${targetBodyHeight}px` },
      ],
      bodyTiming,
    );

    Promise.allSettled([ghostAnimation.finished, bodyAnimation.finished, ...weekdayAnimations.map((animation) => animation.finished)]).then(() =>
      finishCalendarMorph(ghost, weekdayGhost, bodyAnimation),
    );
  });
}

function animateCalendarGhostContent(ghost, scaleX, scaleY, timing, nextOpen) {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || !scaleX || !scaleY) return;
  const ratios = calendarTextScaleRatios();
  const tracks = [
    { selector: "strong", source: nextOpen ? 1 : ratios.monthDate, target: nextOpen ? ratios.monthDate : 1 },
    { selector: "small", source: nextOpen ? 1 : ratios.monthDot, target: nextOpen ? ratios.monthDot : 1 },
  ];

  for (const track of tracks) {
    ghost.querySelectorAll(track.selector).forEach((element) => {
      animateCalendarTextScale(element, track.source, track.target, scaleX, scaleY, timing);
    });
  }
}

function animateCalendarTextScale(element, sourceScale, targetScale, parentScaleX, parentScaleY, timing) {
  element.animate(
    [
      { transform: `scale(${sourceScale}, ${sourceScale})` },
      { transform: `scale(${targetScale / parentScaleX}, ${targetScale / parentScaleY})` },
    ],
    timing,
  );
}

function calendarTextScaleRatios() {
  const weekDate = cssNumber(els.weekStrip.querySelector(".date-chip strong"), "fontSize", 18);
  const monthDate = cssNumber(els.monthGrid.querySelector(".month-day strong"), "fontSize", 11);
  const weekDot = cssNumber(els.weekStrip.querySelector(".date-chip small"), "fontSize", 10);
  const monthDot = cssNumber(els.monthGrid.querySelector(".month-day small"), "fontSize", 10);

  return {
    monthDate: monthDate / weekDate,
    monthDot: monthDot / weekDot,
  };
}

function cssNumber(element, property, fallback) {
  if (!element) return fallback;
  const value = Number.parseFloat(getComputedStyle(element)[property]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function calendarBodyTargetHeight(isOpen) {
  if (isOpen) return els.monthInline.scrollHeight;
  return els.weekNav.scrollHeight || els.weekStrip.getBoundingClientRect().height;
}

function buildCalendarWeekGhost(rect) {
  const ghost = els.weekStrip.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("calendar-week-ghost");
  ghost.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
    button.tabIndex = -1;
  });
  Object.assign(ghost.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  document.body.append(ghost);
  return ghost;
}

function buildCalendarWeekdayGhost(metrics) {
  const ghost = document.createElement("div");
  ghost.className = "calendar-weekday-ghost";
  ghost.setAttribute("aria-hidden", "true");

  for (const metric of metrics) {
    const label = document.createElement("span");
    label.className = "calendar-weekday-ghost-label";
    label.textContent = metric.text;
    label._sourceMetric = metric;
    Object.assign(label.style, metricStyle(metric));
    ghost.append(label);
  }

  document.body.append(ghost);
  return ghost;
}

function animateCalendarWeekdayGhost(ghost, targets, timing) {
  return Array.from(ghost.querySelectorAll(".calendar-weekday-ghost-label")).flatMap((label, index) => {
    const target = targets[index];
    if (!target) return [];
    return [
      label.animate(
        [
          metricStyle(label._sourceMetric || targets[index]),
          metricStyle(target),
        ],
        timing,
      ),
    ];
  });
}

function weekWeekdayMetrics() {
  return Array.from(els.weekStrip.querySelectorAll(".date-chip span")).map(labelMetric);
}

function monthWeekdayMetrics() {
  return Array.from(document.querySelectorAll(".month-weekdays span")).map(labelMetric);
}

function labelMetric(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    text: element.textContent,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
  };
}

function metricStyle(metric) {
  return {
    left: `${metric.left}px`,
    top: `${metric.top}px`,
    width: `${metric.width}px`,
    height: `${metric.height}px`,
    color: metric.color,
    fontSize: metric.fontSize,
    fontWeight: metric.fontWeight,
  };
}

function cleanupCalendarMorph(ghost, weekdayGhost = null) {
  ghost.remove();
  weekdayGhost?.remove();
  els.calendarSurface.classList.remove("calendar-morphing", "calendar-opening", "calendar-closing");
  els.calendarBody.getAnimations().forEach((animation) => animation.cancel());
  els.calendarBody.style.height = "";
  state.calendarAnimating = false;
}

function finishCalendarMorph(ghost, weekdayGhost, bodyAnimation) {
  bodyAnimation.cancel();
  els.calendarSurface.classList.remove("calendar-morphing", "calendar-opening", "calendar-closing");
  els.calendarBody.style.height = "";
  const fadeTiming = {
    duration: 60,
    easing: "ease-out",
    fill: "forwards",
  };
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], fadeTiming);
  const weekdayFade = weekdayGhost.animate([{ opacity: 1 }, { opacity: 0 }], fadeTiming);
  Promise.allSettled([fade.finished, weekdayFade.finished]).finally(() => {
    ghost.remove();
    weekdayGhost.remove();
    state.calendarAnimating = false;
  });
}

function selectedMonthWeekRect() {
  const days = Array.from(els.monthGrid.querySelectorAll(".month-day.week-selected"));
  if (!days.length) return null;
  const rects = days.map((day) => day.getBoundingClientRect()).filter(isUsableRect);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function isUsableRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function startTimer() {
  if (state.active) return;

  const now = new Date();
  const date = toDateKey(now);
  if (state.selectedDate !== date) return;

  state.selectedDate = date;
  state.weekStart = startOfWeek(now);
  state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
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
  if (!isSelectedDateToday()) return;
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
  els.recordMemo.value = "";
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
  els.recordMemo.value = session.memo || "";
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
  els.recordMemo.value = mergedTaskMemo(null, sessions);
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
  els.recordMemo.value = mergedTaskMemo(group, sessions);
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
  const memo = els.recordMemo.value.trim();
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
    memo: els.recordMemo.value,
  };
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
    button.innerHTML = `<span>${escapeHtml(tag)}</span><b aria-hidden="true">×</b>`;
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
  if (!session || session.date !== state.selectedDate) return;

  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderTasks();
}

function toggleGroupSelection(id) {
  const group = groupById(id);
  if (!group || group.date !== state.selectedDate) return;

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
    if (group && group.date === state.selectedDate) {
      groupIdsToDelete.add(group.id);
      for (const sessionId of group.sessionIds) sessionIdsToDelete.add(sessionId);
      continue;
    }

    const session = sessionById(id);
    if (session && session.date === state.selectedDate) sessionIdsToDelete.add(session.id);
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

  const positions = timelineItemsForDate(state.selectedDate)
    .map((item, index) => ({ ...item, index }))
    .filter((item) => selected.has(item.id));

  if (positions.length < 2) return [];

  const first = positions[0].index;
  const last = positions[positions.length - 1].index;
  if (last - first + 1 !== positions.length) return [];

  return positions;
}

function selectDate(dateKey) {
  state.selectedDate = dateKey;
  state.weekStart = startOfWeek(parseDateKey(dateKey));
  state.monthCursor = new Date(parseDateKey(dateKey).getFullYear(), parseDateKey(dateKey).getMonth(), 1);
  clearSelection(false);
  render();
}

function moveWeek(direction) {
  const nextWeekStart = addDays(state.weekStart, direction * 7);
  state.weekStart = nextWeekStart;
  state.selectedDate = toDateKey(nextWeekStart);
  state.monthCursor = new Date(nextWeekStart.getFullYear(), nextWeekStart.getMonth(), 1);
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
  if (!state.active) return;
  renderTimer();
  renderTasks();
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
      end: activeOffset + absoluteEndMinutes(state.active.start, toTimeValue(new Date())),
      label: "Active task",
    });
  }

  return items.filter((item) => item.end > item.start);
}

function activeSessionForSelectedDate() {
  if (!state.active || state.active.date !== state.selectedDate) return null;
  return {
    id: "active",
    date: state.active.date,
    title: "Active task",
    start: state.active.start,
    end: toTimeValue(new Date()),
    tags: [],
    memo: "Timer is running.",
    isActive: true,
  };
}

function cleanupGroups() {
  const validSessionIds = new Set(state.sessions.map((session) => session.id));
  state.groups = state.groups
    .map((group) => ({ ...group, sessionIds: group.sessionIds.filter((id) => validSessionIds.has(id)) }))
    .filter((group) => group.sessionIds.length);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
  localStorage.setItem(GROUPS_KEY, JSON.stringify(state.groups));
  if (state.active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(state.active));
  else localStorage.removeItem(ACTIVE_KEY);
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
  if (timelineItemsForDate(dateKey).length) return true;

  const targetDate = parseDateKey(dateKey);
  const previousDate = addDays(targetDate, -1);
  return timelineItemsForDate(toDateKey(previousDate)).some((item) => {
    return overlapMinutes(item.startMinute - 1440, item.endMinute - 1440, 0, 1440) > 0;
  });
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
    const memo = (session.memo || "").trim();
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

function activityMeta(session) {
  const range = session.isActive ? currentTimeText(session.start) : formatTimeRange(session.start, session.end);
  if (session.isActive) return `Recording (${range})`;
  return `${formatDuration(durationMinutes(session))} (${range})`;
}

function groupFooterMeta(start, end, minutes) {
  return `${formatDuration(minutes)} (${formatTimeRangeFromMinutes(start, end)})`;
}

function taskMemoHtml(session) {
  const memo = String(session.memo || "").trim();
  if (!memo) return "";
  return `<p>${escapeHtml(memo)}</p>`;
}

function tagChipsHtml(tags) {
  const values = uniqueNonEmpty(tags);
  if (!values.length) return "";
  return `<div class="task-tags">${values.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function dotTextForDate(dateKey) {
  const count = sessionsForDate(dateKey).length;
  if (!count) return "";
  return "•".repeat(Math.min(count, 3));
}

function currentTimeText(start) {
  return `${start}~`;
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

function formatTimeRange(start, end) {
  return `${start}~${timeToMinutes(end) < timeToMinutes(start) ? "next day " : ""}${end}`;
}

function formatTimeRangeFromMinutes(start, end) {
  const endText = end === 1440 ? "24:00" : `${end > 1440 ? "next day " : ""}${minutesToTime(end)}`;
  return `${minutesToTime(start)}~${endText}`;
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
