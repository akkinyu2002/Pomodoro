"use strict";

const SESSION_TYPES = {
  work: {
    label: "Work",
    ready: "Ready to focus",
    running: "Focus session in progress"
  },
  shortBreak: {
    label: "Short break",
    ready: "Ready for a short break",
    running: "Short break in progress"
  },
  longBreak: {
    label: "Long break",
    ready: "Ready for a long break",
    running: "Long break in progress"
  }
};

const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakFrequency: 4,
  autoSwitch: true,
  accent: "teal",
  sound: "chime",
  volume: 70,
  voiceAlerts: false,
  theme: "dark"
};

const STORAGE_KEYS = {
  settings: "focusForge.settings.v1",
  runtime: "focusForge.runtime.v1",
  tasks: "focusForge.tasks.v1",
  sessions: "focusForge.sessions.v1"
};

const RING_LENGTH = 339.292;
const SECOND = 1000;

const elements = {
  timerTime: document.querySelector("#timerTime"),
  timerHeading: document.querySelector("#timerHeading"),
  timerMeta: document.querySelector("#timerMeta"),
  ringProgress: document.querySelector("#ringProgress"),
  startPauseButton: document.querySelector("#startPauseButton"),
  skipButton: document.querySelector("#skipButton"),
  resetButton: document.querySelector("#resetButton"),
  sessionTabs: [...document.querySelectorAll(".session-tab")],
  completedCount: document.querySelector("#completedCount"),
  streakCount: document.querySelector("#streakCount"),
  coinsCount: document.querySelector("#coinsCount"),
  themeToggle: document.querySelector("#themeToggle"),
  workDuration: document.querySelector("#workDuration"),
  shortBreakDuration: document.querySelector("#shortBreakDuration"),
  longBreakDuration: document.querySelector("#longBreakDuration"),
  longBreakFrequency: document.querySelector("#longBreakFrequency"),
  notifyButton: document.querySelector("#notifyButton"),
  accentSelect: document.querySelector("#accentSelect"),
  soundSelect: document.querySelector("#soundSelect"),
  volumeControl: document.querySelector("#volumeControl"),
  autoSwitchToggle: document.querySelector("#autoSwitchToggle"),
  voiceToggle: document.querySelector("#voiceToggle"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskEstimate: document.querySelector("#taskEstimate"),
  taskList: document.querySelector("#taskList"),
  clearDoneButton: document.querySelector("#clearDoneButton"),
  prioritizeButton: document.querySelector("#prioritizeButton"),
  breakdownForm: document.querySelector("#breakdownForm"),
  breakdownInput: document.querySelector("#breakdownInput"),
  focusToday: document.querySelector("#focusToday"),
  focusWeek: document.querySelector("#focusWeek"),
  bestHour: document.querySelector("#bestHour"),
  breakSkips: document.querySelector("#breakSkips"),
  weeklyChart: document.querySelector("#weeklyChart"),
  insightBox: document.querySelector("#insightBox"),
  achievementList: document.querySelector("#achievementList"),
  levelPill: document.querySelector("#levelPill")
};

const settings = loadSettings();
const runtime = loadRuntime();
let tasks = loadTasks();
let sessions = loadSessions();
let draggedTaskId = null;
let audioContext = null;

const state = {
  sessionType: runtime.sessionType,
  isRunning: runtime.isRunning,
  targetTime: runtime.targetTime,
  remainingMs: runtime.remainingMs,
  startedAt: runtime.startedAt,
  completedToday: runtime.completedToday,
  cycleCount: runtime.cycleCount,
  streak: runtime.streak,
  coins: runtime.coins,
  activeTaskId: runtime.activeTaskId,
  tickHandle: null
};

function minutesToMs(minutes) {
  return Number(minutes) * 60 * SECOND;
}

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn("Could not read saved data", error);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not save data", error);
  }
}

function loadSettings() {
  const saved = readJson(STORAGE_KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    workDuration: clampNumber(saved.workDuration, 1, 120, DEFAULT_SETTINGS.workDuration),
    shortBreakDuration: clampNumber(saved.shortBreakDuration, 1, 60, DEFAULT_SETTINGS.shortBreakDuration),
    longBreakDuration: clampNumber(saved.longBreakDuration, 1, 90, DEFAULT_SETTINGS.longBreakDuration),
    longBreakFrequency: clampNumber(saved.longBreakFrequency, 2, 12, DEFAULT_SETTINGS.longBreakFrequency),
    volume: clampNumber(saved.volume, 0, 100, DEFAULT_SETTINGS.volume)
  };
}

function loadRuntime() {
  const saved = readJson(STORAGE_KEYS.runtime, {});
  const sessionType = SESSION_TYPES[saved.sessionType] ? saved.sessionType : "work";
  const fallbackDuration = getDurationFromSettings(sessionType);
  const targetTime = Number(saved.targetTime) || null;
  const wasRunning = Boolean(saved.isRunning && targetTime);
  const remainingFromTarget = wasRunning ? Math.max(0, targetTime - Date.now()) : null;
  const isToday = saved.dateKey === getDateKey();

  return {
    expired: wasRunning && remainingFromTarget <= 0,
    sessionType,
    isRunning: wasRunning && remainingFromTarget > 0,
    targetTime: wasRunning && remainingFromTarget > 0 ? targetTime : null,
    remainingMs: wasRunning ? remainingFromTarget : clampNumber(saved.remainingMs, 0, fallbackDuration, fallbackDuration),
    startedAt: typeof saved.startedAt === "string" ? saved.startedAt : null,
    completedToday: isToday ? clampNumber(saved.completedToday, 0, 999, 0) : 0,
    cycleCount: isToday ? clampNumber(saved.cycleCount, 0, 999, 0) : 0,
    streak: clampNumber(saved.streak, 0, 9999, 0),
    coins: clampNumber(saved.coins, 0, 999999, 0),
    activeTaskId: typeof saved.activeTaskId === "string" ? saved.activeTaskId : null
  };
}

function loadTasks() {
  const saved = readJson(STORAGE_KEYS.tasks, []);
  if (!Array.isArray(saved)) return [];

  return saved
    .filter((task) => task && typeof task.title === "string" && task.title.trim())
    .map((task, index) => ({
      id: typeof task.id === "string" ? task.id : createId(),
      title: task.title.trim(),
      estimatedPomodoros: clampNumber(task.estimatedPomodoros, 1, 24, 1),
      completedPomodoros: clampNumber(task.completedPomodoros, 0, 999, 0),
      done: Boolean(task.done),
      createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
      dateKey: typeof task.dateKey === "string" ? task.dateKey : getDateKey(),
      priority: clampNumber(task.priority, 0, 999, index)
    }))
    .sort(sortTasks);
}

function loadSessions() {
  const saved = readJson(STORAGE_KEYS.sessions, []);
  if (!Array.isArray(saved)) return [];

  return saved
    .filter((session) => session && SESSION_TYPES[session.type] && typeof session.startedAt === "string")
    .map((session) => ({
      id: typeof session.id === "string" ? session.id : createId(),
      type: session.type,
      duration: clampNumber(session.duration, 0, 240, 0),
      startedAt: session.startedAt,
      endedAt: typeof session.endedAt === "string" ? session.endedAt : session.startedAt,
      taskId: typeof session.taskId === "string" ? session.taskId : null,
      skipped: Boolean(session.skipped)
    }));
}

function saveSettings() {
  writeJson(STORAGE_KEYS.settings, settings);
}

function saveTasks() {
  writeJson(STORAGE_KEYS.tasks, tasks);
}

function saveSessions() {
  writeJson(STORAGE_KEYS.sessions, sessions);
}

function saveRuntime() {
  writeJson(STORAGE_KEYS.runtime, {
    dateKey: getDateKey(),
    sessionType: state.sessionType,
    isRunning: state.isRunning,
    targetTime: state.targetTime,
    remainingMs: state.remainingMs,
    startedAt: state.startedAt,
    completedToday: state.completedToday,
    cycleCount: state.cycleCount,
    streak: state.streak,
    coins: state.coins,
    activeTaskId: state.activeTaskId
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortTasks(a, b) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  return a.priority - b.priority;
}

function getActiveTask() {
  return tasks.find((task) => task.id === state.activeTaskId) || null;
}

function getFocusMinutesForDate(dateKey) {
  return sessions
    .filter((session) => session.type === "work" && !session.skipped && getDateKey(new Date(session.endedAt)) === dateKey)
    .reduce((total, session) => total + session.duration, 0);
}

function getLastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 6));
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatHour(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function calculateStreak() {
  const focusDates = new Set(
    sessions
      .filter((session) => session.type === "work" && !session.skipped)
      .map((session) => getDateKey(new Date(session.endedAt)))
  );

  let cursor = new Date();
  let count = 0;

  if (!focusDates.has(getDateKey(cursor)) && focusDates.has(getDateKey(addDays(cursor, -1)))) {
    cursor = addDays(cursor, -1);
  }

  while (focusDates.has(getDateKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

function getDurationFromSettings(type) {
  if (type === "work") return minutesToMs(settings.workDuration);
  if (type === "shortBreak") return minutesToMs(settings.shortBreakDuration);
  return minutesToMs(settings.longBreakDuration);
}

function getSessionDurationMs(type = state.sessionType) {
  return getDurationFromSettings(type);
}

function formatTime(ms) {
  const safeMs = Math.max(0, Math.ceil(ms / SECOND) * SECOND);
  const totalSeconds = Math.floor(safeMs / SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateRemainingFromClock() {
  if (!state.isRunning || !state.targetTime) return;

  state.remainingMs = Math.max(0, state.targetTime - Date.now());
  if (state.remainingMs <= 0) {
    completeSession({ skipped: false });
  }
}

function startTicker() {
  window.clearInterval(state.tickHandle);
  state.tickHandle = window.setInterval(() => {
    updateRemainingFromClock();
    render();
  }, 250);
}

function stopTicker() {
  window.clearInterval(state.tickHandle);
  state.tickHandle = null;
}

function startTimer() {
  if (state.isRunning) return;

  state.isRunning = true;
  state.startedAt = state.startedAt || new Date().toISOString();
  state.targetTime = Date.now() + state.remainingMs;
  startTicker();
  saveRuntime();
  render();
}

function pauseTimer() {
  if (!state.isRunning) return;

  updateRemainingFromClock();
  state.isRunning = false;
  state.targetTime = null;
  stopTicker();
  saveRuntime();
  render();
}

function resetTimer() {
  state.isRunning = false;
  state.targetTime = null;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs();
  stopTicker();
  saveRuntime();
  render();
}

function switchSession(type) {
  state.sessionType = type;
  state.isRunning = false;
  state.targetTime = null;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs(type);
  stopTicker();
  saveRuntime();
  render();
}

function updateIdleDuration() {
  if (state.isRunning) return;

  state.remainingMs = getSessionDurationMs();
  render();
}

function setNumberSetting(key, value, min, max) {
  settings[key] = clampNumber(value, min, max, DEFAULT_SETTINGS[key]);
  saveSettings();
  updateIdleDuration();
  saveRuntime();
}

function getNextSessionType() {
  if (state.sessionType !== "work") return "work";

  const nextCycleCount = state.cycleCount + 1;
  return nextCycleCount % settings.longBreakFrequency === 0 ? "longBreak" : "shortBreak";
}

function completeSession({ skipped }) {
  const completedType = state.sessionType;
  const shouldCountWork = completedType === "work" && !skipped;

  state.isRunning = false;
  state.targetTime = null;
  stopTicker();
  recordSession(completedType, skipped);

  if (shouldCountWork) {
    state.completedToday += 1;
    state.cycleCount += 1;
    state.streak = calculateStreak();
    state.coins += 5;
    recordTaskPomodoro();
  }

  const nextType = skipped && completedType !== "work" ? "work" : getNextSessionType();
  state.sessionType = nextType;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs(nextType);

  if (!skipped) {
    announceSessionComplete(completedType, nextType);
  }

  if (settings.autoSwitch && !skipped) {
    startTimer();
  } else {
    saveRuntime();
  }

  render();
}

function handleSessionTab(event) {
  const type = event.currentTarget.dataset.sessionType;
  if (!type || type === state.sessionType) return;
  switchSession(type);
}

function renderSessionTabs() {
  elements.sessionTabs.forEach((tab) => {
    const isActive = tab.dataset.sessionType === state.sessionType;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function renderTimer() {
  const duration = getSessionDurationMs();
  const elapsedRatio = duration > 0 ? 1 - state.remainingMs / duration : 0;
  const progress = Math.min(1, Math.max(0, elapsedRatio));
  const sessionCopy = SESSION_TYPES[state.sessionType];
  const cyclePosition = (state.cycleCount % settings.longBreakFrequency) + 1;

  elements.timerTime.textContent = formatTime(state.remainingMs);
  elements.timerHeading.textContent = state.isRunning ? sessionCopy.running : sessionCopy.ready;
  elements.startPauseButton.textContent = state.isRunning ? "Pause" : state.remainingMs < duration ? "Resume" : "Start";
  elements.ringProgress.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));

  if (state.sessionType === "work") {
    const activeTask = getActiveTask();
    const activeCopy = activeTask ? ` - ${activeTask.title}` : "";
    elements.timerMeta.textContent = `Pomodoro ${cyclePosition} of ${settings.longBreakFrequency} before a long break${activeCopy}`;
  } else {
    elements.timerMeta.textContent = `${sessionCopy.label} before the next focus session`;
  }
}

function renderCounters() {
  elements.completedCount.textContent = String(state.completedToday);
  elements.streakCount.textContent = String(state.streak);
  elements.coinsCount.textContent = String(state.coins);
  elements.levelPill.textContent = `Level ${Math.floor(state.coins / 50) + 1}`;
}

function renderAnalytics() {
  const todayKey = getDateKey();
  const weekDays = getLastSevenDays();
  const weeklyMinutes = weekDays.map((date) => ({
    date,
    dateKey: getDateKey(date),
    minutes: getFocusMinutesForDate(getDateKey(date))
  }));
  const weekTotal = weeklyMinutes.reduce((total, day) => total + day.minutes, 0);
  const focusSessions = sessions.filter((session) => session.type === "work" && !session.skipped);
  const hourCounts = focusSessions.reduce((counts, session) => {
    const hour = new Date(session.startedAt).getHours();
    counts.set(hour, (counts.get(hour) || 0) + session.duration);
    return counts;
  }, new Map());
  const bestHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const breakSkipsToday = sessions.filter((session) => (
    session.skipped &&
    session.type !== "work" &&
    getDateKey(new Date(session.endedAt)) === todayKey
  )).length;

  elements.focusToday.textContent = formatMinutes(getFocusMinutesForDate(todayKey));
  elements.focusWeek.textContent = formatMinutes(weekTotal);
  elements.bestHour.textContent = bestHour ? formatHour(bestHour[0]) : "-";
  elements.breakSkips.textContent = String(breakSkipsToday);
  renderWeeklyChart(weeklyMinutes);
  renderInsight(bestHour, breakSkipsToday, focusSessions.length);
  renderAchievements(focusSessions);
}

function renderWeeklyChart(days) {
  const maxMinutes = Math.max(1, ...days.map((day) => day.minutes));
  elements.weeklyChart.innerHTML = "";

  days.forEach((day) => {
    const bar = document.createElement("div");
    bar.className = "chart-bar";

    const fill = document.createElement("div");
    fill.className = "chart-fill";
    fill.style.height = `${Math.max(4, (day.minutes / maxMinutes) * 112)}px`;
    fill.title = `${formatMinutes(day.minutes)} on ${day.dateKey}`;

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);

    bar.append(fill, label);
    elements.weeklyChart.append(bar);
  });
}

function renderInsight(bestHour, breakSkipsToday, focusSessionCount) {
  if (focusSessionCount === 0) {
    elements.insightBox.textContent = "Finish one work session to unlock focus insights.";
    return;
  }

  if (breakSkipsToday > 1) {
    elements.insightBox.textContent = "You skipped multiple breaks today. Try a shorter work duration for the next cycle and protect the next break.";
    return;
  }

  if (bestHour) {
    const suggestion = settings.workDuration > 45 ? " Consider a shorter session when the task feels fuzzy." : " Your current work duration looks reasonable.";
    elements.insightBox.textContent = `Your strongest focus window is around ${formatHour(bestHour[0])}. Schedule demanding tasks near that hour.${suggestion}`;
    return;
  }

  elements.insightBox.textContent = "Keep logging sessions and Focus Forge will surface stronger weekly patterns.";
}

function renderAchievements(focusSessions) {
  const completedTasks = tasks.filter((task) => task.done).length;
  const achievements = [
    { label: "First focus", unlocked: focusSessions.length >= 1 },
    { label: "Four pack", unlocked: state.completedToday >= 4 },
    { label: "Task closer", unlocked: completedTasks >= 1 },
    { label: "Streak spark", unlocked: state.streak >= 2 },
    { label: "Coin stack", unlocked: state.coins >= 50 }
  ];

  elements.achievementList.innerHTML = "";
  achievements.forEach((achievement) => {
    const badge = document.createElement("li");
    badge.className = `achievement-badge${achievement.unlocked ? " unlocked" : ""}`;
    badge.textContent = achievement.label;
    elements.achievementList.append(badge);
  });
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  tasks.sort(sortTasks).forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item${task.done ? " done" : ""}${state.activeTaskId === task.id ? " active" : ""}`;
    item.dataset.taskId = task.id;
    item.draggable = true;
    item.addEventListener("dragstart", handleTaskDragStart);
    item.addEventListener("dragover", handleTaskDragOver);
    item.addEventListener("dragleave", handleTaskDragLeave);
    item.addEventListener("drop", handleTaskDrop);
    item.addEventListener("dragend", handleTaskDragEnd);

    const checkbox = document.createElement("input");
    checkbox.className = "task-check";
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", `Mark ${task.title} complete`);
    checkbox.addEventListener("change", () => toggleTaskDone(task.id));

    const copy = document.createElement("div");
    copy.className = "task-copy";

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const progress = document.createElement("span");
    progress.className = "task-progress";
    progress.textContent = `${task.completedPomodoros}/${task.estimatedPomodoros} pomodoros`;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const focusButton = document.createElement("button");
    focusButton.type = "button";
    focusButton.textContent = state.activeTaskId === task.id ? "On" : "Go";
    focusButton.title = "Use task for the timer";
    focusButton.setAttribute("aria-label", `Use ${task.title} for the timer`);
    focusButton.disabled = task.done;
    focusButton.addEventListener("click", () => setActiveTask(task.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "X";
    deleteButton.title = "Delete task";
    deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    copy.append(title, progress);
    actions.append(focusButton, deleteButton);
    item.append(checkbox, copy, actions);
    elements.taskList.append(item);
  });
}

function render() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.accent = settings.accent;
  renderSessionTabs();
  renderTimer();
  renderCounters();
  renderSettings();
}

function renderSettings() {
  elements.workDuration.value = settings.workDuration;
  elements.shortBreakDuration.value = settings.shortBreakDuration;
  elements.longBreakDuration.value = settings.longBreakDuration;
  elements.longBreakFrequency.value = settings.longBreakFrequency;
  elements.accentSelect.value = settings.accent;
  elements.soundSelect.value = settings.sound;
  elements.volumeControl.value = settings.volume;
  elements.autoSwitchToggle.checked = settings.autoSwitch;
  elements.voiceToggle.checked = settings.voiceAlerts;
  elements.themeToggle.textContent = settings.theme === "dark" ? "D" : "L";
  renderNotificationButton();
}

function renderNotificationButton() {
  if (!("Notification" in window)) {
    elements.notifyButton.textContent = "Unavailable";
    elements.notifyButton.disabled = true;
    return;
  }

  elements.notifyButton.disabled = false;
  elements.notifyButton.textContent = Notification.permission === "granted" ? "On" : "Notifications";
}

function addTask(title, estimate) {
  const nextPriority = tasks.length ? Math.max(...tasks.map((task) => task.priority)) + 1 : 0;

  const task = {
    id: createId(),
    title: title.trim(),
    estimatedPomodoros: clampNumber(estimate, 1, 24, 1),
    completedPomodoros: 0,
    done: false,
    createdAt: new Date().toISOString(),
    dateKey: getDateKey(),
    priority: nextPriority
  };

  tasks = [...tasks, task];
  state.activeTaskId = state.activeTaskId || task.id;

  saveTasks();
  saveRuntime();
  render();
  renderTasks();
  renderAnalytics();
}

function addBreakdownTasks(title) {
  const steps = createTaskBreakdown(title);
  const startPriority = tasks.length ? Math.max(...tasks.map((task) => task.priority)) + 1 : 0;
  const newTasks = steps.map((step, index) => ({
    id: createId(),
    title: step.title,
    estimatedPomodoros: step.estimate,
    completedPomodoros: 0,
    done: false,
    createdAt: new Date().toISOString(),
    dateKey: getDateKey(),
    priority: startPriority + index
  }));

  tasks = [...tasks, ...newTasks];
  state.activeTaskId = state.activeTaskId || newTasks[0]?.id || null;
  saveTasks();
  saveRuntime();
  render();
  renderTasks();
}

function createTaskBreakdown(title) {
  const cleanTitle = title.trim();
  const lower = cleanTitle.toLowerCase();

  if (lower.includes("portfolio") || lower.includes("website") || lower.includes("site")) {
    return [
      { title: "Plan page goals", estimate: 1 },
      { title: "Build navigation", estimate: 1 },
      { title: "Create landing section", estimate: 2 },
      { title: "Write about content", estimate: 1 },
      { title: "Add contact form", estimate: 2 },
      { title: "Deploy and review", estimate: 1 }
    ];
  }

  if (lower.includes("app") || lower.includes("tool") || lower.includes("dashboard")) {
    return [
      { title: `Define scope for ${cleanTitle}`, estimate: 1 },
      { title: "Model the core data", estimate: 1 },
      { title: "Build the main workflow", estimate: 3 },
      { title: "Add persistence and edge states", estimate: 2 },
      { title: "Test and polish", estimate: 2 }
    ];
  }

  return [
    { title: `Clarify outcome for ${cleanTitle}`, estimate: 1 },
    { title: "Create the first usable draft", estimate: 2 },
    { title: "Review weak spots", estimate: 1 },
    { title: "Finish and ship", estimate: 1 }
  ];
}

function smartPrioritizeTasks() {
  const urgentPattern = /\b(urgent|today|due|fix|bug|submit|deadline)\b/i;

  tasks = [...tasks]
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);

      const aRemaining = Math.max(0, a.estimatedPomodoros - a.completedPomodoros);
      const bRemaining = Math.max(0, b.estimatedPomodoros - b.completedPomodoros);
      const aUrgency = urgentPattern.test(a.title) ? -3 : 0;
      const bUrgency = urgentPattern.test(b.title) ? -3 : 0;
      return aRemaining + aUrgency - (bRemaining + bUrgency);
    })
    .map((task, index) => ({ ...task, priority: index }));

  saveTasks();
  renderTasks();
}

function toggleTaskDone(taskId) {
  tasks = tasks.map((task) => (
    task.id === taskId ? { ...task, done: !task.done } : task
  ));

  if (getActiveTask()?.done) {
    state.activeTaskId = null;
    saveRuntime();
  }

  saveTasks();
  render();
  renderTasks();
  renderAnalytics();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  if (state.activeTaskId === taskId) {
    state.activeTaskId = null;
    saveRuntime();
  }
  saveTasks();
  render();
  renderTasks();
  renderAnalytics();
}

function setActiveTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.done) return;

  state.activeTaskId = task.id;
  saveRuntime();
  render();
  renderTasks();
  renderAnalytics();
}

function recordTaskPomodoro() {
  if (!state.activeTaskId) return;

  tasks = tasks.map((task) => {
    if (task.id !== state.activeTaskId) return task;

    const completedPomodoros = task.completedPomodoros + 1;
    return {
      ...task,
      completedPomodoros,
      done: completedPomodoros >= task.estimatedPomodoros
    };
  });

  if (getActiveTask()?.done) {
    state.activeTaskId = null;
  }

  saveTasks();
  renderTasks();
  renderAnalytics();
}

function recordSession(type, skipped) {
  const duration = skipped ? 0 : Math.round(getDurationFromSettings(type) / 60000);

  sessions = [
    ...sessions,
    {
      id: createId(),
      type,
      duration,
      startedAt: state.startedAt || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      taskId: state.activeTaskId,
      skipped
    }
  ].slice(-500);

  state.streak = calculateStreak();
  saveSessions();
  renderAnalytics();
}

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;

  audioContext = audioContext || new AudioCtor();
  return audioContext;
}

function primeAudio() {
  const context = getAudioContext();
  if (context && context.state === "suspended") {
    context.resume();
  }
}

function playTone(frequency, start, duration, gainLevel) {
  const context = getAudioContext();
  if (!context || settings.sound === "none" || settings.volume <= 0) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = settings.sound === "bell" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
  gain.gain.setValueAtTime(0.0001, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainLevel, context.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration + 0.03);
}

function playAlert() {
  const volume = Math.max(0.0001, settings.volume / 100);
  if (settings.sound === "soft") {
    playTone(440, 0, 0.28, 0.12 * volume);
    playTone(554, 0.32, 0.28, 0.1 * volume);
    return;
  }

  if (settings.sound === "bell") {
    playTone(784, 0, 0.18, 0.16 * volume);
    playTone(988, 0.18, 0.26, 0.12 * volume);
    return;
  }

  playTone(523, 0, 0.16, 0.14 * volume);
  playTone(659, 0.16, 0.16, 0.12 * volume);
  playTone(784, 0.32, 0.22, 0.1 * volume);
}

function announceSessionComplete(completedType, nextType) {
  const completedLabel = SESSION_TYPES[completedType].label;
  const nextLabel = SESSION_TYPES[nextType].label.toLowerCase();
  const title = `${completedLabel} complete`;
  const body = `Next up: ${nextLabel}.`;

  playAlert();
  sendBrowserNotification(title, body);

  if (settings.voiceAlerts && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${title}. ${body}`));
  }
}

function sendBrowserNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    tag: "focus-forge-session",
    silent: true
  });
}

function handleTaskDragStart(event) {
  draggedTaskId = event.currentTarget.dataset.taskId;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTaskId);
}

function handleTaskDragOver(event) {
  event.preventDefault();
  if (!draggedTaskId || event.currentTarget.dataset.taskId === draggedTaskId) return;
  event.currentTarget.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
}

function handleTaskDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleTaskDrop(event) {
  event.preventDefault();
  const targetTaskId = event.currentTarget.dataset.taskId;
  event.currentTarget.classList.remove("drag-over");

  if (!draggedTaskId || !targetTaskId || draggedTaskId === targetTaskId) return;

  const ordered = [...tasks].sort(sortTasks);
  const draggedIndex = ordered.findIndex((task) => task.id === draggedTaskId);
  if (draggedIndex < 0) return;

  const [draggedTask] = ordered.splice(draggedIndex, 1);
  const targetIndex = ordered.findIndex((task) => task.id === targetTaskId);
  if (targetIndex < 0) return;

  ordered.splice(targetIndex, 0, draggedTask);
  tasks = ordered.map((task, index) => ({ ...task, priority: index }));
  saveTasks();
  renderTasks();
}

function handleTaskDragEnd() {
  draggedTaskId = null;
  document.querySelectorAll(".task-item.dragging, .task-item.drag-over").forEach((item) => {
    item.classList.remove("dragging", "drag-over");
  });
}

elements.startPauseButton.addEventListener("click", () => {
  primeAudio();
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

elements.skipButton.addEventListener("click", () => completeSession({ skipped: true }));
elements.resetButton.addEventListener("click", resetTimer);
elements.sessionTabs.forEach((tab) => tab.addEventListener("click", handleSessionTab));
elements.themeToggle.addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  saveSettings();
  render();
});

elements.workDuration.addEventListener("change", (event) => setNumberSetting("workDuration", event.target.value, 1, 120));
elements.shortBreakDuration.addEventListener("change", (event) => setNumberSetting("shortBreakDuration", event.target.value, 1, 60));
elements.longBreakDuration.addEventListener("change", (event) => setNumberSetting("longBreakDuration", event.target.value, 1, 90));
elements.longBreakFrequency.addEventListener("change", (event) => setNumberSetting("longBreakFrequency", event.target.value, 2, 12));
elements.accentSelect.addEventListener("change", (event) => {
  settings.accent = event.target.value;
  saveSettings();
  render();
});
elements.soundSelect.addEventListener("change", (event) => {
  settings.sound = event.target.value;
  saveSettings();
});
elements.volumeControl.addEventListener("input", (event) => {
  settings.volume = clampNumber(event.target.value, 0, 100, DEFAULT_SETTINGS.volume);
  saveSettings();
});
elements.autoSwitchToggle.addEventListener("change", (event) => {
  settings.autoSwitch = event.target.checked;
  saveSettings();
});
elements.voiceToggle.addEventListener("change", (event) => {
  settings.voiceAlerts = event.target.checked;
  saveSettings();
});
elements.notifyButton.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  await Notification.requestPermission();
  renderNotificationButton();
});
elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  if (!title) return;

  addTask(title, elements.taskEstimate.value);
  elements.taskForm.reset();
  elements.taskEstimate.value = "1";
  elements.taskTitle.focus();
});
elements.clearDoneButton.addEventListener("click", () => {
  const doneTaskIds = new Set(tasks.filter((task) => task.done).map((task) => task.id));
  tasks = tasks.filter((task) => !task.done);
  if (state.activeTaskId && doneTaskIds.has(state.activeTaskId)) {
    state.activeTaskId = null;
    saveRuntime();
  }
  saveTasks();
  render();
  renderTasks();
  renderAnalytics();
});
elements.prioritizeButton.addEventListener("click", smartPrioritizeTasks);
elements.breakdownForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.breakdownInput.value.trim();
  if (!title) return;

  addBreakdownTasks(title);
  elements.breakdownInput.value = "";
  elements.taskTitle.focus();
});

if (runtime.expired) {
  completeSession({ skipped: false });
} else if (state.isRunning) {
  startTicker();
  render();
} else {
  render();
}

renderTasks();
renderAnalytics();
