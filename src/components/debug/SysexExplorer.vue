<script lang="ts">
import { ref } from 'vue';

/**
 * Module-scope (not component-scope) so the "Open" reservation on the shared editor session
 * survives the Debug drawer's `v-if` unmount/remount — otherwise closing and reopening the
 * drawer would leak a `useDeviceSettings().acquire()` reservation. `sessionHeld` is the reactive
 * flag the template reads; `releaseSession` is the plain closure it calls.
 */
let releaseSession: (() => void) | null = null;
const sessionHeld = ref(false);
</script>

<script setup lang="ts">
import { t, translatedText, errorMessage, diagnosticText, payloadField, language } from '../../i18n';
import { computed, onBeforeUnmount, watch } from 'vue';
import { sysexExplorerStore, type SweepRow } from '../../stores/sysexExplorerStore';
import { editorSession } from '../../services/editorSessionService';
import { useDeviceSettings } from '../../composables/useDeviceSettings';
import { bytesToHex, hexToBytes, findParamByAddress } from '../../midi/sysex';
import { snapshotLayoutFor } from '../../midi/sysex/zoomL6/stateSnapshot';
import type { ParamSnapshot } from '../../midi/sysex';

const device = useDeviceSettings();

// ── session status / open / close ─────────────────────────────────────────────
const sessionState = computed(() => editorSession.state.value);
const isOpen = computed(() => sessionState.value === 'open');

const stateLabel: Record<string, string> = {
  closed: 'Closed',
  opening: 'Opening…',
  open: 'Open',
  stale: 'Stale',
  error: 'Error',
};

const statePillClass = computed(() => {
  switch (sessionState.value) {
    case 'open':
      return 'pill-ok';
    case 'opening':
    case 'stale':
      return 'pill-warn';
    case 'error':
      return 'pill-error';
    default:
      return 'pill-neutral';
  }
});

/** Why the session can't be opened right now, or `null` if it can. Mirrors the link-readiness
 * checks in `useDeviceSettings` (not exported from there, so restated here for the explorer). */
const blockedReason = computed<string | null>(() => {
  if (!device.linkEnabled.value) return t('editorDisabled');
  switch (device.link.value) {
    case 'no-sysex':
      return errorMessage('System Exclusive is not enabled. Reload the app and allow SysEx when prompted.');
    case 'no-editor-port':
      return t('ui.no_zoom_editor_midi_port_found_connect_the_mixer_over_usb');
    case 'suspended':
      return t('editorSuspended');
    default:
      return null;
  }
});

const opening = ref(false);
const openError = ref<(() => string) | null>(null);

async function openSession(): Promise<void> {
  if (releaseSession || opening.value) return;
  // Respect the same link-readiness gate the composable uses. Opening while the link is
  // suspended (mass storage in progress) would race the file-transfer handshake on the wire.
  if (blockedReason.value) {
    openError.value = () => blockedReason.value ?? t('editorClosed');
    return;
  }
  openError.value = null;
  opening.value = true;
  releaseSession = device.acquire();
  sessionHeld.value = true;
  try {
    await editorSession.open();
  } catch (e) {
    openError.value = () => errorMessage(e);
    // Release so "Open" is clickable again immediately, instead of forcing an explicit Close first.
    closeSession();
  } finally {
    opening.value = false;
  }
}

function closeSession(): void {
  releaseSession?.();
  releaseSession = null;
  sessionHeld.value = false;
}

// If the session is torn down elsewhere (MIDI disconnect, mass-storage suspend both call
// deviceSettings.close(), which bypasses the ref count), drop our stale reservation so the
// "Open" button becomes usable again instead of pointing at a dead session.
watch(sessionState, (state) => {
  if (sessionHeld.value && (state === 'closed' || state === 'error') && !opening.value) {
    closeSession();
  }
});

// ── snapshot re-read / layout ──────────────────────────────────────────────────
/** Live session's snapshot (editor-open reply payload); `payload[0]` is the layout byte. */
const livePayload = computed(() => editorSession.info.value?.editorState.payload ?? null);

const layoutLabel = computed<string | null>(() => {
  const payload = livePayload.value;
  if (!payload || payload.length === 0) return null;
  const id = snapshotLayoutFor(payload)?.id;
  const name = id === undefined ? t('unknown') : id;
  const pretty = name.toLowerCase() === 'l6max' ? 'L6max' : name.toLowerCase() === 'l6' ? 'L6' : name;
  return t('layout', { name: pretty, byte: `0x${payload[0]!.toString(16).padStart(2, '0')}`, count: payload.length });
});

const rereadConfirmed = ref(false);
let rereadConfirmTimer: ReturnType<typeof setTimeout> | null = null;

async function rereadSnapshot(): Promise<void> {
  rereadConfirmed.value = false;
  await sysexExplorerStore.refreshSnapshot();
  if (sysexExplorerStore.reread.error) return;
  rereadConfirmed.value = true;
  if (rereadConfirmTimer) clearTimeout(rereadConfirmTimer);
  rereadConfirmTimer = setTimeout(() => {
    rereadConfirmed.value = false;
  }, 2500);
}

onBeforeUnmount(() => {
  if (rereadConfirmTimer) clearTimeout(rereadConfirmTimer);
});

// ── raw hex send ───────────────────────────────────────────────────────────────
const rawHexError = ref<(() => string) | null>(null);

function sendRawHex(): void {
  rawHexError.value = null;
  try {
    const bytes = hexToBytes(sysexExplorerStore.rawHex);
    if (bytes.length < 2 || bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7) {
      rawHexError.value = () => t('hexError');
      return;
    }
    editorSession.sendRaw(bytes);
  } catch (e) {
    rawHexError.value = () => errorMessage(e);
  }
}

// ── sweep results ────────────────────────────────────────────────────────────
const copiedKey = ref<string | null>(null);

async function copyRegistryEntry(row: SweepRow): Promise<void> {
  const text = sysexExplorerStore.registryEntryFor(row);
  const key = `${row.group}:${row.index}`;
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 1500);
  } catch {
    // Clipboard API unavailable/denied: nothing more we can do from here.
  }
}

function sweepRowHex(row: SweepRow): string {
  return row.values ? bytesToHex(row.values) : '—';
}

// ── set ───────────────────────────────────────────────────────────────────────
const setConfirmed = ref(false);

const setAddressKnown = computed(() =>
  findParamByAddress({
    scheme: 'param',
    group: sysexExplorerStore.setForm.group,
    index: sysexExplorerStore.setForm.index,
  }),
);

function runSetParam(): void {
  void sysexExplorerStore.setParam(setConfirmed.value);
}

// ── snapshots & diff ────────────────────────────────────────────────────────────
const snapshotLabel = ref('');

function takeSnapshot(): void {
  sysexExplorerStore.takeSnapshot(snapshotLabel.value || t('snapshotName', { time: new Date().toLocaleTimeString(language.value === 'es' ? 'es-CO' : 'en-US') }));
  snapshotLabel.value = '';
}

const diffA = ref('');
const diffB = ref('');

function runDiff(): void {
  if (!diffA.value || !diffB.value) return;
  sysexExplorerStore.runDiff(diffA.value, diffB.value);
}

function snapshotLabelFor(id: string): string {
  const s = sysexExplorerStore.snapshots.find((snap: ParamSnapshot) => snap.id === id);
  return s ? s.label : id;
}

function bytesOrDash(bytes: number[] | null): string {
  return bytes ? bytesToHex(bytes) : '—';
}

// ── export / import ───────────────────────────────────────────────────────────
function exportJson(): void {
  const json = sysexExplorerStore.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sysex-explorer-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const importError = ref<(() => string) | null>(null);

async function onImportFile(event: Event): Promise<void> {
  importError.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    sysexExplorerStore.importJson(text);
  } catch (e) {
    importError.value = () => errorMessage(e);
  } finally {
    input.value = '';
  }
}

// ── message log ────────────────────────────────────────────────────────────────
const visibleMessageLog = computed(() => sysexExplorerStore.messageLog.slice(0, 50));

function formatLogTime(at: number): string {
  return new Date(at).toLocaleTimeString(language.value === 'es' ? 'es-CO' : 'en-US', { hour12: false });
}
</script>

<template>
  <div class="sysex-explorer">
    <div class="notice notice-warn">
      {{ t('ui.quit_zoom_l6_editor_before_opening_a_session_midi_monitor_spying_is_fine') }}
    </div>

    <!-- Session status -->
    <section class="sysex-section grupo">
      <div class="section-row session-row">
        <span class="pill" :class="statePillClass">
          <span class="lampara" aria-hidden="true" :class="{
            verde: sessionState === 'open',
            ambar: sessionState === 'opening' || sessionState === 'stale',
            rojo: sessionState === 'error',
            blanco: sessionState === 'closed',
            on: sessionState !== 'closed'
          }" />
          {{ translatedText(stateLabel[sessionState] ?? sessionState) }}
        </span>
        <span class="info-piece" v-if="device.firmware.value">{{ t('ui.fw_2') }} {{ device.firmware.value }}</span>
        <span class="info-piece">{{ t('ui.hb_misses') }} {{ device.heartbeatMisses.value }}</span>
        <span class="info-piece" v-if="isOpen && layoutLabel">{{ layoutLabel }}</span>
        <div class="spacer" />
        <button class="tecla btn" :disabled="sessionHeld || opening" @click="openSession">
          {{ opening ? t('ui.opening') : t('ui.open') }}
        </button>
        <button class="tecla btn" :disabled="!sessionHeld" @click="closeSession">
          {{ t('ui.close') }}
        </button>
        <button class="tecla btn" :disabled="!isOpen || sysexExplorerStore.reread.busy" @click="rereadSnapshot">
          {{ sysexExplorerStore.reread.busy ? t('ui.re_reading') : t('ui.re_read_snapshot') }}
        </button>
      </div>
      <div class="hint hint-ok" v-if="rereadConfirmed">{{ t('ui.snapshot_re_read') }}<template v-if="layoutLabel"> — {{ layoutLabel }}</template></div>
      <div class="hint hint-error" v-if="sysexExplorerStore.reread.error">{{ errorMessage(sysexExplorerStore.reread.error) }}</div>
      <div class="hint hint-warn" v-if="blockedReason && !isOpen">{{ blockedReason }}</div>
      <div class="hint hint-error" v-if="openError">{{ openError() }}</div>
      <div class="hint hint-error" v-if="device.lastError.value">{{ errorMessage(device.lastError.value) }}</div>
    </section>

    <!-- Raw hex send -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.raw_sysex') }}</h4>
      <textarea
        v-model="sysexExplorerStore.rawHex"
        class="mono-input textarea"
        rows="2"
        :placeholder="t('fixed.F0_52_00_00_46_00_00_F7')"
        :disabled="!isOpen"
      />
      <div class="section-row">
        <button class="tecla btn" :disabled="!isOpen" @click="sendRawHex">{{ t('ui.send') }}</button>
        <span class="hint hint-error" v-if="rawHexError">{{ rawHexError() }}</span>
      </div>
    </section>

    <!-- Get single -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.get_param') }}</h4>
      <div class="section-row wrap">
        <label class="field">
          {{ t('ui.group') }}
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.single.group" :disabled="!isOpen" />
        </label>
        <label class="field">
          {{ t('ui.index') }}
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.single.index" :disabled="!isOpen" />
        </label>
        <button class="tecla btn" :disabled="!isOpen || sysexExplorerStore.single.busy" @click="sysexExplorerStore.getSingle()">
          {{ sysexExplorerStore.single.busy ? t('ui.reading') : t('ui.get') }}
        </button>
      </div>
      <div class="mono-output" v-if="sysexExplorerStore.single.result">
        {{ bytesToHex(sysexExplorerStore.single.result) }}
      </div>
      <div class="hint hint-error" v-if="sysexExplorerStore.single.error">{{ errorMessage(sysexExplorerStore.single.error) }}</div>
    </section>

    <!-- Sweep -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.sweep_get_only') }}</h4>
      <div class="section-row wrap">
        <label class="field">
          {{ t('ui.group_from') }}
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.sweep.groupFrom" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          {{ t('ui.group_to') }}
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.sweep.groupTo" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          {{ t('ui.index_from') }}
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.sweep.indexFrom" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          {{ t('ui.index_to') }}
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.sweep.indexTo" :disabled="sysexExplorerStore.sweep.running" />
        </label>
      </div>
      <div class="section-row wrap">
        <label class="field">
          {{ t('ui.interval_ms') }}
          <input type="number" min="0" v-model.number="sysexExplorerStore.sweep.intervalMs" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          {{ t('ui.timeout_ms') }}
          <input type="number" min="1" v-model.number="sysexExplorerStore.sweep.timeoutMs" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <button class="tecla btn" :disabled="!isOpen || sysexExplorerStore.sweep.running" @click="sysexExplorerStore.runSweep()">{{ t('ui.run') }}</button>
        <button class="tecla btn btn-danger" :disabled="!sysexExplorerStore.sweep.running" @click="sysexExplorerStore.abortSweep()">{{ t('ui.abort') }}</button>
      </div>
      <div class="hint hint-warn" v-if="sysexExplorerStore.sweep.needsConfirm">
        {{ t('ui.that_range_is_a_large_number_of_requests') }} <button class="link-btn" @click="sysexExplorerStore.runSweep(true)">{{ t('ui.confirm_run_anyway') }}</button>
      </div>
      <div class="hint hint-error" v-if="sysexExplorerStore.sweep.error">{{ errorMessage(sysexExplorerStore.sweep.error) }}</div>
      <div class="hint" v-if="sysexExplorerStore.sweep.running || sysexExplorerStore.sweep.progress.total > 0">
        {{ sysexExplorerStore.sweep.progress.done }} / {{ sysexExplorerStore.sweep.progress.total }}
      </div>
      <div class="table-scroll" v-if="sysexExplorerStore.sweep.rows.length > 0">
        <table class="mono-table">
          <thead>
            <tr>
              <th>{{ t('ui.group') }}</th>
              <th>{{ t('ui.index') }}</th>
              <th>{{ t('ui.width') }}</th>
              <th>{{ t('ui.values') }}</th>
              <th>{{ t('ui.latency') }}</th>
              <th>{{ t('ui.registry') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sysexExplorerStore.sweep.rows" :key="`${row.group}:${row.index}`" :class="`row-${row.status}`">
              <td>{{ row.group }}</td>
              <td>{{ row.index }}</td>
              <td>{{ row.values ? row.values.length : '—' }}</td>
              <td class="mono">{{ row.status === 'ok' ? sweepRowHex(row) : translatedText(row.status) }}</td>
              <td>{{ row.latencyMs }} {{ t('fixed.ms') }}</td>
              <td>{{ row.registryId ?? '—' }}</td>
              <td>
                <button class="link-btn" v-if="row.values" @click="copyRegistryEntry(row)">
                  {{ copiedKey === `${row.group}:${row.index}` ? t('ui.copied') : t('ui.copy_as_registry_entry') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Set -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.set_param') }}</h4>
      <div class="section-row wrap">
        <label class="field">
          {{ t('ui.group') }}
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.setForm.group" :disabled="!isOpen" />
        </label>
        <label class="field">
          {{ t('ui.index') }}
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.setForm.index" :disabled="!isOpen" />
        </label>
        <label class="field field-grow">
          {{ t('ui.values_hex') }}
          <input type="text" class="mono-input" v-model="sysexExplorerStore.setForm.valuesHex" placeholder="00 01" :disabled="!isOpen" />
        </label>
      </div>
      <label class="checkbox-row" v-if="!setAddressKnown">
        <input type="checkbox" v-model="setConfirmed" />
        {{ t('ui.i_understand_this_address_is_not_in_the_registry') }}
      </label>
      <div class="section-row">
        <button class="tecla btn btn-danger" :disabled="!isOpen || (!setAddressKnown && !setConfirmed)" @click="runSetParam">{{ t('ui.set') }}</button>
      </div>
      <div class="hint" v-if="sysexExplorerStore.setForm.result">{{ diagnosticText(sysexExplorerStore.setForm.result) }}</div>
    </section>

    <!-- Snapshots & diff -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.snapshots') }}</h4>
      <details class="workflow-hint">
        <summary>{{ t('ui.how_to_find_a_setting_s_byte') }}</summary>
        <p>
          {{ t('ui.to_find_a_setting_s_byte_take_snapshot_change_one_setting_in_device_settings_or_sound') }}
        </p>
      </details>
      <div class="section-row wrap">
        <input type="text" class="mono-input field-grow" v-model="snapshotLabel" :placeholder="t('ui.label')" />
        <button class="tecla btn" @click="takeSnapshot">{{ t('ui.take_snapshot') }}</button>
      </div>
      <ul class="snapshot-list" v-if="sysexExplorerStore.snapshots.length > 0">
        <li v-for="snap in sysexExplorerStore.snapshots" :key="snap.id">
          {{ snap.label }} — {{ Object.keys(snap.params).length }} {{ t('ui.params') }} {{ new Date(snap.takenAt).toLocaleTimeString() }}
        </li>
      </ul>
      <div class="section-row wrap" v-if="sysexExplorerStore.snapshots.length > 1">
        <label class="field field-grow">
          {{ t('fixed.A') }}
          <select v-model="diffA">
            <option value="" disabled>{{ t('ui.choose') }}</option>
            <option v-for="snap in sysexExplorerStore.snapshots" :key="snap.id" :value="snap.id">{{ snap.label }}</option>
          </select>
        </label>
        <label class="field field-grow">
          {{ t('fixed.B') }}
          <select v-model="diffB">
            <option value="" disabled>{{ t('ui.choose') }}</option>
            <option v-for="snap in sysexExplorerStore.snapshots" :key="snap.id" :value="snap.id">{{ snap.label }}</option>
          </select>
        </label>
        <button class="tecla btn" :disabled="!diffA || !diffB" @click="runDiff">{{ t('ui.diff') }}</button>
      </div>
      <div v-if="sysexExplorerStore.diff">
        <p class="hint">
          {{ snapshotLabelFor(sysexExplorerStore.diff.aId) }} → {{ snapshotLabelFor(sysexExplorerStore.diff.bId) }}
          {{ t('ui.layout') }} {{ sysexExplorerStore.diff.layoutId }}
        </p>
        <div class="table-scroll" v-if="sysexExplorerStore.diff.result.params.length > 0">
          <table class="mono-table">
            <thead>
              <tr><th>{{ t('ui.group_index') }}</th><th>{{ t('ui.before') }}</th><th>{{ t('ui.after') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in sysexExplorerStore.diff.result.params" :key="entry.key">
                <td>{{ entry.key }}</td>
                <td class="mono">{{ bytesOrDash(entry.before) }}</td>
                <td class="mono">{{ bytesOrDash(entry.after) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-scroll" v-if="sysexExplorerStore.diff.result.payload.length > 0">
          <table class="mono-table">
            <thead>
              <tr><th>{{ t('ui.payload_offset') }}</th><th>{{ t('ui.field') }}</th><th>{{ t('ui.before') }}</th><th>{{ t('ui.after') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in sysexExplorerStore.diff.payload" :key="entry.offset">
                <td>{{ entry.offset }}</td>
                <td :class="{ 'field-unknown': entry.kind === 'unknown' }">
                  {{ payloadField(entry.field) }}
                  <span class="tag-unverified" v-if="entry.verified === false">{{ t('ui.unverified') }}</span>
                </td>
                <td class="mono">{{ entry.before ?? '—' }}</td>
                <td class="mono">{{ entry.after ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="hint" v-if="sysexExplorerStore.diff.result.params.length === 0 && sysexExplorerStore.diff.result.payload.length === 0">
          {{ t('ui.no_differences') }}
        </div>
      </div>
    </section>

    <!-- Export / import -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.export_import') }}</h4>
      <div class="section-row wrap">
        <button class="tecla btn" @click="exportJson">{{ t('ui.export_json') }}</button>
        <input type="file" accept="application/json" @change="onImportFile" />
      </div>
      <div class="hint hint-error" v-if="importError">{{ importError() }}</div>
    </section>

    <!-- Notes -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.notes') }}</h4>
      <textarea v-model="sysexExplorerStore.notes" class="textarea" rows="3" :placeholder="t('ui.reverse_engineering_notes')" />
    </section>

    <!-- Inbound message log -->
    <section class="sysex-section grupo">
      <h4 class="t-rotulo">{{ t('ui.inbound_messages') }}</h4>
      <div class="log-container">
        <div v-for="(entry, i) in visibleMessageLog" :key="i" class="log-entry">
          <span class="log-timestamp">{{ formatLogTime(entry.at) }}</span>
          <span class="log-message">{{ diagnosticText(entry.description) }}</span>
          <span class="log-hex">{{ entry.hex }}</span>
        </div>
        <div v-if="visibleMessageLog.length === 0" class="no-logs">{{ t('ui.no_inbound_messages_yet') }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sysex-explorer { padding: 12px; min-height: 0; overflow-y: auto; color: var(--serigrafia); font: 400 13px/1.5 var(--f-texto); }
.notice { margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--linea); border-left: 3px solid var(--ambar); border-radius: 5px; color: var(--serigrafia-2); background: var(--hundido); }
.sysex-section { margin-bottom: 12px; min-width: 0; }
.sysex-section:last-child { margin-bottom: 0; }
.sysex-section h4 { margin-bottom: 3px; }
.section-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.section-row.wrap, .session-row { flex-wrap: wrap; }
.spacer { flex: 1 1 auto; }
.field { display: flex; flex-direction: column; gap: 5px; color: var(--serigrafia-2); font: 600 12px/1.3 var(--f-panel); letter-spacing: 0.08em; }
.field-grow { flex: 1 1 140px; min-width: 0; }
input[type='number'], input[type='text'], select, .textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--linea);
  border-radius: 5px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  color: var(--serigrafia);
  font: 400 12px/1.5 var(--f-datos);
  letter-spacing: normal;
}
input[type='number'] { width: 80px; }
.textarea { resize: vertical; }
input::placeholder, .textarea::placeholder { color: var(--serigrafia-3); opacity: 1; }
input:disabled, select:disabled, .textarea:disabled { opacity: 0.45; }
input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible, .link-btn:focus-visible { outline: 2px solid var(--vfd); outline-offset: 2px; }
input[type='checkbox'] { accent-color: var(--vfd); }
.mono-input, .mono, .mono-output { font-family: var(--f-datos); }
.mono-output { padding: 8px 10px; border-radius: 5px; background: var(--hundido); box-shadow: var(--hueco); color: var(--vfd); overflow-wrap: anywhere; }
.checkbox-row { display: flex; align-items: center; gap: 8px; color: var(--ambar); }
.btn { flex-shrink: 0; white-space: nowrap; }
/* Actions stay unlit; red and amber are reserved for reported errors and warnings. */
.btn:hover:not(:disabled) { color: var(--blanco); }
.link-btn { padding: 3px 0; border: 0; background: none; color: var(--serigrafia); font: 500 12px/1.5 var(--f-texto); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--hundido); box-shadow: var(--hueco); border-radius: 5px; font: 600 12px/1 var(--f-panel); letter-spacing: 0.1em; text-transform: uppercase; }
.info-piece { color: var(--serigrafia-2); font: 400 11px/1.5 var(--f-datos); overflow-wrap: anywhere; }
.hint { color: var(--serigrafia-2); font: 400 12px/1.5 var(--f-datos); overflow-wrap: anywhere; }
.hint-warn, .field-unknown, .tag-unverified, .row-timeout td { color: var(--ambar); }
.hint-error, .row-error td { color: var(--rojo); }
.hint-ok { color: var(--verde); }
.workflow-hint { color: var(--serigrafia-2); }
.workflow-hint summary { cursor: pointer; color: var(--serigrafia); }
.workflow-hint p { margin: 6px 0 0; }
.tag-unverified { margin-left: 4px; padding: 1px 4px; border: 1px solid var(--ambar-off); border-radius: 3px; font-size: 11px; }
.table-scroll { max-width: 100%; overflow-x: auto; border-radius: 5px; background: var(--hundido); box-shadow: var(--hueco); }
.mono-table { border-collapse: collapse; width: 100%; font: 400 12px/1.6 var(--f-datos); }
.mono-table th, .mono-table td { padding: 7px 8px; border-bottom: 1px solid var(--linea); text-align: left; white-space: nowrap; }
.mono-table th { color: var(--serigrafia-2); font: 600 12px/1.4 var(--f-panel); letter-spacing: 0.1em; text-transform: uppercase; }
.snapshot-list { list-style: none; margin: 0; padding: 0; font: 400 12px/1.6 var(--f-datos); }
.snapshot-list li { padding: 6px 0; border-bottom: 1px solid var(--linea); overflow-wrap: anywhere; }
input[type='file'] { min-width: 0; max-width: 100%; color: var(--serigrafia-2); font: 400 12px/1.5 var(--f-texto); }
input[type='file']::file-selector-button { margin-right: 8px; padding: 8px; border: 1px solid var(--linea); border-radius: 5px; background: var(--placa-2); color: var(--serigrafia); font: 600 12px/1 var(--f-panel); cursor: pointer; }
.log-container { max-height: 240px; overflow-y: auto; padding: 8px; border-radius: 5px; background: var(--hundido); box-shadow: var(--hueco); }
.log-entry { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 8px 0; border-bottom: 1px solid var(--linea); font: 400 12px/1.6 var(--f-datos); }
.log-timestamp { color: var(--serigrafia-3); flex: 0 0 auto; }
.log-message { overflow-wrap: anywhere; }
.log-hex { flex-basis: 100%; color: var(--vfd); overflow-wrap: anywhere; }
.no-logs { padding: 12px; text-align: center; color: var(--serigrafia-3); }

@media (max-width: 480px) {
  .field { flex: 1 1 40%; min-width: 0; }
  input[type='number'] { width: 100%; }
  .section-row { flex-wrap: wrap; }
}
@media (hover: none) and (pointer: coarse) {
  .btn, .link-btn, input:not([type='checkbox']), select { min-height: 40px; }
}
</style>
