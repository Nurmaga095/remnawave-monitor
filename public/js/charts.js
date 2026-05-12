const RANGE_MS = {
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const RANGE_LABELS = {
  '6h': '6ч',
  '24h': '24ч',
  '7d': '7д',
};

const hoverGuidePlugin = {
  id: 'rwmHoverGuide',
  afterDraw(chart) {
    const active = chart.tooltip && chart.tooltip.getActiveElements();
    if (!active || active.length === 0) return;

    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = chart.options.plugins.rwmHoverGuide.lineColor;
    ctx.stroke();
    ctx.restore();
  },
};

export function createActivityChartController({ getState } = {}) {
  let chartRange = '6h';
  let chart = null;

  function setChartRange(range, btn) {
    chartRange = RANGE_MS[range] ? range : '6h';
    if (btn) {
      const switcher = btn.closest('.window-switch');
      if (switcher) {
        switcher.querySelectorAll('button').forEach((button) => {
          button.classList.toggle('active', button === btn);
        });
      }
    }
    renderActivityChart();
  }

  function renderActivityChart() {
    const canvas = document.getElementById('activity-chart');
    if (!canvas) return;

    const state = typeof getState === 'function' ? getState() : {};
    const history = Array.isArray(state?.data?.activityHistory)
      ? state.data.activityHistory.map(normalizeActivityPoint).filter(Boolean)
      : [];
    const data = filterByRange(history, chartRange);
    updateDataBadge(data.length, chartRange);

    if (!window.Chart) {
      destroyChart();
      drawCanvasMessage(canvas, 'Chart.js не загружен');
      return;
    }

    if (data.length < 2) {
      destroyChart();
      drawCanvasMessage(canvas, history.length < 2
        ? 'Ожидание данных активности...'
        : 'Нет данных за выбранный период');
      return;
    }

    const theme = getChartTheme();
    destroyChart();
    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: buildChartData(data, theme),
      options: buildChartOptions(data, theme),
      plugins: [hoverGuidePlugin],
    });
  }

  function destroy() {
    destroyChart();
  }

  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  return { renderActivityChart, setChartRange, destroy };
}

function normalizeActivityPoint(point) {
  if (!point || typeof point !== 'object') return null;
  const ts = normalizeTimestamp(point.ts ?? point.timestamp ?? point.time ?? point.createdAt);
  if (!Number.isFinite(ts)) return null;

  return {
    ts,
    online: toNumber(point.onlineUsers ?? point.online ?? point.usersOnline ?? point.activeUsers),
    suspects: toNumber(point.suspects ?? point.suspectUsers ?? point.suspiciousUsers),
    ips: toNumber(point.ips ?? point.onlineIps ?? point.uniqueIps ?? point.ipCount),
  };
}

function normalizeTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return normalizeTimestamp(asNumber);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function filterByRange(history, range) {
  const cutoff = Date.now() - (RANGE_MS[range] || RANGE_MS['6h']);
  return history
    .filter((point) => point.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);
}

function updateDataBadge(count, range) {
  const badge = document.getElementById('chart-data-count');
  if (badge) badge.textContent = `${count} точек · ${RANGE_LABELS[range] || RANGE_LABELS['6h']}`;
}

function buildChartData(data, theme) {
  const labels = data.map((point) => formatTick(point.ts, chartRangeForData(data)));
  const onlineValues = data.map((point) => point.online);
  const suspectValues = data.map((point) => point.suspects);
  const avgOnline = Math.round(onlineValues.reduce((sum, value) => sum + value, 0) / data.length);
  const hasSuspects = suspectValues.some((value) => value > 0);

  const datasets = [
    {
      label: 'Онлайн',
      data: onlineValues,
      borderColor: theme.online,
      backgroundColor(context) {
        const area = context.chart.chartArea;
        if (!area) return theme.onlineFillFallback;
        const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, theme.onlineFillTop);
        gradient.addColorStop(0.65, theme.onlineFillMid);
        gradient.addColorStop(1, theme.onlineFillBottom);
        return gradient;
      },
      borderWidth: 2.5,
      cubicInterpolationMode: 'monotone',
      fill: true,
      pointRadius: (context) => context.dataIndex === data.length - 1 ? 3.5 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: theme.online,
      pointBorderColor: theme.pointBorder,
      pointBorderWidth: 2,
      tension: 0.35,
      yAxisID: 'y',
    },
    {
      label: 'Среднее',
      data: data.map(() => avgOnline),
      borderColor: theme.avg,
      borderDash: [6, 6],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      yAxisID: 'y',
    },
  ];

  if (hasSuspects) {
    datasets.splice(1, 0, {
      label: 'Подозрительные',
      data: suspectValues,
      borderColor: theme.suspect,
      backgroundColor: theme.suspectFill,
      borderWidth: 2,
      cubicInterpolationMode: 'monotone',
      fill: true,
      pointRadius: (context) => context.dataIndex === data.length - 1 && suspectValues[context.dataIndex] > 0 ? 3.5 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: theme.suspect,
      pointBorderColor: theme.pointBorder,
      pointBorderWidth: 2,
      tension: 0.35,
      yAxisID: 'y1',
    });
  }

  return { labels, datasets };
}

function buildChartOptions(data, theme) {
  const maxSuspects = Math.max(0, ...data.map((point) => point.suspects));

  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 80,
    animation: {
      duration: 320,
      easing: 'easeOutQuart',
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          color: theme.grid,
          drawTicks: false,
        },
        ticks: {
          color: theme.textMuted,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: window.innerWidth <= 720 ? 4 : 7,
          font: {
            family: 'JetBrains Mono, monospace',
            size: 10,
            weight: 500,
          },
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        suggestedMax: Math.max(1, ...data.map((point) => point.online)) * 1.15,
        grid: {
          color: theme.grid,
          drawTicks: false,
        },
        ticks: {
          color: theme.textMuted,
          precision: 0,
          padding: 8,
          font: {
            family: 'JetBrains Mono, monospace',
            size: 10,
            weight: 500,
          },
        },
        border: { display: false },
      },
      y1: {
        display: maxSuspects > 0,
        position: 'right',
        beginAtZero: true,
        suggestedMax: Math.max(1, maxSuspects),
        grid: { drawOnChartArea: false, drawTicks: false },
        ticks: {
          color: theme.suspect,
          precision: 0,
          padding: 8,
          font: {
            family: 'JetBrains Mono, monospace',
            size: 10,
            weight: 600,
          },
        },
        border: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      rwmHoverGuide: {
        lineColor: theme.hoverLine,
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: theme.tooltipBg,
        titleColor: theme.tooltipTitle,
        bodyColor: theme.tooltipBody,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        callbacks: {
          title(items) {
            const point = data[items[0]?.dataIndex || 0];
            return point ? formatFullTime(point.ts) : '';
          },
          label(context) {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${value}`;
          },
          afterBody(items) {
            const point = data[items[0]?.dataIndex || 0];
            return point && point.ips > 0 ? [`IP: ${point.ips}`] : [];
          },
        },
      },
    },
  };
}

function getChartTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    online: isLight ? '#6366f1' : '#818cf8',
    onlineFillTop: isLight ? 'rgba(99,102,241,0.20)' : 'rgba(129,140,248,0.20)',
    onlineFillMid: isLight ? 'rgba(99,102,241,0.06)' : 'rgba(129,140,248,0.07)',
    onlineFillBottom: 'rgba(99,102,241,0)',
    onlineFillFallback: isLight ? 'rgba(99,102,241,0.12)' : 'rgba(129,140,248,0.14)',
    suspect: isLight ? '#ef4444' : '#f87171',
    suspectFill: isLight ? 'rgba(239,68,68,0.10)' : 'rgba(248,113,113,0.12)',
    avg: isLight ? 'rgba(99,102,241,0.45)' : 'rgba(129,140,248,0.35)',
    grid: isLight ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.055)',
    textMuted: isLight ? 'rgba(15,23,42,0.48)' : 'rgba(255,255,255,0.38)',
    hoverLine: isLight ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.15)',
    pointBorder: isLight ? '#ffffff' : '#111724',
    tooltipBg: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(17,23,36,0.96)',
    tooltipTitle: isLight ? '#0f172a' : '#e5e7eb',
    tooltipBody: isLight ? '#1e293b' : '#cbd5e1',
    tooltipBorder: isLight ? 'rgba(99,102,241,0.25)' : 'rgba(129,140,248,0.26)',
  };
}

function drawCanvasMessage(canvas, message) {
  const parent = canvas.parentElement;
  const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width || canvas.clientWidth || 640);
  const height = Math.max(180, rect.height || 220);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.38)';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

function chartRangeForData(data) {
  if (data.length < 2) return '6h';
  const range = data[data.length - 1].ts - data[0].ts;
  return range > RANGE_MS['24h'] ? '7d' : range > RANGE_MS['6h'] ? '24h' : '6h';
}

function formatTick(ts, range) {
  const d = new Date(ts);
  if (range === '7d') {
    return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatFullTime(ts) {
  const d = new Date(ts);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function renderSparkline(containerId, values, color = '#818cf8') {
  const container = document.getElementById(containerId);
  if (!container || values.length < 2) return;

  let svg = container.querySelector('.sparkline-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sparkline-svg');
    svg.setAttribute('viewBox', '0 0 80 24');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;bottom:0;left:0;right:0;width:100%;height:28px;opacity:0.25;pointer-events:none;z-index:0;';
    container.style.position = 'relative';
    container.appendChild(svg);
  }

  const w = 80;
  const h = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = h - ((value - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const fillPoints = [`0,${h}`, ...points, `${w},${h}`].join(' ');

  svg.innerHTML = `
    <defs>
      <linearGradient id="sg-${containerId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${fillPoints}" fill="url(#sg-${containerId})" />
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}
