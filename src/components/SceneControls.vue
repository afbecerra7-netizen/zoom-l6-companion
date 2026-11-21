<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { midiService } from '../services/midiService';
import { useDeviceSettings } from '../composables/useDeviceSettings';
import { sceneControls, type SceneControl } from '../config/midiConfig';
import { sceneControlsL6Max } from '../config/midiConfigL6Max';

const deviceSettings = useDeviceSettings();

interface Props {
  mixerType?: 'l6' | 'l6max';
}

const props = withDefaults(defineProps<Props>(), {
  mixerType: 'l6'
});

// Emits
const emit = defineEmits<{
  sceneChanged: [scene: SceneControl];
}>();

// Use appropriate scene controls based on mixer type
const activeSceneControls = computed(() => {
  return props.mixerType === 'l6max' ? sceneControlsL6Max : sceneControls;
});

// Reactive state
const currentScene = ref<SceneControl | null>(null);
const isConnected = ref(false);

// Scene selection
function selectScene(scene: SceneControl) {
  if (!isConnected.value) {
    console.warn('MIDI not connected, cannot send scene change');
    return;
  }

  try {
    // Send Program Change message
    midiService.sendProgramChange(scene.program, scene.channel);
    // The recalled scene changes effect parameters and other mixer settings, and the mixer doesn't
    // echo the Program Change back, so ask for a (debounced) re-read of its state.
    deviceSettings.sceneChanged();
    
    // Update current scene
    currentScene.value = scene;
    
    // Emit scene change event
    emit('sceneChanged', scene);
    
    console.log(`Scene changed to: ${scene.name} (Program ${scene.program})`);
  } catch (error) {
    console.error('Failed to send scene change:', error);
  }
}

// MIDI Program Change listener
function handleProgramChange(program: number, channel: number) {
  // Find the scene that matches this program change
  const scene = activeSceneControls.value.find(s => s.program === program && s.channel === channel);
  if (scene) {
    currentScene.value = scene;
    emit('sceneChanged', scene);
    console.log(`Scene received: ${scene.name} (Program ${program})`);
  }
}

// Watch MIDI connection state
function updateConnectionState() {
  isConnected.value = midiService.isConnected;
}

// Lifecycle
onMounted(() => {
  // Set up MIDI Program Change listener
  midiService.addProgramChangeListener(handleProgramChange);
  
  // Watch connection state
  updateConnectionState();
  
  // Set initial scene to first one
  if (activeSceneControls.value.length > 0) {
    currentScene.value = activeSceneControls.value[0]!;
  }
});

onUnmounted(() => {
  // Clean up listener
  midiService.removeProgramChangeListener(handleProgramChange);
});
</script>

<template>
  <div class="escenas" role="radiogroup" aria-label="Escena">
    <span class="escenas-rotulo">Escena</span>
    <button
      v-for="scene in activeSceneControls"
      :key="scene.id"
      type="button"
      class="tecla tecla-escena"
      :class="{ on: currentScene?.id === scene.id }"
      role="radio"
      :aria-checked="currentScene?.id === scene.id"
      :disabled="!isConnected"
      :title="`${scene.name} (PC ${scene.program})`"
      @click="selectScene(scene)"
    >
      {{ scene.id }}
    </button>
  </div>
</template>

<style scoped>
.escenas { display: flex; align-items: center; gap: 6px; }
.escenas-rotulo { margin-right: 4px; font: 700 11.5px/1 var(--f-panel); letter-spacing: 0.16em; text-transform: uppercase; color: var(--serigrafia-2); }
.tecla-escena.on { color: var(--hundido); background: linear-gradient(175deg, #fbf7ee, #ddd6c8); }
</style>
