// Estado de la consola que no es del mezclador: el modo MODULACIÓN y las cintas de los canales.
import { reactive, watch } from 'vue';

export interface Cinta {
  /** Lo escrito con rotulador. Vacío = canal sin cinta. */
  texto: string;
  /** Índice en TELAS. */
  color: number;
  /**
   * Canal MIDI (1–16) del aparato que suena en este canal de la mezcladora, escrito a mano bajo la
   * cinta. Es solo un rótulo: la app no manda nada por él. Ausente o null = sin anotar.
   */
  midi?: number | null;
}

/**
 * Colores de cinta gaffer: los que Felipe usa en Ableton para cada tipo de pista (leídos de una
 * captura de su set, 2026-11-21), más el blanco neutro. Los índices 0, 1, 2 y 4 conservan el
 * sentido de la paleta anterior (blanco, amarillo, rosa, verde) para que las cintas ya rotuladas no
 * cambien de familia; el 3 era naranja y nadie lo usaba.
 */
export const TELAS = [
  '#efece4', // neutro
  '#fcf15e', // BASS
  '#f099a7', // VOX
  '#5e4ca7', // GUITAR
  '#77fb58', // DRUMS
  '#6de6fc', // KEYS
  '#b9dce9', // FX
] as const;
export const TELA_NOMBRES = ['neutro', 'BASS', 'VOX', 'GUITAR', 'DRUMS', 'KEYS', 'FX'] as const;

/** Tinta del rotulador: negra sobre telas claras, blanca sobre las oscuras (la de GUITAR). */
export function tintaPara(tela: string): string {
  const n = parseInt(tela.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luz = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luz < 0.45 ? '#f5f1e8' : '#16130f';
}
export const CINTA_MAX = 12;

const CLAVE = 'zoom-l6-cintas';

function carga(): Record<number, Cinta> {
  try {
    const dato: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    if (dato && typeof dato === 'object') return dato as Record<number, Cinta>;
  } catch {
    /* sin almacenamiento o dato roto: se empieza sin cintas */
  }
  return {};
}

export const ui = reactive({
  /** Con MODULACIÓN activa cada perilla enseña su LFO. Los LFO en marcha se ven siempre. */
  modulacion: false,
  cintas: carga(),
});

export function cintaDe(canal: number): Cinta {
  // Se crea y LUEGO se lee de `ui`: `ui.cintas[canal] ??= {...}` devuelve el objeto crudo, no el
  // reactivo, y los cambios hechos sobre él no se guardaban (lo cazó la prueba de punta a punta:
  // la cinta escrita por primera vez no llegaba al almacenamiento).
  if (!ui.cintas[canal]) ui.cintas[canal] = { texto: '', color: 0 };
  return ui.cintas[canal]!;
}

watch(
  () => ui.cintas,
  (cintas) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(cintas));
    } catch {
      /* sin almacenamiento, las cintas duran lo que la sesión */
    }
  },
  { deep: true },
);

/**
 * Cuánto está encogida la consola (1 = tamaño real). Los arrastres llegan en píxeles de
 * pantalla y los controles se mueven en unidades del lienzo.
 */
export function escalaConsola(): number {
  const el = document.querySelector<HTMLElement>('.consola-escala');
  if (!el || el.offsetWidth === 0) return 1;
  return el.getBoundingClientRect().width / el.offsetWidth;
}
