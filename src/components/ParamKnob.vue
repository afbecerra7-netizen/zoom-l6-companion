<template>
  <div class="param-knob" :class="{ disabled: !isInteractive, desconocido: !known }">
    <div
      ref="knobEl"
      class="perilla-zona"
      :class="{ active: isDragging }"
      tabindex="0"
      role="slider"
      :aria-label="paramLabel(paramId)"
      :title="paramDescription(paramId)"
      :aria-valuemin="def.range.min"
      :aria-valuemax="def.range.max"
      :aria-valuenow="displayNumber ?? undefined"
      :aria-disabled="!isInteractive"
      @pointerdown="startDrag"
      @pointermove="onPointerMove"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
      @dblclick.prevent="resetToMidpoint"
      @wheel.prevent="onWheel"
      @keydown="onKeydown"
    >
      <div class="perilla-falda"></div>
      <div class="perilla-tapa" :style="{ transform: `rotate(${knobRotation}deg)` }"><i class="perilla-indice"></i></div>
      <span
        v-if="statusDotVisible"
        class="status-dot"
        :class="statusDotClass"
        :title="statusTitle"
      ></span>
    </div>
    <span class="perilla-nombre">{{ paramLabel(paramId) }}</span>
    <span class="perilla-valor">{{ displayText }}</span>
  </div>
</template>

<script setup lang="ts">
import { useSceneKnowledge } from '../composables/useSceneKnowledge';
import { t, paramLabel, paramDescription, translatedText, errorMessage } from '../i18n';
import { computed, onUnmounted, ref, watch } from 'vue';
import { getParam, type ParamId } from '../midi/sysex/zoomL6/params';
import { useDeviceSettings } from '../composables/useDeviceSettings';

interface Props {
  paramId: ParamId;
  compact?: boolean;
  disabled?: boolean;
  /** Display-only hook for a future LFO pass: overrides the readout/rotation without writing. */
  modulatedValue?: number;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  disabled: false,
  modulatedValue: undefined,
});

const deviceSettings = useDeviceSettings();
const { known, markKnown, revision } = useSceneKnowledge(() => props.paramId);
const def = computed(() => getParam(props.paramId));

const rawValue = computed<number | undefined>(() => deviceSettings.values[props.paramId]);
const status = computed(() => deviceSettings.status[props.paramId] ?? 'idle');
const errorText = computed(() => deviceSettings.errors[props.paramId] ?? null);

const midpoint = computed(() => {
  const { min, max, step } = def.value.range;
  return snapToStep((min + max) / 2, step);
});

/** The value driving rotation/readout: modulated override > device value > midpoint (for display). */
const displayNumber = computed<number | undefined>(() => {
  if (!known.value) return undefined;
  if (props.modulatedValue !== undefined) return props.modulatedValue;
  return rawValue.value;
});

const isLoading = computed(() => rawValue.value === undefined || status.value === 'reading');

// Draggable only when the caller hasn't disabled it AND the editor link can actually accept a
// write for this parameter. Without the isWritable check the knob would optimistically move on a
// closed/stale/suspended link and then snap back once the write fails, fighting the user.
const isInteractive = computed(() => !props.disabled && deviceSettings.isWritable(props.paramId));

const displayText = computed(() => {
  if (!known.value) return '—';
  if (isLoading.value && props.modulatedValue === undefined) return '—';
  const value = displayNumber.value;
  if (value === undefined) return '—';
  const special = def.value.specialValues?.[value];
  if (special) return translatedText(special);
  const rounded = Math.round(value);
  return def.value.range.unit ? `${rounded} ${def.value.range.unit}` : `${rounded}`;
});

const knobRotation = computed(() => {
  const { min, max } = def.value.range;
  const range = max - min || 1;
  const value = displayNumber.value ?? midpoint.value;
  const normalized = (value - min) / range;
  return normalized * 270 - 135; // -135 to +135 degrees
});

const statusDotVisible = computed(() => known.value && (status.value === 'reading' || status.value === 'writing' || status.value === 'error'));
const statusDotClass = computed(() => ({
  reading: status.value === 'reading',
  writing: status.value === 'writing',
  error: status.value === 'error',
}));
const statusTitle = computed(() => (status.value === 'error' ? errorMessage(errorText.value) : undefined));

function snapToStep(value: number, step?: number): number {
  const s = step ?? 1;
  return Math.round(value / s) * s;
}

function clamp(value: number): number {
  const { min, max } = def.value.range;
  return Math.min(max, Math.max(min, value));
}

function commit(value: number): void {
  const snapped = clamp(snapToStep(value, def.value.range.step));
  deviceSettings.set(props.paramId, snapped);
  markKnown();
}

// ── drag ──────────────────────────────────────────────────────────────────────
const knobEl = ref<HTMLElement | null>(null);
const isDragging = ref(false);
let dragStartY = 0;
let dragStartValue = 0;

function sensitivityFor(fine: boolean): number {
  const { min, max, step } = def.value.range;
  const base = Math.max(step ?? 1, (max - min) / 200);
  return fine ? base / 10 : base;
}

function startDrag(event: PointerEvent): void {
  if (!isInteractive.value) return;
  isDragging.value = true;
  dragStartY = event.clientY;
  dragStartValue = displayNumber.value ?? midpoint.value;
  knobEl.value?.setPointerCapture(event.pointerId);
  knobEl.value?.focus();
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!isDragging.value) return;
  const deltaY = dragStartY - event.clientY; // up = increase
  const sensitivity = sensitivityFor(event.shiftKey);
  commit(dragStartValue + deltaY * sensitivity);
}

function stopDrag(event: PointerEvent): void {
  if (!isDragging.value) return;
  isDragging.value = false;
  try {
    knobEl.value?.releasePointerCapture(event.pointerId);
  } catch {
    /* pointer may already be released */
  }
}

// ── double-click reset ──────────────────────────────────────────────────────────
// There is no known device default for these parameters yet, so double-click resets
// to the midpoint of the documented range instead.
function resetToMidpoint(): void {
  if (!isInteractive.value) return;
  commit(midpoint.value);
}

// ── wheel (optional convenience) ────────────────────────────────────────────────
function onWheel(event: WheelEvent): void {
  if (!isInteractive.value) return;
  const step = def.value.range.step ?? 1;
  const amount = (event.shiftKey ? step * 10 : step) * (event.deltaY > 0 ? -1 : 1);
  commit((displayNumber.value ?? midpoint.value) + amount);
}

// ── keyboard ─────────────────────────────────────────────────────────────────────
function onKeydown(event: KeyboardEvent): void {
  if (!isInteractive.value) return;
  const step = def.value.range.step ?? 1;
  const base = displayNumber.value ?? midpoint.value;
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      event.preventDefault();
      commit(base + step);
      break;
    case 'ArrowDown':
    case 'ArrowLeft':
      event.preventDefault();
      commit(base - step);
      break;
    case 'PageUp':
      event.preventDefault();
      commit(base + step * 10);
      break;
    case 'PageDown':
      event.preventDefault();
      commit(base - step * 10);
      break;
    default:
      break;
  }
}

watch(revision, () => { isDragging.value = false; }, { flush: 'sync' });

onUnmounted(() => {
  isDragging.value = false;
});
</script>

<style scoped>
.param-knob { display: flex; flex-direction: column; align-items: center; gap: 2px; touch-action: none; }
.param-knob.disabled { opacity: 0.4; }
.perilla-zona { position: relative; width: 40px; height: 40px; border-radius: 50%; cursor: ns-resize; outline: none; }
.param-knob.disabled .perilla-zona { cursor: default; }
.perilla-zona:focus-visible .perilla-falda { box-shadow: var(--relieve-4), 0 0 0 2px rgba(142, 240, 220, 0.6); }
.perilla-falda { position: absolute; inset: 5px; border-radius: 50%; background: linear-gradient(135deg, rgba(255, 244, 226, 0.10), transparent 45%, rgba(0, 0, 0, 0.32)), repeating-conic-gradient(#2c2927 0 6deg, #3a3633 6deg 12deg); box-shadow: var(--relieve-4); }
.perilla-falda::before { content: ""; position: absolute; inset: 15%; border-radius: 50%; background: radial-gradient(circle, transparent 0 58%, rgba(0, 0, 0, 0.18) 100%), conic-gradient(from 20deg, #dcd8d1, #a7a298 12%, #ece8e1 25%, #9d978d 38%, #d8d3cb 50%, #a29d93 62%, #ebe7e0 75%, #9f9a90 88%, #dcd8d1); box-shadow: inset 1px 1px 1px rgba(255, 255, 255, 0.6), inset -1px -2px 2px rgba(0, 0, 0, 0.4); }
.perilla-tapa { position: absolute; inset: 15%; border-radius: 50%; z-index: 1; }
.perilla-indice { position: absolute; left: 50%; top: 4%; width: 2.5px; height: 38%; margin-left: -1.25px; border-radius: 2px; background: #1f1d1b; }
.perilla-nombre { font: 700 11.5px/1 var(--f-panel); letter-spacing: 0.1em; text-transform: uppercase; color: var(--serigrafia); white-space: nowrap; }
.perilla-valor { font: 500 10.5px/1 var(--f-datos); color: var(--serigrafia-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* leyendo o escribiendo en el mezclador: dato en curso; error: rojo, que es peligro */
.status-dot { position: absolute; right: -3px; top: -3px; z-index: 2; width: 8px; height: 8px; border-radius: 50%; background: var(--vfd); }
.status-dot.error { background: var(--rojo); }
</style>
