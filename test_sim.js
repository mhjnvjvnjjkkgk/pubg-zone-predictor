import { ZoneEngine } from './src/engine.js';
const engine = new ZoneEngine();
let sim1 = engine.simulate([{phase: 1, cx: 2000, cy: 2000, r: 2000}], 10, false);
console.log("Sim 1 (2000,2000):", sim1.finals.slice(0, 4));

let sim2 = engine.simulate([{phase: 1, cx: 6000, cy: 6000, r: 2000}], 10, false);
console.log("Sim 2 (6000,6000):", sim2.finals.slice(0, 4));
