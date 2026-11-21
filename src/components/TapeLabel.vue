<template>
  <div class="cinta-zona">
    <div
      ref="el"
      class="cinta"
      :class="{ vacia }"
      contenteditable="plaintext-only"
      spellcheck="false"
      role="textbox"
      :aria-label="`Cinta del canal ${canal}`"
      :style="{ '--giro': giro + 'deg', '--tela': TELAS[cinta.color] }"
      @focus="alEnfocar"
      @blur="alSalir"
      @beforeinput="antesDeEscribir"
      @input="alEscribir"
      @keydown.stop="alTeclear"
    ></div>
    <div v-if="enfocada" class="cinta-colores" aria-label="Color de la cinta">
      <button
        v-for="(tela, i) in TELAS"
        :key="tela"
        type="button"
        :class="{ on: i === cinta.color }"
        :style="{ background: tela }"
        :aria-label="`Color de cinta ${i + 1}`"
        @pointerdown.prevent
        @click="cinta.color = i"
      ></button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Cinta gaffer con rotulador: el nombre de lo que va en el canal, escrito a mano.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { CINTA_MAX, TELAS, cintaDe } from '../stores/ui';

const props = defineProps<{ canal: number }>();

const GIROS = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.6, -1.9, 1.3];
const giro = computed(() => GIROS[(props.canal - 1) % GIROS.length]);

const cinta = cintaDe(props.canal);
const el = ref<HTMLElement | null>(null);
const enfocada = ref(false);
const vacia = computed(() => cinta.texto.length === 0 && !enfocada.value);

/** Encoge antes de cortar el nombre: se mide el texto ya pintado, no se adivina por su largo. */
function ajusta(): void {
  const nodo = el.value;
  if (!nodo) return;
  nodo.style.fontSize = '';
  if (vacia.value) return;
  for (let t = 18; t >= 8; t -= 0.5) {
    nodo.style.fontSize = `${t}px`;
    if (nodo.scrollWidth <= nodo.clientWidth) break;
  }
}

function alEnfocar(): void {
  enfocada.value = true;
  void nextTick(ajusta);
}

function antesDeEscribir(event: Event): void {
  const e = event as InputEvent;
  const seleccion = window.getSelection();
  const lleno = (el.value?.textContent ?? '').length >= CINTA_MAX;
  if (e.inputType.startsWith('insert') && seleccion?.isCollapsed && lleno) e.preventDefault();
}

function alEscribir(): void {
  const nodo = el.value;
  if (!nodo) return;
  const texto = nodo.textContent ?? '';
  if (/\n/.test(texto) || texto.length > CINTA_MAX) nodo.textContent = texto.replace(/\n/g, ' ').slice(0, CINTA_MAX);
  ajusta();
}

function alTeclear(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    el.value?.blur();
  } else if (event.key === 'Escape') {
    if (el.value) el.value.textContent = cinta.texto;
    el.value?.blur();
  }
}

function alSalir(): void {
  const texto = (el.value?.textContent ?? '').trim();
  if (el.value) el.value.textContent = texto;
  cinta.texto = texto;
  enfocada.value = false;
  void nextTick(ajusta);
}

onMounted(() => {
  if (el.value) el.value.textContent = cinta.texto;
  ajusta();
  // el ancho del texto depende de la fuente de rotulador, que puede llegar después
  void document.fonts.ready.then(ajusta);
});
watch(() => cinta.color, ajusta);
</script>

<style scoped>
.cinta-zona { position: relative; height: 40px; display: flex; align-items: center; justify-content: center; }
.cinta {
  --tela: #efece4; position: relative; isolation: isolate; max-width: 100%; min-width: 64px; padding: 6px 12px 5px;
  transform: rotate(var(--giro, -1deg)); text-align: center; white-space: nowrap; overflow: hidden;
  font: 400 18px/1.15 var(--f-mano); color: #16130f; cursor: text; user-select: text; outline: none;
  filter: drop-shadow(1px 1px 0.5px rgba(0, 0, 0, 0.5)) drop-shadow(2px 4px 3px rgba(0, 0, 0, 0.4));
}
.cinta::before { /* la tela va aparte: el borde rasgado no debe cortar la sombra */
  content: ""; position: absolute; inset: 0; z-index: -1;
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.055) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.045) 0 1px, transparent 1px 3px),
    linear-gradient(170deg, rgba(255, 255, 255, 0.25), transparent 45%, rgba(0, 0, 0, 0.10)), var(--tela);
  clip-path: polygon(0 8%, 2% 0, 4% 9%, 6% 2%, 94% 0, 96% 8%, 98% 1%, 100% 7%, 99% 50%, 100% 94%, 98% 100%, 96% 93%, 94% 100%, 6% 98%, 4% 92%, 2% 100%, 0 93%, 1% 50%);
}
.cinta.vacia { filter: none; font: 600 10.5px/1 var(--f-panel); letter-spacing: 0.14em; color: var(--inactivo); padding: 9px 10px; border: 1px dashed var(--inactivo); border-radius: 3px; transform: none; }
.cinta.vacia::before { display: none; }
.cinta.vacia:empty::after { content: "PEGAR CINTA"; }
.cinta-colores { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); z-index: 10; display: flex; gap: 6px; padding: 6px; border-radius: 8px; background: #0e0d0c; border: 1px solid #44403b; }
.cinta-colores button { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5); cursor: pointer; }
.cinta-colores button.on { outline: 2px solid var(--vfd); outline-offset: 1px; }
</style>
