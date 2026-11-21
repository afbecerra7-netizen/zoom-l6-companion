<template>
  <div class="midi-control" :class="[`control-${clase}`, { active: isActive }]">
    <!-- Fader -->
    <template v-if="clase === 'fader'">
      <div class="fader">
        <div class="fader-escala" aria-hidden="true">
          <span v-for="marca in MARCAS_FADER" :key="marca" :style="{ top: alturaFader((marca / 10) * 127) }">{{ marca }}</span>
        </div>
        <div
          class="fader-pista"
          tabindex="0"
          role="slider"
          :aria-label="etiqueta"
          :aria-valuemin="control.min"
          :aria-valuemax="control.max"
          :aria-valuenow="Math.round(currentValue)"
          :aria-valuetext="displayValue"
          @pointerdown="startDrag"
          @dblclick.prevent="resetToDefault"
          @keydown="onKeydown"
        >
          <div class="fader-tapa" :style="{ top: alturaFader(currentValue) }"></div>
        </div>
        <button
          v-if="lfoVisible"
          type="button"
          class="lfo-btn"
          :class="{ active: lfo.state === 'active', paused: lfo.state === 'paused' }"
          :title="t('lfoFor', { label: etiqueta })"
          @click.stop="openPopover"
        ></button>
      </div>
      <div class="fader-valor">{{ displayValue }}</div>
    </template>

    <!-- Perilla: la luz no gira, solo el índice -->
    <div v-else-if="clase === 'knob'" class="perilla" :class="{ bipolar }">
      <div
        class="perilla-zona"
        tabindex="0"
        role="slider"
        :aria-label="etiqueta"
        :aria-valuemin="control.min"
        :aria-valuemax="control.max"
        :aria-valuenow="Math.round(currentValue)"
        :aria-valuetext="displayValue"
        @pointerdown="startDrag"
        @dblclick.prevent="resetToDefault"
        @keydown="onKeydown"
      >
        <div class="perilla-falda"></div>
        <div class="perilla-tapa" :style="{ transform: `rotate(${knobRotation}deg)` }"><i class="perilla-indice"></i></div>
        <button
          v-if="lfoVisible"
          type="button"
          class="lfo-btn"
          :class="{ active: lfo.state === 'active', paused: lfo.state === 'paused' }"
          :title="t('lfoFor', { label: etiqueta })"
          @pointerdown.stop
          @click.stop="openPopover"
        ></button>
      </div>
      <span class="perilla-nombre">{{ etiqueta }}</span>
      <span class="perilla-valor">{{ displayValue }}</span>
    </div>

    <!-- Interruptor: tecla con lámpara -->
    <button
      v-else-if="clase === 'toggle'"
      type="button"
      class="tecla"
      :class="[forma ? `tecla-${forma}` : '', { on: currentValue > 63 }]"
      :aria-pressed="currentValue > 63"
      @click="toggleValue"
    >
      <i class="lampara" :class="tono"></i>{{ etiqueta }}
    </button>

    <!-- Tecla momentánea -->
    <button
      v-else-if="clase === 'button'"
      type="button"
      class="tecla"
      @pointerdown="buttonDown"
      @pointerup="buttonUp"
      @pointercancel="buttonUp"
    >
      {{ etiqueta }}
    </button>

    <!-- Selector: una sola tecla encendida -->
    <div v-else-if="clase === 'radio'" class="selector" role="radiogroup" :aria-label="etiqueta">
      <button
        v-for="option in control.options"
        :key="option.value"
        type="button"
        class="tecla"
        :class="{ on: opcionActiva === option.value }"
        role="radio"
        :aria-checked="opcionActiva === option.value"
        @click="handleRadioChange(option.value)"
      >
        <i class="lampara blanco"></i>{{ translatedText(option.label) }}
      </button>
    </div>

    <!-- Diálogo del LFO: fuera de la consola, para que no se encoja con ella -->
    <Teleport to="body">
      <div v-if="showPopover" class="lfo-overlay" @click="closePopover">
        <div class="lfo-dialog" @click.stop>
          <div class="lfo-dialog-header">
            <div class="lfo-dialog-title">{{ t('fixed.LFO_') }} {{ etiqueta }}</div>
            <button class="lfo-close" :aria-label="t('ui.close')" @click="closePopover">×</button>
          </div>
          <LFOControl :config="lfo" @update:config="updateLfoConfig" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { t, translatedText } from '../i18n';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { MIDIControl } from '../config/midiConfig';
import { midiService } from '../services/midiService';
import LFOControl, { type LFOConfig, type LFOShape, type LFOMode } from './LFOControl.vue';
import { ui, escalaConsola } from '../stores/ui';
import { esBipolar, formatea, type Unidad } from '../utils/unidades';

interface Props {
  control: MIDIControl;
  modelValue?: number;
  /** Se conserva por compatibilidad; la consola tiene una sola vista. */
  compact?: boolean;
  /** Dibuja el control de otra forma que la de su configuración: el nivel es un fader. */
  vista?: 'fader';
  /** Cómo se lee el valor. Sin unidad se muestra el número MIDI. */
  unidad?: Unidad;
  /** Rótulo serigrafiado; por defecto, el nombre de la configuración. */
  rotulo?: string;
  /** Forma de la tecla de un interruptor. */
  forma?: 'mini' | 'mute' | 'ancha';
  /** Color de la lámpara de un interruptor: ámbar = fuera de lo normal, blanco = neutro. */
  tono?: 'ambar' | 'blanco';
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
  (e: 'change', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  compact: false,
  vista: undefined,
  unidad: undefined,
  rotulo: undefined,
  forma: undefined,
  tono: 'blanco',
});

const emit = defineEmits<Emits>();

const currentValue = ref(props.modelValue ?? props.control.defaultValue);
const isActive = ref(false);
const isDragging = ref(false);
const dragStartY = ref(0);
const dragStartValue = ref(0);

// Computed properties
const clase = computed(() => props.vista ?? props.control.type);
const etiqueta = computed(() => props.rotulo ?? translatedText(props.control.name));
const bipolar = computed(() => esBipolar(props.unidad));

const displayValue = computed(() => {
  if (props.control.type === 'toggle') {
    return translatedText(currentValue.value > 63 ? 'ON' : 'OFF');
  }
  return props.unidad ? formatea(props.unidad, currentValue.value) : String(Math.round(currentValue.value));
});

/** Escala neutra del fader, de 0 a 10. */
const MARCAS_FADER = [10, 8, 6, 4, 2, 0];
function alturaFader(valor: number): string {
  const rango = props.control.max - props.control.min || 1;
  return `calc(10px + ${1 - (valor - props.control.min) / rango} * (100% - 20px))`;
}

// El mezclador puede mandar cualquier CC dentro del tramo de una opción, no solo su valor
// exacto: la opción encendida es la de mayor valor que no pasa del actual.
const opcionActiva = computed<number | null>(() => {
  const opciones = props.control.options ?? [];
  if (opciones.length === 0) return null;
  const candidatas = opciones.filter((o) => o.value <= currentValue.value);
  const elegida = candidatas.length > 0
    ? candidatas.reduce((mejor, o) => (o.value > mejor.value ? o : mejor))
    : opciones.reduce((menor, o) => (o.value < menor.value ? o : menor));
  return elegida.value;
});

// Los LFO solo se ofrecen en modo MODULACIÓN, pero uno en marcha o en pausa se ve siempre:
// si algo se mueve solo, tiene que verse por qué.
const lfoVisible = computed(() => ui.modulacion || lfo.value.state !== 'disabled');

const knobRotation = computed(() => {
  const range = props.control.max - props.control.min;
  const normalized = (currentValue.value - props.control.min) / range;
  return (normalized * 270) - 135; // -135 to +135 degrees
});

// LFO state
const showPopover = ref(false);
const lfo = ref<LFOConfig>({ rate: 1, depth: 0.3, shape: 'sine', mode: 'bipolar', state: 'disabled' });
const lfoPhaseVal = ref(0);
const lfoBaseValue = ref(props.control.defaultValue);
let lfoRafId = 0;
let lfoLastTime = performance.now();
let lfoPhase = 0; // 0..1

function openPopover() { showPopover.value = true; }
function closePopover() { showPopover.value = false; }

function updateLfoConfig(cfg: LFOConfig) {
  lfo.value = cfg;
}

function lfoShapeSample(shape: LFOShape, p: number): number {
  switch (shape) {
    case 'sine':
      return Math.sin(p * Math.PI * 2);
    case 'triangle': {
      const t = (p + 0.25) % 1;
      return 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
    }
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * ((p + 0.5) % 1) - 1;
  }
}

function applyLFOMode(value: number, mode: LFOMode): number {
  switch (mode) {
    case 'bipolar':
      return value; // -1 to +1, centered on current value
    case 'positive':
      return (value + 1) / 2; // 0 to +1, only positive modulation
    case 'negative':
      return (value - 1) / 2; // -1 to 0, only negative modulation
  }
}

function lfoLoop() {
  const now = performance.now();
  const dt = (now - lfoLastTime) / 1000;
  lfoLastTime = now;
  if (lfo.value.state === 'active' && lfo.value.rate > 0) {
    lfoPhase = (lfoPhase + dt * lfo.value.rate) % 1;
    const rawValue = lfoShapeSample(lfo.value.shape, lfoPhase);
    const modeValue = applyLFOMode(rawValue, lfo.value.mode);
    lfoPhaseVal.value = modeValue;
    const base = lfoBaseValue.value;
    const depth = lfo.value.depth * (props.control.max - props.control.min);
    const modulated = base + modeValue * depth;
    updateValue(modulated);
  }
  lfoRafId = requestAnimationFrame(lfoLoop);
}

function startLfo() {
  cancelAnimationFrame(lfoRafId);
  lfoLastTime = performance.now();
  lfoRafId = requestAnimationFrame(lfoLoop);
}

function stopLfo() {
  cancelAnimationFrame(lfoRafId);
}

watch(() => lfo.value.state, (state) => {
  if (state === 'active') startLfo(); else stopLfo();
}, { immediate: true });

// Update base value when user manually changes the control
watch(() => currentValue.value, (newValue) => {
  if (lfo.value.state !== 'active') {
    lfoBaseValue.value = newValue;
  }
});

// Update base value when LFO is disabled
watch(() => lfo.value.state, (state) => {
  if (state === 'disabled') {
    lfoBaseValue.value = currentValue.value;
  }
});

// Methods
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value);
  updateValue(value);
}

function updateValue(value: number, fromMidi = false) {
  const clampedValue = Math.max(props.control.min, Math.min(props.control.max, value));
  currentValue.value = clampedValue;
  emit('update:modelValue', clampedValue);
  emit('change', clampedValue);
  
  // Only send MIDI CC if the update is NOT from MIDI input (to avoid feedback loop)
  if (!fromMidi) {
    midiService.sendControlChange(props.control, clampedValue);
  }
  
  // Visual feedback
  isActive.value = true;
  setTimeout(() => { isActive.value = false; }, 150);
}

function toggleValue() {
  const newValue = currentValue.value > 63 ? 0 : 127;
  updateValue(newValue);
}

function buttonDown() {
  updateValue(127);
}

function buttonUp() {
  updateValue(0);
}

function handleRadioChange(value: number) {
  updateValue(value);
}

// Arrastre relativo: el control no salta al tocarlo. Shift = ajuste fino. Solo se manda un
// valor cuando cambia el entero: arrastrar no repite el mismo CC en cada píxel.
let dragEl: HTMLElement | null = null;

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  isDragging.value = true;
  dragStartY.value = event.clientY;
  dragStartValue.value = currentValue.value;
  dragEl = event.currentTarget as HTMLElement;
  dragEl.setPointerCapture(event.pointerId);
  dragEl.addEventListener('pointermove', handleDrag);
  dragEl.addEventListener('pointerup', stopDrag);
  dragEl.addEventListener('pointercancel', stopDrag);
}

function handleDrag(event: PointerEvent) {
  if (!isDragging.value) return;
  const recorrido = clase.value === 'fader' ? Math.max(1, (dragEl?.clientHeight ?? 200) - 20) : 160;
  const rango = props.control.max - props.control.min;
  const deltaY = (dragStartY.value - event.clientY) / escalaConsola(); // hacia arriba sube
  const nuevo = Math.round(dragStartValue.value + (deltaY / recorrido) * rango * (event.shiftKey ? 0.2 : 1));
  const limitado = Math.max(props.control.min, Math.min(props.control.max, nuevo));
  if (limitado !== currentValue.value) updateValue(limitado);
}

function stopDrag() {
  isDragging.value = false;
  if (!dragEl) return;
  dragEl.removeEventListener('pointermove', handleDrag);
  dragEl.removeEventListener('pointerup', stopDrag);
  dragEl.removeEventListener('pointercancel', stopDrag);
  dragEl = null;
}

function onKeydown(event: KeyboardEvent) {
  const pasos: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
  const paso = pasos[event.key];
  if (paso === undefined) return;
  event.preventDefault();
  updateValue(Math.round(currentValue.value) + paso);
}

// Reset to default (double-click / double-tap)
function resetToDefault() {
  const value = props.control.defaultValue;
  updateValue(value);
  // When LFO is not active, also update base value
  if (lfo.value.state !== 'active') {
    lfoBaseValue.value = value;
  }
}

// Watch for external value changes (e.g., resets)
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined) {
      currentValue.value = newValue;
    }
  },
  { immediate: true }
);

// MIDI input listener reference for cleanup
let midiListener: ((cc: number, value: number, channel: number) => void) | null = null;

onMounted(() => {
  // Listen for MIDI input to update control
  midiListener = (cc, value, channel) => {
    if (cc === props.control.cc && channel === props.control.channel) {
      console.log(`Updating control ${props.control.name} from MIDI: CC${cc} = ${value}`);
      
      // Validate the MIDI value
      if (value === undefined || value === null || isNaN(value)) {
        console.warn(`Invalid MIDI value received for ${props.control.name}: ${value}`);
        return;
      }
      
      // Ensure value is in valid range
      const validValue = Math.max(0, Math.min(127, Math.round(value)));
      console.log(`Validated MIDI value: ${value} -> ${validValue}`);
      
      // Use updateValue with fromMidi=true to avoid feedback loop
      updateValue(validValue, true);
    }
  };
  
  midiService.addControlChangeListener(midiListener);
});

// Methods to control LFO state
function disableLfo() {
  lfo.value.state = 'disabled';
  stopLfo();
}

function pauseLfo() {
  if (lfo.value.state === 'active') {
    lfo.value.state = 'paused';
  }
}

function resumeLfo() {
  if (lfo.value.state === 'paused') {
    lfo.value.state = 'active';
  }
}

function pauseResumeLfo() {
  if (lfo.value.state === 'active') {
    lfo.value.state = 'paused';
  } else if (lfo.value.state === 'paused') {
    lfo.value.state = 'active';
  }
}

// Expose methods and state for external access
defineExpose({
  disableLfo,
  pauseLfo,
  resumeLfo,
  pauseResumeLfo,
  lfo
});

onUnmounted(() => {
  stopDrag();
  // Clean up MIDI listener
  if (midiListener) {
    midiService.removeControlChangeListener(midiListener);
    midiListener = null;
  }
});
</script>

<style scoped>
.midi-control { display: flex; flex-direction: column; align-items: center; min-width: 0; }
.midi-control.control-fader { flex: 1; min-height: 0; align-self: stretch; gap: 7px; }
.midi-control.control-toggle, .midi-control.control-radio { align-items: stretch; }

/* perilla */
.perilla { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; touch-action: none; }
.perilla-zona { position: relative; width: 40px; height: 40px; border-radius: 50%; cursor: ns-resize; outline: none; }
.perilla-zona:focus-visible .perilla-falda, .fader-pista:focus-visible .fader-tapa { box-shadow: var(--relieve-4), 0 0 0 2px rgba(142, 240, 220, 0.6); }
.perilla.bipolar .perilla-zona::before { content: ""; position: absolute; left: 50%; top: -1px; width: 2px; height: 4px; margin-left: -1px; border-radius: 1px; background: var(--serigrafia-2); }
.perilla-falda { position: absolute; inset: 5px; border-radius: 50%; background: linear-gradient(135deg, rgba(255, 244, 226, 0.10), transparent 45%, rgba(0, 0, 0, 0.32)), repeating-conic-gradient(#2c2927 0 6deg, #3a3633 6deg 12deg); box-shadow: var(--relieve-4); }
.perilla-falda::before { content: ""; position: absolute; inset: 15%; border-radius: 50%; background: radial-gradient(circle, transparent 0 58%, rgba(0, 0, 0, 0.18) 100%), conic-gradient(from 20deg, #dcd8d1, #a7a298 12%, #ece8e1 25%, #9d978d 38%, #d8d3cb 50%, #a29d93 62%, #ebe7e0 75%, #9f9a90 88%, #dcd8d1); box-shadow: inset 1px 1px 1px rgba(255, 255, 255, 0.6), inset -1px -2px 2px rgba(0, 0, 0, 0.4); }
.perilla-tapa { position: absolute; inset: 15%; border-radius: 50%; z-index: 1; }
.perilla-indice { position: absolute; left: 50%; top: 4%; width: 2.5px; height: 38%; margin-left: -1.25px; border-radius: 2px; background: #1f1d1b; }
.perilla-nombre { font: 700 11.5px/1 var(--f-panel); letter-spacing: 0.1em; text-transform: uppercase; color: var(--serigrafia); white-space: nowrap; }
.perilla-valor { font: 500 10.5px/1 var(--f-datos); color: var(--serigrafia-2); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* LFO: anillo en la esquina; lleno si está en marcha, ámbar si está en pausa */
.lfo-btn { position: absolute; right: -3px; top: -3px; z-index: 2; width: 11px; height: 11px; padding: 0; border-radius: 50%; border: 1.5px solid var(--vfd); background: var(--hundido); cursor: pointer; }
.lfo-btn.active { background: var(--vfd); box-shadow: 0 0 6px var(--vfd); }
.lfo-btn.paused { border-color: var(--ambar); background: var(--ambar); }

/* fader */
.fader { position: relative; flex: 1; min-height: 100px; align-self: stretch; display: grid; grid-template-columns: 34px 1fr; touch-action: none; }
.fader-escala { position: relative; font: 500 10.5px/1 var(--f-datos); color: var(--serigrafia-3); }
.fader-escala span { position: absolute; right: 8px; transform: translateY(-50%); }
.fader-pista { position: relative; cursor: ns-resize; outline: none; }
.fader-pista::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 8px; margin-left: -4px; border-radius: 4px; background: var(--hundido); box-shadow: var(--hueco); }
.fader-tapa { position: absolute; left: 50%; width: 38px; height: 20px; margin: -10px 0 0 -19px; border-radius: 3px; background: linear-gradient(180deg, #e6e2db, #a8a39a 45%, #1f1d1b 45% 55%, #c9c4bb 55%, #8f897f); box-shadow: var(--relieve-4); }
.fader .lfo-btn { right: 2px; top: 0; }
.fader-valor { padding: 4px 7px; border-radius: 4px; background: var(--hundido); box-shadow: var(--hueco); font: 500 11.5px/1 var(--f-datos); color: var(--serigrafia); font-variant-numeric: tabular-nums; }

/* teclas de interruptor */
.tecla-mini { height: 22px; min-width: 0; padding: 0 6px; font-size: 10.5px; letter-spacing: 0.08em; text-transform: none; color: var(--serigrafia-2); }
.tecla-mini.on { color: var(--serigrafia); }
.tecla-mute { flex-direction: column; height: 40px; width: 46px; gap: 5px; font-size: 11.5px; }
.tecla-ancha { width: 100%; justify-content: flex-start; }

/* selector */
.selector { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 6px; }
.selector .tecla { justify-content: flex-start; padding: 0 7px; font-size: 11.5px; }

/* diálogo del LFO */
.lfo-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); }
.lfo-dialog { min-width: 300px; max-width: 92vw; padding: 14px; border-radius: 10px; background: var(--placa); box-shadow: var(--relieve-1), 0 20px 50px rgba(0, 0, 0, 0.6); color: var(--serigrafia); }
.lfo-dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.lfo-dialog-title { font: 700 14px/1 var(--f-panel); letter-spacing: 0.14em; text-transform: uppercase; }
.lfo-close { width: 28px; height: 28px; border: 0; border-radius: 6px; background: var(--placa-2); color: var(--serigrafia); font-size: 18px; line-height: 1; cursor: pointer; }
</style>
