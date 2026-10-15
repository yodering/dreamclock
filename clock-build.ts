// Compiles the clock network into a GLSL fragment shader whose weights live in a uniform block, so the page can move
// them every frame. Writes dreamclock.html (full screen, no text) and dreamclock-annotated.html (with explanations).
import {buildClock, clockLayout} from './clock.ts'

const built = buildClock()
const {circuit, cells} = built
const S = circuit.sourceSize
const ops = circuit.operations

const names: string[] = []
names[cells.x] = 'x'; names[cells.y] = 'y'; names[cells.colon] = 'colon'
cells.digits.forEach((w, i) => { names[w] = `d${i + 1}` })
const label = (w: number) => w < S ? names[w]! : `n${w - S}`

// Flat parameter list: per op, leftBias, left coefficients, gateBias, gate coefficients.
const params: number[] = []
const param = (value: number) => { params.push(value); const j = params.length - 1; return `P[${j >> 2}].${'xyzw'[j & 3]}` }
const fmt = (n: number) => Number.isInteger(n) ? `${n}` : `${+n.toFixed(3)}`
const formula = (terms: readonly (readonly [number, number])[], bias: number) => {
  const parts = terms.map(([w, c]) => `${c === 1 ? '' : c === -1 ? '−' : fmt(c) + '·'}${label(w)}`)
  if (bias !== 0 || parts.length === 0) parts.push(fmt(bias))
  return parts.join(' + ').replace(/\+ −/g, '− ').replace(/\+ -/g, '− ')
}
const lines: string[] = []
const labels: string[] = []
ops.forEach((op, i) => {
  if (op.kind !== 'affine' && op.kind !== 'reglu') throw new Error(`unsupported op ${op.kind}`)
  const sum = (terms: typeof op.leftTerms, bias: number) =>
    [param(bias), ...terms.map(([w, c]) => `${param(c)}*v${w}`)].join(' + ')
  const left = sum(op.leftTerms, op.leftBias)
  lines.push(op.kind === 'reglu'
    ? `  float v${S + i} = (${left}) * max(0.0, ${sum(op.gateTerms, op.gateBias)});`
    : `  float v${S + i} = ${left};`)
  labels.push(op.kind === 'reglu'
    ? `(${formula(op.leftTerms, op.leftBias)}) × relu(${formula(op.gateTerms, op.gateBias)})`
    : formula(op.leftTerms, op.leftBias))
})
const vec4s = Math.ceil(params.length / 4)
const shader = `#version 300 es
precision highp float;
layout(std140) uniform Weights { vec4 P[${vec4s}]; };
uniform vec2 uRes;
uniform float uScale, uSoft, uColon, uShow, uTime;
uniform float uDigits[6];
out vec4 outColor;
// Whole units when the weights are exact (the network was wired for integers), continuous as they drift.
float feed(float u) { return mix(floor(u), u - 0.5, uSoft); }
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * t + vec3(0.02, 0.36, 0.67))); }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uScale;
  float v${cells.x} = feed(p.x + ${(clockLayout.width / 2).toFixed(1)});
  float v${cells.y} = feed(${(clockLayout.height / 2).toFixed(1)} - p.y);
${cells.digits.map((w, i) => `  float v${w} = uDigits[${i}];`).join('\n')}
  float v${cells.colon} = uColon;
${lines.join('\n')}
  float o = v${built.output.lit};
  int show = int(uShow);
  if (show >= 0) {
    float h[${ops.length}];
${ops.map((_, i) => `    h[${i}] = v${S + i};`).join('\n')}
    o = h[show];
  }
  float c = clamp(o, 0.0, 1.0);
  float e = o - c;
  vec3 bg = vec3(0.027, 0.031, 0.055);
  vec3 lit = vec3(1.0, 0.93, 0.82);
  vec3 col = mix(bg, lit, c);
  float t = sign(e) * log(1.0 + abs(e));
  float dream = 1.0 - exp(-abs(e) * 1.2);
  col = mix(col, pal(t * 0.32 + 0.025 * uTime), dream * 0.9);
  col *= 1.0 - 0.18 * dream * smoothstep(0.85, 1.0, fract(t * 1.5));
  outColor = vec4(pow(col, vec3(0.95)), 1.0);
}`

const data = {
  shader, params, labels, neurons: ops.length, units: ops.filter(op => !(op.kind === 'affine' && op.leftTerms.length === 0)).length, paramCount: params.length,
  weightCount: ops.reduce((sum, op) => sum + op.leftTerms.length + (op.kind === 'reglu' ? op.gateTerms.length : 0), 0),
  reglus: ops.filter(op => op.kind === 'reglu').length, depth: Math.max(...ops.map(op => op.depth)),
  layout: clockLayout,
}
// Favicons, inlined so the page works anywhere: the SVG for browsers that take one, PNGs for the rest and iOS.
const asset = (name: string) => Bun.file(new URL(`./${name}`, import.meta.url))
const svgIcon = (await asset('favicon.svg').text()).trim()
const pngIcon = async (name: string) => `data:image/png;base64,${Buffer.from(await asset(name).arrayBuffer()).toString('base64')}`
const icons = [
  `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svgIcon)}">`,
  `<link rel="icon" type="image/png" sizes="32x32" href="${await pngIcon('favicon-32.png')}">`,
  `<link rel="apple-touch-icon" href="${await pngIcon('favicon-180.png')}">`,
].join('\n')

const page = await Bun.file(new URL('./page-annotated.html', import.meta.url)).text()
await Bun.write(new URL('./dreamclock-annotated.html', import.meta.url), page.replace('/*CLOCK_DATA*/null', () => JSON.stringify(data)))
console.log(`wrote dreamclock-annotated.html: ${ops.length} neurons, ${params.length} params (${vec4s} vec4), shader ${shader.length} chars`)

const bare = (await Bun.file(new URL('./page.html', import.meta.url)).text()).replace('<!--ICONS-->', () => icons)
await Bun.write(new URL('./dreamclock.html', import.meta.url), bare.replace('/*CLOCK_DATA*/null', () => JSON.stringify(data)))
console.log('wrote dreamclock.html')

// A standalone page for normal hosting (yoder.ing/dreamclock, GitHub Pages): the artifact host adds the doctype and
// viewport tags itself, so page.html leaves them out.
const split = bare.indexOf('<div id="stage"')
const head = bare.slice(0, split).replace('<meta charset="utf-8">\n', '').replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="A clock that is a neural network nobody trained. Move your mouse to move its weights.">
<meta property="og:title" content="dreamclock">
<meta property="og:description" content="A clock that is a neural network nobody trained. Move your mouse to move its weights.">
<meta property="og:url" content="https://yoder.ing/dreamclock">
<meta name="twitter:card" content="summary">
<style>body { margin: 0 }</style>
${head.trim()}
</head>
<body>
${bare.slice(split).replace('/*CLOCK_DATA*/null', () => JSON.stringify(data))}</body>
</html>
`
await Bun.write(new URL('./dist/index.html', import.meta.url), standalone)
console.log('wrote dist/index.html')
