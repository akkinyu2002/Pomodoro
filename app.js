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
  tasks: "focusForge.tasks.v1"
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
  accentSelect: document.querySelector("#accentSelect"),
  soundSelect: document.querySelector("#soundSelect"),
  volumeControl: document.querySelector("#volumeControl"),
  autoSwitchToggle: document.querySelector("#autoSwitchToggle"),
  voiceToggle: document.querySelector("#voiceToggle"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskEstimate: document.querySelector("#taskEstimate"),
  taskList: document.querySelector("#taskList"),
  clearDoneButton: document.querySelector("#clearDoneButton")
};

const settings = loadSettings();
const runtime = loadRuntime();
let tasks = loadTasks();
let draggedTaskId = null;

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
    coins: clampNumber(saved.coins, 0, 999999, 0)
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

function saveSettings() {
  writeJson(STORAGE_KEYS.settings, settings);
}

function saveTasks() {
  writeJson(STORAGE_KEYS.tasks, tasks);
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
    coins: state.coins
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
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

  if (shouldCountWork) {
    state.completedToday += 1;
    state.cycleCount += 1;
    state.streak = Math.max(1, state.streak);
    state.coins += 5;
  }

  const nextType = skipped && completedType !== "work" ? "work" : getNextSessionType();
  state.sessionType = nextType;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs(nextType);

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
    elements.timerMeta.textContent = `Pomodoro ${cyclePosition} of ${settings.longBreakFrequency} before a long break`;
  } else {
    elements.timerMeta.textContent = `${sessionCopy.label} before the next focus session`;
  }
}

function renderCounters() {
  elements.completedCount.textContent = String(state.completedToday);
  elements.streakCount.textContent = String(state.streak);
  elements.coinsCount.textContent = String(state.coins);
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  tasks.sort(sortTasks).forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item${task.done ? " done" : ""}`;
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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "X";
    deleteButton.title = "Delete task";
    deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    copy.append(title, progress);
    actions.append(deleteButton);
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
}

function addTask(title, estimate) {
  const nextPriority = tasks.length ? Math.max(...tasks.map((task) => task.priority)) + 1 : 0;

  tasks = [
    ...tasks,
    {
      id: createId(),
      title: title.trim(),
      estimatedPomodoros: clampNumber(estimate, 1, 24, 1),
      completedPomodoros: 0,
      done: false,
      createdAt: new Date().toISOString(),
      dateKey: getDateKey(),
      priority: nextPriority
    }
  ];

  saveTasks();
  renderTasks();
}

function toggleTaskDone(taskId) {
  tasks = tasks.map((task) => (
    task.id === taskId ? { ...task, done: !task.done } : task
  ));
  saveTasks();
  renderTasks();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  renderTasks();
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
  tasks = tasks.filter((task) => !task.done);
  saveTasks();
  renderTasks();
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
