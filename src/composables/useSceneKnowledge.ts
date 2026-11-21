import { computed, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue';
import type { MIDIControl } from '../config/midiConfig';

// Session-only UI knowledge. Retaining an old value never makes it a scene readback.
const revision = ref(0);
const knownAt = reactive<Record<string, number>>({});
const scene = ref<string | null>(null);

export function recallScene(id: string): void {
  scene.value = id;
  revision.value += 1;
}

/**
 * The mixer itself reported this value after the last recall (a verified snapshot slot), so it is
 * known again. Only for registry params: channel CCs are never read back from the mixer.
 */
export function markKnownFromMixer(key: string): void {
  knownAt[key] = revision.value;
}

export function ccKnowledgeKey(control: MIDIControl): string {
  return `cc:${control.channel}:${control.cc}`;
}

export function isSceneParam(id: string): boolean {
  return id.startsWith('fx.') || /^aux[12]SendPoint\.ch\d+$/.test(id);
}

export function useSceneKnowledge(key: MaybeRefOrGetter<string>) {
  const known = computed(() => revision.value === 0 || knownAt[toValue(key)] === revision.value);
  function markKnown(): void {
    knownAt[toValue(key)] = revision.value;
  }
  return { known, markKnown, revision, scene };
}
