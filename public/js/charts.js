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
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.38);font:600 13px Inter,sans-serif;">${msg}</div>`;
      return;
    }

    const theme = getChartTheme();
    const options = buildApexOptions(data, theme, chartRange);

    if (chart) {
      chart.updateOptions(options, true, true, true);
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
      chart.destroy();
      chart = null;
    }
    const el = document.getElementById('activity-chart');
    if (el) el.innerHTML = '';
  }

  return { renderActivityChart, setChartRange, destroy };
}

function buildApexOptions(data, theme, range) {
  const onlineValues = data.map((p) => [p.ts, p.online]);
  const suspectValues = data.map((p) => [p.ts, p.suspects]);
  const hasSuspects = data.some((p) => p.suspects > 0);
  const avgOnline = Math.round(data.reduce((s, p) => s + p.online, 0) / data.length);
  const maxOnline = Math.max(1, ...data.map((p) => p.online));
  const maxSuspects = Math.max(0, ...data.map((p) => p.suspects));

  const series = [
    {
      name: 'Пользователи онлайн',
      type: 'area',
      data: onlineValues,
    },
  ];

  if (hasSuspects) {
    series.push({
      name: 'Подозрительные',
      type: 'area',
      data: suspectValues,
    });
  }

  const yaxis = [
    {
      title: { text: undefined },
      min: 0,
      max: Math.ceil(maxOnline * 1.15),
      tickAmount: 5,
      labels: {
        style: {
          colors: theme.textMuted,
          fontSize: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 500,
        },
        formatter: (val) => Math.round(val),
      },
    },
  ];

  if (hasSuspects) {
    yaxis.push({
      opposite: true,
      title: { text: undefined },
      min: 0,
      max: Math.max(1, Math.ceil(maxSuspects * 1.4)),
      tickAmount: 4,
      labels: {
        style: {
          colors: theme.suspect,
          fontSize: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        },
        formatter: (val) => Math.round(val),
      },
    });
  }

  return {
    series,
    chart: {
      type: 'area',
      height: 290,
      fontFamily: 'Inter, sans-serif',
      background: 'transparent',
      foreColor: theme.textMuted,
      toolbar: { show: false },
      zoom: { enabled: false },
      selection: { enabled: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 700,
        animateGradually: { enabled: true, delay: 120 },
        dynamicAnimation: { enabled: true, speed: 400 },
      },
      dropShadow: {
        enabled: true,
        top: 4,
        left: 0,
        blur: 12,
        opacity: 0.18,
        color: [theme.onlineGlow, theme.suspectGlow],
      },
      sparkline: { enabled: false },
    },
    colors: hasSuspects
      ? [theme.online, theme.suspect]
      : [theme.online],
    fill: {
      type: 'gradient',
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        opacityFrom: [0.45, 0.35],
        opacityTo: [0.02, 0.02],
        stops: [0, 90, 100],
        colorStops: [
          [
            { offset: 0, color: theme.online, opacity: 0.4 },
            { offset: 40, color: theme.online, opacity: 0.15 },
            { offset: 100, color: theme.online, opacity: 0.01 },
          ],
          ...(hasSuspects ? [[
            { offset: 0, color: theme.suspect, opacity: 0.35 },
            { offset: 50, color: theme.suspect, opacity: 0.1 },
            { offset: 100, color: theme.suspect, opacity: 0.01 },
          ]] : []),
        ],
      },
    },
    stroke: {
      curve: 'smooth',
      width: hasSuspects ? [3, 2.5] : [3],
      lineCap: 'round',
    },
    dataLabels: { enabled: false },
    markers: {
      size: 0,
      hover: { sizeOffset: 5 },
      strokeColors: theme.markerStroke,
      strokeWidth: 2,
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
          day: 'dd.MM',
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: {
        show: true,
        stroke: {
          color: theme.crosshair,
          width: 1,
          dashArray: 4,
        },
      },
      tooltip: { enabled: false },
    },
    yaxis,
    grid: {
      borderColor: theme.grid,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 8, right: 8 },
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
        format: 'dd.MM HH:mm',
      },
      y: {
        formatter: (val, { seriesIndex }) => {
          if (seriesIndex === 0) return `${Math.round(val)} чел.`;
          return `${Math.round(val)}`;
        },
      },
      marker: { show: true },
      custom: undefined,
    },
    annotations: {
      yaxis: [{
        y: avgOnline,
        strokeDashArray: 6,
        borderColor: theme.avgLine,
        borderWidth: 1.5,
        label: {
          text: `avg: ${avgOnline}`,
          position: 'left',
          offsetX: 10,
          offsetY: -4,
          style: {
            color: theme.avgText,
            background: theme.avgBg,
            fontSize: '10px',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            padding: { left: 6, right: 6, top: 3, bottom: 3 },
            borderRadius: 4,
          },
          borderWidth: 0,
        },
      }],
    },
    responsive: [{
      breakpoint: 768,
      options: {
        chart: { height: 220 },
      },
    }],
  };
}

function getChartTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    online: isDark ? '#818cf8' : '#6366f1',
    onlineGlow: isDark ? '#818cf8' : '#6366f1',
    suspect: isDark ? '#f87171' : '#ef4444',
    suspectGlow: isDark ? '#f87171' : '#ef4444',
    avgLine: isDark ? 'rgba(129,140,248,0.3)' : 'rgba(99,102,241,0.3)',
    avgText: isDark ? '#94a3b8' : '#64748b',
    avgBg: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)',
    grid: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)',
    textMuted: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.42)',
    crosshair: isDark ? 'rgba(129,140,248,0.25)' : 'rgba(99,102,241,0.25)',
    markerStroke: isDark ? '#111724' : '#ffffff',
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
