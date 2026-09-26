const fs = require('fs');
const path = require('path');
const echarts = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/echarts');
const { Resvg } = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/@resvg/resvg-js');
const PDFDocument = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/pdfkit');
const SVGtoPDF = require('/home2/gmj/openvla/paper/NeurIPS2026/echarts_fig3/node_modules/svg-to-pdfkit');

const bridgePath = '/home2/gmj/openvla/runs/feature_mask_ablation_20260428/bridge/summary_table.md';
const liberoPath = '/home2/gmj/openvla/runs/feature_mask_ablation_20260428/libero_long/summary_table.md';
const outDir = __dirname;
fs.mkdirSync(outDir, { recursive: true });

const fontFamily = 'Times New Roman, Times, serif';
const titleFontFamily = 'Liberation Sans, Arial, sans-serif';
const pdfFonts = {
  regular: '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  bold: '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
  italic: '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf',
};

const color = {
  bridge: '#5A768F',
  libero: '#A97A49',
  grid: '#E8EEF5',
  axis: '#A3AFBB',
  text: '#1F2937',
  muted: '#6B7280',
  guide: '#C9D3DE',
  pairStroke: '#44515F',
};

const variantOrder = [
  'without_bbox',
  'without_edge',
  'without_motion',
  'without_relation',
  'only_bbox_relation',
  'only_edge_motion',
];

const labels = {
  without_bbox: 'w/o bbox',
  without_edge: 'w/o edge',
  without_motion: 'w/o motion',
  without_relation: 'w/o relation',
  only_bbox_relation: 'only bbox+relation',
  only_edge_motion: 'only edge+motion',
};

function parseTable(text) {
  const rows = {};
  const lines = text.split('\n').filter((line) => line.trim().startsWith('|'));
  let header = null;
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (!cells.length) continue;
    if (cells[0] === 'Variant') {
      header = cells;
      continue;
    }
    if (cells[0].startsWith('---')) continue;
    if (!header) continue;
    const variant = cells[0];
    const successIdx = header.indexOf('Success');
    if (successIdx < 0 || successIdx >= cells.length) continue;
    const success = Number(cells[successIdx]);
    if (Number.isFinite(success)) rows[variant] = success * 100.0;
  }
  return rows;
}

function buildDataset(tableRows) {
  const full = tableRows.dynamic_full;
  return variantOrder.map((key) => ({
    key,
    label: labels[key],
    success: tableRows[key],
    delta: +(tableRows[key] - full).toFixed(2),
    pairOnly: key.startsWith('only_'),
  }));
}

const bridgeRows = parseTable(fs.readFileSync(bridgePath, 'utf8'));
const liberoRows = parseTable(fs.readFileSync(liberoPath, 'utf8'));
const bridgeData = buildDataset(bridgeRows);
const liberoData = buildDataset(liberoRows);

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

function axisCommon() {
  return {
    axisLine: { lineStyle: { color: color.axis, width: 0.8 } },
    axisTick: { show: false },
    axisLabel: { fontFamily, fontSize: 11, color: '#5F6B7A' },
    splitLine: { lineStyle: { type: 'dashed', color: color.grid, width: 0.8 } },
  };
}

function stemSeries(data, gridIndex, seriesColor) {
  return {
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    xAxisIndex: gridIndex,
    yAxisIndex: gridIndex,
    data: data.map((d) => ({ value: [d.delta, d.label] })),
    silent: true,
    renderItem(params, api) {
      const value = api.value(0);
      const category = api.value(1);
      const start = api.coord([0, category]);
      const end = api.coord([value, category]);
      return {
        type: 'line',
        shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
        style: { stroke: seriesColor, lineWidth: 2.4, opacity: 0.92, lineCap: 'round' },
      };
    },
  };
}

function scatterSeries(data, gridIndex, seriesColor, pairOnly) {
  const filtered = data.filter((d) => d.pairOnly === pairOnly);
  return {
    type: 'scatter',
    xAxisIndex: gridIndex,
    yAxisIndex: gridIndex,
    symbol: pairOnly ? 'diamond' : 'circle',
    symbolSize: pairOnly ? 11 : 10,
    data: filtered.map((d) => {
      const labelPosition = d.delta <= -6.4 ? 'right' : 'left';
      return {
        value: [d.delta, d.label],
        labelValue: `${d.delta.toFixed(2)} pts`,
        label: {
          position: labelPosition,
          distance: labelPosition === 'right' ? 10 : 8,
          offset: labelPosition === 'right' ? [0, -7] : [0, 0],
          formatter: () => `${d.delta.toFixed(2)} pts`,
          color: seriesColor,
          fontFamily,
          fontSize: 10,
        },
      };
    }),
    itemStyle: pairOnly
      ? { color: '#FFFFFF', borderColor: seriesColor, borderWidth: 2.0 }
      : { color: seriesColor, borderColor: '#FFFFFF', borderWidth: 1.6 },
    label: {
      show: true,
      formatter: ({ data }) => data.labelValue,
      color: seriesColor,
      fontFamily,
      fontSize: 10,
    },
    emphasis: { disabled: true },
    silent: true,
  };
}

function option() {
  return {
    backgroundColor: '#FFFFFF',
    animation: false,
    textStyle: { fontFamily, color: color.text },
    title: [
      {
        text: '(A) BridgeData V2',
        left: 56,
        top: 10,
        textStyle: { fontFamily: titleFontFamily, fontSize: 17, fontWeight: 700, color: color.text },
        subtext: `full = ${bridgeRows.dynamic_full.toFixed(2)}%`,
        subtextStyle: { fontFamily, fontSize: 10, color: color.muted, padding: [2, 0, 0, 0] },
      },
      {
        text: '(B) LIBERO-Long',
        left: 490,
        top: 10,
        textStyle: { fontFamily: titleFontFamily, fontSize: 17, fontWeight: 700, color: color.text },
        subtext: `full = ${liberoRows.dynamic_full.toFixed(2)}%`,
        subtextStyle: { fontFamily, fontSize: 10, color: color.muted, padding: [2, 0, 0, 0] },
      },
    ],
    grid: [
      { left: 150, top: 60, width: 280, height: 176 },
      { left: 584, top: 60, width: 280, height: 176 },
    ],
    xAxis: [
      {
        type: 'value',
        gridIndex: 0,
        min: -8.0,
        max: 0.0,
        interval: 2,
        name: 'Success change vs. full (pts)',
        nameLocation: 'middle',
        nameGap: 36,
        nameTextStyle: { fontFamily, fontSize: 12, color: color.text },
        ...axisCommon(),
        axisLabel: {
          fontFamily,
          fontSize: 11,
          color: '#5F6B7A',
          formatter: (value) => `${value.toFixed(0)}`,
        },
      },
      {
        type: 'value',
        gridIndex: 1,
        min: -8.0,
        max: 0.0,
        interval: 2,
        name: 'Success change vs. full (pts)',
        nameLocation: 'middle',
        nameGap: 36,
        nameTextStyle: { fontFamily, fontSize: 12, color: color.text },
        ...axisCommon(),
        axisLabel: {
          fontFamily,
          fontSize: 11,
          color: '#5F6B7A',
          formatter: (value) => `${value.toFixed(0)}`,
        },
      },
    ],
    yAxis: [
      {
        type: 'category',
        gridIndex: 0,
        inverse: true,
        data: variantOrder.map((k) => labels[k]),
        axisLabel: { fontFamily, fontSize: 11, color: '#4B5563', margin: 14 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        inverse: true,
        data: variantOrder.map((k) => labels[k]),
        axisLabel: { fontFamily, fontSize: 11, color: '#4B5563', margin: 14 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    graphic: [],
    series: [
      stemSeries(bridgeData, 0, color.bridge),
      scatterSeries(bridgeData, 0, color.bridge, false),
      scatterSeries(bridgeData, 0, color.bridge, true),
      stemSeries(liberoData, 1, color.libero),
      scatterSeries(liberoData, 1, color.libero, false),
      scatterSeries(liberoData, 1, color.libero, true),
    ],
  };
}

async function main() {
  const opt = option();
  await render('feature_ablation_combined', opt, 920, 286);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
