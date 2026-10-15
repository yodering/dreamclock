import {buildClock, clockLayout} from './clock.ts'

const built = buildClock()
const {circuit, cells} = built
const kinds: Record<string, number> = {}
for (const op of circuit.operations) kinds[op.kind] = (kinds[op.kind] ?? 0) + 1
const rp: Record<string, number> = {}
for (const p of circuit.roundingPoints()) rp[p.kind] = (rp[p.kind] ?? 0) + 1
let weights = 0
for (const op of circuit.operations) weights += op.leftTerms.length + (op.kind === 'reglu' ? op.gateTerms.length : 0)
console.log(circuit.operations.length, 'ops', kinds, rp, weights, 'weights', 'depth', Math.max(...circuit.depths))

const digits = [1, 2, 3, 4, 5, 6]
const source = new Float32Array(built.initialSource)
digits.forEach((d, i) => { source[cells.digits[i]!] = d })
source[cells.colon] = 1
for (const set of [[1, 2, 3, 4, 5, 6], [7, 8, 9, 0, 0, 0]]) {
  set.forEach((d, i) => { source[cells.digits[i]!] = d })
  for (let y = -1; y < clockLayout.height + 1; y++) {
    let row = ''
    for (let x = -1; x < clockLayout.width + 1; x++) {
      source[cells.x] = x; source[cells.y] = y
      const v = circuit.evaluateReference(source)[built.output.lit]!
      row += v === 1 ? '#' : v === 0 ? '.' : '?'
    }
    console.log(row)
  }
}
