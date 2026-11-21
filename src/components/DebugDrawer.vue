<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue';
import { midiService } from '../services/midiService';
import { bytesToHex } from '../midi/sysex';
import SysexExplorer from './debug/SysexExplorer.vue';

// Props
interface Props {
  isVisible?: boolean;
  debugData?: {
    errorLogs: any[];
    midiLogs: any[];
    activeTab: 'errors' | 'midi' | 'system' | 'sysex';
    systemInfo: any;
  };
}

const props = withDefaults(defineProps<Props>(), {
  isVisible: false,
  debugData: () => ({
    errorLogs: [],
    midiLogs: [],
    activeTab: 'errors',
    systemInfo: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${screen.width}x${screen.height}`,
      viewportSize: '',
      devicePixelRatio: window.devicePixelRatio,
      webMidiSupported: false,
      timestamp: new Date()
    }
  })
});

// Emits
const emit = defineEmits<{
  toggle: [];
}>();

// Reactive state
const isExpanded = ref(false);
const activeTab = computed({
  get: () => props.debugData.activeTab,
  set: (value: 'errors' | 'midi' | 'system' | 'sysex') => {
    props.debugData.activeTab = value;
  }
});

// Error logging
interface ErrorLog {
  id: string;
  timestamp: Date;
  type: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  source?: string;
}

// MIDI message logging
interface MidiLog {
  id: string;
  timestamp: Date;
  direction: 'in' | 'out';
  type: 'cc' | 'note' | 'pc' | 'sysex' | 'other';
  channel: number;
  data: any;
  description: string;
}

// Use persistent debug data from props
const errorLogs = computed(() => props.debugData.errorLogs);
const midiLogs = computed(() => props.debugData.midiLogs);
const systemInfo = computed(() => props.debugData.systemInfo);

const maxLogs = 100;
const maxMidiLogs = 50;

// Reactive MIDI connection state
const midiConnected = computed(() => midiService.connectionState.value);

// Computed properties
const errorCount = computed(() => props.debugData.errorLogs.length);
const midiCount = computed(() => props.debugData.midiLogs.length);
const hasErrors = computed(() => props.debugData.errorLogs.some(log => log.type === 'error'));
const hasWarnings = computed(() => props.debugData.errorLogs.some(log => log.type === 'warning'));

// Methods
function toggleDrawer() {
  isExpanded.value = !isExpanded.value;
  emit('toggle');
}

function addErrorLog(type: ErrorLog['type'], message: string, stack?: string, source?: string) {
  const log: ErrorLog = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    type,
    message,
    stack,
    source
  };
  
  props.debugData.errorLogs.unshift(log);
  
  // Keep only the most recent logs
  if (props.debugData.errorLogs.length > maxLogs) {
    props.debugData.errorLogs.splice(maxLogs);
  }
}

function addMidiLog(direction: MidiLog['direction'], type: MidiLog['type'], channel: number, data: any, description: string) {
  const log: MidiLog = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    direction,
    type,
    channel,
    data,
    description
  };
  
  props.debugData.midiLogs.unshift(log);
  
  // Keep only the most recent logs
  if (props.debugData.midiLogs.length > maxMidiLogs) {
    props.debugData.midiLogs.splice(maxMidiLogs);
  }
}

function clearLogs(type: 'errors' | 'midi' | 'all' = 'all') {
  if (type === 'errors' || type === 'all') {
    props.debugData.errorLogs.length = 0;
  }
  if (type === 'midi' || type === 'all') {
    props.debugData.midiLogs.length = 0;
  }
}

function updateSystemInfo() {
  props.debugData.systemInfo.viewportSize = `${window.innerWidth}x${window.innerHeight}`;
  props.debugData.systemInfo.onLine = navigator.onLine;
  props.debugData.systemInfo.timestamp = new Date();
}

function formatTimestamp(date: Date): string {
  const timeString = date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
  });
  
  // Add milliseconds manually for better compatibility
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
  return `${timeString}.${milliseconds}`;
}

function getLogTypeClass(type: ErrorLog['type']): string {
  switch (type) {
    case 'error': return 'log-error';
    case 'warning': return 'log-warning';
    case 'info': return 'log-info';
    default: return '';
  }
}

function getMidiDirectionClass(direction: MidiLog['direction']): string {
  return direction === 'in' ? 'midi-in' : 'midi-out';
}

// Error handling setup
function setupErrorHandling() {
  // Global error handler
  window.addEventListener('error', (event) => {
    addErrorLog('error', event.message, event.error?.stack, event.filename);
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    addErrorLog('error', `Unhandled Promise Rejection: ${event.reason}`, undefined, 'Promise');
  });

  // Console override for debugging
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;

  console.error = (...args) => {
    addErrorLog('error', args.join(' '));
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args) => {
    addErrorLog('warning', args.join(' '));
    originalConsoleWarn.apply(console, args);
  };

  console.info = (...args) => {
    addErrorLog('info', args.join(' '));
    originalConsoleInfo.apply(console, args);
  };

  // Return cleanup function
  return () => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
  };
}

// MIDI monitoring setup
function setupMidiMonitoring() {
  // Monitor MIDI input - Control Changes
  const midiCCListener = (cc: number, value: number, channel: number) => {
    addMidiLog('in', 'cc', channel, { cc, value }, `CC${cc} = ${value} on channel ${channel}`);
  };

  // Monitor MIDI input - Note On
  const midiNoteOnListener = (note: number, velocity: number, channel: number) => {
    addMidiLog('in', 'note', channel, { note, velocity, type: 'on' }, `Note On: ${note} (vel: ${velocity}) on channel ${channel}`);
  };

  // Monitor MIDI input - Note Off
  const midiNoteOffListener = (note: number, velocity: number, channel: number) => {
    addMidiLog('in', 'note', channel, { note, velocity, type: 'off' }, `Note Off: ${note} (vel: ${velocity}) on channel ${channel}`);
  };

  // Monitor MIDI input - Program Change
  const midiProgramChangeListener = (program: number, channel: number) => {
    addMidiLog('in', 'pc', channel, { program }, `Program Change: ${program} on channel ${channel}`);
  };

  // Monitor MIDI output (we'll need to patch the midiService methods)
  const originalSendControlChange = midiService.sendControlChange;
  const originalSendNoteOn = midiService.sendNoteOn;
  const originalSendNoteOff = midiService.sendNoteOff;
  const originalSendProgramChange = midiService.sendProgramChange;
  const originalSendSysexRaw = midiService.sendSysexRaw.bind(midiService);

  // Patch sendControlChange
  midiService.sendControlChange = function(control: any, value: number) {
    addMidiLog('out', 'cc', control.channel, { cc: control.cc, value }, `CC${control.cc} = ${value} on channel ${control.channel}`);
    return originalSendControlChange.call(this, control, value);
  };

  // Patch sendNoteOn
  midiService.sendNoteOn = function(note: number, channel: number, velocity: number) {
    addMidiLog('out', 'note', channel, { note, velocity, type: 'on' }, `Note On: ${note} (vel: ${velocity}) on channel ${channel}`);
    return originalSendNoteOn.call(this, note, channel, velocity);
  };

  // Patch sendNoteOff
  midiService.sendNoteOff = function(note: number, channel: number, release: number) {
    addMidiLog('out', 'note', channel, { note, release, type: 'off' }, `Note Off: ${note} (rel: ${release}) on channel ${channel}`);
    return originalSendNoteOff.call(this, note, channel, release);
  };

  // Patch sendProgramChange
  midiService.sendProgramChange = function(program: number, channel: number) {
    addMidiLog('out', 'pc', channel, { program }, `Program Change: ${program} on channel ${channel}`);
    return originalSendProgramChange.call(this, program, channel);
  };

  // The editor session emits a heartbeat (F0 52 00 00 31 0B F7) and receives its ack
  // (F0 52 00 00 00 0B F7) ~10×/s while open; logging them would flush the 50-entry MIDI ring
  // buffer within seconds and bury real traffic. The SysEx explorer filters them for the same
  // reason. Match the two fixed patterns and skip them.
  const isHeartbeatTraffic = (b: readonly number[]) =>
    b.length === 7 &&
    b[0] === 0xf0 && b[1] === 0x52 && b[2] === 0x00 && b[3] === 0x00 &&
    ((b[4] === 0x31 && b[5] === 0x0b) || (b[4] === 0x00 && b[5] === 0x0b)) &&
    b[6] === 0xf7;

  // Patch sendSysexRaw (mass storage and other SysEx)
  midiService.sendSysexRaw = function (bytes: readonly number[]) {
    if (!isHeartbeatTraffic(bytes)) {
      const hex = bytesToHex(bytes);
      addMidiLog('out', 'sysex', 0, { hex, bytes: [...bytes] }, `SysEx out: ${hex}`);
    }
    return originalSendSysexRaw(bytes);
  };

  const midiSysexListener = (bytes: readonly number[]) => {
    if (isHeartbeatTraffic(bytes)) return;
    const hex = bytesToHex(bytes);
    addMidiLog('in', 'sysex', 0, { hex, bytes: [...bytes] }, `SysEx in: ${hex}`);
  };

  // Add MIDI input listeners
  if (midiService.isConnected) {
    midiService.addControlChangeListener(midiCCListener);
    midiService.addNoteOnListener(midiNoteOnListener);
    midiService.addNoteOffListener(midiNoteOffListener);
    midiService.addProgramChangeListener(midiProgramChangeListener);
    midiService.addSysexListener(midiSysexListener);
  }

  // Watch for MIDI connection changes
  const stopWatching = watch(() => midiService.connectionState.value, (connected) => {
    if (connected) {
      midiService.removeControlChangeListener(midiCCListener);
      midiService.removeNoteOnListener(midiNoteOnListener);
      midiService.removeNoteOffListener(midiNoteOffListener);
      midiService.removeProgramChangeListener(midiProgramChangeListener);
      midiService.removeSysexListener(midiSysexListener);
      midiService.addControlChangeListener(midiCCListener);
      midiService.addNoteOnListener(midiNoteOnListener);
      midiService.addNoteOffListener(midiNoteOffListener);
      midiService.addProgramChangeListener(midiProgramChangeListener);
      midiService.addSysexListener(midiSysexListener);
    } else {
      midiService.removeControlChangeListener(midiCCListener);
      midiService.removeNoteOnListener(midiNoteOnListener);
      midiService.removeNoteOffListener(midiNoteOffListener);
      midiService.removeProgramChangeListener(midiProgramChangeListener);
      midiService.removeSysexListener(midiSysexListener);
    }
  });

  // Return cleanup function
  return () => {
    midiService.removeControlChangeListener(midiCCListener);
    midiService.removeNoteOnListener(midiNoteOnListener);
    midiService.removeNoteOffListener(midiNoteOffListener);
    midiService.removeProgramChangeListener(midiProgramChangeListener);
    midiService.removeSysexListener(midiSysexListener);
    midiService.sendControlChange = originalSendControlChange;
    midiService.sendNoteOn = originalSendNoteOn;
    midiService.sendNoteOff = originalSendNoteOff;
    midiService.sendProgramChange = originalSendProgramChange;
    midiService.sendSysexRaw = originalSendSysexRaw;
    stopWatching();
  };
}

// System monitoring
function setupSystemMonitoring() {
  const updateViewport = () => updateSystemInfo();
  
  window.addEventListener('resize', updateViewport);
  window.addEventListener('orientationchange', updateViewport);
  window.addEventListener('online', updateViewport);
  window.addEventListener('offline', updateViewport);

  // Check WebMIDI support
  props.debugData.systemInfo.webMidiSupported = 'requestMIDIAccess' in navigator;

  return () => {
    window.removeEventListener('resize', updateViewport);
    window.removeEventListener('orientationchange', updateViewport);
    window.removeEventListener('online', updateViewport);
    window.removeEventListener('offline', updateViewport);
  };
}

// Lifecycle
let cleanupErrorHandling: (() => void) | null = null;
let cleanupMidiMonitoring: (() => void) | null = null;
let cleanupSystemMonitoring: (() => void) | null = null;

onMounted(() => {
  cleanupErrorHandling = setupErrorHandling();
  cleanupMidiMonitoring = setupMidiMonitoring();
  cleanupSystemMonitoring = setupSystemMonitoring();
  updateSystemInfo();
});

onUnmounted(() => {
  cleanupErrorHandling?.();
  cleanupMidiMonitoring?.();
  cleanupSystemMonitoring?.();
});

// Watch for visibility changes
watch(() => props.isVisible, (visible) => {
  isExpanded.value = visible;
});
</script>

<template>
  <div class="debug-drawer" :class="{ expanded: isExpanded }">
    <!-- Debug Toggle Button -->
    <button 
      class="debug-toggle tecla"
      :aria-expanded="isExpanded"
      aria-controls="debug-panel"
      @click="toggleDrawer"
      :class="{ 
        'has-errors': hasErrors, 
        'has-warnings': hasWarnings && !hasErrors,
        'has-logs': errorCount > 0 || midiCount > 0
      }"
      :title="`Debug Console (${errorCount} errors, ${midiCount} MIDI messages)`"
    >
      <span class="lampara" aria-hidden="true" :class="{
        rojo: hasErrors,
        ambar: hasWarnings && !hasErrors,
        blanco: !hasErrors && !hasWarnings,
        on: hasErrors || hasWarnings || errorCount > 0 || midiCount > 0
      }" />
      <span>Debug</span>
      <span class="debug-badge" v-if="errorCount > 0 || midiCount > 0">
        {{ errorCount + midiCount }}
      </span>
    </button>

    <!-- Debug Panel -->
    <div id="debug-panel" class="debug-panel" v-if="isExpanded">
      <div class="debug-header">
        <h3 class="debug-title t-rotulo">Debug Console</h3>
        <div class="debug-controls">
          <button 
            class="tecla clear-button"
            @click="clearLogs('all')"
            title="Clear all logs"
          >
            Clear All
          </button>
          <button 
            class="tecla close-button"
            @click="toggleDrawer"
            title="Close debug console"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="debug-tabs">
        <button 
          class="debug-tab boton-barra"
          :class="{ activo: activeTab === 'errors' }"
          @click="activeTab = 'errors'"
        >
          Errors
          <span class="tab-badge" v-if="errorCount > 0">{{ errorCount }}</span>
        </button>
        <button 
          class="debug-tab boton-barra"
          :class="{ activo: activeTab === 'midi' }"
          @click="activeTab = 'midi'"
        >
          MIDI
          <span class="tab-badge" v-if="midiCount > 0">{{ midiCount }}</span>
        </button>
        <button
          class="debug-tab boton-barra"
          :class="{ activo: activeTab === 'system' }"
          @click="activeTab = 'system'"
        >
          System
        </button>
        <button
          class="debug-tab boton-barra"
          :class="{ activo: activeTab === 'sysex' }"
          @click="activeTab = 'sysex'"
        >
          SysEx
        </button>
      </div>

      <!-- Tab Content -->
      <div class="debug-content">
        <!-- Errors Tab -->
        <div v-if="activeTab === 'errors'" class="tab-panel">
          <div class="panel-header">
            <h4 class="t-rotulo">Error Logs</h4>
            <button class="tecla clear-button small" @click="clearLogs('errors')">Clear</button>
          </div>
          <div class="log-container">
            <div 
              v-for="log in errorLogs" 
              :key="log.id"
              class="log-entry"
              :class="getLogTypeClass(log.type)"
            >
              <div class="log-header">
                <span class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</span>
                <span class="log-type">{{ log.type.toUpperCase() }}</span>
                <span class="log-source" v-if="log.source">{{ log.source }}</span>
              </div>
              <div class="log-message">{{ log.message }}</div>
              <div class="log-stack" v-if="log.stack">{{ log.stack }}</div>
            </div>
            <div v-if="props.debugData.errorLogs.length === 0" class="no-logs">
              No error logs yet
            </div>
          </div>
        </div>

        <!-- MIDI Tab -->
        <div v-if="activeTab === 'midi'" class="tab-panel">
          <div class="panel-header">
            <h4 class="t-rotulo">MIDI Messages</h4>
            <button class="tecla clear-button small" @click="clearLogs('midi')">Clear</button>
          </div>
          <div class="log-container">
            <div 
              v-for="log in midiLogs" 
              :key="log.id"
              class="log-entry midi-log"
              :class="[
                getMidiDirectionClass(log.direction),
                { 'midi-pc': log.type === 'pc', 'midi-sysex': log.type === 'sysex' },
              ]"
            >
              <div class="log-header">
                <span class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</span>
                <span class="log-direction">{{ log.direction.toUpperCase() }}</span>
                <span class="log-type">{{ log.type.toUpperCase() }}</span>
                <span class="log-channel">{{ log.type === 'sysex' ? 'SYSEX' : `CH${log.channel}` }}</span>
              </div>
              <div class="log-message">{{ log.description }}</div>
              <div class="log-data" v-if="log.data">
                <pre>{{ JSON.stringify(log.data, null, 2) }}</pre>
              </div>
            </div>
            <div v-if="props.debugData.midiLogs.length === 0" class="no-logs">
              No MIDI messages yet
            </div>
          </div>
        </div>

        <!-- System Tab -->
        <div v-if="activeTab === 'system'" class="tab-panel">
          <div class="panel-header">
            <h4 class="t-rotulo">System Information</h4>
            <button class="tecla refresh-button small" @click="updateSystemInfo">Refresh</button>
          </div>
          <div class="system-info">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Platform:</span>
                <span class="info-value">{{ props.debugData.systemInfo.platform }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Language:</span>
                <span class="info-value">{{ props.debugData.systemInfo.language }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Online:</span>
                <span class="info-value" :class="{ online: props.debugData.systemInfo.onLine, offline: !props.debugData.systemInfo.onLine }">
                  {{ props.debugData.systemInfo.onLine ? 'Yes' : 'No' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Screen:</span>
                <span class="info-value">{{ props.debugData.systemInfo.screenResolution }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Viewport:</span>
                <span class="info-value">{{ props.debugData.systemInfo.viewportSize }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Pixel Ratio:</span>
                <span class="info-value">{{ props.debugData.systemInfo.devicePixelRatio }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">WebMIDI:</span>
                <span class="info-value" :class="{ supported: props.debugData.systemInfo.webMidiSupported, unsupported: !props.debugData.systemInfo.webMidiSupported }">
                  {{ props.debugData.systemInfo.webMidiSupported ? 'Supported' : 'Not Supported' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">MIDI Connected:</span>
                <span class="info-value" :class="{ connected: midiConnected, disconnected: !midiConnected }">
                  {{ midiConnected ? 'Yes' : 'No' }}
                </span>
              </div>
            </div>
            <div class="user-agent">
              <span class="info-label">User Agent:</span>
              <div class="info-value">{{ props.debugData.systemInfo.userAgent }}</div>
            </div>
          </div>
        </div>

        <!-- SysEx Tab -->
        <div v-if="activeTab === 'sysex'" class="tab-panel">
          <SysexExplorer />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-drawer {
  position: fixed;
  bottom: 20px;
  right: 20px;
  /* Above Advanced Settings (10000) and platform prompt (1000). */
  z-index: 11000;
  color: var(--serigrafia);
  font: 400 13px/1.5 var(--f-texto);
}

.debug-toggle { position: relative; height: 36px; padding: 0 12px; }
.debug-badge, .tab-badge {
  min-width: 18px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--hundido);
  color: var(--serigrafia);
  font: 500 11px/1.5 var(--f-datos);
  text-align: center;
}
.debug-panel {
  position: absolute;
  bottom: 48px;
  right: 0;
  width: 640px;
  max-width: calc(100vw - 40px);
  max-height: min(76vh, calc(100dvh - 88px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--linea);
  border-radius: 10px;
  background: var(--chasis);
  box-shadow: var(--relieve-4), 0 12px 32px rgba(0, 0, 0, 0.5);
}
.debug-header, .panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--linea);
  background: var(--placa);
}
.debug-title { flex: 1; font-size: 15px; }
.debug-controls { display: flex; gap: 8px; }
.close-button { font-size: 22px; padding: 0; }
.debug-tabs { display: flex; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--linea); }
.debug-tab { display: flex; align-items: center; justify-content: center; gap: 6px; flex: 1; min-width: 0; padding: 0 8px; }
.debug-content, .tab-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.panel-header { background: var(--chasis); padding: 10px 12px; }
.panel-header h4 { flex: 1; }
.log-container { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.log-entry {
  margin-bottom: 8px;
  padding: 10px;
  border: 1px solid var(--linea);
  border-left: 3px solid var(--linea);
  border-radius: 4px;
  background: var(--hundido);
  font: 400 12px/1.6 var(--f-datos);
  overflow-wrap: anywhere;
}
.log-entry.log-error { border-left-color: var(--rojo); }
.log-entry.log-warning { border-left-color: var(--ambar); }
.log-error .log-type { color: var(--rojo); }
.log-warning .log-type { color: var(--ambar); }
.log-header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 5px; }
.log-timestamp, .log-source { color: var(--serigrafia-3); font-size: 11px; }
.log-type, .log-direction, .log-channel { color: var(--serigrafia-2); font-weight: 500; }
.log-direction { border: 1px solid var(--linea); border-radius: 3px; padding: 0 4px; }
.log-message { white-space: pre-wrap; }
.log-stack, .log-data { margin-top: 6px; color: var(--serigrafia-2); white-space: pre-wrap; }
.log-data pre { margin: 0; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.no-logs { padding: 24px 12px; text-align: center; color: var(--serigrafia-3); font: 400 13px/1.5 var(--f-texto); }
.system-info { padding: 12px; overflow: auto; min-height: 0; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.info-label { color: var(--serigrafia-2); font: 600 12px/1.4 var(--f-panel); letter-spacing: 0.12em; text-transform: uppercase; }
.info-value { color: var(--serigrafia); font: 400 12px/1.6 var(--f-datos); overflow-wrap: anywhere; }
.info-value.online, .info-value.supported, .info-value.connected { color: var(--verde); }
.info-value.offline, .info-value.unsupported, .info-value.disconnected { color: var(--serigrafia-3); }
.user-agent { margin-top: 16px; }
.user-agent .info-value { margin-top: 6px; padding: 10px; border-radius: 5px; background: var(--hundido); box-shadow: var(--hueco); }

@media (max-width: 600px) {
  .debug-drawer { bottom: 10px; right: 10px; }
  .debug-panel { max-width: calc(100vw - 20px); max-height: min(80vh, calc(100dvh - 78px)); }
  .debug-tabs { gap: 6px; }
  .debug-tab { letter-spacing: 0.06em; padding: 0 5px; }
  .info-grid { grid-template-columns: 1fr; }
}
@media (hover: none) and (pointer: coarse) {
  .tecla, .boton-barra { min-height: 40px; }
  .debug-panel { bottom: 52px; max-height: calc(100dvh - 82px); }
}
</style>
