const fs = require('fs');
const path = require('path');
const echarts = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/echarts');
const { Resvg } = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/@resvg/resvg-js');
const PDFDocument = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/pdfkit');
const SVGtoPDF = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/svg-to-pdfkit');

const root = '/home2/gmj/openvla/runs/ablations/recipe_training_ablation_20260428/30_summary';
const tablePath = path.join(root, 'recipe_ablation_table.md');
const outDir = '/home2/gmj/openvla/paper/NeurIPS2026/figures';
fs.mkdirSync(outDir, { recursive: true });

const fontFamily = 'Times New Roman, Times, serif';
const pdfFonts = {
  regular: '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  bold: '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
  italic: '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf',
};

const color = {
  bridge: '#4C78A8',
  bridgeLight: '#7FA7CF',
  bridgeDark: '#2F5F8F',
  libero: '#D18B2D',
  liberoLight: '#E4AF5C',
  liberoDark: '#A8641E',
  hard: '#737D8C',
  blend: '#59A14F',
  distill: '#D65F5F',
  rGate: '#9C76B7',
  seqGate: '#2A9D8F',
  arrow: '#64748B',
  grid: '#E6EBF2',
  axis: '#9AA6B2',
  text: '#1f2937',
  muted: '#6b7280',
};

const bridgeStageColors = ['#7B8796', '#4C78A8', '#2F5F8F'];
const liberoStageColors = ['#C58D45', '#D18B2D', '#A8641E'];

function parseTable(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length !== 3 || cells[0] === 'Comparison') continue;
    rows.push({ comparison: cells[0], benchmark: cells[1], result: cells[2] });
  }
  return rows;
}

function pairNumbers(result) {
  const m = result.match(/([0-9]+(?:\.[0-9]+)?)\s*->\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) throw new Error(`Cannot parse pair: ${result}`);
  return [Number(m[1]), Number(m[2])];
}

function selectedNumbers(result) {
  const m = result.match(/selected\s*([0-9]+(?:\.[0-9]+)?)\s*->\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) throw new Error(`Cannot parse selected pair: ${result}`);
  return [Number(m[1]), Number(m[2])];
}

function sweepNumbers(result) {
  return Array.from(result.matchAll(/([0-9]+(?:\.[0-9]+)?):\s*([0-9]+(?:\.[0-9]+)?)/g))
    .map((m) => ({ alpha: Number(m[1]), success: Number(m[2]) }));
}

const rows = parseTable(fs.readFileSync(tablePath, 'utf8'));
function get(comparison, benchmark) {
  const row = rows.find((r) => r.comparison === comparison && r.benchmark === benchmark);
  if (!row) throw new Error(`Missing row: ${comparison} / ${benchmark}`);
  return row.result;
}

const benchmarks = ['BridgeData V2', 'LIBERO-Long'];
const hardBlend = Object.fromEntries(benchmarks.map((b) => [b, pairNumbers(get('Hard sparse masks vs. +blend', b))]));
const blendDistill = Object.fromEntries(benchmarks.map((b) => [b, pairNumbers(get('+blend vs. +blend+distill', b))]));
const gatePair = Object.fromEntries(benchmarks.map((b) => [b, pairNumbers(get('Final unified gate vs. earlier gate variant', b))]));
const selectedPair = Object.fromEntries(benchmarks.map((b) => [b, selectedNumbers(get('Final unified gate vs. earlier gate variant', b))]));
const sweeps = Object.fromEntries(benchmarks.map((b) => [b, sweepNumbers(get('Blend sweep ($\\alpha=0.35$ vs. nearby values)', b))]));

function baseOption(title, subtitle) {
  return {
    backgroundColor: '#fff',
    title: {
      text: title,
      subtext: subtitle,
      left: 26,
      top: 18,
      textStyle: { fontFamily, fontSize: 22, fontWeight: 700, color: color.text },
      subtextStyle: { fontFamily, fontSize: 12, color: color.muted, lineHeight: 17 },
    },
    textStyle: { fontFamily, color: color.text },
    animation: false,
  };
}

function axisCommon() {
  return {
    axisLine: { lineStyle: { color: color.axis, width: 0.8 } },
    axisTick: { lineStyle: { color: color.axis } },
    axisLabel: { fontFamily, fontSize: 11, color: '#5f6b7a' },
    splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.8 } },
  };
}

function arrowGraphic(x1, y1, x2, y2, stroke = color.arrow) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 9;
  const spread = 0.55;
  const p1 = [x2 - len * Math.cos(angle - spread), y2 - len * Math.sin(angle - spread)];
  const p2 = [x2 - len * Math.cos(angle + spread), y2 - len * Math.sin(angle + spread)];
  return [
    { type: 'line', z: 1, shape: { x1, y1, x2, y2 }, style: { stroke, lineWidth: 1.8, lineDash: [5, 4], lineCap: 'round', opacity: 0.78 } },
    { type: 'polygon', z: 1, shape: { points: [[x2, y2], p1, p2] }, style: { fill: stroke, opacity: 0.78 } },
  ];
}

function arrowLabel(x1, y1, x2, y2, text, fill, dx = 0, dy = -18, fontSize = 12) {
  return {
    type: 'text',
    z: 30,
    left: (x1 + x2) / 2 + dx,
    top: (y1 + y2) / 2 + dy,
    style: { text, fill, font: `bold ${fontSize}px ${fontFamily}` },
  };
}

function slopeGainGraphics(left, top, width, height, yMin, yMax, bridge, libero, fontSize = 10, offsets = {}) {
  const x = (idx) => left + width * (idx + 0.5) / 3;
  const y = (v) => top + height * (yMax - v) / (yMax - yMin);
  const label = (series, i, fill, dy) => ({
    type: 'text',
    z: 30,
    left: (x(i) + x(i + 1)) / 2 - 20 + (offsets[`${fill}-${i}`]?.dx || 0),
    top: (y(series[i]) + y(series[i + 1])) / 2 + dy + (offsets[`${fill}-${i}`]?.dy || 0),
    style: {
      text: `+${(series[i + 1] - series[i]).toFixed(2)} pts`,
      fill,
      font: `bold ${fontSize}px ${fontFamily}`,
    },
  });
  return [
    label(bridge, 0, color.bridge, -18),
    label(bridge, 1, color.bridge, -18),
    label(libero, 0, color.libero, -20),
    label(libero, 1, color.libero, -24),
  ];
}

function render(name, option, width, height) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height });
  chart.setOption(option);
  let svg = chart.renderToSVGString();
  chart.dispose();
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svg = svg.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
  }

  const svgPath = path.join(outDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);
  const pdfPath = path.join(outDir, `${name}.pdf`);
  fs.writeFileSync(svgPath, svg);
  fs.writeFileSync(pngPath, new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  doc.registerFont('Times New Roman', pdfFonts.regular);
  doc.registerFont('Times New Roman Bold', pdfFonts.bold);
  doc.registerFont('Times New Roman Italic', pdfFonts.italic);
  SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true });
  doc.end();

  return new Promise((resolve) => stream.on('finish', () => {
    console.log(`[ok] wrote ${svgPath}`);
    console.log(`[ok] wrote ${pngPath}`);
    console.log(`[ok] wrote ${pdfPath}`);
    resolve();
  }));
}

function centeredGraphicText(cx, top, value, size = 14, weight = 'normal') {
  const approxWidth = String(value).length * size * 0.46;
  return {
    type: 'text',
    left: cx - approxWidth / 2,
    top,
    style: { text: value, fill: color.muted, font: `${weight === 'bold' ? 'bold ' : ''}${size}px ${fontFamily}` },
  };
}

function trainingRecipeOption(compact = false) {
  const opt = baseOption(
    compact ? '(A) Training recipe ablation' : 'Training recipe ablation',
    compact ? '' : 'Slope chart of proxy-success gains across recipe stages.'
  );
  const categories = ['Hard', 'Blend', 'Blend+Distill'];
  const bridge = [hardBlend['BridgeData V2'][0], hardBlend['BridgeData V2'][1], blendDistill['BridgeData V2'][1]];
  const libero = [hardBlend['LIBERO-Long'][0], hardBlend['LIBERO-Long'][1], blendDistill['LIBERO-Long'][1]];

  Object.assign(opt, {
    grid: { left: compact ? 58 : 76, right: compact ? 24 : 40, top: compact ? 96 : 116, bottom: compact ? 58 : 76, width: compact ? 370 : 560, height: compact ? 218 : 250 },
    legend: { top: compact ? 58 : 76, right: compact ? 18 : 42, itemWidth: 16, itemHeight: 8, textStyle: { fontFamily, fontSize: compact ? 10 : 11, color: color.muted } },
    xAxis: { type: 'category', name: compact ? '' : 'Recipe stage', nameLocation: 'middle', nameGap: 42, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, data: categories, axisLabel: { interval: 0, rotate: 0, fontFamily, fontStyle: 'normal', fontSize: compact ? 10 : 12, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.8 } }, axisTick: { show: false } },
    yAxis: { type: 'value', min: 80, max: 96, name: compact ? '' : 'Proxy success rate (%)', nameLocation: 'middle', nameGap: 42, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, ...axisCommon() },
    graphic: slopeGainGraphics(compact ? 58 : 76, compact ? 96 : 116, compact ? 370 : 560, compact ? 218 : 250, 80, 96, bridge, libero, compact ? 9 : 11),
    series: [
      {
        name: 'BridgeData V2',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: compact ? 7 : 9,
        lineStyle: { width: compact ? 2 : 2.3, color: color.bridge },
        itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.4 },
        data: bridge,
        label: { show: true, position: 'bottom', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: compact ? 9 : 11 },
      },
      {
        name: 'LIBERO-Long',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: compact ? 7 : 9,
        lineStyle: { width: compact ? 2 : 2.3, color: color.libero },
        itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.4 },
        data: libero,
        label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: compact ? 9 : 11 },
      },
    ],
  });
  return opt;
}

function gateChangeOption(compact = false) {
  const opt = baseOption(
    compact ? '(B) Gate method ablation' : 'Gate method ablation',
    compact ? '' : 'Success and selected channels are separated to avoid dual-axis ambiguity.'
  );
  const cats = ['R-Gate', 'SeqText-Gate'];
  const bridgeSuccess = [gatePair['BridgeData V2'][1], gatePair['BridgeData V2'][0]];
  const liberoSuccess = [gatePair['LIBERO-Long'][1], gatePair['LIBERO-Long'][0]];
  const bridgeSelected = [selectedPair['BridgeData V2'][1], selectedPair['BridgeData V2'][0]];
  const liberoSelected = [selectedPair['LIBERO-Long'][1], selectedPair['LIBERO-Long'][0]];
  Object.assign(opt, {
    grid: [
      { left: compact ? 58 : 76, right: compact ? 26 : 42, top: compact ? 96 : 116, bottom: 0, width: compact ? 370 : 560, height: compact ? 94 : 112 },
      { left: compact ? 58 : 76, right: compact ? 26 : 42, top: compact ? 230 : 270, bottom: compact ? 58 : 76, width: compact ? 370 : 560, height: compact ? 88 : 102 },
    ],
    legend: { top: compact ? 58 : 76, right: compact ? 18 : 42, data: ['BridgeData V2', 'LIBERO-Long'], itemWidth: 16, itemHeight: 8, textStyle: { fontFamily, fontSize: compact ? 10 : 11, color: color.muted } },
    xAxis: [
      { type: 'category', gridIndex: 0, data: cats, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
      { type: 'category', gridIndex: 1, name: compact ? '' : 'Gate method', nameLocation: 'middle', nameGap: 34, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, data: cats, axisLabel: { fontFamily, fontStyle: 'normal', fontSize: compact ? 10 : 12, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.8 } }, axisTick: { show: false } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, min: 88, max: 96, name: compact ? '' : 'Success (%)', nameLocation: 'middle', nameGap: 36, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, ...axisCommon() },
      { type: 'value', gridIndex: 1, min: 1.2, max: 3.0, name: compact ? '' : 'Selected channels', nameLocation: 'middle', nameGap: 36, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, ...axisCommon() },
    ],
    graphic: [
      { type: 'text', left: compact ? 62 : 82, top: compact ? 78 : 98, style: { text: 'Success rate', fill: color.muted, font: `bold ${compact ? 10 : 12}px ${fontFamily}` } },
      { type: 'text', left: compact ? 62 : 82, top: compact ? 212 : 252, style: { text: 'Selected channels', fill: color.muted, font: `bold ${compact ? 10 : 12}px ${fontFamily}` } },
    ],
    series: [
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'circle', symbolSize: compact ? 7 : 9, lineStyle: { color: color.bridge, width: 2.2 }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.4 }, data: bridgeSuccess, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: compact ? 9 : 10 } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'circle', symbolSize: compact ? 7 : 9, lineStyle: { color: color.libero, width: 2.2 }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.4 }, data: liberoSuccess, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: compact ? 9 : 10 } },
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 1, yAxisIndex: 1, smooth: false, symbol: 'circle', symbolSize: compact ? 7 : 9, lineStyle: { color: color.bridge, width: 2.2 }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.4 }, data: bridgeSelected, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: compact ? 9 : 10 } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 1, yAxisIndex: 1, smooth: false, symbol: 'circle', symbolSize: compact ? 7 : 9, lineStyle: { color: color.libero, width: 2.2 }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.4 }, data: liberoSelected, label: { show: true, position: 'bottom', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: compact ? 9 : 10 } },
    ],
  });
  return opt;
}

function alphaSweepOption(compact = false) {
  const opt = baseOption(
    compact ? '(C) Blend coefficient sweep' : 'Blend coefficient sweep',
    compact ? '' : 'Proxy success around the default blend coefficient.'
  );
  Object.assign(opt, {
    grid: { left: compact ? 58 : 78, right: compact ? 28 : 42, top: compact ? 96 : 116, bottom: compact ? 58 : 76, width: compact ? 370 : 560, height: compact ? 218 : 250 },
    legend: { top: compact ? 58 : 76, right: compact ? 16 : 42, data: ['BridgeData V2', 'LIBERO-Long'], itemWidth: 16, itemHeight: 8, textStyle: { fontFamily, fontSize: compact ? 10 : 11, color: color.muted } },
    xAxis: { type: 'value', min: 0.18, max: 0.52, name: compact ? '' : 'Blend coefficient λ', nameLocation: 'middle', nameGap: 38, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, axisLabel: { formatter: (v) => Number(v).toFixed(2), fontFamily, fontSize: compact ? 10 : 11, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.8 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.8 } } },
    yAxis: { type: 'value', min: 86, max: 96, name: compact ? '' : 'Proxy success rate (%)', nameLocation: 'middle', nameGap: 44, nameTextStyle: { fontFamily, fontSize: compact ? 10 : 12 }, ...axisCommon() },
    graphic: [
      { type: 'text', left: compact ? 214 : 344, top: compact ? 120 : 136, style: { text: 'default λ = 0.35', fill: color.muted, font: `italic ${compact ? 10 : 12}px ${fontFamily}` } },
    ],
    series: [
      {
        name: 'BridgeData V2',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: compact ? 7 : 9,
        lineStyle: { width: 2.2, color: color.bridge },
        itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.4 },
        data: sweeps['BridgeData V2'].map((d) => [d.alpha, d.success]),
        markLine: { symbol: 'none', label: { show: false }, lineStyle: { color: '#AEB7C2', type: 'dashed', width: 1.1 }, data: [{ xAxis: 0.35 }] },
        label: { show: !compact, position: 'top', formatter: ({ value }) => Number(value[1]).toFixed(2), color: color.bridge, fontFamily, fontSize: 10 },
      },
      {
        name: 'LIBERO-Long',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: compact ? 7 : 9,
        lineStyle: { width: 2.2, color: color.libero },
        itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.4 },
        data: sweeps['LIBERO-Long'].map((d) => [d.alpha, d.success]),
        label: { show: !compact, position: 'bottom', formatter: ({ value }) => Number(value[1]).toFixed(2), color: color.libero, fontFamily, fontSize: 10 },
      },
    ],
  });
  return opt;
}

function combinedOption() {
  const bridge = [hardBlend['BridgeData V2'][0], hardBlend['BridgeData V2'][1], blendDistill['BridgeData V2'][1]];
  const libero = [hardBlend['LIBERO-Long'][0], hardBlend['LIBERO-Long'][1], blendDistill['LIBERO-Long'][1]];
  const bridgeSuccess = [gatePair['BridgeData V2'][1], gatePair['BridgeData V2'][0]];
  const liberoSuccess = [gatePair['LIBERO-Long'][1], gatePair['LIBERO-Long'][0]];
  const bridgeSelected = [selectedPair['BridgeData V2'][1], selectedPair['BridgeData V2'][0]];
  const liberoSelected = [selectedPair['LIBERO-Long'][1], selectedPair['LIBERO-Long'][0]];
  const option = {
    backgroundColor: '#fff',
    textStyle: { fontFamily, color: color.text },
    animation: false,
    title: [
      { text: '(A) Training recipe ablation', left: 18, top: 14, textStyle: { fontFamily, fontSize: 25, fontWeight: 700, color: color.text } },
      { text: '(B) Gate method ablation', left: 420, top: 14, textStyle: { fontFamily, fontSize: 25, fontWeight: 700, color: color.text } },
      { text: '(C) Blend coefficient sweep', left: 820, top: 14, textStyle: { fontFamily, fontSize: 25, fontWeight: 700, color: color.text } },
    ],
    legend: { top: 54, left: 'center', data: ['BridgeData V2', 'LIBERO-Long'], itemWidth: 18, itemHeight: 10, itemGap: 24, textStyle: { fontFamily, fontSize: 14, color: color.muted } },
    grid: [
      { left: 60, top: 92, width: 320, height: 282 },
      { left: 450, top: 92, width: 300, height: 118 },
      { left: 450, top: 284, width: 300, height: 90 },
      { left: 840, top: 92, width: 300, height: 282 },
    ],
    xAxis: [
      { type: 'category', gridIndex: 0, data: ['Hard', 'Blend', 'Blend+Distill'], axisLabel: { interval: 0, rotate: 0, fontFamily, fontStyle: 'normal', fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { show: false } },
      { type: 'category', gridIndex: 1, data: ['R-Gate', 'SeqText-Gate'], axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
      { type: 'category', gridIndex: 2, data: ['R-Gate', 'SeqText-Gate'], axisLabel: { fontFamily, fontStyle: 'normal', fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { show: false } },
      { type: 'value', gridIndex: 3, min: 0.18, max: 0.52, axisLabel: { formatter: (v) => Number(v).toFixed(2), fontFamily, fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.9 } } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, min: 80, max: 96, name: 'Proxy success rate (%)', nameLocation: 'middle', nameGap: 46, nameTextStyle: { fontFamily, fontSize: 14 }, axisLabel: { fontFamily, fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.9 } } },
      { type: 'value', gridIndex: 1, min: 88, max: 96, name: 'Success (%)', nameLocation: 'middle', nameGap: 42, nameTextStyle: { fontFamily, fontSize: 14 }, axisLabel: { fontFamily, fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.9 } } },
      { type: 'value', gridIndex: 2, min: 1.2, max: 3.0, name: 'Selected channels', nameLocation: 'middle', nameGap: 42, nameTextStyle: { fontFamily, fontSize: 14 }, axisLabel: { fontFamily, fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.9 } } },
      { type: 'value', gridIndex: 3, min: 86, max: 96, name: 'Proxy success rate (%)', nameLocation: 'middle', nameGap: 46, nameTextStyle: { fontFamily, fontSize: 14 }, axisLabel: { fontFamily, fontSize: 14, color: '#5f6b7a' }, axisLine: { lineStyle: { color: color.axis, width: 0.9 } }, axisTick: { lineStyle: { color: color.axis } }, splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.9 } } },
    ],
    graphic: [
      centeredGraphicText(220, 410, 'Recipe stage'),
      { type: 'text', left: 452, top: 72, style: { text: 'Success rate', fill: color.muted, font: `bold 14px ${fontFamily}` } },
      { type: 'text', left: 452, top: 262, style: { text: 'Selected channels', fill: color.muted, font: `bold 14px ${fontFamily}` } },
      centeredGraphicText(600, 410, 'Gate method'),
      centeredGraphicText(990, 410, 'Blend coefficient'),
      { type: 'text', left: 1004, top: 118, style: { text: 'default λ = 0.35', fill: color.muted, font: `italic 14px ${fontFamily}` } },
      ...slopeGainGraphics(60, 92, 320, 282, 80, 96, bridge, libero, 13, {
        [`${color.bridge}-1`]: { dx: -30, dy: 0 },
        [`${color.libero}-0`]: { dx: -36, dy: 0 },
      }),
    ],
    series: [
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { width: 3, color: color.bridge }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.6 }, data: bridge, label: { show: true, position: 'bottom', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: 13 } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { width: 3, color: color.libero }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.6 }, data: libero, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: 13 } },
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 1, yAxisIndex: 1, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { color: color.bridge, width: 3 }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.6 }, data: bridgeSuccess, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: 13 } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 1, yAxisIndex: 1, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { color: color.libero, width: 3 }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.6 }, data: liberoSuccess, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: 13 } },
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 2, yAxisIndex: 2, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { color: color.bridge, width: 3 }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.6 }, data: bridgeSelected, label: { show: true, position: 'top', formatter: ({ value }) => Number(value).toFixed(2), color: color.bridge, fontFamily, fontSize: 13 } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 2, yAxisIndex: 2, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { color: color.libero, width: 3 }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.6 }, data: liberoSelected, label: { show: true, position: 'bottom', formatter: ({ value }) => Number(value).toFixed(2), color: color.libero, fontFamily, fontSize: 13 } },
      { name: 'BridgeData V2', type: 'line', xAxisIndex: 3, yAxisIndex: 3, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { width: 3, color: color.bridge }, itemStyle: { color: color.bridge, borderColor: '#fff', borderWidth: 1.6 }, data: sweeps['BridgeData V2'].map((d) => [d.alpha, d.success]), markLine: { symbol: 'none', label: { show: false }, lineStyle: { color: '#AEB7C2', type: 'dashed', width: 1.2 }, data: [{ xAxis: 0.35 }] } },
      { name: 'LIBERO-Long', type: 'line', xAxisIndex: 3, yAxisIndex: 3, smooth: false, symbol: 'circle', symbolSize: 10, lineStyle: { width: 3, color: color.libero }, itemStyle: { color: color.libero, borderColor: '#fff', borderWidth: 1.6 }, data: sweeps['LIBERO-Long'].map((d) => [d.alpha, d.success]) },
    ],
  };
  return option;
}

(async () => {
  // The old blend-gain-only figure is intentionally removed because it duplicates the recipe panel.
  for (const ext of ['svg', 'png', 'pdf']) {
    const oldPath = path.join(outDir, `recipe_ablation_01_blend_gain.${ext}`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await render('recipe_ablation_01_training_recipe', trainingRecipeOption(false), 720, 430);
  await render('recipe_ablation_02_gate_change', gateChangeOption(false), 720, 430);
  await render('recipe_ablation_03_alpha_sweep', alphaSweepOption(false), 720, 430);
  await render('recipe_ablation_combined', combinedOption(), 1160, 440);
  process.exit(0);
})();
