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
  coinsCount: document.querySelector("#coinsCount")
};

const settings = { ...DEFAULT_SETTINGS };

const state = {
  sessionType: "work",
  isRunning: false,
  targetTime: null,
  remainingMs: minutesToMs(settings.workDuration),
  startedAt: null,
  completedToday: 0,
  cycleCount: 0,
  streak: 0,
  coins: 0,
  tickHandle: null
};

function minutesToMs(minutes) {
  return Number(minutes) * 60 * SECOND;
}

function getSessionDurationMs(type = state.sessionType) {
  if (type === "work") return minutesToMs(settings.workDuration);
  if (type === "shortBreak") return minutesToMs(settings.shortBreakDuration);
  return minutesToMs(settings.longBreakDuration);
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
  render();
}

function pauseTimer() {
  if (!state.isRunning) return;

  updateRemainingFromClock();
  state.isRunning = false;
  state.targetTime = null;
  stopTicker();
  render();
}

function resetTimer() {
  state.isRunning = false;
  state.targetTime = null;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs();
  stopTicker();
  render();
}

function switchSession(type) {
  state.sessionType = type;
  state.isRunning = false;
  state.targetTime = null;
  state.startedAt = null;
  state.remainingMs = getSessionDurationMs(type);
  stopTicker();
  render();
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

function render() {
  document.documentElement.dataset.theme = settings.theme;
  renderSessionTabs();
  renderTimer();
  renderCounters();
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

render();
