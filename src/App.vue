<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import MidiConnection from './components/MidiConnection.vue';
import ChannelStrip from './components/ChannelStrip.vue';
import GlobalControls from './components/GlobalControls.vue';
import SoundPads from './components/SoundPads.vue';
import SceneControls from './components/SceneControls.vue';
import { ui } from './stores/ui';
import DebugDrawer from './components/DebugDrawer.vue';
import AdvancedSettings from './components/AdvancedSettings.vue';
import { channelControls as defaultChannelControls, globalControls as defaultGlobalControls, soundPads as defaultSoundPads, detectMixerType, type MixerType } from './config/midiConfig';
import { channelControlsL6Max, globalControlsL6Max, soundPadsL6Max } from './config/midiConfigL6Max';
import type { ChannelControls, GlobalControls as GlobalControlsType, MIDIControl, SoundPad } from './config/midiConfig';
import { applyMixerCcMap } from './config/ccMapping';
import { midiService } from './services/midiService';
import { useDeviceSettings } from './composables/useDeviceSettings';
import type { ParamId } from './midi/sysex/zoomL6/params';

// Platform detection
function detectPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports a desktop Mac user agent by default; touch support gives an iPad away.
  const isIPadDesktopUA = /macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
  const isIOS = /iphone|ipad|ipod/.test(userAgent) || isIPadDesktopUA;
  // iPhone/iPad user agents also contain "Mac OS X", so exclude them from the Mac check.
  const isMac = /macintosh|mac os x/.test(userAgent) && !isIOS;
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  // What actually matters is whether the browser provides the Web MIDI API. Browsers such as the
  // MIDIWeb Browser app do on Apple devices, so the warnings below only show when it's missing.
  const hasWebMidi = typeof navigator.requestMIDIAccess === 'function';

  return {
    isMac,
    isIOS,
    isSafari,
    hasWebMidi,
    isSafariMac: isMac && isSafari,
    isIOSDevice: isIOS
  };
}

// Platform-specific prompts
const platformInfo = ref(detectPlatform());
const showPlatformPrompt = ref(false);
/** This page's address, shown in the iOS prompt so users can open it inside MIDIWeb Browser. */
const appHost = window.location.host;

// Reactive state
const midiConnected = ref(false);
const mixerType = ref<MixerType>('l6');
const appSettings = reactive({
  showAdvanced: false,
  compactMode: false,
});
const showDebugDrawer = ref(false);
const debugDrawerExpanded = ref(true); // Start with panel open by default
const showAdvancedSettings = ref(false);
// Con el mezclador conectado, el panel de conexión se abre desde la lámpara de estado.
const showConexion = ref(false);
watch(midiConnected, (conectado) => {
  if (conectado) showConexion.value = false;
});

// MIDI configuration state (can be overridden by advanced settings)
const channelControls = ref<ChannelControls[]>(JSON.parse(JSON.stringify(defaultChannelControls)));
const globalControls = ref<GlobalControlsType>(JSON.parse(JSON.stringify(defaultGlobalControls)));
const soundPads = ref<SoundPad[]>(JSON.parse(JSON.stringify(defaultSoundPads)));

// Function to load config based on mixer type
function loadConfigForMixerType(type: MixerType) {
  if (type === 'l6max') {
    channelControls.value = JSON.parse(JSON.stringify(channelControlsL6Max));
    globalControls.value = JSON.parse(JSON.stringify(globalControlsL6Max));
    soundPads.value = JSON.parse(JSON.stringify(soundPadsL6Max));
  } else {
    channelControls.value = JSON.parse(JSON.stringify(defaultChannelControls));
    globalControls.value = JSON.parse(JSON.stringify(defaultGlobalControls));
    soundPads.value = JSON.parse(JSON.stringify(defaultSoundPads));
  }
}

// Debug data storage (persists between toggles)
const debugData = reactive({
  errorLogs: [] as any[],
  midiLogs: [] as any[],
  activeTab: 'errors' as 'errors' | 'midi' | 'system' | 'sysex',
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
});

// SysEx device settings (editor session) — keep the mixer type in sync
const deviceSettings = useDeviceSettings();
deviceSettings.mixerType.value = mixerType.value;
watch(mixerType, (type) => {
  deviceSettings.mixerType.value = type;
});

// Refs to channel components for resetting and LFO control
type ChannelStripInstance = InstanceType<typeof ChannelStrip> | null;
const channelRefs = ref<ChannelStripInstance[]>([]);

// Event handlers
function onMidiConnectionChanged(connected: boolean) {
  midiConnected.value = connected;
  if (connected) {
    console.log('MIDI connected successfully');
    
    // Check if there's a saved mixer type override first
    const savedMixerType = localStorage.getItem('zoom-l6-mixer-type') as MixerType | null;
    
    if (!savedMixerType || (savedMixerType !== 'l6' && savedMixerType !== 'l6max')) {
      // No override found, detect from device name
      const deviceName = midiService.inputName || midiService.outputName || '';
      const detectedType = detectMixerType(deviceName);
      if (detectedType !== mixerType.value) {
        mixerType.value = detectedType;
        loadConfigForMixerType(detectedType);
        console.log(`Mixer type detected: ${detectedType}`);
      }
    } else {
      // Use saved override
      if (savedMixerType !== mixerType.value) {
        mixerType.value = savedMixerType;
        loadConfigForMixerType(savedMixerType);
        console.log(`Mixer type using saved override: ${savedMixerType}`);
      }
    }
    
    // Re-attach after hotplug without duplicating callbacks
    if (globalMidiListener) {
      midiService.removeControlChangeListener(globalMidiListener);
      midiService.addControlChangeListener(globalMidiListener);
    }
  } else {
    console.log('MIDI disconnected');
    // Close the SysEx editor session (heartbeats would keep firing at a dead port)
    deviceSettings.close();
    // Remove global MIDI listener when disconnected
    if (globalMidiListener) {
      midiService.removeControlChangeListener(globalMidiListener);
    }
  }
}

function onChannelControlChange(channel: number, control: string, value: number) {
  console.log(`Channel ${channel} - ${control}: ${value}`);
}

function onGlobalControlChange(section: string, control: string, value: number) {
  console.log(`Global ${section} - ${control}: ${value}`);
}

function onSceneChanged(scene: any) {
  console.log(`Scene changed to: ${scene.name} (Program ${scene.program})`);
  // Additional scene change handling can be added here if needed
}

function resetAllChannels() {
  // Call resetToDefaults on each ChannelStrip instance
  channelRefs.value.forEach((instance) => {
    instance?.resetToDefaults?.();
  });
}

function savePreset() {
  console.log('Saving current preset');
  // Implementation for saving presets
}

function loadPreset() {
  console.log('Loading preset');
  // Implementation for loading presets
}

// Computed property to check if there are any active LFOs globally
const hasGlobalActiveLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveLfos;
  });
});

const hasGlobalPausedLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveOrPausedLfos && !channelStrip.hasActiveLfos;
  });
});

const hasGlobalActiveOrPausedLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveOrPausedLfos;
  });
});

const globalLfoButtonText = computed(() => {
  if (!hasGlobalActiveOrPausedLfos.value) return 'No LFOs';
  if (hasGlobalActiveLfos.value) return 'Pause LFOs';
  return 'Resume LFOs';
});

function pauseResumeAllGlobalLfos() {
  // If there are any active LFOs globally, pause ALL active ones across all channels
  // Otherwise, resume ALL paused ones across all channels
  // This ensures consistent behavior and prevents mixed-state issues
  if (hasGlobalActiveLfos.value) {
    // Pause all active LFOs
    channelRefs.value.forEach((channelStrip) => {
      if (channelStrip) {
        channelStrip.pauseAllLfos?.();
      }
    });
  } else {
    // Resume all paused LFOs
    channelRefs.value.forEach((channelStrip) => {
      if (channelStrip) {
        channelStrip.resumeAllLfos?.();
      }
    });
  }
}

async function toggleDebugDrawer() {
  if (!showDebugDrawer.value) {
    // Show the debugger and restore its previous state
    showDebugDrawer.value = true;
    // Wait for the component to be mounted, then restore the panel state
    await nextTick();
    // Trigger reactivity by setting the value again
    const currentState = debugDrawerExpanded.value;
    debugDrawerExpanded.value = !currentState;
    await nextTick();
    debugDrawerExpanded.value = currentState;
  } else {
    // Hide the entire debugger (state is preserved)
    showDebugDrawer.value = false;
  }
}

function onDebugDrawerToggle() {
  debugDrawerExpanded.value = !debugDrawerExpanded.value;
}

function toggleAdvancedSettings() {
  showAdvancedSettings.value = !showAdvancedSettings.value;
}

/**
 * Saves the current CC/note configuration to localStorage (no UI). `mixerTypeOverride` is only
 * passed by the Advanced Settings Save: persisting it turns off device-name detection.
 */
function persistConfig(mixerTypeOverride?: MixerType): boolean {
  try {
    localStorage.setItem('zoom-l6-channel-controls', JSON.stringify(channelControls.value));
    localStorage.setItem('zoom-l6-global-controls', JSON.stringify(globalControls.value));
    localStorage.setItem('zoom-l6-sound-pads', JSON.stringify(soundPads.value));
    if (mixerTypeOverride) {
      localStorage.setItem('zoom-l6-mixer-type', mixerTypeOverride);
    }
    return true;
  } catch (e) {
    console.error('❌ Failed to save settings to localStorage:', e);
    return false;
  }
}

function handleAdvancedSettingsSave(data: { channelControls: ChannelControls[], globalControls: GlobalControlsType, soundPads: SoundPad[], mixerType: MixerType }) {
  // Update the mixer type if provided
  if (data.mixerType && data.mixerType !== mixerType.value) {
    mixerType.value = data.mixerType;
    console.log(`Mixer type updated to: ${data.mixerType}`);
  }
  
  // Update the configuration (these may be custom or defaults for the selected mixer type)
  channelControls.value = data.channelControls;
  globalControls.value = data.globalControls;
  soundPads.value = data.soundPads;
  
  // Save to localStorage for persistence
  if (persistConfig(data.mixerType)) {
    console.log('✅ Advanced settings saved to localStorage');
    alert('✅ Settings saved successfully!');
  } else {
    alert('❌ Failed to save settings. Please check browser storage permissions.');
  }
}

// ── Adopt the mixer's shared settings (MIDI channel, pad notes, CC# map) ─────────────────
// The mixer's values win: whenever a state snapshot is read (link open, Device Settings opened,
// scene recall), anything that differs from this app's config is copied in and saved.
const mixerNotice = ref<string | null>(null);
let mixerNoticeTimer: ReturnType<typeof window.setTimeout> | undefined;
const MIXER_NOTICE_MS = 4000;

function showMixerNotice(text: string): void {
  mixerNotice.value = text;
  window.clearTimeout(mixerNoticeTimer);
  mixerNoticeTimer = window.setTimeout(() => {
    mixerNotice.value = null;
    mixerNoticeTimer = undefined;
  }, MIXER_NOTICE_MS);
}

/** Every MIDI control of the config (channel strips incl. their EQ group, plus the globals). */
function allControls(channels: ChannelControls[], globals: GlobalControlsType): MIDIControl[] {
  const out: MIDIControl[] = [];
  for (const strip of channels) {
    for (const control of Object.values(strip.controls)) {
      if (!control) continue;
      if ('cc' in control) out.push(control);
      else out.push(...Object.values(control));
    }
  }
  out.push(globals.efxType, globals.compressor);
  return out;
}

/**
 * Copies the mixer's shared settings into the app config. `mixerState.values` already omits any
 * setting the app was writing at read time (see useDeviceSettings), so no extra guard is needed.
 *
 * Deferred while Advanced Settings is open: the dialog writes pad notes / the MIDI channel to the
 * mixer immediately but only commits them to the app on Save (and reverts the mixer on Cancel), so a
 * snapshot taken mid-edit must not be adopted. On close the mixer is re-read and adopted then.
 */
function adoptMixerState(): void {
  const state = deviceSettings.mixerState;
  if (state.readAt === null || showAdvancedSettings.value) return;

  // Work on plain copies: the refs hold reactive proxies, which structuredClone can't copy.
  let channels: ChannelControls[] = JSON.parse(JSON.stringify(channelControls.value));
  let globals: GlobalControlsType = JSON.parse(JSON.stringify(globalControls.value));
  const pads: SoundPad[] = JSON.parse(JSON.stringify(soundPads.value));
  const adopted: string[] = [];

  // CC map: only from a verified table whose layout matches the config's mixer type.
  if (state.ccMap && state.ccMapVerified && state.layout !== null && state.layout === mixerType.value) {
    const result = applyMixerCcMap(state.ccMap, state.layout, channels, globals);
    if (result.changed) {
      channels = result.channelControls;
      globals = result.globalControls;
      adopted.push('CC map');
    }
  }

  // MIDI channel (applies to every control and pad, as Advanced Settings' Save does).
  const channel = state.values.midiChannel;
  if (channel !== undefined) {
    let changed = false;
    for (const control of allControls(channels, globals)) {
      if (control.channel !== channel) {
        control.channel = channel;
        changed = true;
      }
    }
    for (const pad of pads) {
      if (pad.channel !== channel) {
        pad.channel = channel;
        changed = true;
      }
    }
    if (changed) adopted.push('MIDI channel');
  }

  // Pad notes.
  let padsChanged = false;
  pads.forEach((pad, padIndex) => {
    const id = `pad${padIndex + 1}.note` as ParamId;
    const note = state.values[id];
    // A Not Mapped pad decodes as PAD_NOTE_NOT_MAPPED (the snapshot's per-pad flag), so this
    // adopts both directions: a pad unmapped on the mixer, and one newly mapped there.
    if (note === undefined || pad.note === note) return;
    pad.note = note;
    padsChanged = true;
  });
  if (padsChanged) adopted.push('pad notes');

  if (adopted.length === 0) return;
  channelControls.value = channels;
  globalControls.value = globals;
  soundPads.value = pads;
  persistConfig();
  console.log(`Adopted from the mixer: ${adopted.join(', ')}`);
  showMixerNotice(`Loaded settings from the mixer (${adopted.join(', ')})`);
}

watch(() => deviceSettings.mixerState.readAt, adoptMixerState);

// After Advanced Settings closes (Save, or Cancel once it has reverted the mixer), re-read the mixer
// so adoption works from its current state rather than a snapshot taken mid-edit.
watch(showAdvancedSettings, (open) => {
  if (!open) void deviceSettings.refreshState();
});

// Global MIDI input handler for debugging and monitoring
let globalMidiListener: ((cc: number, value: number, channel: number) => void) | null = null;

onMounted(() => {
  // Set up global MIDI input monitoring
  globalMidiListener = (cc, value, channel) => {
    console.log(`[App] Global MIDI received: CC${cc} = ${value} on channel ${channel}`);
  };
  
  // Check for platform-specific prompts. Re-detect now rather than at setup, so a browser that
  // installs the Web MIDI API during page load (e.g. MIDIWeb Browser) is counted as supported.
  platformInfo.value = detectPlatform();
  if (!platformInfo.value.hasWebMidi && (platformInfo.value.isSafariMac || platformInfo.value.isIOSDevice)) {
    showPlatformPrompt.value = true;
  }
  
  // Load saved settings from localStorage if available
  try {
    // Load mixer type override first
    const savedMixerType = localStorage.getItem('zoom-l6-mixer-type') as MixerType | null;
    if (savedMixerType && (savedMixerType === 'l6' || savedMixerType === 'l6max')) {
      mixerType.value = savedMixerType;
      loadConfigForMixerType(savedMixerType);
      console.log(`Loaded mixer type from localStorage: ${savedMixerType}`);
    }
    
    const savedChannelControls = localStorage.getItem('zoom-l6-channel-controls');
    const savedGlobalControls = localStorage.getItem('zoom-l6-global-controls');
    const savedSoundPads = localStorage.getItem('zoom-l6-sound-pads');
    
    if (savedChannelControls) {
      channelControls.value = JSON.parse(savedChannelControls);
      console.log('Loaded channel controls from localStorage');
    }
    if (savedGlobalControls) {
      globalControls.value = JSON.parse(savedGlobalControls);
      console.log('Loaded global controls from localStorage');
    }
    if (savedSoundPads) {
      soundPads.value = JSON.parse(savedSoundPads);
      console.log('Loaded sound pads from localStorage');
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }
  
  // The listener will be added when MIDI connects via onMidiConnectionChanged
});

onUnmounted(() => {
  window.clearTimeout(mixerNoticeTimer);
  if (globalMidiListener) {
    midiService.removeControlChangeListener(globalMidiListener);
    globalMidiListener = null;
  }
});
</script>

<template>
  <div id="app">
    <!-- La consola ocupa la ventana entera; si la ventana es menor que el lienzo base se encoge
         completa (assets/tape101.css). Nunca hay scroll. -->
    <div class="consola-escala" :style="{ '--canales': channelControls.length }">
      <header class="barra">
        <div class="placa-nombre">
          <b>ZOOM {{ mixerType === 'l6max' ? 'L6max' : 'L6' }}</b>
          <span>MEZCLADOR · {{ channelControls.length }} CANALES</span>
        </div>

        <button
          type="button"
          class="estado"
          :title="midiConnected ? 'Ver la conexión MIDI' : 'El mezclador no está conectado'"
          :aria-expanded="showConexion"
          @click="showConexion = !showConexion"
        >
          <i class="lampara verde" :class="{ on: midiConnected }"></i>
          <span>{{ midiConnected ? 'CONECTADA' : 'SIN CONEXIÓN' }}</span>
        </button>

        <SceneControls v-if="midiConnected" class="barra-escenas" :mixerType="mixerType" @sceneChanged="onSceneChanged" />

        <div class="barra-fin">
          <button
            v-if="hasGlobalActiveOrPausedLfos"
            type="button"
            class="boton-barra"
            @click="pauseResumeAllGlobalLfos"
          >
            {{ hasGlobalActiveLfos ? 'Pausar LFO' : 'Reanudar LFO' }}
          </button>
          <button
            type="button"
            class="boton-barra"
            :class="{ activo: ui.modulacion }"
            :aria-pressed="ui.modulacion"
            title="Mostrar los LFO de cada control"
            @click="ui.modulacion = !ui.modulacion"
          >
            Modulación
          </button>
          <button type="button" class="boton-barra" :class="{ activo: showAdvancedSettings }" @click="toggleAdvancedSettings">
            Ajustes
          </button>
          <button type="button" class="boton-barra" :class="{ activo: showDebugDrawer }" @click="toggleDebugDrawer">
            Debug
          </button>
        </div>
      </header>

      <!-- Conexión MIDI: a la vista sin mezclador; con él, se abre desde la lámpara de estado -->
      <div v-show="!midiConnected || showConexion" class="panel-conexion" :class="{ flotante: midiConnected }">
        <MidiConnection @connectionChanged="onMidiConnectionChanged" />
      </div>

      <main v-if="midiConnected" class="consola">
        <section class="tiras" aria-label="Canales">
          <ChannelStrip
            v-for="channel in channelControls"
            :key="channel.channel"
            :channelData="channel"
            :mixerType="mixerType"
            ref="channelRefs"
            @controlChange="onChannelControlChange"
            @resetAll="resetAllChannels"
          />
        </section>

        <aside class="lateral">
          <GlobalControls
            :globalData="globalControls"
            :mixerType="mixerType"
            @controlChange="onGlobalControlChange"
            @sceneChanged="onSceneChanged"
          />
          <SoundPads :soundPads="soundPads" />
        </aside>
      </main>

      <main v-else class="sin-conexion">
        <div class="aviso">
          <h2>Conecta la Zoom L6 o L6max</h2>
          <ol>
            <li>Conecta el mezclador al Mac por USB y enciéndelo.</li>
            <li>Pulsa «Auto-Connect Zoom», o elige en los dos menús el puerto «Mixer Control». Por ese puerto van niveles, EQ, paneos, mutes, sound pads y escenas.</li>
            <li>El puerto «Editor» no hay que elegirlo: la app lo detecta sola y lo usa para los parámetros de efecto y los ajustes del aparato.</li>
          </ol>
          <p class="aviso-pie">
            Basada en <a href="https://github.com/philmillman/zoom-l6-companion" target="_blank" rel="noopener noreferrer">Zoom L6 Companion</a>
            de philmillman (MIT). No está afiliada a Zoom Corp.
          </p>
        </div>
      </main>
    </div>

    <!-- Platform-specific prompts -->
    <div v-if="showPlatformPrompt" class="platform-prompt-overlay">
      <div class="platform-prompt">
        <!-- Safari macOS prompt -->
        <div v-if="platformInfo.isSafariMac" class="platform-notice safari-mac">
          <div class="notice-header">
            <h3>🔌 Jazz Plugin Required for Safari</h3>
            <button @click="showPlatformPrompt = false" class="close-button">×</button>
          </div>
          <div class="notice-content">
            <p>Safari requires the Jazz Plugin to access MIDI devices. Please install it to use this app:</p>
            <ol>
              <li>Download the Jazz Plugin from <a href="https://jazz-soft.net/download/Jazz-Plugin/" target="_blank">jazz-soft.net</a></li>
              <li>Run the installer and follow the setup instructions</li>
              <li>Restart Safari after installation</li>
              <li>Reload this page</li>
            </ol>
            <div class="notice-actions">
              <a href="https://jazz-soft.net/download/Jazz-Plugin/" target="_blank" class="download-button">
                Download Jazz Plugin
              </a>
              <button @click="showPlatformPrompt = false" class="skip-button">
                Skip for now
              </button>
            </div>
          </div>
        </div>

        <!-- iOS / iPadOS prompt (only shown when the browser lacks the Web MIDI API) -->
        <div v-if="platformInfo.isIOSDevice" class="platform-notice ios">
          <div class="notice-header">
            <h3>📱 Use MIDIWeb Browser on iPhone &amp; iPad</h3>
            <button @click="showPlatformPrompt = false" class="close-button">×</button>
          </div>
          <div class="notice-content">
            <p>Safari on iPhone and iPad doesn't support the Web MIDI API, so it can't control your Zoom L6.</p>
            <div class="ios-info">
              <p>Install the free <strong>MIDIWeb Browser</strong> app, which adds Web MIDI on Apple devices:</p>
              <ol>
                <li>Get MIDIWeb Browser from the App Store</li>
                <li>Open it and find <strong>Zoom L6 Companion</strong> in its MIDIWeb Hub directory, or go to <strong>{{ appHost }}</strong></li>
                <li>Connect your Zoom L6 over USB and allow MIDI access when asked</li>
              </ol>
            </div>
            <div class="notice-actions">
              <a href="https://apps.apple.com/us/app/midiweb-browser/id6757226617" target="_blank" rel="noopener" class="download-button">
                Get MIDIWeb Browser
              </a>
              <button @click="showPlatformPrompt = false" class="continue-button">
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Debug Drawer -->
    <DebugDrawer 
      v-if="showDebugDrawer"
      :isVisible="debugDrawerExpanded"
      :debugData="debugData"
      @toggle="onDebugDrawerToggle"
    />
    
    <!-- Brief notice when settings were adopted from the mixer -->
    <Transition name="mixer-notice">
      <div v-if="mixerNotice" class="mixer-notice" role="status" aria-live="polite">
        {{ mixerNotice }}
      </div>
    </Transition>

    <!-- Advanced Settings Dialog -->
    <AdvancedSettings 
      :isVisible="showAdvancedSettings"
      :currentChannelControls="channelControls"
      :currentGlobalControls="globalControls"
      :currentSoundPads="soundPads"
      :currentMixerType="mixerType"
      @close="showAdvancedSettings = false"
      @save="handleAdvancedSettingsSave"
    />
  </div>
</template>

<style>
/* Reinicio global que ya traía la app: los paneles de ajustes y depuración cuentan con él. */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ---------------------------------------------------------------- consola sin scroll
   Por debajo del lienzo base (1400 × 720) la consola se encoge entera. La escala la calcula el
   CSS: tan(atan2(a, b)) da el cociente a/b sin unidades. En la maqueta, hacerlo con el evento
   resize o con un ResizeObserver dejaba la escala atrás al achicar la ventana. */
.consola-escala {
  --escala: min(1, tan(atan2(var(--ventana-ancho), 1400px)), tan(atan2(var(--ventana-alto), 720px)));
  position: relative; width: calc(100vw / var(--escala)); height: calc(100vh / var(--escala));
  transform: scale(var(--escala)); transform-origin: 0 0;
  display: flex; flex-direction: column; user-select: none;
}

/* barra */
.barra { height: 54px; flex: none; display: flex; align-items: center; gap: 22px; padding: 0 14px; background: var(--hundido); box-shadow: 0 1px 0 rgba(255, 244, 226, 0.06); }
.placa-nombre { display: flex; flex-direction: column; gap: 3px; }
.placa-nombre b { font: 800 19px/1 var(--f-panel); letter-spacing: 0.14em; }
.placa-nombre span { font: 600 10.5px/1 var(--f-panel); letter-spacing: 0.16em; color: var(--serigrafia-3); }
.estado { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border: 0; border-radius: 6px; background: none; cursor: pointer; font: 500 12px/1 var(--f-datos); color: var(--serigrafia-2); }
.estado:hover, .estado[aria-expanded="true"] { background: var(--placa); }
.estado:focus-visible { outline: 2px solid var(--vfd); outline-offset: 2px; }
.barra-escenas { margin-left: auto; }
.barra-fin { display: flex; gap: 8px; margin-left: auto; }
.barra-escenas + .barra-fin { margin-left: 0; }

/* consola */
.consola { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 204px; gap: 10px; padding: 10px; }
.tiras { display: grid; grid-template-columns: repeat(var(--canales, 8), minmax(0, 1fr)); gap: 8px; min-height: 0; }
.lateral { display: flex; flex-direction: column; gap: 10px; min-height: 0; }

/* conexión */
.panel-conexion { align-self: center; width: 620px; margin-top: 22px; }
.panel-conexion.flotante { position: absolute; left: 14px; top: 60px; z-index: 30; margin-top: 0; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.65); border-radius: 10px; }
.sin-conexion { flex: 1; min-height: 0; display: flex; justify-content: center; padding: 18px 10px; }
.aviso { width: 620px; }
.aviso h2 { margin-bottom: 12px; font: 700 21px/1.1 var(--f-panel); letter-spacing: 0.1em; text-transform: uppercase; color: var(--serigrafia); }
.aviso ol { padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font: 400 14.5px/1.45 var(--f-texto); color: var(--serigrafia-2); }
.aviso-pie { margin-top: 18px; font: 400 12px/1.4 var(--f-texto); color: var(--serigrafia-3); }
.aviso-pie a { padding: 0; color: var(--serigrafia-2); text-decoration: underline; }

/* Mixer state notice */
.mixer-notice {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 10001;
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  background: #1e1e1e;
  border: 1px solid #4a90e2;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 13px;
  text-align: center;
  pointer-events: none;
}

.mixer-notice-enter-active,
.mixer-notice-leave-active {
  transition: opacity 0.2s ease;
}

.mixer-notice-enter-from,
.mixer-notice-leave-to {
  opacity: 0;
}

/* Platform Prompt Styles */
.platform-prompt-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.platform-prompt {
  max-width: 500px;
  width: 100%;
}

.platform-notice {
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #333;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  border-bottom: 1px solid #333;
}

.notice-header h3 {
  color: #4a90e2;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.notice-content {
  padding: 24px;
}

.notice-content p {
  color: #ccc;
  margin-bottom: 16px;
  line-height: 1.5;
}

.notice-content ol {
  color: #aaa;
  margin: 16px 0;
  padding-left: 20px;
}

.notice-content li {
  margin-bottom: 8px;
  line-height: 1.4;
}

.notice-content a {
  color: #4a90e2;
  text-decoration: none;
}

.notice-content a:hover {
  text-decoration: underline;
}

.ios-info {
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ios-info p {
  margin-bottom: 12px;
}

.ios-info ul {
  color: #aaa;
  margin: 12px 0;
  padding-left: 20px;
}

.ios-info li {
  margin-bottom: 6px;
}

.notice-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: center;
}

.download-button,
.skip-button,
.continue-button {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

.download-button {
  background: #4a90e2 !important;
  color: white !important;
}

.download-button:hover {
  background: #3a7bc8 !important;
  color: white !important;
  transform: translateY(-2px);
}

.skip-button {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.skip-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.continue-button {
  background: #4caf50;
  color: white;
}

.continue-button:hover {
  background: #45a049;
  transform: translateY(-2px);
}

/* Safari Mac specific styling */
.platform-notice.safari-mac .notice-header {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}

.platform-notice.safari-mac .notice-header h3 {
  color: white;
}

/* iOS specific styling */
.platform-notice.ios .notice-header {
  background: linear-gradient(135deg, #4a90e2 0%, #3a7bc8 100%);
}

.platform-notice.ios .notice-header h3 {
  color: white;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .platform-prompt-overlay {
    padding: 10px;
  }
  
  .notice-header {
    padding: 16px 20px;
  }
  
  .notice-header h3 {
    font-size: 16px;
  }
  
  .notice-content {
    padding: 20px;
  }
  
  .notice-actions {
    flex-direction: column;
  }
  
  .download-button,
  .skip-button,
  .continue-button {
    width: 100%;
  }
}
</style>
