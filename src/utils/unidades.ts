// Lectura de cada control en la consola.
//
// La curva real de la Zoom (qué CC es cuántos dB) no está medida y el manual no la da, así
// que la consola NO muestra dB: enseña escalas neutras, que no afirman nada que no se sepa.
// Lo único que sale del manual es el rango de FREQ, 100 Hz – 8 kHz; que el recorrido sea
// logarítmico es una suposición, y por eso lleva «≈». Cuando se mida con el aparato
// conectado, basta cambiar estas funciones.

export type Unidad = 'eq' | 'frec' | 'pan' | 'envio' | 'nivel';

/** Coma decimal y signo menos tipográfico. */
function num(x: number, dec = 1): string {
  return (x < 0 ? '−' : '') + Math.abs(x).toFixed(dec).replace('.', ',');
}

function conSigno(x: number): string {
  if (Math.abs(x) < 0.05) return '0';
  return (x > 0 ? '+' : '') + num(x);
}

const FORMATOS: Record<Unidad, (v: number) => string> = {
  // −10 … +10 alrededor del centro (CC 64)
  eq: (v) => conSigno(v >= 64 ? ((v - 64) / 63) * 10 : ((v - 64) / 64) * 10),
  frec: (v) => {
    const hz = 100 * Math.pow(80, v / 127);
    return hz < 1000 ? `≈${Math.round(hz / 10) * 10} Hz` : `≈${num(hz / 1000)} kHz`;
  },
  pan: (v) => (v === 64 ? 'C' : v < 64 ? `L ${Math.round(((64 - v) / 64) * 100)}` : `R ${Math.round(((v - 64) / 63) * 100)}`),
  envio: (v) => num((v / 127) * 10),
  nivel: (v) => num((v / 127) * 10),
};

export function formatea(unidad: Unidad, valor: number): string {
  return FORMATOS[unidad](Math.round(valor));
}

/** Los controles con centro (EQ y pan) llevan una marca arriba. */
export function esBipolar(unidad: Unidad | undefined): boolean {
  return unidad === 'eq' || unidad === 'pan';
}
