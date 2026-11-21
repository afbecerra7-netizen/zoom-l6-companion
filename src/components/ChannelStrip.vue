<template>
  <article
    class="tira"
    :class="{ estereo, muda: muteKnown && values.mute > 63 }"
    :aria-label="t('channel', { n: channelData.channel })"
    @keydown.esc="cierraMenu"
  >
    <div class="tira-cab">
      <button
        type="button"
        class="tira-num"
        :title="t('channelOptions', { n: channelData.channel })"
        aria-haspopup="menu"
        :aria-expanded="menuAbierto"
        @click="menuAbierto = !menuAbierto"
      >{{ channelData.channel }}</button>
      <span class="tira-tipo">{{ estereo ? t('stereo') : 'MONO' }}</span>
      <MidiControl
        v-if="channelData.controls.monoX2"
        class="tira-extra"
        :control="channelData.controls.monoX2"
        v-model="values.monoX2"
        @change="onControlChange('monoX2', $event)"
        forma="mini"
        :rotulo="t('fixed.MONO_x2')"
        ref="monoX2Ref"
      />
      <MidiControl
        v-else-if="channelData.controls.usb12"
        class="tira-extra"
        :control="channelData.controls.usb12"
        v-model="values.usb12"
        @change="onControlChange('usb12', $event)"
        forma="mini"
        :rotulo="t('fixed.USB_1_2')"
        ref="usb12Ref"
      />
      <MidiControl
        v-else-if="channelData.controls.usb34"
        class="tira-extra"
        :control="channelData.controls.usb34"
        v-model="values.usb34"
        @change="onControlChange('usb34', $event)"
        forma="mini"
        :rotulo="t('fixed.USB_3_4')"
        ref="usb34Ref"
      />

      <div v-if="menuAbierto" class="tira-menu" role="menu">
        <button type="button" role="menuitem" @click="alReiniciar">{{ t('ui.reset_this_channel') }}</button>
        <button type="button" role="menuitem" @click="alReiniciarTodos">{{ t('ui.reset_all_channels') }}</button>
        <button type="button" role="menuitem" :disabled="!hasActiveOrPausedLfos" @click="alPausarLfos">{{ lfoButtonText }}</button>
      </div>
    </div>

    <div>
      <h2 class="t-rotulo">{{ t('fixed.EQ') }}</h2>
      <div class="rejilla">
        <MidiControl :control="channelData.controls.eq.high" v-model="values.eqHigh" @change="onControlChange('eqHigh', $event)" unidad="eq" :rotulo="t('fixed.HIGH')" ref="eqHighRef" />
        <MidiControl :control="channelData.controls.eq.mid" v-model="values.eqMid" @change="onControlChange('eqMid', $event)" unidad="eq" :rotulo="t('fixed.MID')" ref="eqMidRef" />
        <MidiControl :control="channelData.controls.eq.midFreq" v-model="values.eqMidFreq" @change="onControlChange('eqMidFreq', $event)" unidad="frec" :rotulo="t('fixed.FREQ')" ref="eqMidFreqRef" />
        <MidiControl :control="channelData.controls.eq.low" v-model="values.eqLow" @change="onControlChange('eqLow', $event)" unidad="eq" :rotulo="t('fixed.LOW')" ref="eqLowRef" />
      </div>
    </div>

    <div>
      <h2 class="t-rotulo">{{ t('ui.sends') }}</h2>
      <div class="rejilla">
        <MidiControl :control="channelData.controls.aux1" v-model="values.aux1" @change="onControlChange('aux1', $event)" unidad="envio" :rotulo="t('fixed.AUX_1')" ref="aux1Ref" />
        <MidiControl :control="channelData.controls.aux2" v-model="values.aux2" @change="onControlChange('aux2', $event)" unidad="envio" :rotulo="t('fixed.AUX_2')" ref="aux2Ref" />
        <MidiControl :control="channelData.controls.efxSend" v-model="values.efxSend" @change="onControlChange('efxSend', $event)" unidad="envio" :rotulo="t('fixed.EFX')" ref="efxSendRef" />
        <MidiControl
          v-if="mixerType === 'l6max' && channelData.controls.subMix"
          :control="channelData.controls.subMix"
          v-model="values.subMix"
          @change="onControlChange('subMix', $event)"
          unidad="envio"
          :rotulo="t('fixed.SUB')"
          ref="subMixRef"
        />
      </div>
    </div>

    <div class="fila-pan">
      <MidiControl :control="channelData.controls.pan" v-model="values.pan" @change="onControlChange('pan', $event)" unidad="pan" :rotulo="t('fixed.PAN')" ref="panRef" />
      <MidiControl :control="channelData.controls.mute" v-model="values.mute" @change="onControlChange('mute', $event)" forma="mute" tono="ambar" :rotulo="t('fixed.MUTE')" ref="muteRef" />
    </div>

    <MidiControl
      :control="channelData.controls.volume"
      v-model="values.volume"
      @change="onControlChange('volume', $event)"
      vista="fader"
      unidad="nivel"
      :rotulo="t('ui.level_2')"
      ref="volumeRef"
    />

    <TapeLabel :canal="channelData.channel" />
  </article>
</template>

<script setup lang="ts">
import { ccKnowledgeKey, useSceneKnowledge } from '../composables/useSceneKnowledge';
import { t } from '../i18n';
import { reactive, ref, computed } from 'vue';
import MidiControl from './MidiControl.vue';
import TapeLabel from './TapeLabel.vue';
import type { ChannelControls } from '../config/midiConfig';

interface Props {
  channelData: ChannelControls;
  compactMode?: boolean;
  mixerType?: 'l6' | 'l6max';
}

interface Emits {
  (e: 'controlChange', channel: number, control: string, value: number): void;
  (e: 'resetAll'): void;
}

const props = withDefaults(defineProps<Props>(), {
  compactMode: false,
  mixerType: 'l6'
});
const emit = defineEmits<Emits>();

const { known: muteKnown } = useSceneKnowledge(() => ccKnowledgeKey(props.channelData.controls.mute));

// L6max: canales 1–4 mono y 5–8 estéreo. L6: 1–2 mono y 3–6 estéreo.
const estereo = computed(() => props.channelData.channel >= (props.mixerType === 'l6max' ? 5 : 3));

// Menú del canal: se abre desde su número. Reiniciar y pausar no son gestos de cada momento,
// así que no ocupan sitio en la tira.
const menuAbierto = ref(false);
function cierraMenu() {
  menuAbierto.value = false;
}
function alReiniciar() {
  resetToDefaults();
  cierraMenu();
}
function alReiniciarTodos() {
  emit('resetAll');
  cierraMenu();
}
function alPausarLfos() {
  pauseResumeAllLfos();
  cierraMenu();
}

// Individual refs for each control type
const eqHighRef = ref<any>(null);
const eqMidRef = ref<any>(null);
const eqMidFreqRef = ref<any>(null);
const eqLowRef = ref<any>(null);
const aux1Ref = ref<any>(null);
const aux2Ref = ref<any>(null);
const efxSendRef = ref<any>(null);
const subMixRef = ref<any>(null);
const panRef = ref<any>(null);
const volumeRef = ref<any>(null);
const muteRef = ref<any>(null);
const monoX2Ref = ref<any>(null);
const usb12Ref = ref<any>(null);
const usb34Ref = ref<any>(null);

// Reactive values for all controls
const values = reactive({
  volume: props.channelData.controls.volume.defaultValue,
  pan: props.channelData.controls.pan.defaultValue,
  eqHigh: props.channelData.controls.eq.high.defaultValue,
  eqMid: props.channelData.controls.eq.mid.defaultValue,
  eqMidFreq: props.channelData.controls.eq.midFreq.defaultValue,
  eqLow: props.channelData.controls.eq.low.defaultValue,
  aux1: props.channelData.controls.aux1.defaultValue,
  aux2: props.channelData.controls.aux2.defaultValue,
  efxSend: props.channelData.controls.efxSend.defaultValue,
  subMix: props.channelData.controls.subMix?.defaultValue ?? 0,
  mute: props.channelData.controls.mute.defaultValue,
  monoX2: props.channelData.controls.monoX2?.defaultValue ?? 0,
  usb12: props.channelData.controls.usb12?.defaultValue ?? 0,
  usb34: props.channelData.controls.usb34?.defaultValue ?? 0,
});

function onControlChange(controlName: string, value: number) {
  emit('controlChange', props.channelData.channel, controlName, value);
}

// Method to reset all controls to defaults
function resetToDefaults() {
  values.volume = props.channelData.controls.volume.defaultValue;
  values.pan = props.channelData.controls.pan.defaultValue;
  values.eqHigh = props.channelData.controls.eq.high.defaultValue;
  values.eqMid = props.channelData.controls.eq.mid.defaultValue;
  values.eqMidFreq = props.channelData.controls.eq.midFreq.defaultValue;
  values.eqLow = props.channelData.controls.eq.low.defaultValue;
  values.aux1 = props.channelData.controls.aux1.defaultValue;
  values.aux2 = props.channelData.controls.aux2.defaultValue;
  values.efxSend = props.channelData.controls.efxSend.defaultValue;
  if (props.channelData.controls.subMix) {
    values.subMix = props.channelData.controls.subMix.defaultValue;
  }
  values.mute = props.channelData.controls.mute.defaultValue;
  if (props.channelData.controls.monoX2) {
    values.monoX2 = props.channelData.controls.monoX2.defaultValue;
  }
  if (props.channelData.controls.usb12) {
    values.usb12 = props.channelData.controls.usb12.defaultValue;
  }
  if (props.channelData.controls.usb34) {
    values.usb34 = props.channelData.controls.usb34.defaultValue;
  }
  
  // Also disable all LFOs when resetting
  const allRefs = [
    eqHighRef.value, eqMidRef.value, eqMidFreqRef.value, eqLowRef.value,
    aux1Ref.value, aux2Ref.value, efxSendRef.value, subMixRef.value,
    panRef.value, volumeRef.value, muteRef.value,
    monoX2Ref.value, usb12Ref.value, usb34Ref.value
  ];
  
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.disableLfo) {
      controlRef.disableLfo();
    }
  });
}

// Helper function to get all control refs
function getAllControlRefs() {
  return [
    eqHighRef.value, eqMidRef.value, eqMidFreqRef.value, eqLowRef.value,
    aux1Ref.value, aux2Ref.value, efxSendRef.value, subMixRef.value,
    panRef.value, volumeRef.value, muteRef.value,
    monoX2Ref.value, usb12Ref.value, usb34Ref.value
  ];
}

// Computed property to check if there are any active or paused LFOs on this channel
const hasActiveLfos = computed(() => {
  return getAllControlRefs().some((controlRef) => {
    return controlRef && controlRef.lfo && controlRef.lfo.state === 'active';
  });
});

const hasPausedLfos = computed(() => {
  return getAllControlRefs().some((controlRef) => {
    return controlRef && controlRef.lfo && controlRef.lfo.state === 'paused';
  });
});

const hasActiveOrPausedLfos = computed(() => {
  return hasActiveLfos.value || hasPausedLfos.value;
});

const lfoButtonText = computed(() => {
  if (!hasActiveOrPausedLfos.value) return t('ui.no_lfos_on_this_channel');
  if (hasActiveLfos.value) return t('ui.pause_lfos_3');
  return t('ui.resume_lfos_3');
});

// Method to pause/resume all LFOs on this channel
function pauseResumeAllLfos() {
  const allRefs = getAllControlRefs();
  
  // If there are any active LFOs, pause all active ones
  // Otherwise, resume all paused ones
  if (hasActiveLfos.value) {
    // Pause all active LFOs
    allRefs.forEach((controlRef) => {
      if (controlRef && controlRef.pauseLfo) {
        controlRef.pauseLfo();
      }
    });
  } else {
    // Resume all paused LFOs
    allRefs.forEach((controlRef) => {
      if (controlRef && controlRef.resumeLfo) {
        controlRef.resumeLfo();
      }
    });
  }
}

// Separate methods for explicit pause/resume (used by global controls)
function pauseAllLfos() {
  const allRefs = getAllControlRefs();
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.pauseLfo) {
      controlRef.pauseLfo();
    }
  });
}

function resumeAllLfos() {
  const allRefs = getAllControlRefs();
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.resumeLfo) {
      controlRef.resumeLfo();
    }
  });
}

// Expose methods
defineExpose({
  resetToDefaults,
  pauseResumeAllLfos,
  pauseAllLfos,
  resumeAllLfos,
  hasActiveLfos,
  hasActiveOrPausedLfos,
  values
});
</script>

<style scoped>
.tira { position: relative; display: flex; flex-direction: column; gap: 7px; min-width: 0; min-height: 0; padding: 8px 7px 10px; border-radius: 8px; background: var(--placa); box-shadow: var(--relieve-1); }
.tira.estereo { background: linear-gradient(180deg, #282523, var(--placa) 30%); }
.tira-cab { position: relative; display: flex; align-items: center; gap: 6px; height: 24px; }
.tira-num { padding: 0 2px; border: 0; border-radius: 4px; background: none; cursor: pointer; font: 800 21px/1 var(--f-panel); letter-spacing: 0.04em; color: var(--serigrafia); }
.tira-num:hover, .tira-num[aria-expanded="true"] { background: var(--placa-2); }
.tira-num:focus-visible { outline: 2px solid var(--vfd); outline-offset: 1px; }
.tira-tipo { font: 600 10.5px/1 var(--f-panel); letter-spacing: 0.14em; color: var(--serigrafia-3); }
.tira-extra { margin-left: auto; }
.tira-menu { position: absolute; left: 0; top: calc(100% + 4px); z-index: 20; display: flex; flex-direction: column; min-width: 190px; padding: 4px; border-radius: 8px; background: #0e0d0c; border: 1px solid #44403b; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6); }
.tira-menu button { padding: 8px 10px; border: 0; border-radius: 5px; background: none; text-align: left; cursor: pointer; font: 500 13px/1.2 var(--f-texto); color: var(--serigrafia); }
.tira-menu button:hover:not(:disabled) { background: var(--placa-2); }
.tira-menu button:disabled { cursor: default; color: var(--inactivo); }
.rejilla { display: grid; grid-template-columns: 1fr 1fr; justify-items: center; row-gap: 3px; margin-top: 5px; }
.fila-pan { display: flex; align-items: center; justify-content: space-around; }
/* canal en mute: lo que suena se atenúa; la tecla y la cinta no */
.tira.muda :deep(.perilla), .tira.muda :deep(.fader), .tira.muda :deep(.fader-valor) { opacity: 0.5; }
</style>
