import { generarOleada, evaluarActa, TOTAL_OLEADAS, SINTOMAS, HERRAMIENTAS, CODICE, EXPEDIENTES }
  from '../src/gameplay/encomiendas.js';

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLO') + ' · ' + msg); if (!cond) fallos++; };

console.log('\n== 1. Cada oleada permite armar al menos un acta SÓLIDA ==');
for (let r = 0; r < 200; r++) {
  for (let i = 0; i < TOTAL_OLEADAS; i++) {
    const o = generarOleada(i);
    const porExp = {};
    for (const p of o.encomiendas) {
      if (!p.sintoma || p.senuelo || !p.expediente) continue;
      (porExp[p.expediente] ??= new Set()).add(p.dominio);
    }
    const armable = Object.values(porExp).some((doms) => doms.size >= 2);
    if (!armable) { console.log(`  FALLO · ronda ${r}, oleada ${i}: sin acta posible`); fallos++; r = 999; break; }
  }
}
ok(fallos === 0, '200 rondas × 3 oleadas: siempre hay 2 dominios distintos en un mismo expediente');

console.log('\n== 2. La primera oleada nunca abre con un paquete limpio ==');
let abrenLimpio = 0;
for (let r = 0; r < 300; r++) if (generarOleada(0).encomiendas[0].limpio) abrenLimpio++;
ok(abrenLimpio === 0, `300 rondas: ${abrenLimpio} arrancaron con un bulto limpio (debe ser 0)`);

console.log('\n== 3. evaluarActa: las cuatro decisiones ==');
const ev = (dom, exp) => ({ dominio: dom, expediente: exp });
ok(evaluarActa([ev('lupa','meridiano')]).solida === false, 'una sola prueba NO sostiene');
ok(evaluarActa([ev('lupa','meridiano'), ev('rayosx','meridiano')]).solida === true, 'dos dominios + mismo expediente SÍ sostiene');
ok(evaluarActa([ev('lupa','meridiano'), ev('lupa','meridiano')]).solida === false, 'dos pruebas del mismo dominio NO sostienen');
ok(evaluarActa([ev('lupa','meridiano'), ev('rayosx','sastre')]).solida === false, 'expedientes mezclados NO sostienen');
ok(evaluarActa([ev('lupa','sastre'), ev('rayosx','sastre'), ev('justus','sastre')]).solida === true, 'tres dominios del mismo expediente sostienen');

console.log('\n== 4. Integridad de los datos ==');
const dominios = new Set(HERRAMIENTAS.map(h => h.id));
ok(Object.values(SINTOMAS).every(s => dominios.has(s.dominio)), 'todo síntoma apunta a una herramienta existente');
ok(Object.values(SINTOMAS).every(s => s.icono === '⚠'), 'ningún icono de síntoma delata la herramienta');
ok(CODICE.every(c => c.llave === 'inicio' || dominios.has(c.llave) || EXPEDIENTES[c.llave] || c.llave === 'evidencia_cruzada'),
   'toda ficha del códice tiene una llave alcanzable jugando');

console.log('\n== 5. Reparto de una oleada tipo ==');
const o = generarOleada(1);
const sosp = o.encomiendas.filter(p => p.sintoma && !p.senuelo).length;
const limpios = o.encomiendas.filter(p => p.limpio && !p.senuelo).length;
const senuelos = o.encomiendas.filter(p => p.senuelo).length;
console.log(`  oleada 2: ${o.encomiendas.length} bultos = ${sosp} con señal + ${limpios} limpios + ${senuelos} señuelo · ${o.duracion}s`);
ok(o.encomiendas.length >= 6 && o.encomiendas.length <= 10, 'entre 6 y 10 paquetes por oleada (ADR-013)');
ok(o.duracion >= 60 && o.duracion <= 90, 'oleada de 60-90 s (Regla de Oro #4: sesión móvil corta)');

console.log(fallos === 0 ? '\nTODO VERDE\n' : `\n${fallos} FALLO(S)\n`);
process.exit(fallos ? 1 : 0);
