<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue';
import type { ChannelControls, GlobalControls, SoundPad, MixerType } from '../config/midiConfig';
import { PAD_NOTE_NOT_MAPPED, midiNoteLabel } from '../config/midiConfig';
import { channelControls as defaultChannelControls, globalControls as defaultGlobalControls, soundPads as defaultSoundPads } from '../config/midiConfig';
import { channelControlsL6Max, globalControlsL6Max, soundPadsL6Max } from '../config/midiConfigL6Max';
import DeviceSettingsPanel from './DeviceSettingsPanel.vue';
import DeviceNotice from './DeviceNotice.vue';
import { useDeviceSettings } from '../composables/useDeviceSettings';
import { getParam, type ParamId } from '../midi/sysex/zoomL6/params';
import type { PadFileInfo } from '../midi/sysex/zoomL6/stateSnapshot';

interface Props {
  isVisible: boolean;
  currentChannelControls: ChannelControls[];
  currentGlobalControls: GlobalControls;
  currentSoundPads: SoundPad[];
  currentMixerType: MixerType;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', data: { channelControls: ChannelControls[], globalControls: GlobalControls, soundPads: SoundPad[], mixerType: MixerType }): void;
}>();

// Deep clone the configurations for editing (use current values, not defaults)
const editableChannelControls = reactive<ChannelControls[]>(JSON.parse(JSON.stringify(props.currentChannelControls)));
const editableGlobalControls = reactive<GlobalControls>(JSON.parse(JSON.stringify(props.currentGlobalControls)));
const editableSoundPads = reactive<SoundPad[]>(JSON.parse(JSON.stringify(props.currentSoundPads)));

// Mixer type override (can be set regardless of detection)
const mixerTypeOverride = ref<MixerType>(props.currentMixerType);

// Global MIDI channel setting (initialized from first channel control)
const globalMidiChannel = ref(editableChannelControls[0]?.controls.volume.channel || 1);

// Track if using custom settings
const hasCustomSettings = computed(() => {
  try {
    return localStorage.getItem('zoom-l6-channel-controls') !== null;
  } catch {
    return false;
  }
});

// Track which section is expanded
const expandedSections = reactive({
  channels: false,
  global: false,
  soundPads: false,
  device: false,
});

// Check for duplicate CCs
const hasDuplicateCCs = computed(() => {
  const ccCounts = new Map<number, number>();
  
  // Count CC usage
  editableChannelControls.forEach((channel) => {
    [
      channel.controls.volume.cc,
      channel.controls.pan.cc,
      channel.controls.eq.high.cc,
      channel.controls.eq.mid.cc,
      channel.controls.eq.midFreq.cc,
      channel.controls.eq.low.cc,
      channel.controls.aux1.cc,
      channel.controls.aux2.cc,
      channel.controls.efxSend.cc,
      channel.controls.subMix?.cc,
      channel.controls.mute.cc,
      channel.controls.monoX2?.cc,
      channel.controls.usb12?.cc,
      channel.controls.usb34?.cc,
    ].forEach(cc => {
      if (cc !== undefined && cc >= 0) {
        ccCounts.set(cc, (ccCounts.get(cc) || 0) + 1);
      }
    });
  });
  
  // Add global controls
  [editableGlobalControls.efxType.cc, editableGlobalControls.compressor.cc].forEach(cc => {
    if (cc >= 0) {
      ccCounts.set(cc, (ccCounts.get(cc) || 0) + 1);
    }
  });
  
  // Check if any CC is used more than once
  return Array.from(ccCounts.values()).some(count => count > 1);
});

// Check for duplicate notes
const hasDuplicateNotes = computed(() => {
  const noteCounts = new Map<number, number>();
  editableSoundPads.forEach(pad => {
    if (pad.note >= 0 && pad.note !== PAD_NOTE_NOT_MAPPED) {
      noteCounts.set(pad.note, (noteCounts.get(pad.note) || 0) + 1);
    }
  });
  return Array.from(noteCounts.values()).some(count => count > 1);
});


// ── Sound pads: mixer settings laid out like the official ZOOM L6 Editor ─────────────
// Play mode / level / clock sync are mixer-only settings, written immediately (like the Device
// Settings section). MIDI Note is ONE column kept in sync: it writes the mixer immediately AND
// sets this app's trigger note, which (like everything else here) is persisted on Save. Cancel
// reverts the mixer to the notes it had when the dialog opened; Save also pushes notes changed
// without a mixer write (Reset to Defaults).
const deviceSettings = useDeviceSettings();

type PadField = 'mode' | 'level' | 'note' | 'clockSync';
function padParam(padIndex: number, field: PadField): ParamId {
  return `pad${padIndex + 1}.${field}` as ParamId;
}

function enumLabels(id: ParamId): readonly string[] {
  const enc = getParam(id).encoding;
  return enc.kind === 'enum' ? enc.labels : [];
}

const PAD_MODE_OPTIONS = enumLabels('pad1.mode').map((label, value) => ({ value, label }));
/** Raw level v: 00 = −∞, otherwise v − 49 dB in 1 dB steps (01 = −48 … 31 = 0 … 3B = +10). */
const PAD_LEVEL_OPTIONS = Array.from({ length: 0x3b + 1 }, (_, v) => {
  const db = v - 49;
  const sign = db < 0 ? '−' : db > 0 ? '+' : '';
  return { value: v, label: v === 0 ? '−∞' : `${sign}${Math.abs(db)} dB` };
});
const PAD_NOTE_OPTIONS = [
  { value: PAD_NOTE_NOT_MAPPED, label: midiNoteLabel(PAD_NOTE_NOT_MAPPED) },
  ...Array.from({ length: 128 }, (_, n) => ({ value: n, label: midiNoteLabel(n) })),
];
const PAD_CLOCK_SYNC_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
];

/** MIDI Clock Sync exists only on the L6max (official L6max editor column). */
const showPadClockSync = computed(() => mixerTypeOverride.value === 'l6max');

/** Raw pad level for 0 dB (see PAD_LEVEL_OPTIONS). */
const PAD_LEVEL_0DB = 0x31;

/**
 * Unread mixer values show the first option, matching the other device settings — except Level,
 * which defaults to 0 dB rather than −∞.
 */
function padDeviceValue(padIndex: number, field: PadField): number {
  return deviceSettings.values[padParam(padIndex, field)] ?? (field === 'level' ? PAD_LEVEL_0DB : 0);
}

function padFieldWritable(padIndex: number, field: PadField): boolean {
  return deviceSettings.isWritable(padParam(padIndex, field));
}

function onPadDeviceChange(padIndex: number, field: PadField, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isNaN(value)) return;
  deviceSettings.set(padParam(padIndex, field), value);
}

/** App notes when the dialog opened (Cancel restores the mixer to these). */
let originalPadNotes: number[] = props.currentSoundPads.map((pad) => pad.note);
/** What this dialog session has asked the mixer to hold (assumed to match the app at open). */
let mixerPadNotes: number[] = [...originalPadNotes];

function onPadNoteChange(padIndex: number, event: Event): void {
  const note = Number((event.target as HTMLSelectElement).value);
  const pad = editableSoundPads[padIndex];
  if (Number.isNaN(note) || !pad) return;
  pad.note = note;
  mixerPadNotes[padIndex] = note;
  deviceSettings.set(padParam(padIndex, 'note'), note);
}

// MIDI channel: one control (Device Settings ▸ MIDI) shared by the app and the mixer, same model as
// the pad notes — the mixer is written immediately, all app controls take the channel on Save.
/** App channel when the dialog opened (Cancel restores the mixer to it). */
let originalMidiChannel = globalMidiChannel.value;
/** Channel this dialog session has asked the mixer to use (assumed to match the app at open). */
let mixerMidiChannel = originalMidiChannel;

function onMidiChannelChange(channel: number): void {
  globalMidiChannel.value = channel;
  mixerMidiChannel = channel;
  deviceSettings.set('midiChannel', channel);
}

/**
 * Brings the mixer to the given pad notes and MIDI channel, writing only what differs from what it
 * was last told and waiting for each write to finish.
 */
async function syncMixer(target: { padNotes: number[]; midiChannel: number }): Promise<void> {
  const changedPads = target.padNotes
    .map((note, padIndex) => (note !== mixerPadNotes[padIndex] ? padIndex : -1))
    .filter((padIndex) => padIndex >= 0);
  const channelChanged = target.midiChannel !== mixerMidiChannel;
  if (changedPads.length === 0 && !channelChanged) return;
  // Hold the editor link for the duration so the writes aren't cut off when the dialog closes.
  const release = deviceSettings.acquire();
  try {
    if (channelChanged) {
      await deviceSettings.setNow('midiChannel', target.midiChannel);
      mixerMidiChannel = target.midiChannel;
    }
    for (const padIndex of changedPads) {
      const note = target.padNotes[padIndex]!;
      await deviceSettings.setNow(padParam(padIndex, 'note'), note);
      mixerPadNotes[padIndex] = note;
    }
  } finally {
    release();
  }
}

const padLinkWritable = computed(() => deviceSettings.isWritable('pad1.mode'));

/** The pad's assigned file as last read from the mixer; undefined until read. */
function padFile(padIndex: number): PadFileInfo | undefined {
  // `null` (that pad's read failed) is shown the same as not read yet.
  return deviceSettings.mixerState.padFiles[padIndex] ?? undefined;
}

/** File name, "No file" when unassigned, "—" when not read yet. */
function padFileLabel(padIndex: number): string {
  const file = padFile(padIndex);
  if (!file) return '—';
  if (!file.assigned) return 'No file';
  return file.fileName ?? 'Assigned';
}

const padDeviceError = computed<string | null>(() => {
  const fields: PadField[] = ['mode', 'level', 'note', 'clockSync'];
  for (let padIndex = 0; padIndex < editableSoundPads.length; padIndex++) {
    for (const field of fields) {
      const error = deviceSettings.errors[padParam(padIndex, field)];
      if (error) return `Pad ${padIndex + 1}: ${error}`;
    }
  }
  return null;
});

// Hold the editor link open while the Sound Pads section is showing, so mixer writes go out.
let releasePadLink: (() => void) | null = null;
watch(
  () => props.isVisible && expandedSections.soundPads,
  (active) => {
    if (active && !releasePadLink) {
      releasePadLink = deviceSettings.acquire();
    } else if (!active && releasePadLink) {
      releasePadLink();
      releasePadLink = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  releasePadLink?.();
  releasePadLink = null;
});


// Reset to defaults
function resetToDefaults() {
  if (confirm('Are you sure you want to reset all MIDI mappings to their defaults? This will also clear your saved settings.')) {
    // Use defaults based on selected mixer type
    const defaults = mixerTypeOverride.value === 'l6max' 
      ? {
          channelControls: channelControlsL6Max,
          globalControls: globalControlsL6Max,
          soundPads: soundPadsL6Max
        }
      : {
          channelControls: defaultChannelControls,
          globalControls: defaultGlobalControls,
          soundPads: defaultSoundPads
        };
    
    // Deep clone defaults again
    Object.assign(editableChannelControls, JSON.parse(JSON.stringify(defaults.channelControls)));
    Object.assign(editableGlobalControls, JSON.parse(JSON.stringify(defaults.globalControls)));
    Object.assign(editableSoundPads, JSON.parse(JSON.stringify(defaults.soundPads)));
    
    // Reset global MIDI channel
    globalMidiChannel.value = 1;
    
    // Clear localStorage
    try {
      localStorage.removeItem('zoom-l6-channel-controls');
      localStorage.removeItem('zoom-l6-global-controls');
      localStorage.removeItem('zoom-l6-sound-pads');
      localStorage.removeItem('zoom-l6-mixer-type');
      console.log('✅ Cleared saved settings from localStorage');
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
    }
  }
}

// Save changes
async function saveChanges() {
  // Warn about duplicates
  if (hasDuplicateCCs.value || hasDuplicateNotes.value) {
    const warnings = [];
    if (hasDuplicateCCs.value) warnings.push('duplicate CC assignments');
    if (hasDuplicateNotes.value) warnings.push('duplicate note assignments');
    
    if (!confirm(`Warning: You have ${warnings.join(' and ')}. This may cause unexpected behavior. Save anyway?`)) {
      return;
    }
  }
  
  // Apply global MIDI channel to all controls before saving
  editableChannelControls.forEach(channel => {
    Object.values(channel.controls).forEach(control => {
      if (typeof control === 'object' && 'channel' in control) {
        control.channel = globalMidiChannel.value;
      } else if (control && typeof control === 'object' && 'high' in control) {
        // Handle EQ object
        Object.values(control).forEach(eqControl => {
          if (eqControl && typeof eqControl === 'object' && 'channel' in eqControl) {
            eqControl.channel = globalMidiChannel.value;
          }
        });
      }
    });
  });
  
  editableGlobalControls.efxType.channel = globalMidiChannel.value;
  editableGlobalControls.compressor.channel = globalMidiChannel.value;
  
  editableSoundPads.forEach(pad => {
    pad.channel = globalMidiChannel.value;
  });
  
  emit('save', {
    channelControls: JSON.parse(JSON.stringify(editableChannelControls)),
    globalControls: JSON.parse(JSON.stringify(editableGlobalControls)),
    soundPads: JSON.parse(JSON.stringify(editableSoundPads)),
    mixerType: mixerTypeOverride.value,
  });
  // Notes/channel changed without a mixer write (e.g. Reset to Defaults) reach the mixer on Save.
  await syncMixer({
    padNotes: editableSoundPads.map((pad) => pad.note),
    midiChannel: globalMidiChannel.value,
  });
  // App adopts the mixer's state only after this closes (it defers while the dialog is open).
  emit('close');
}

// Close without saving
async function cancel() {
  if (confirm('Are you sure? Any unsaved changes will be lost.')) {
    // Pad notes / MIDI channel were already sent to the mixer; put them back the way they were.
    await syncMixer({ padNotes: originalPadNotes, midiChannel: originalMidiChannel });
    emit('close');
  }
}

function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section];
}

// Watch for mixer type changes to update defaults if needed
watch(mixerTypeOverride, (newType) => {
  // Optionally reload defaults when mixer type changes
  // User can manually change this or use reset to defaults
});

// Watch for dialog open to reload current settings
watch(() => props.isVisible, (visible) => {
  if (visible) {
    // Reload settings from current props when dialog opens
    Object.assign(editableChannelControls, JSON.parse(JSON.stringify(props.currentChannelControls)));
    Object.assign(editableGlobalControls, JSON.parse(JSON.stringify(props.currentGlobalControls)));
    Object.assign(editableSoundPads, JSON.parse(JSON.stringify(props.currentSoundPads)));
    mixerTypeOverride.value = props.currentMixerType;
    
    // Update MIDI channel from current settings
    globalMidiChannel.value = editableChannelControls[0]?.controls.volume.channel || 1;

    // Snapshot pad notes + MIDI channel for Cancel's mixer revert / Save's mixer sync
    originalPadNotes = props.currentSoundPads.map((pad) => pad.note);
    mixerPadNotes = [...originalPadNotes];
    originalMidiChannel = globalMidiChannel.value;
    mixerMidiChannel = originalMidiChannel;
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="advanced-settings-overlay" @click.self="cancel">
      <div class="advanced-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="advanced-settings-title">
        <div class="dialog-header">
          <h2 id="advanced-settings-title">Advanced Settings</h2>
          <button type="button" class="tecla close-button" @click="cancel" title="Close" aria-label="Close">×</button>
        </div>

        <div class="dialog-content">
          <p class="banner banner--warn">
            <i class="lampara ambar on" aria-hidden="true"></i>
            <span>Changing these settings may cause conflicts. Only modify if you know what you're doing.</span>
          </p>

          <p v-if="hasCustomSettings" class="banner banner--info">
            <i class="lampara blanco on" aria-hidden="true"></i>
            <span>Custom settings loaded from browser storage</span>
          </p>

          <!-- Mixer Type Override -->
          <div class="grupo global-setting">
            <label for="mixer-type" class="t-rotulo">Mixer Type Override</label>
            <select
              id="mixer-type"
              v-model="mixerTypeOverride"
              class="setting-select"
            >
              <option value="l6">L6 (8 channels, 3 scenes)</option>
              <option value="l6max">L6Max (8 channels: 4 mono + 4 stereo, 4 scenes, subMix sends)</option>
            </select>
            <p class="setting-hint">Override the auto-detected mixer type. Changing this will affect available controls.</p>
          </div>

          <!-- Device Settings (SysEx, mass storage, editor link) -->
          <div class="settings-section">
            <h3 class="section-heading">
              <button
                type="button"
                class="section-header"
                :aria-expanded="expandedSections.device"
                @click="toggleSection('device')"
              >
                <span>Device Settings</span>
                <span class="toggle-icon" aria-hidden="true">{{ expandedSections.device ? '▾' : '▸' }}</span>
              </button>
            </h3>

            <div v-if="expandedSections.device" class="section-content">
              <DeviceSettingsPanel
                :expanded="expandedSections.device"
                :mixerType="mixerTypeOverride"
                :midiChannel="globalMidiChannel"
                @update:midiChannel="onMidiChannelChange"
              />
            </div>
          </div>

          <!-- Channel Controls Section -->
          <div class="settings-section">
            <h3 class="section-heading">
              <button
                type="button"
                class="section-header"
                :aria-expanded="expandedSections.channels"
                @click="toggleSection('channels')"
              >
                <span>Channel Controls</span>
                <span class="toggle-icon" aria-hidden="true">{{ expandedSections.channels ? '▾' : '▸' }}</span>
              </button>
            </h3>

            <div v-if="expandedSections.channels" class="section-content section-stack">
              <div v-for="channel in editableChannelControls" :key="channel.channel" class="grupo channel-group">
                <h4 class="t-rotulo">Channel {{ channel.channel }}</h4>

                <div class="controls-grid">
                  <!-- Volume -->
                  <div class="control-row">
                    <label>Volume (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.volume.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- Pan -->
                  <div class="control-row">
                    <label>Pan (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.pan.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- EQ High -->
                  <div class="control-row">
                    <label>EQ High (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.eq.high.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- EQ Mid -->
                  <div class="control-row">
                    <label>EQ Mid (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.eq.mid.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- EQ Mid Freq -->
                  <div class="control-row">
                    <label>EQ Mid Freq (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.eq.midFreq.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- EQ Low -->
                  <div class="control-row">
                    <label>EQ Low (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.eq.low.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- AUX1 -->
                  <div class="control-row">
                    <label>AUX1 (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.aux1.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- AUX2 -->
                  <div class="control-row">
                    <label>AUX2 (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.aux2.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- EFX Send -->
                  <div class="control-row">
                    <label>EFX Send (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.efxSend.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- SUB MIX (if exists) -->
                  <div v-if="channel.controls.subMix" class="control-row">
                    <label>SUB MIX (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.subMix.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- Mute -->
                  <div class="control-row">
                    <label>Mute (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.mute.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- MONO x2 (if exists) -->
                  <div v-if="channel.controls.monoX2" class="control-row">
                    <label>MONO x2 (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.monoX2.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- USB 1/2 (if exists) -->
                  <div v-if="channel.controls.usb12" class="control-row">
                    <label>USB 1/2 (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.usb12.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- USB 3/4 (if exists) -->
                  <div v-if="channel.controls.usb34" class="control-row">
                    <label>USB 3/4 (CC)</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.usb34.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- MIDI Channel -->
                  <div class="control-row highlight">
                    <label>MIDI Channel</label>
                    <input
                      type="number"
                      v-model.number="channel.controls.volume.channel"
                      min="1"
                      max="16"
                      class="cc-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Global Controls Section -->
          <div class="settings-section">
            <h3 class="section-heading">
              <button
                type="button"
                class="section-header"
                :aria-expanded="expandedSections.global"
                @click="toggleSection('global')"
              >
                <span>Global Controls</span>
                <span class="toggle-icon" aria-hidden="true">{{ expandedSections.global ? '▾' : '▸' }}</span>
              </button>
            </h3>

            <div v-if="expandedSections.global" class="section-content">
              <div class="grupo channel-group">
                <div class="controls-grid">
                  <!-- EFX Type -->
                  <div class="control-row">
                    <label>EFX Type (CC)</label>
                    <input
                      type="number"
                      v-model.number="editableGlobalControls.efxType.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>

                  <!-- Compressor -->
                  <div class="control-row">
                    <label>Compressor (CC)</label>
                    <input
                      type="number"
                      v-model.number="editableGlobalControls.compressor.cc"
                      min="0"
                      max="127"
                      class="cc-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sound Pads Section -->
          <div class="settings-section">
            <h3 class="section-heading">
              <button
                type="button"
                class="section-header"
                :aria-expanded="expandedSections.soundPads"
                @click="toggleSection('soundPads')"
              >
                <span>Sound Pads</span>
                <span class="toggle-icon" aria-hidden="true">{{ expandedSections.soundPads ? '▾' : '▸' }}</span>
              </button>
            </h3>

            <div v-if="expandedSections.soundPads" class="section-content section-stack">
              <p class="setting-hint">
                {{ showPadClockSync ? 'Play mode, level and MIDI clock sync' : 'Play mode and level' }} apply to the mixer immediately.
                MIDI Note updates the mixer immediately and this app's pad on Save; Cancel puts the mixer's notes back.
              </p>
              <DeviceNotice
                v-if="!padLinkWritable"
                subtle
                variant="warn"
                text="Editor link isn't open, so pad settings can't be sent to the mixer. Check Device Settings."
              />
              <div class="pad-settings" :class="{ 'pad-settings--clock': showPadClockSync }">
                <div v-for="(pad, padIndex) in editableSoundPads" :key="pad.id" class="pad-settings-row">
                  <div
                    class="pad-settings-badge"
                    :class="{ 'pad-settings-badge--assigned': padFile(padIndex)?.assigned }"
                    :title="padFile(padIndex)?.assigned ? `${pad.name}: ${padFileLabel(padIndex)}` : pad.name"
                  >
                    <i class="lampara blanco" :class="{ on: padFile(padIndex)?.assigned }" aria-hidden="true"></i>
                    <span>{{ pad.id }}</span>
                  </div>

                  <div class="control-row">
                    <label>File</label>
                    <span
                      class="pad-file-name"
                      :class="{ 'pad-file-name--empty': !padFile(padIndex)?.assigned }"
                      :title="padFileLabel(padIndex)"
                    >{{ padFileLabel(padIndex) }}</span>
                  </div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-mode`">Play mode</label>
                    <select
                      :id="`pad-${pad.id}-mode`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'mode')"
                      :value="padDeviceValue(padIndex, 'mode')"
                      @change="onPadDeviceChange(padIndex, 'mode', $event)"
                    >
                      <option v-for="opt in PAD_MODE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-level`">Level</label>
                    <select
                      :id="`pad-${pad.id}-level`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'level')"
                      :value="padDeviceValue(padIndex, 'level')"
                      @change="onPadDeviceChange(padIndex, 'level', $event)"
                    >
                      <option v-for="opt in PAD_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-note`">MIDI Note</label>
                    <select
                      :id="`pad-${pad.id}-note`"
                      class="setting-select"
                      :value="pad.note"
                      @change="onPadNoteChange(padIndex, $event)"
                    >
                      <option v-for="opt in PAD_NOTE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div v-if="showPadClockSync" class="control-row">
                    <label :for="`pad-${pad.id}-clock`">MIDI Clock Sync</label>
                    <select
                      :id="`pad-${pad.id}-clock`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'clockSync')"
                      :value="padDeviceValue(padIndex, 'clockSync')"
                      @change="onPadDeviceChange(padIndex, 'clockSync', $event)"
                    >
                      <option v-for="opt in PAD_CLOCK_SYNC_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                </div>
              </div>
              <DeviceNotice v-if="padDeviceError" subtle variant="error" :text="padDeviceError" />
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button type="button" class="tecla reset-button" @click="resetToDefaults">
            Reset to Defaults
          </button>
          <div class="action-buttons">
            <button type="button" class="tecla cancel-button" @click="cancel">Cancel</button>
            <button type="button" class="tecla save-button" @click="saveChanges">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.advanced-settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  overflow-y: auto;
}

.advanced-settings-dialog {
  background: var(--chasis);
  border: 1px solid var(--linea);
  border-radius: 10px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--serigrafia);
  box-shadow: var(--relieve-1), 0 24px 64px rgba(0, 0, 0, 0.75);
}

.dialog-header {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--hundido);
  box-shadow: 0 1px 0 rgba(255, 244, 226, 0.06);
}

.dialog-header h2 {
  margin: 0;
  font: 800 18px/1 var(--f-panel);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--serigrafia);
}

.close-button {
  width: 30px;
  min-width: 30px;
  height: 30px;
  padding: 0;
  font-size: 18px;
  letter-spacing: 0;
  color: var(--serigrafia-2);
}

.close-button:hover {
  color: var(--serigrafia);
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Que nada se encoja: con una sección abierta, el cuerpo hace scroll en vez de aplastar
   las cabeceras de las demás (las secciones llevan overflow: hidden). */
.dialog-content > * {
  flex-shrink: 0;
}

.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  border-left: 3px solid var(--linea);
  font: 400 13.5px/1.45 var(--f-texto);
  color: var(--serigrafia-2);
}

.banner--warn {
  border-left-color: var(--ambar);
  color: var(--serigrafia);
}

.banner--info {
  border-left-color: var(--serigrafia-3);
}

.global-setting {
  padding: 12px 14px;
}

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

.setting-hint {
  margin: 0;
  font: 400 12.5px/1.45 var(--f-texto);
  color: var(--serigrafia-3);
}

.settings-section {
  border-radius: 8px;
  background: var(--placa);
  box-shadow: var(--relieve-1);
  overflow: hidden;
}

.section-heading {
  margin: 0;
}

.section-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border: 0;
  background: none;
  cursor: pointer;
  user-select: none;
  font: 700 13.5px/1 var(--f-panel);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--serigrafia);
  text-align: left;
  transition: background 0.12s;
}

.section-header:hover {
  background: var(--placa-2);
}

.section-header:focus-visible {
  outline: 2px solid var(--vfd);
  outline-offset: -2px;
}

.toggle-icon {
  font-size: 13px;
  color: var(--serigrafia-2);
}

.section-content {
  padding: 14px;
  background: var(--chasis);
  border-top: 1px solid var(--linea);
}

.section-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.channel-group {
  padding: 12px;
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.control-row.highlight {
  padding-left: 8px;
  border-left: 2px solid var(--serigrafia-2);
}

.control-row label {
  font: 700 11px/1 var(--f-panel);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--serigrafia-2);
}

.cc-input {
  height: 32px;
  width: 100%;
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

/* Sound pads: one row per pad, laid out like the official ZOOM L6 Editor. */
.pad-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pad-settings-row {
  display: grid;
  grid-template-columns: 46px repeat(4, minmax(0, 1fr));
  /* Top-align so every field label shares one line, whatever sits under it. */
  align-items: start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--placa);
  box-shadow: var(--relieve-1);
}

.pad-settings--clock .pad-settings-row {
  grid-template-columns: 46px repeat(5, minmax(0, 1fr));
}

/* Read-only: the file assigned on the mixer (SD card). Same height as the selects. */
.pad-file-name {
  display: block;
  height: 32px;
  padding: 0 8px;
  border-radius: 5px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 500 12.5px/32px var(--f-datos);
  color: var(--serigrafia);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pad-file-name--empty {
  color: var(--inactivo);
  font-style: italic;
}

.pad-settings-row .setting-select {
  min-width: 0;
  width: 100%;
}

.pad-settings-row .setting-select:disabled {
  opacity: 0.45;
  cursor: default;
}

/* Echoes the main-view pad keycaps (SoundPads.vue); white lamp lights when a file is assigned. */
.pad-settings-badge {
  align-self: end;
  width: 46px;
  height: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 6px;
  background: linear-gradient(175deg, #3a3633, #2b2825);
  box-shadow: var(--relieve-3);
  font: 700 16px/1 var(--f-panel);
  color: var(--serigrafia);
}

.pad-settings-badge .lampara {
  width: 7px;
  height: 7px;
}

/* Armoniza DeviceNotice dentro de Sound Pads (sin tocar el componente compartido). */
.advanced-settings-dialog :deep(.device-notice) {
  margin: 0;
  padding: 9px 12px;
  border: 0;
  border-left: 3px solid var(--linea);
  border-radius: 6px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 400 13px/1.45 var(--f-texto);
  color: var(--serigrafia-2);
}

.advanced-settings-dialog :deep(.device-notice--subtle) {
  padding: 0;
  border-left: 0;
  background: none;
  box-shadow: none;
  font: 400 12.5px/1.45 var(--f-texto);
  color: var(--serigrafia-3);
}

.advanced-settings-dialog :deep(.device-notice--subtle.device-notice--warn) {
  color: var(--ambar);
}

.advanced-settings-dialog :deep(.device-notice--subtle.device-notice--error) {
  color: var(--rojo);
}

@media (max-width: 600px) {
  .pad-settings-row,
  .pad-settings--clock .pad-settings-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pad-settings-badge {
    grid-column: 1 / -1;
  }
}

@media (max-width: 480px) {
  .pad-settings-row,
  .pad-settings--clock .pad-settings-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.dialog-footer {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--hundido);
  box-shadow: 0 -1px 0 rgba(255, 244, 226, 0.06);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.reset-button,
.cancel-button,
.save-button {
  height: 34px;
  padding: 0 16px;
}

.reset-button {
  color: var(--rojo);
}

.cancel-button {
  color: var(--serigrafia-2);
}

.save-button {
  color: var(--hundido);
  background: linear-gradient(175deg, #fbf7ee, #ddd6c8);
}

/* Scrollbar styling */
.dialog-content::-webkit-scrollbar {
  width: 8px;
}

.dialog-content::-webkit-scrollbar-track {
  background: var(--hundido);
}

.dialog-content::-webkit-scrollbar-thumb {
  background: var(--placa-2);
  border-radius: 4px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: var(--linea);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .advanced-settings-dialog {
    max-width: 100%;
    margin: 10px;
  }

  .controls-grid {
    grid-template-columns: 1fr;
  }

  .dialog-footer {
    flex-direction: column;
    gap: 10px;
  }

  .action-buttons {
    width: 100%;
  }

  .reset-button,
  .cancel-button,
  .save-button {
    width: 100%;
  }
}
</style>

