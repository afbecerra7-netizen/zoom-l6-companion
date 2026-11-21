<template>
  <div class="grupo sound-pads">
    <h2 class="t-rotulo">{{ t('ui.sound_pads_2') }}</h2>
    <div class="pads">
      <!-- aria-disabled (not `disabled`) so the tooltip still shows on unmapped pads in every browser -->
      <button
        v-for="pad in soundPads"
        :key="pad.id"
        type="button"
        class="tecla pad"
        :aria-disabled="isUnmapped(pad)"
        :title="isUnmapped(pad) ? t('ui.this_pad_is_not_mapped_assign_it_a_midi_note_in_advanced_settings_sound_pads_to_enabl') : undefined"
        @pointerdown="noteOn(pad)"
        @pointerup="noteOff(pad)"
        @pointercancel="noteOff(pad)"
      >
        <span class="pad-id">{{ pad.id }}</span>
        <span class="pad-nota">{{ isUnmapped(pad) ? t('ui.no_note') : midiNoteLabel(pad.note) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../i18n';
import { PAD_NOTE_NOT_MAPPED, midiNoteLabel, type SoundPad } from '../config/midiConfig';
import { midiService } from '../services/midiService';

interface Props {
  soundPads: SoundPad[];
}

const props = defineProps<Props>();

function isUnmapped(pad: { note: number }): boolean {
  return pad.note === PAD_NOTE_NOT_MAPPED;
}

function noteOn(pad: { note: number; channel: number }) {
  if (isUnmapped(pad)) return;
  midiService.sendNoteOn(pad.note, pad.channel, 100);
}

function noteOff(pad: { note: number; channel: number }) {
  if (isUnmapped(pad)) return;
  midiService.sendNoteOff(pad.note, pad.channel, 0);
}
</script>

<style scoped>
.pads { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 6px; }
.pad { flex-direction: column; gap: 3px; height: 44px; }
.pad-id { font-size: 16px; }
.pad-nota { font: 500 10px/1 var(--f-datos); letter-spacing: 0; text-transform: none; color: var(--serigrafia-3); }
</style>
