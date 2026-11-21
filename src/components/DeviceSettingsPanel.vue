<script setup lang="ts">
import { t, translatedText, errorMessage } from '../i18n';
import { computed, onUnmounted, ref, watch } from 'vue';
import type { MixerType } from '../config/midiConfig';
import { useDeviceSettings, type DeviceLinkState } from '../composables/useDeviceSettings';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import { midiService } from '../services/midiService';
import { runZoomL6FileTransferHandshake } from '../midi/sysex';
import DeviceNotice from './DeviceNotice.vue';
import DeviceParamField from './DeviceParamField.vue';

interface Props {
  expanded: boolean;
  mixerType: MixerType;
  /**
   * The MIDI channel shared by the app and the mixer (owned by AdvancedSettings). The MIDI Channel
   * field shows it and emits changes up instead of writing the mixer itself.
   */
  midiChannel: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:midiChannel', channel: number): void;
}>();

const deviceSettings = useDeviceSettings();

// ── link lifecycle: only hold the editor session open while this panel is expanded ─────────
let releaseLink: (() => void) | null = null;

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) {
      if (!releaseLink) releaseLink = deviceSettings.acquire();
    } else {
      releaseLink?.();
      releaseLink = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  releaseLink?.();
  releaseLink = null;
});

// ── link status line ─────────────────────────────────────────────────────────────
const LINK_LABELS: Record<DeviceLinkState, string> = {
  'no-sysex': 'SysEx not allowed',
  'no-editor-port': 'No Editor port',
  closed: 'Closed',
  opening: 'Opening…',
  open: 'Open',
  stale: 'Stale',
  suspended: 'Suspended',
  error: 'Error',
};

const linkLabel = computed(() => translatedText(LINK_LABELS[deviceSettings.link.value]));
const linkTone = computed<'success' | 'warn' | 'error' | 'idle'>(() => {
  switch (deviceSettings.link.value) {
    case 'open':
      return 'success';
    case 'opening':
    case 'stale':
    case 'suspended':
      return 'warn';
    case 'error':
    case 'no-sysex':
    case 'no-editor-port':
      return 'error';
    default:
      return 'idle';
  }
});

const { linkEnabled } = deviceSettings;

const linkMessage = computed<string | null>(() => {
  if (!deviceSettings.linkEnabled.value) {
    return t('ui.editor_link_is_off_turn_it_on_above_to_change_device_settings');
  }
  switch (deviceSettings.link.value) {
    case 'no-sysex':
      return t('ui.sysex_permission_was_not_granted_reload_and_approve_system_exclusive_access_for_this_');
    case 'no-editor-port':
      return t('ui.no_zoom_editor_midi_port_found_connect_the_mixer_over_usb');
    case 'suspended':
      return t('ui.the_editor_link_is_suspended_usb_file_transfer_reconnect_the_device_to_resume');
    case 'error':
      return deviceSettings.lastError.value ? errorMessage(deviceSettings.lastError.value) : t('ui.the_editor_link_hit_an_error');
    default:
      return null;
  }
});

const linkOpen = computed(() => deviceSettings.link.value === 'open');

// ── visibility helper: hide entries whose registry model list excludes the current mixer ────
function visible(id: ParamId): boolean {
  const def = deviceSettings.entry(id);
  return !!def && def.models.includes(props.mixerType);
}

// ── group id lists ───────────────────────────────────────────────────────────────
const midiIds = computed<ParamId[]>(() =>
  (['midiOutMode', 'mixerControlViaMidi', 'midiChannel'] as ParamId[]).filter(visible),
);
const powerIds = computed<ParamId[]>(() =>
  (['batteryType', 'autoPowerOff'] as ParamId[]).filter(visible),
);
const recorderIds = computed<ParamId[]>(() => (['recorderMode'] as ParamId[]).filter(visible));
const l6MaxIds = computed<ParamId[]>(() =>
  (['monitorPoint', 'subOutPoint', 'usbMixMinus', 'usbAudioMode'] as ParamId[]).filter(visible),
);

interface AuxRow {
  ch: number;
  aux1Id: ParamId | null;
  aux2Id: ParamId | null;
}

const auxRows = computed<AuxRow[]>(() => {
  const rows: AuxRow[] = [];
  for (let ch = 1; ch <= 8; ch++) {
    const aux1Id = `aux1SendPoint.ch${ch}` as ParamId;
    const aux2Id = `aux2SendPoint.ch${ch}` as ParamId;
    const v1 = visible(aux1Id);
    const v2 = visible(aux2Id);
    if (v1 || v2) rows.push({ ch, aux1Id: v1 ? aux1Id : null, aux2Id: v2 ? aux2Id : null });
  }
  return rows;
});

const showL6MaxGroup = computed(() => l6MaxIds.value.length > 0);
const showAuxGroup = computed(() => auxRows.value.length > 0);

// ── re-read the mixer's state snapshot once per expand → link-open transition ─────────
// Device settings are session-command (write-only) params; their values come from the snapshot.
// Opening the link reads one already, so skip a re-read that would only repeat it.
const SNAPSHOT_FRESH_MS = 1000;
let refreshedForThisOpen = false;

watch(
  () => props.expanded,
  (expanded) => {
    if (!expanded) refreshedForThisOpen = false;
  },
);

watch(
  [() => props.expanded, linkOpen],
  ([expanded, open]) => {
    if (expanded && open && !refreshedForThisOpen) {
      refreshedForThisOpen = true;
      const readAt = deviceSettings.mixerState.readAt;
      if (readAt === null || Date.now() - readAt > SNAPSHOT_FRESH_MS) {
        void deviceSettings.refreshState();
      }
    }
  },
  { immediate: true },
);

// ── USB mass storage (file transfer) ─────────────────────────────────────────────
// Moved here from the old "Non-MIDI" section. It runs its own hardware-proven handshake
// (fileTransferMode.ts) rather than the editor session, so it works even with the link off.
const massStorageBusy = ref(false);
const massStorageCooldown = ref(false);
let massStorageCooldownTimer: ReturnType<typeof window.setTimeout> | undefined;

const massStorageNotice = ref<(() => string) | null>(null);
const massStorageNoticeVariant = ref<'success' | 'error'>('success');

const massStorageButtonsLocked = computed(
  () => massStorageBusy.value || massStorageCooldown.value,
);

function startMassStorageCooldown() {
  massStorageCooldown.value = true;
  window.clearTimeout(massStorageCooldownTimer);
  massStorageCooldownTimer = window.setTimeout(() => {
    massStorageCooldown.value = false;
    massStorageCooldownTimer = undefined;
  }, 3000);
}

const midiOutputReady = computed(() => midiService.midiOutputConnected.value);
const midiInputReady = computed(() => midiService.midiInputConnected.value);
const sysexReady = computed(() => midiService.sysexEnabled.value);
/** SysEx can use the Editor output even when Mixer Control is selected for CC. */
const massStorageOutReady = computed(
  () => midiOutputReady.value || midiService.hasZoomEditorSysexOutput(),
);
const massStorageHandshakeWaitReady = computed(
  () =>
    sysexReady.value &&
    (midiInputReady.value || midiService.hasZoomEditorSysexInput()),
);

async function applyMassStorage(enable: boolean) {
  massStorageNotice.value = null;
  if (!massStorageOutReady.value) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value = () =>
      t('ui.no_midi_output_available_for_sysex_connect_mixer_control_or_ensure_a_zoom_editor_outp');
    return;
  }
  if (!sysexReady.value) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value = () =>
      t('ui.system_exclusive_is_not_enabled_reload_the_app_and_allow_sysex_when_the_browser_promp');
    return;
  }
  startMassStorageCooldown();
  massStorageBusy.value = true;
  try {
    // The handshake sends its own identity/editor-open/heartbeat sequence: the session's
    // heartbeat must not run alongside it. USB re-enumeration follows, so it stays suspended
    // until the device reconnects.
    await deviceSettings.suspend();
    const useInboundWait = massStorageHandshakeWaitReady.value;
    await runZoomL6FileTransferHandshake((msg) => midiService.sendSysexRaw(msg), enable, {
      waitForInboundSysex: useInboundWait
        ? (timeoutMs: number) => midiService.waitForSysexOnce(timeoutMs)
        : undefined,
    });
    massStorageNoticeVariant.value = 'success';
    massStorageNotice.value = () => enable
      ? t('ui.command_sent_the_l6_should_appear_as_a_usb_drive_sd_card_access_in_the_host_file_mana')
      : t('ui.command_sent_the_l6_usb_storage_will_disconnect');
  } catch (e) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value = () => errorMessage(e);
    // The handshake failed, so no USB re-enumeration will fire the reconnect watcher that
    // normally clears the suspension. Resume the editor link here or it stays wedged shut.
    await deviceSettings.resume();
  } finally {
    massStorageBusy.value = false;
  }
}

onUnmounted(() => {
  window.clearTimeout(massStorageCooldownTimer);
});
</script>

<template>
  <div class="device-settings-panel">
    <!-- Editor link (SysEx session) -->
    <div class="grupo editor-link">
      <div class="editor-link-row">
        <label class="tecla editor-link-toggle" :class="{ on: linkEnabled }">
          <input type="checkbox" v-model="linkEnabled" class="sr-only" />
          <i class="lampara blanco" aria-hidden="true"></i>
          <span>{{ t('ui.editor_link') }}</span>
        </label>
        <span class="link-status" :class="`link-status--${linkTone}`">
          <i
            class="lampara"
            :class="{
              verde: linkTone === 'success',
              ambar: linkTone === 'warn',
              rojo: linkTone === 'error',
              blanco: linkTone === 'idle',
              on: linkTone !== 'idle',
            }"
            aria-hidden="true"
          ></i>
          <span>
            {{ linkLabel }}
            <template v-if="linkOpen && deviceSettings.firmware.value">
              {{ t('ui.fw') }} {{ deviceSettings.firmware.value }}
            </template>
          </span>
        </span>
      </div>
      <p class="setting-hint">
        {{ t('ui.turn_off_before_launching_the_official_zoom_l6_editor') }}
      </p>
    </div>

    <DeviceNotice
      variant="info"
      subtle
      :text="t('ui.changes_apply_to_the_mixer_immediately_they_are_not_part_of_save')"
    />
    <DeviceNotice v-if="linkMessage" subtle variant="warn" :text="linkMessage" />

    <!-- MIDI -->
    <section v-if="midiIds.length" class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('fixed.MIDI') }}</h4>
      <div class="param-list">
        <DeviceParamField
          v-for="id in midiIds"
          :key="id"
          :param-id="id"
          :model-value="id === 'midiChannel' ? props.midiChannel : undefined"
          @update:model-value="(channel: number) => emit('update:midiChannel', channel)"
        />
      </div>
      <p v-if="midiIds.includes('midiChannel')" class="setting-hint">
        {{ t('ui.midi_channel_is_shared_by_the_app_and_the_mixer_the_mixer_updates_immediately_and_all') }}
      </p>
    </section>

    <!-- Power -->
    <section v-if="powerIds.length" class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.power') }}</h4>
      <div class="param-list">
        <DeviceParamField
          v-for="id in powerIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- Recorder -->
    <section v-if="recorderIds.length" class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.recorder') }}</h4>
      <div class="param-list">
        <DeviceParamField
          v-for="id in recorderIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- System info -->
    <section class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.system_info') }}</h4>
      <div class="param-list">
        <div class="device-param-field--static">
          <div class="device-param-field__label-row">
            <label class="device-param-field__label">{{ t('ui.firmware') }}</label>
          </div>
          <div class="device-param-field__control">
            <span class="device-param-field__value">{{ deviceSettings.firmware.value ?? '--' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- L6max routing / USB -->
    <section v-if="showL6MaxGroup" class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.l6max_routing_usb') }}</h4>
      <div class="param-list">
        <DeviceParamField
          v-for="id in l6MaxIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- AUX send points -->
    <section v-if="showAuxGroup" class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.aux_send_points') }}</h4>
      <div class="param-grid param-grid--2col">
        <template v-for="row in auxRows" :key="row.ch">
          <DeviceParamField
            v-if="row.aux1Id"
            :param-id="row.aux1Id"
            :label="`AUX 1 · ${t('channel', { n: row.ch })}`"
          />
          <div v-else class="param-grid__spacer"></div>
          <DeviceParamField v-if="row.aux2Id" :param-id="row.aux2Id" :label="`AUX 2 · ${t('channel', { n: row.ch })}`" />
          <div v-else class="param-grid__spacer"></div>
        </template>
      </div>
    </section>

    <!-- USB mass storage -->
    <section class="grupo device-settings-group">
      <h4 class="t-rotulo">{{ t('ui.usb_mass_storage') }}</h4>
      <p class="mass-storage-intro">
        {{ t('ui.toggle_usb_file_transfer_sd_card_as_a_drive_the_device_will_disconnect_and_re_enumera') }}
      </p>
      <DeviceNotice v-if="!sysexReady" subtle variant="warn">
        {{ t('ui.sysex_permission_was_not_granted_reload_and_approve_system_exclusive_access_for_this_') }}
      </DeviceNotice>
      <DeviceNotice v-else-if="!massStorageOutReady" subtle variant="info">
        {{ t('ui.connect_a_midi_output_mixer_control_or_ensure_a_zoom_editor_output_appears_in_the_lis') }}
      </DeviceNotice>
      <DeviceNotice
        v-else-if="!massStorageHandshakeWaitReady"
        subtle
        variant="warn"
      >
        {{ t('ui.sysex_replies_won_t_be_waited_on_allow_sysex_and_connect_a_midi_input_or_ensure_an_ed') }}
      </DeviceNotice>
      <div class="mass-storage-actions">
        <button
          type="button"
          class="tecla mass-storage-button mass-storage-button--on"
          :disabled="massStorageButtonsLocked || !massStorageOutReady || !sysexReady"
          @click="applyMassStorage(true)"
        >
          {{ massStorageBusy ? t('ui.sending') : massStorageCooldown ? t('ui.wait') : t('ui.enable_mass_storage') }}
        </button>
        <button
          type="button"
          class="tecla mass-storage-button"
          :disabled="massStorageButtonsLocked || !massStorageOutReady || !sysexReady"
          @click="applyMassStorage(false)"
        >
          {{ massStorageBusy ? t('ui.sending') : massStorageCooldown ? t('ui.wait') : t('ui.disable_mass_storage') }}
        </button>
      </div>
      <DeviceNotice
        v-if="massStorageNotice"
        :variant="massStorageNoticeVariant"
        :text="massStorageNotice()"
      />
    </section>
  </div>
</template>

<style scoped>
.device-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-hint {
  margin: 0;
  font: 400 12.5px/1.45 var(--f-texto);
  color: var(--serigrafia-3);
}

.editor-link {
  padding: 12px;
}

.editor-link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.editor-link-toggle {
  position: relative;
  height: 32px;
  padding: 0 12px;
  user-select: none;
}

.editor-link-toggle:has(input:focus-visible) {
  outline: 2px solid var(--vfd);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.link-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border-radius: 5px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 500 12px/1 var(--f-datos);
  font-variant-numeric: tabular-nums;
  color: var(--serigrafia-2);
  white-space: nowrap;
}

.link-status--success {
  color: var(--serigrafia);
}

.link-status--warn {
  color: var(--ambar);
}

.link-status--error {
  color: var(--rojo);
}

.device-settings-group {
  padding: 12px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-grid {
  display: grid;
  gap: 6px;
}

.param-grid--2col {
  grid-template-columns: 1fr 1fr;
}

.param-grid__spacer {
  visibility: hidden;
}

.device-param-field--static {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--chasis);
  border: 1px solid var(--linea);
}

.device-param-field--static .device-param-field__label {
  font: 700 12px/1.2 var(--f-panel);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--serigrafia-2);
}

.device-param-field--static .device-param-field__value {
  padding: 5px 9px;
  border-radius: 4px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 500 12.5px/1 var(--f-datos);
  font-variant-numeric: tabular-nums;
  color: var(--serigrafia-2);
}

.mass-storage-intro {
  margin: 0;
  font: 400 13px/1.45 var(--f-texto);
  color: var(--serigrafia-2);
}

.mass-storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mass-storage-button {
  height: 32px;
  padding: 0 14px;
}

.mass-storage-button--on {
  color: var(--hundido);
  background: linear-gradient(175deg, #fbf7ee, #ddd6c8);
}

/* DeviceNotice ya trae la gráfica de TAPE 101; aquí solo el margen, que lo da la rejilla. */
.device-settings-panel :deep(.device-notice) {
  margin: 0;
}

@media (max-width: 480px) {
  .param-grid--2col {
    grid-template-columns: 1fr;
  }

  .param-grid__spacer {
    display: none;
  }
}
</style>
