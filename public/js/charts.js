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

// ─── Hover guide: vertical dashed line on cursor ───
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

// ─── Glow effect: draw a blurred shadow behind lines ───
const glowPlugin = {
  id: 'rwmGlow',
  beforeDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  },
};

// ─── Animated pulse on last data point ───
const lastPointPulsePlugin = {
  id: 'rwmLastPulse',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    chart.data.datasets.forEach((ds, i) => {
      if (ds.label === 'Среднее') return;
      const meta = chart.getDatasetMeta(i);
      if (!meta.visible || meta.data.length === 0) return;

      const last = meta.data[meta.data.length - 1];
      if (!last) return;

      const x = last.x;
      const y = last.y;
      const color = ds.borderColor;

      // Outer pulse ring
      const t = (Date.now() % 2000) / 2000;
      const scale = 1 + Math.sin(t * Math.PI * 2) * 0.3;
      const alpha = 0.3 - Math.sin(t * Math.PI * 2) * 0.15;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 8 * scale, 0, Math.PI * 2);
      ctx.fillStyle = typeof color === 'string'
        ? color.replace(/[^,]+\)$/, `${alpha})`)
        : `rgba(129,140,248,${alpha})`;
      ctx.fill();

      // Inner solid dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // White ring
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = chart.options.plugins.rwmHoverGuide?.lineColor || 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    });
  },
};

export function createActivityChartController({ getState } = {}) {
  let chartRange = '6h';
  let chart = null;
  let animFrame = null;

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
      plugins: [hoverGuidePlugin, lastPointPulsePlugin],
    });

    // Animate pulse
    startPulseAnimation();
  }

  function startPulseAnimation() {
    cancelAnimationFrame(animFrame);
    function tick() {
      if (chart && chart.canvas) {
        chart.draw();
        animFrame = requestAnimationFrame(tick);
      }
    }
    animFrame = requestAnimationFrame(tick);
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
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
      label: 'Пользователи онлайн',
      data: onlineValues,
      borderColor: theme.online,
      backgroundColor(context) {
        const area = context.chart.chartArea;
        if (!area) return theme.onlineFillFallback;
        const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, theme.onlineFillTop);
        gradient.addColorStop(0.3, theme.onlineFillMid);
        gradient.addColorStop(0.7, theme.onlineFillLow);
        gradient.addColorStop(1, theme.onlineFillBottom);
        return gradient;
      },
      borderWidth: 2.5,
      cubicInterpolationMode: 'monotone',
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: theme.online,
      pointHoverBorderColor: theme.pointBorder,
      pointHoverBorderWidth: 2.5,
      tension: 0.4,
      yAxisID: 'y',
      order: 1,
    },
    {
      label: 'Среднее',
      data: data.map(() => avgOnline),
      borderColor: theme.avg,
      borderDash: [8, 6],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      yAxisID: 'y',
      order: 3,
    },
  ];

  if (hasSuspects) {
    datasets.splice(1, 0, {
      label: 'Подозрительные',
      data: suspectValues,
      borderColor: theme.suspect,
      backgroundColor(context) {
        const area = context.chart.chartArea;
        if (!area) return theme.suspectFill;
        const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, theme.suspectFillTop);
        gradient.addColorStop(0.5, theme.suspectFillMid);
        gradient.addColorStop(1, theme.suspectFillBottom);
        return gradient;
      },
      borderWidth: 2,
      cubicInterpolationMode: 'monotone',
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: theme.suspect,
      pointHoverBorderColor: theme.pointBorder,
      pointHoverBorderWidth: 2,
      tension: 0.4,
      yAxisID: 'y1',
      order: 2,
    });
  }

  return { labels, datasets };
}

function buildChartOptions(data, theme) {
  const maxSuspects = Math.max(0, ...data.map((point) => point.suspects));
  const maxOnline = Math.max(1, ...data.map((point) => point.online));

  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 80,
    animation: {
      duration: 600,
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
          lineWidth: 0.5,
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
          padding: 8,
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        suggestedMax: maxOnline * 1.18,
        grid: {
          color: theme.grid,
          drawTicks: false,
          lineWidth: 0.5,
        },
        ticks: {
          color: theme.textMuted,
          precision: 0,
          padding: 10,
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
        suggestedMax: Math.max(1, maxSuspects) * 1.3,
        grid: { drawOnChartArea: false, drawTicks: false },
        ticks: {
          color: theme.suspect,
          precision: 0,
          padding: 10,
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
        cornerRadius: 10,
        padding: { top: 10, bottom: 10, left: 14, right: 14 },
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        boxPadding: 6,
        bodySpacing: 6,
        titleSpacing: 4,
        titleFont: {
          family: 'JetBrains Mono, monospace',
          size: 11,
          weight: 600,
        },
        bodyFont: {
          family: 'Inter, sans-serif',
          size: 12,
          weight: 500,
        },
        callbacks: {
          title(items) {
            const point = data[items[0]?.dataIndex || 0];
            return point ? `📅 ${formatFullTime(point.ts)}` : '';
          },
          label(context) {
            const value = context.parsed.y;
            const label = context.dataset.label;
            if (label === 'Среднее') return `  ── avg: ${value}`;
            if (label === 'Подозрительные') return `  🔴 ${label}: ${value}`;
            return `  👤 ${label}: ${value}`;
          },
          afterBody(items) {
            const point = data[items[0]?.dataIndex || 0];
            if (!point || point.ips <= 0) return [];
            return [`  🌐 IP адресов: ${point.ips}`];
          },
        },
      },
    },
    layout: {
      padding: {
        top: 4,
        right: 4,
        bottom: 0,
        left: 0,
      },
    },
  };
}

function getChartTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    // Online line — indigo/purple gradient feel
    online: isLight ? '#6366f1' : '#818cf8',
    onlineFillTop: isLight ? 'rgba(99,102,241,0.28)' : 'rgba(129,140,248,0.28)',
    onlineFillMid: isLight ? 'rgba(99,102,241,0.12)' : 'rgba(129,140,248,0.14)',
    onlineFillLow: isLight ? 'rgba(99,102,241,0.04)' : 'rgba(129,140,248,0.05)',
    onlineFillBottom: 'rgba(99,102,241,0)',
    onlineFillFallback: isLight ? 'rgba(99,102,241,0.15)' : 'rgba(129,140,248,0.16)',

    // Suspect line — warm red
    suspect: isLight ? '#ef4444' : '#f87171',
    suspectFill: isLight ? 'rgba(239,68,68,0.10)' : 'rgba(248,113,113,0.12)',
    suspectFillTop: isLight ? 'rgba(239,68,68,0.22)' : 'rgba(248,113,113,0.24)',
    suspectFillMid: isLight ? 'rgba(239,68,68,0.08)' : 'rgba(248,113,113,0.10)',
    suspectFillBottom: 'rgba(239,68,68,0)',

    // Average line — subtle
    avg: isLight ? 'rgba(99,102,241,0.35)' : 'rgba(129,140,248,0.28)',

    // Grid & text
    grid: isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.04)',
    textMuted: isLight ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.32)',
    hoverLine: isLight ? 'rgba(99,102,241,0.2)' : 'rgba(129,140,248,0.2)',
    pointBorder: isLight ? '#ffffff' : '#111724',

    // Tooltip
    tooltipBg: isLight ? 'rgba(255,255,255,0.97)' : 'rgba(15,20,30,0.97)',
    tooltipTitle: isLight ? '#1e293b' : '#e5e7eb',
    tooltipBody: isLight ? '#475569' : '#94a3b8',
    tooltipBorder: isLight ? 'rgba(99,102,241,0.2)' : 'rgba(129,140,248,0.22)',
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
  ctx.fillStyle = isLight ? 'rgba(15,23,42,0.36)' : 'rgba(255,255,255,0.32)';
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
