export const cfg = { interval: 30 };

export const state = {
  users: [],
  hwidTop: [],
  hwidDevices: {},
  activeIps: {},
  activeIpWindows: {},
  onlineWindow: 'live',
  ipHistory: [],
  ipStats: {},
  hwidChurn: {},
  trafficMedian: 0,
  remnawaveExtra: null,
  suspectStreak: {},
  sessionFilter: 'all',
  sessionSort: 'ip-desc',
  searchQuery: '',
  incidentFilter: 'open',
  refreshTimer: null,
  countdown: 0,
  countdownTimer: null,
  loading: false,
  sync: null,
  aiSettings: null,
  aiProviders: [],
  stateVersion: 0,
  lastStateETag: null,
  bulkSelected: new Set(),
};

export function resetState() {
  state.users = [];
  state.hwidTop = [];
  state.hwidDevices = {};
  state.activeIps = {};
  state.activeIpWindows = {};
  state.ipHistory = [];
  state.ipStats = {};
  state.suspectStreak = {};
  state.hwidChurn = {};
  state.trafficMedian = 0;
  state.sync = null;
  state.loading = false;
  if (state.bulkSelected instanceof Set) {
    state.bulkSelected.clear();
  }
}
