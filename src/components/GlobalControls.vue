<template>
  <!-- Columna lateral: efecto interno y compresor. Las escenas viven en la barra superior. -->
  <div class="global-controls">
    <div class="grupo">
      <h2 class="t-rotulo">{{ t('ui.effect') }}</h2>
      <MidiControl
        :control="globalData.efxType"
        v-model="values.efxType"
        @change="onControlChange('global', 'efxType', $event)"
        :rotulo="t('ui.effect_type')"
      />
      <EffectParams
        :efxType="values.efxType"
        :selectionKnown="effectKnown"
        :efxOptions="globalData.efxType.options ?? []"
        :mixerType="mixerType"
      />
    </div>

    <div class="grupo">
      <h2 class="t-rotulo">{{ t('ui.compressor') }}</h2>
      <MidiControl
        :control="globalData.compressor"
        v-model="values.compressor"
        @change="onControlChange('global', 'compressor', $event)"
        forma="ancha"
        :rotulo="t('fixed.COMP')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ccKnowledgeKey, useSceneKnowledge } from '../composables/useSceneKnowledge';
import { t } from '../i18n';
import { reactive } from 'vue';
import MidiControl from './MidiControl.vue';
import EffectParams from './EffectParams.vue';
import type { GlobalControls } from '../config/midiConfig';

interface Props {
  globalData: GlobalControls;
  mixerType?: 'l6' | 'l6max';
  compact?: boolean;
}

interface Emits {
  (e: 'controlChange', section: string, control: string, value: number): void;
  (e: 'sceneChanged', scene: any): void;
}

const props = withDefaults(defineProps<Props>(), {
  mixerType: 'l6',
  compact: false
});
const emit = defineEmits<Emits>();

const { known: effectKnown } = useSceneKnowledge(() => ccKnowledgeKey(props.globalData.efxType));

// Reactive values for simplified global controls
const values = reactive({
  efxType: props.globalData.efxType.defaultValue,
  compressor: props.globalData.compressor.defaultValue,
});

function onControlChange(section: string, control: string, value: number) {
  emit('controlChange', section, control, value);
}

function onSceneChanged(scene: any) {
  emit('sceneChanged', scene);
}


// Method to reset all controls to defaults
function resetToDefaults() {
  values.efxType = props.globalData.efxType.defaultValue;
  values.compressor = props.globalData.compressor.defaultValue;
}

// Expose methods
defineExpose({
  resetToDefaults,
  values
});
</script>

<style scoped>
.global-controls { display: flex; flex-direction: column; gap: 10px; }
</style>
