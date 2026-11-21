<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getParam } from '../midi/sysex/zoomL6/params';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import { useDeviceSettings } from '../composables/useDeviceSettings';

interface Props {
  paramId: ParamId;
  label?: string;
  readonly?: boolean;
  /**
   * Controlled mode: when set, the parent owns the value (e.g. a setting shared by the app and the
   * mixer). The field shows this value and emits `update:modelValue` instead of writing the mixer
   * itself, and it stays editable even when the editor link is closed.
   */
  modelValue?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  readonly: false,
  modelValue: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const deviceSettings = useDeviceSettings();
const def = computed(() => getParam(props.paramId));

const displayLabel = computed(() => props.label ?? def.value.label);
const controlled = computed(() => props.modelValue !== undefined);
const value = computed<number | undefined>(() =>
  controlled.value ? props.modelValue : deviceSettings.values[props.paramId],
);
const paramStatus = computed(() => deviceSettings.status[props.paramId] ?? 'idle');
const errorText = computed(() => deviceSettings.errors[props.paramId] ?? null);

const isReadOnly = computed(() => props.readonly || def.value.readOnly === true);
const isTextOnly = computed(() => isReadOnly.value || def.value.encoding.kind === 'ascii');
const disabled = computed(
  () => isReadOnly.value || (!controlled.value && !deviceSettings.isWritable(props.paramId)),
);

/** Writes the mixer, or hands the value to the parent in controlled mode. */
function commit(next: number): void {
  if (controlled.value) {
    emit('update:modelValue', next);
  } else {
    deviceSettings.set(props.paramId, next);
  }
}


const statusTitle = computed(() => {
  if (paramStatus.value === 'error') return errorText.value ?? 'Error';
  return paramStatus.value;
});

// ── enum control ─────────────────────────────────────────────────────────────
function onEnumChange(event: Event): void {
  const raw = Number((event.target as HTMLSelectElement).value);
  if (Number.isNaN(raw)) return;
  commit(raw);
}

// ── bool control ─────────────────────────────────────────────────────────────
function toggleBool(): void {
  if (disabled.value) return;
  commit(value.value === 1 ? 0 : 1);
}

// ── numeric control (with optional specialValues combo) ─────────────────────
const hasSpecialValues = computed(
  () => def.value.specialValues !== undefined && Object.keys(def.value.specialValues).length > 0,
);
const specialOptions = computed(() => {
  const special = def.value.specialValues;
  if (!special) return [];
  return Object.entries(special).map(([k, optLabel]) => ({ value: Number(k), label: optLabel }));
});
const isCurrentValueSpecial = computed(
  () => value.value !== undefined && !!def.value.specialValues && Object.prototype.hasOwnProperty.call(def.value.specialValues, value.value),
);
/** True while the user has picked "Custom value…" but has not typed a number yet. */
const manualEntry = ref(false);
watch(isCurrentValueSpecial, (isSpecial) => {
  if (isSpecial) manualEntry.value = false;
});

const specialSelectValue = computed<number | '__custom'>(() => {
  if (!manualEntry.value && isCurrentValueSpecial.value && value.value !== undefined) return value.value;
  return '__custom';
});

function onSpecialSelectChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value;
  if (raw === '__custom') {
    manualEntry.value = true;
    return;
  }
  manualEntry.value = false;
  const num = Number(raw);
  if (!Number.isNaN(num)) commit(num);
}

function clampToRange(n: number): number {
  const { min, max } = def.value.range;
  return Math.min(max, Math.max(min, n));
}

function onNumberChange(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  if (Number.isNaN(raw)) return;
  commit(clampToRange(raw));
}

const showNumberInput = computed(() => !hasSpecialValues.value || specialSelectValue.value === '__custom');
</script>

<template>
  <div class="device-param-field" :class="{ 'device-param-field--disabled': disabled }">
    <div class="device-param-field__label-row">
      <i
        class="lampara status-dot"
        :class="{
          blanco: paramStatus === 'idle',
          verde: paramStatus === 'ok',
          rojo: paramStatus === 'error',
          on: paramStatus !== 'idle',
          'status-dot--busy': paramStatus === 'reading' || paramStatus === 'writing',
        }"
        :title="statusTitle"
      ></i>
      <label class="device-param-field__label" :title="def.description">
        {{ displayLabel }}
        <span
          v-if="!def.verified"
          class="experimental-badge"
          title="Not yet verified against real hardware"
        >experimental</span>
      </label>
    </div>

    <div class="device-param-field__control">
      <!-- read-only / ascii -->
      <span v-if="isTextOnly" class="device-param-field__value">{{ value ?? '--' }}</span>

      <!-- enum -->
      <select
        v-else-if="def.encoding.kind === 'enum'"
        class="setting-select device-param-field__select"
        :disabled="disabled"
        :value="value ?? 0"
        @change="onEnumChange"
      >
        <option v-for="(optLabel, idx) in def.encoding.labels" :key="idx" :value="idx">
          {{ optLabel }}
        </option>
      </select>

      <!-- bool -->
      <button
        v-else-if="def.encoding.kind === 'bool'"
        type="button"
        class="tecla toggle-button"
        :class="{ on: value === 1 }"
        :aria-pressed="value === 1"
        :disabled="disabled"
        @click="toggleBool"
      >
        <i class="lampara blanco" aria-hidden="true"></i>
        <span class="toggle-state">{{ value === 1 ? 'ON' : 'OFF' }}</span>
      </button>

      <!-- numeric with discrete choices (e.g. MIDI channel 1-16) -->
      <select
        v-else-if="def.choices"
        class="setting-select device-param-field__select"
        :disabled="disabled"
        :value="value ?? def.choices[0]?.value"
        @change="onEnumChange"
      >
        <option v-for="choice in def.choices" :key="choice.value" :value="choice.value">
          {{ choice.label }}
        </option>
      </select>

      <!-- numeric (u7 / u14le / u28le), optionally combined with specialValues -->
      <div v-else class="device-param-field__numeric">
        <select
          v-if="hasSpecialValues"
          class="setting-select device-param-field__select"
          :disabled="disabled"
          :value="specialSelectValue"
          @change="onSpecialSelectChange"
        >
          <option v-for="opt in specialOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
          <option value="__custom">Custom value…</option>
        </select>
        <input
          v-if="showNumberInput"
          type="number"
          class="cc-input device-param-field__number"
          :disabled="disabled"
          :min="def.range.min"
          :max="def.range.max"
          :step="def.range.step ?? 1"
          :value="value ?? ''"
          @change="onNumberChange"
        />
        <span v-if="def.range.unit" class="device-param-field__unit">{{ def.range.unit }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Shared sunken control look: kept in sync with AdvancedSettings.vue and MidiConnection.vue. */
.setting-select {
  height: 32px;
  min-width: 156px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  color: var(--serigrafia);
  font: 500 13px/1 var(--f-datos);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.setting-select:hover:not(:disabled) {
  box-shadow: var(--hueco), 0 0 0 1px var(--linea);
}

.setting-select:focus-visible {
  outline: 2px solid var(--vfd);
  outline-offset: 2px;
}

.setting-select option {
  background: var(--chasis);
  color: var(--serigrafia);
}

.cc-input {
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  color: var(--serigrafia);
  font: 500 13px/1 var(--f-datos);
  font-variant-numeric: tabular-nums;
}

.cc-input:hover:not(:disabled) {
  box-shadow: var(--hueco), 0 0 0 1px var(--linea);
}

.cc-input:focus-visible {
  outline: 2px solid var(--vfd);
  outline-offset: 2px;
}

.device-param-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--chasis);
  border: 1px solid var(--linea);
}

.device-param-field--disabled {
  opacity: 0.65;
}

.device-param-field__label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.device-param-field__label {
  font: 700 12px/1.2 var(--f-panel);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--serigrafia-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.experimental-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 5px;
  font: 700 9.5px/1 var(--f-panel);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ambar);
  border: 1px solid var(--ambar);
  border-radius: 3px;
  vertical-align: middle;
  white-space: nowrap;
}

/* leyendo o escribiendo: VFD; ok: verde; error: rojo; reposo: lámpara apagada */
.status-dot {
  width: 8px;
  height: 8px;
}

.status-dot--busy {
  --on: var(--vfd);
  --off: var(--blanco-off);
}

.device-param-field__control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.device-param-field__value {
  padding: 5px 9px;
  border-radius: 4px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 500 12.5px/1 var(--f-datos);
  font-variant-numeric: tabular-nums;
  color: var(--serigrafia-2);
}

.device-param-field__numeric {
  display: flex;
  align-items: center;
  gap: 6px;
}

.device-param-field__number {
  width: 84px;
}

.device-param-field__unit {
  font: 500 11.5px/1 var(--f-datos);
  color: var(--serigrafia-3);
}

.toggle-button {
  min-width: 68px;
  height: 30px;
}

.device-param-field__select:disabled,
.device-param-field__number:disabled {
  opacity: 0.45;
  cursor: default;
}

@media (max-width: 480px) {
  .device-param-field {
    flex-direction: column;
    align-items: stretch;
  }

  .device-param-field__control {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }

  .device-param-field__select {
    flex: 1;
    min-width: 0;
  }
}
</style>
