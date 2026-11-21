// Estado de la consola que no es del mezclador: el modo MODULACIÓN y las cintas de los canales.
import { reactive, watch } from 'vue';

export interface Cinta {
  /** Lo escrito con rotulador. Vacío = canal sin cinta. */
  texto: string;
  /** Índice en TELAS. */
  color: number;
}

/** Colores de cinta gaffer. */
export const TELAS = ['#efece4', '#f4e04d', '#ff8fbd', '#ff9a3c', '#86e08a'] as const;
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
