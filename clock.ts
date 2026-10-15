// A 7-segment clock as one handwired numeric program, evaluated once per pixel: inputs are the pixel's position and
// the six digits, the output is whether that pixel is lit. Builder code below runs once; the result is a fixed list of
// weighted sums and ReLUs, with no branches at all.
import {type Wire, emitCompare} from './runtime/numeric-ui-core.ts'
import {createSourceTable, input} from './runtime/cells.ts'

// Layout in segment units. A digit is 10 × 18, segments are 2 thick.
export const clockLayout = {
  digitX: [0, 13, 32, 45, 64, 77],
  colonX: [27, 59],
  width: 87,
  height: 18,
} as const
// Segments a..g as [x0, x1, y0, y1], half-open.
const segments = [
  [2, 8, 0, 2], [8, 10, 2, 8], [8, 10, 10, 16], [2, 8, 16, 18], [0, 2, 10, 16], [0, 2, 2, 8], [2, 8, 8, 10],
] as const
// Which segments each digit lights, a..g.
const font = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011']

const digit = () => input([0, 9], {grid: 1})
export const clockCells = {
  x: input([-64, 160], {grid: 1}),
  y: input([-64, 96], {grid: 1}),
  digits: [digit(), digit(), digit(), digit(), digit(), digit()] as const,
  colon: input([0, 1]),
}

export function buildClock() {
  const table = createSourceTable()
  const cells = table.declare(clockCells)
  const circuit = table.createCircuit()
  const k = (value: number) => circuit.constant(value)
  const ge = (a: Wire, b: number) => emitCompare(circuit, a, '>=', k(b))
  const lt = (a: Wire, b: number) => emitCompare(circuit, a, '<', k(b))
  const all = (...bits: Wire[]) => circuit.reglu([], 1, bits.map(bit => [bit, 1] as const), 1 - bits.length)
  const inRect = (x: Wire, y: Wire, [x0, x1, y0, y1]: readonly number[]) => all(ge(x, x0!), lt(x, x1!), ge(y, y0!), lt(y, y1!))

  // JS: slot = the digit whose column the pixel is in, found as a staircase of x >= start comparisons
  const starts = clockLayout.digitX
  const steps = starts.slice(1).map(start => ge(cells.x, start - 1.5))
  const slot = starts.map((_, i) => i === 0
    ? circuit.affine([[steps[0]!, -1]], 1)
    : i === starts.length - 1 ? steps[i - 1]! : circuit.affine([[steps[i - 1]!, 1], [steps[i]!, -1]]))
  // JS: localX = x - starts[slot]; value = digits[slot]
  const localX = circuit.affine([[cells.x, 1], ...slot.map((bit, i) => [bit, -starts[i]!] as const)])
  circuit.assumeRange(localX, -160, 160, {allowExistingReaders: true})
  circuit.assumeGrid(localX, 1, {allowExistingReaders: true})
  const value = circuit.affine(slot.map((bit, i) => [circuit.multiply(bit, cells.digits[i]!), 1] as const))
  circuit.assumeRange(value, 0, 9, {allowExistingReaders: true})
  circuit.assumeGrid(value, 1, {allowExistingReaders: true})

  // JS: oneHot[d] = value === d, as differences of a staircase, so a fractional digit blends two glyphs
  const atLeast = Array.from({length: 9}, (_, d) => ge(value, d + 1))
  const oneHot = Array.from({length: 10}, (_, d) => d === 0
    ? circuit.affine([[atLeast[0]!, -1]], 1)
    : d === 9 ? atLeast[8]! : circuit.affine([[atLeast[d - 1]!, 1], [atLeast[d]!, -1]]))

  // JS: lit = segments.some((rect, s) => font[value][s] === '1' && inRect(localX, y, rect))
  const litTerms = segments.map((rect, s) => {
    const segmentOn = circuit.affine(oneHot.map((bit, d) => [bit, Number(font[d]![s])] as const))
    return [circuit.multiply(segmentOn, inRect(localX, cells.y, rect)), 1] as const
  })
  // JS: colons blink, two dots each
  const colonTerms = clockLayout.colonX.flatMap(cx => [5, 11].map(cy =>
    [circuit.multiply(cells.colon, inRect(cells.x, cells.y, [cx, cx + 2, cy, cy + 2])), 1] as const))
  const lit = circuit.affine([...litTerms, ...colonTerms])
  return {cells, output: {lit}, ...table.finish()}
}
