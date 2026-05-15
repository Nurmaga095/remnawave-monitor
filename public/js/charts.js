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

// ─── Simple moving average to smooth jagged data ───
function smoothData(points, windowSize = 5) {
  if (points.length <= windowSize) return points;
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(points.length, i + Math.ceil(windowSize / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += points[j][1];
    result.push([points[i][0], Math.round(sum / (end - start))]);
  }
  return result;
}

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
    const container = document.getElementById('activity-chart');
    if (!container) return;

    const state = typeof getState === 'function' ? getState() : {};
    const history = Array.isArray(state?.data?.activityHistory)
      ? state.data.activityHistory.map(normalizeActivityPoint).filter(Boolean)
      : [];
    const data = filterByRange(history, chartRange);
    updateDataBadge(data.length, chartRange);

    if (!window.ApexCharts) {
      destroyChart();
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.38);font:600 13px Inter,sans-serif;">ApexCharts не загружен</div>';
      return;
    }

    if (data.length < 2) {
      destroyChart();
      const msg = history.length < 2
        ? 'Ожидание данных активности...'
        : 'Нет данных за выбранный период';
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:280px;color:rgba(255,255,255,0.38);font:600 13px Inter,sans-serif;">${msg}</div>`;
      return;
    }

    const theme = getChartTheme();
    const options = buildApexOptions(data, theme, chartRange);

    if (chart) {
      try {
        chart.updateOptions(options, true, true, true);
      } catch (e) {
        destroyChart();
        chart = new ApexCharts(container, options);
        chart.render();
      }
    } else {
      chart = new ApexCharts(container, options);
      chart.render();
    }
  }

  function destroy() {
    destroyChart();
  }

  function destroyChart() {
    if (chart) {
      try { chart.destroy(); } catch (e) { /* ignore */ }
      chart = null;
    }
    const el = document.getElementById('activity-chart');
    if (el) el.innerHTML = '';
  }

  return { renderActivityChart, setChartRange, destroy };
}

function buildApexOptions(data, theme, range) {
  // Downsample if too many points for smoother visual
  const step = data.length > 200 ? Math.ceil(data.length / 150) : 1;
  const sampled = step > 1 ? data.filter((_, i) => i % step === 0 || i === data.length - 1) : data;

  const rawOnline = sampled.map((p) => [p.ts, p.online]);
  const rawSuspect = sampled.map((p) => [p.ts, p.suspects]);
  const hasSuspects = sampled.some((p) => p.suspects > 0);

  // Smooth the data for a cleaner look
  const smoothWindow = range === '7d' ? 7 : range === '24h' ? 5 : 4;
  const onlineValues = smoothData(rawOnline, smoothWindow);
  const suspectValues = hasSuspects ? smoothData(rawSuspect, Math.max(3, smoothWindow - 1)) : rawSuspect;

  const avgOnline = Math.round(data.reduce((s, p) => s + p.online, 0) / data.length);
  const maxOnline = Math.max(1, ...data.map((p) => p.online));
  const maxSuspects = Math.max(0, ...data.map((p) => p.suspects));

  const series = [
    { name: 'Онлайн', data: onlineValues },
  ];
  if (hasSuspects) {
    series.push({ name: 'Подозрительные', data: suspectValues });
  }

  const yaxis = [
    {
      min: 0,
      max: Math.ceil(maxOnline * 1.12),
      tickAmount: 4,
      labels: {
        style: {
          colors: theme.onlineLabel,
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        },
        formatter: (val) => Math.round(val),
        offsetX: -4,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
  ];

  if (hasSuspects) {
    yaxis.push({
      opposite: true,
      min: 0,
      max: Math.max(2, Math.ceil(maxSuspects * 1.5)),
      tickAmount: 3,
      labels: {
        style: {
          colors: theme.suspectLabel,
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        },
        formatter: (val) => Math.round(val),
        offsetX: 4,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    });
  }

  return {
    series,
    chart: {
      type: 'area',
      height: 310,
      fontFamily: 'Inter, sans-serif',
      background: 'transparent',
      foreColor: theme.textMuted,
      toolbar: { show: false },
      zoom: { enabled: false },
      selection: { enabled: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 900,
        animateGradually: { enabled: true, delay: 80 },
        dynamicAnimation: { enabled: true, speed: 500 },
      },
      dropShadow: {
        enabled: true,
        enabledOnSeries: [0],
        top: 6,
        left: 0,
        blur: 20,
        opacity: 0.35,
        color: theme.online,
      },
    },
    colors: hasSuspects
      ? [theme.online, theme.suspect]
      : [theme.online],
    fill: {
      type: 'gradient',
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        inverseColors: false,
        opacityFrom: hasSuspects ? [0.55, 0.4] : [0.55],
        opacityTo: hasSuspects ? [0.0, 0.0] : [0.0],
        stops: [0, 95, 100],
      },
    },
    stroke: {
      curve: 'smooth',
      width: hasSuspects ? [3.5, 2.5] : [3.5],
      lineCap: 'round',
    },
    dataLabels: { enabled: false },
    markers: {
      size: 0,
      hover: { sizeOffset: 6 },
      strokeColors: theme.markerStroke,
      strokeWidth: 3,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: theme.textMuted,
          fontSize: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 500,
        },
        datetimeUTC: false,
        datetimeFormatter: {
          hour: 'HH:mm',
          day: 'dd MMM',
        },
        rotate: 0,
        maxHeight: 30,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: {
        show: true,
        width: 1,
        position: 'back',
        opacity: 0.6,
        stroke: {
          color: theme.crosshair,
          width: 1,
          dashArray: 5,
        },
        fill: {
          type: 'solid',
          color: theme.crosshairFill,
        },
      },
      tooltip: { enabled: false },
    },
    yaxis,
    grid: {
      show: true,
      borderColor: theme.grid,
      strokeDashArray: 4,
      position: 'back',
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 12, right: 12, top: 0, bottom: 0 },
    },
    legend: { show: false },
    tooltip: {
      enabled: true,
      shared: true,
      intersect: false,
      theme: theme.isDark ? 'dark' : 'light',
      style: {
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
      },
      x: {
        format: 'dd.MM.yyyy HH:mm',
      },
      y: {
        formatter: (val, opts) => {
          if (val === undefined || val === null) return '';
          const v = Math.round(val);
          if (opts.seriesIndex === 0) return `<strong>${v}</strong> чел.`;
          return `<strong>${v}</strong>`;
        },
      },
      marker: { show: true },
      fixed: {
        enabled: false,
      },
    },
    annotations: {
      yaxis: [{
        y: avgOnline,
        strokeDashArray: 8,
        borderColor: theme.avgLine,
        borderWidth: 1.5,
        label: {
          text: `среднее: ${avgOnline}`,
          position: 'left',
          offsetX: 10,
          offsetY: -6,
          style: {
            color: theme.avgText,
            background: theme.avgBg,
            fontSize: '10px',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700,
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
            borderRadius: 6,
            cssClass: 'avg-annotation-label',
          },
          borderWidth: 0,
        },
      }],
    },
    responsive: [{
      breakpoint: 768,
      options: {
        chart: { height: 220 },
        stroke: { width: hasSuspects ? [2.5, 2] : [2.5] },
      },
    }],
  };
}

function getChartTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    // Line colors — vivid
    online: isDark ? '#818cf8' : '#6366f1',
    suspect: isDark ? '#fb7185' : '#f43f5e',
    // Label colors on Y axes
    onlineLabel: isDark ? '#a5b4fc' : '#6366f1',
    suspectLabel: isDark ? '#fda4af' : '#f43f5e',
    // Average annotation
    avgLine: isDark ? 'rgba(129,140,248,0.35)' : 'rgba(99,102,241,0.3)',
    avgText: isDark ? '#c7d2fe' : '#4f46e5',
    avgBg: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
    // Grid & text
    grid: isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.06)',
    textMuted: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.4)',
    crosshair: isDark ? 'rgba(129,140,248,0.35)' : 'rgba(99,102,241,0.3)',
    crosshairFill: isDark ? 'rgba(129,140,248,0.04)' : 'rgba(99,102,241,0.03)',
    markerStroke: isDark ? '#0f172a' : '#ffffff',
  };
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
