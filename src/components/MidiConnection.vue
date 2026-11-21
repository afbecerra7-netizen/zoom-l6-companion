<template>
  <div class="midi-connection">
    <div class="connection-header">
      <h3 class="connection-title">MIDI Connection</h3>
      <div class="connection-status" :class="{ connected: isConnected, error: hasError }">
        <span class="status-dot"></span>
        {{ connectionStatus }}
      </div>
    </div>
    
    <div class="connection-content" v-if="isInitialized">
      <!-- Input Selection -->
      <div class="device-section">
        <label class="device-label">MIDI Input:</label>
        <select 
          v-model="selectedInput" 
          @change="connectInput"
          class="device-select"
        >
          <option value="">Select Input Device</option>
          <option 
            v-for="input in availableInputs" 
            :key="input.id" 
            :value="input.name"
          >
            {{ input.name }}
          </option>
        </select>
      </div>
      
      <!-- Output Selection -->
      <div class="device-section">
        <label class="device-label">MIDI Output:</label>
        <select 
          v-model="selectedOutput" 
          @change="connectOutput"
          class="device-select"
        >
          <option value="">Select Output Device</option>
          <option 
            v-for="output in availableOutputs" 
            :key="output.id" 
            :value="output.name"
          >
            {{ output.name }}
          </option>
        </select>
      </div>
      
      <!-- Connection Actions -->
      <div class="connection-actions">
        <button 
          @click="refreshDevices"
          class="action-button refresh-button"
          :disabled="isRefreshing"
        >
          {{ isRefreshing ? 'Refreshing...' : 'Refresh Devices' }}
        </button>
        
        <button 
          @click="disconnect"
          class="action-button disconnect-button"
          :disabled="!isConnected"
        >
          Disconnect
        </button>
        
        <button 
          @click="autoConnect"
          class="action-button auto-button"
        >
          Auto-Connect Zoom
        </button>
      </div>
    </div>
    
    <div class="connection-content" v-else-if="hasError">
      <div class="error-message">
        <p>WebMIDI is not supported in this browser or failed to initialize.</p>
        <p>Please use a modern browser like Chrome, Edge, or Firefox.</p>
        <button @click="initializeMidi" class="action-button retry-button">
          Retry
        </button>
      </div>
    </div>
    
    <div class="connection-content" v-else>
      <div class="loading-message">
        <p>Initializing MIDI...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { midiService } from '../services/midiService';
import type { Input, Output } from 'webmidi';

interface Emits {
  (e: 'connectionChanged', connected: boolean): void;
}

const emit = defineEmits<Emits>();

const isInitialized = ref(false);
const hasError = ref(false);
const isRefreshing = ref(false);
const selectedInput = ref('');
const selectedOutput = ref('');
const availableInputs = ref<Input[]>([]);
const availableOutputs = ref<Output[]>([]);

const isConnected = computed(() => {
  return midiService.connectionState.value;
});

const connectionStatus = computed(() => {
  if (hasError.value) return 'Error';
  if (!isInitialized.value) return 'Initializing...';
  if (!isConnected.value) return 'Disconnected';
  
  return `Connected: ${midiService.inputName} → ${midiService.outputName}`;
});

async function initializeMidi() {
  hasError.value = false;
  try {
    const success = await midiService.initialize();
    if (success) {
      isInitialized.value = true;
      refreshDevices();
    } else {
      hasError.value = true;
    }
  } catch (error) {
    console.error('MIDI initialization error:', error);
    hasError.value = true;
  }
}

function refreshDevices() {
  if (!isInitialized.value) return;
  
  isRefreshing.value = true;
  
  try {
    const inputs = midiService.getAvailableInputs();
    const outputs = midiService.getAvailableOutputs();
    
    availableInputs.value = inputs;
    availableOutputs.value = outputs;
  } catch (error) {
    console.error('Error refreshing devices:', error);
  } finally {
    isRefreshing.value = false;
  }
}

function connectInput() {
  if (!selectedInput.value) return;
  
  const success = midiService.connectInput(selectedInput.value);
  if (success) {
    emit('connectionChanged', midiService.connectionState.value);
  } else {
    selectedInput.value = '';
  }
}

function connectOutput() {
  if (!selectedOutput.value) return;
  
  const success = midiService.connectOutput(selectedOutput.value);
  if (success) {
    emit('connectionChanged', midiService.connectionState.value);
  } else {
    selectedOutput.value = '';
  }
}

function disconnect() {
  midiService.disconnect();
  selectedInput.value = '';
  selectedOutput.value = '';
  emit('connectionChanged', false);
}

/**
 * Prefer Mixer Control for normal CC/notes (companion default), then Editor (SysEx-focused),
 * then other Zoom/LiveTrak-style names.
 */
function pickZoomPreferredPort<T extends { name: string }>(devices: T[]): T | undefined {
  if (devices.length === 0) return undefined;
  const lower = (s: string) => s.toLowerCase();
  const zoomish = (name: string) => {
    const n = lower(name);
    return n.includes('zoom') || n.includes('l-6') || n.includes('l6') || n.includes('livetrak');
  };
  const candidates = devices.filter((d) => zoomish(d.name));
  const pool = candidates.length > 0 ? candidates : devices;
  const mixer = pool.find((d) => lower(d.name).includes('mixer control'));
  if (mixer) return mixer;
  const editor = pool.find((d) => lower(d.name).includes('editor'));
  if (editor) return editor;
  return pool[0];
}

function autoConnect() {
  const targetInput = pickZoomPreferredPort(availableInputs.value);
  const targetOutput = pickZoomPreferredPort(availableOutputs.value);

  if (targetInput) {
    selectedInput.value = targetInput.name;
    connectInput();
  }

  if (targetOutput) {
    selectedOutput.value = targetOutput.name;
    connectOutput();
  }
}


onMounted(() => {
  initializeMidi();
  
  // Set up device state change callback (USB re-enumeration → rebind stale ports)
  midiService.setDeviceStateChangeCallback(() => {
    refreshDevices();
    if (midiService.syncPortsAfterHotplug()) {
      emit('connectionChanged', midiService.connectionState.value);
    }
  });
});
</script>

<style scoped>
.midi-connection { padding: 14px; border-radius: 10px; background: var(--placa); box-shadow: var(--relieve-1); color: var(--serigrafia); }
.connection-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.connection-title { font: 700 13px/1 var(--f-panel); letter-spacing: 0.16em; text-transform: uppercase; color: var(--serigrafia-2); }
.connection-status { display: flex; align-items: center; gap: 7px; font: 500 12px/1 var(--f-datos); color: var(--serigrafia-2); }
.status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--blanco-off); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.5); }
.connection-status.connected .status-dot { background: var(--verde); box-shadow: 0 0 9px var(--verde); }
.connection-status.error .status-dot { background: var(--rojo); box-shadow: 0 0 9px var(--rojo); }
.connection-content { display: flex; flex-direction: column; gap: 10px; }
.device-section { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: 10px; }
.device-label { font: 700 12px/1 var(--f-panel); letter-spacing: 0.12em; text-transform: uppercase; color: var(--serigrafia-2); }
.device-select { height: 34px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--hundido); box-shadow: var(--hueco); color: var(--serigrafia); font: 500 13px/1 var(--f-datos); }
.device-select:focus-visible { outline: 2px solid var(--vfd); outline-offset: 2px; }
.connection-actions { display: flex; gap: 8px; margin-top: 4px; }
.action-button { height: 32px; padding: 0 12px; border: 0; border-radius: 5px; background: linear-gradient(175deg, #3a3633, #2b2825); box-shadow: var(--relieve-3); cursor: pointer; font: 700 12.5px/1 var(--f-panel); letter-spacing: 0.12em; text-transform: uppercase; color: var(--serigrafia); }
.action-button:active { transform: translateY(2px); box-shadow: var(--relieve-3-pulsada); }
.action-button:disabled { cursor: default; opacity: 0.45; }
.action-button.auto-button { margin-left: auto; color: var(--hundido); background: linear-gradient(175deg, #fbf7ee, #ddd6c8); }
.error-message, .loading-message { font: 400 14px/1.45 var(--f-texto); color: var(--serigrafia-2); }
.error-message p { margin-bottom: 8px; }
</style>
