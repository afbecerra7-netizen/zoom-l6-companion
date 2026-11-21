import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { createRenderer, h, nextTick, ref, type Component } from 'vue';

// No WebMIDI initialization or real ports: exercise actual components against these spies.
vi.mock('../../services/midiService', async () => {
  const { ref } = await import('vue');
  const programListeners = new Set<(program: number, channel: number) => void>();
  const ccListeners = new Set<(cc: number, value: number, channel: number) => void>();
  return { midiService: {
    isConnected: true,
    connectionState: ref(true), midiInputConnected: ref(true),
    editorPortsAvailable: ref(true), sysexEnabled: ref(true),
    sendControlChange: vi.fn(), sendProgramChange: vi.fn(),
    addProgramChangeListener: (fn: (program: number, channel: number) => void) => programListeners.add(fn),
    removeProgramChangeListener: (fn: (program: number, channel: number) => void) => programListeners.delete(fn),
    addControlChangeListener: (fn: (cc: number, value: number, channel: number) => void) => ccListeners.add(fn),
    removeControlChangeListener: (fn: (cc: number, value: number, channel: number) => void) => ccListeners.delete(fn),
    receiveProgram: (program: number, channel: number) => programListeners.forEach(fn => fn(program, channel)),
    receiveCC: (cc: number, value: number, channel: number) => ccListeners.forEach(fn => fn(cc, value, channel)),
  } };
});
vi.mock('../../services/editorSessionService', async () => {
  const { ref } = await import('vue');
  return { editorSession: {
    state: ref('open'), info: ref(null), lastError: ref(null), heartbeatMisses: ref(0),
    onMessage: vi.fn(), open: vi.fn().mockResolvedValue(undefined), close: vi.fn(),
    getValue: vi.fn(), setValue: vi.fn().mockResolvedValue(undefined),
    refreshState: vi.fn().mockResolvedValue(undefined), readPadFiles: vi.fn(),
  } };
});

import EffectParams from '../EffectParams.vue';
import LFOControl from '../LFOControl.vue';
import TapeLabel from '../TapeLabel.vue';
import DeviceNotice from '../DeviceNotice.vue';
import SceneControls from '../SceneControls.vue';
import MidiControl from '../MidiControl.vue';
import ChannelStrip from '../ChannelStrip.vue';
import GlobalControls from '../GlobalControls.vue';
import ParamKnob from '../ParamKnob.vue';
import DeviceParamField from '../DeviceParamField.vue';
import { midiService } from '../../services/midiService';
import { editorSession } from '../../services/editorSessionService';
import { channelControlsL6Max, globalControlsL6Max, sceneControlsL6Max } from '../../config/midiConfigL6Max';
import { channelControls, globalControls, sceneControls } from '../../config/midiConfig';
import { firstPayload } from '../../midi/sysex/zoomL6/__tests__/captureFixtures';
import { decodeSnapshot } from '../../midi/sysex/zoomL6/stateSnapshot';
import { recallScene, useSceneKnowledge, ccKnowledgeKey } from '../../composables/useSceneKnowledge';
import { useDeviceSettings } from '../../composables/useDeviceSettings';

// Vitest's Node environment compiles SFCs for SSR. Attach client templates to the same
// setup functions so the in-memory renderer can exercise their real event handlers.
for (const [name, component] of Object.entries({
  SceneControls, MidiControl, ChannelStrip, GlobalControls, ParamKnob, DeviceParamField,
  LFOControl, TapeLabel, DeviceNotice, EffectParams,
})) {
  const { descriptor } = parse(readFileSync(new URL(`../${name}.vue`, import.meta.url), 'utf8'));
  const script = compileScript(descriptor, { id: name });
  const { code, errors } = compileTemplate({
    source: descriptor.template!.content, filename: `${name}.vue`, id: name,
    compilerOptions: { bindingMetadata: script.bindings },
  });
  if (errors.length) throw new Error(String(errors));
  const clientCode = code
    .replace(/import \{([^}]+)\} from "vue"/g, (_match, bindings: string) =>
      `const {${bindings.replace(/ as /g, ': ')}} = Vue;`)
    .replace('export function render', 'function render');
  Object.assign(component, { render: new Function('Vue', `${clientCode}; return render;`)(Vue) });
}

// Vue's in-memory renderer tests event bindings and output without installing a DOM package.
interface Node {
  type: string;
  text: string;
  props: Record<string, any>;
  children: Node[];
  parent: Node | null;
  style: Record<string, any>;
}
function node(type: string, text = ''): Node {
  return { type, text, props: {}, children: [], parent: null, style: {} };
}
const teleportTarget = node('body');
const renderer = createRenderer<Node, Node>({
  querySelector: () => teleportTarget,
  createElement: type => node(type), createText: text => node('#text', text),
  createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text; },
  setElementText: (el, text) => { el.children = []; el.text = text; },
  parentNode: el => el.parent,
  nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  patchProp: (el, key, _previous, value) => { el.props[key] = value; },
  insert: (el, parent, anchor) => {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, el);
    el.parent = parent;
  },
  remove: el => {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
    el.parent = null;
  },
});
const cleanups: (() => void)[] = [];
function mount(component: Component, props = {}) {
  const root = node('root');
  const app = renderer.createApp(component, props);
  app.provide(Vue.ssrContextKey, { modules: new Set() });
  const vm = app.mount(root);
  cleanups.push(() => app.unmount());
  return { root, vm };
}
function all(root: Node, predicate: (el: Node) => boolean): Node[] {
  return [...(predicate(root) ? [root] : []), ...root.children.flatMap(el => all(el, predicate))];
}
function cls(root: Node, name: string): Node[] {
  return all(root, el => String(el.props.class ?? '').split(' ').includes(name));
}
function text(root: Node): string {
  return root.text + root.children.filter(el => el.type !== '#comment').map(text).join('');
}
function pressKey(el: Node, key = 'ArrowUp'): void {
  el.props.onKeydown({ key, preventDefault: vi.fn() });
}
async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
function recallFromApp(root: Node, index = 1): void {
  cls(root, 'tecla-escena')[index]!.props.onClick();
}
const fakeInput = midiService as typeof midiService & {
  receiveProgram: (program: number, channel: number) => void;
  receiveCC: (cc: number, value: number, channel: number) => void;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() }, querySelector: () => null });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanups.splice(0).reverse().forEach(fn => fn());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scene knowledge in the console', () => {
  it.each(['l6', 'l6max'] as const)('invalidates every channel and global control on %s without sending CC or SysEx', async mixerType => {
    const channels = mixerType === 'l6max' ? channelControlsL6Max : channelControls;
    const globals = mixerType === 'l6max' ? globalControlsL6Max : globalControls;
    const scenes = mixerType === 'l6max' ? sceneControlsL6Max : sceneControls;
    const { root } = mount({ render: () => h('div', [
      h(SceneControls, { mixerType }),
      ...channels.map(channelData => h(ChannelStrip, { channelData, mixerType })),
      h(GlobalControls, { globalData: globals, mixerType }),
    ]) });
    await settle();
    vi.clearAllMocks();
    recallFromApp(root);
    await settle();
    await vi.advanceTimersByTimeAsync(1200);
    const controls = cls(root, 'midi-control');
    expect(controls.length).toBeGreaterThan(60);
    expect(controls.every(el => cls(el, 'desconocido').length === 1)).toBe(true);
    expect(cls(root, 'fader-valor').every(el => text(el) === '—')).toBe(true);
    expect(cls(root, 'perilla-valor').every(el => text(el) === '—')).toBe(true);
    expect(all(root, el => el.props.role === 'slider').every(el => el.props['aria-valuenow'] === undefined)).toBe(true);
    expect(cls(root, 'control-toggle').every(el => !cls(el, 'on').length && text(el).includes('—'))).toBe(true);
    expect(cls(root, 'control-radio').every(el => !cls(el, 'on').length)).toBe(true);
    expect(midiService.sendProgramChange).toHaveBeenCalledExactlyOnceWith(scenes[1]!.program, scenes[1]!.channel);
    expect(midiService.sendControlChange).not.toHaveBeenCalled();
    // One snapshot re-read on the editor port (a read), nothing written.
    expect(editorSession.refreshState).toHaveBeenCalledTimes(1);
    expect(editorSession.open).not.toHaveBeenCalled();
    expect(editorSession.getValue).not.toHaveBeenCalled();
    expect(editorSession.setValue).not.toHaveBeenCalled();
  });

  it('makes only the adjusted control known, using a neutral starting position', async () => {
    const controls = channelControlsL6Max[0]!.controls;
    const { root } = mount({ render: () => h('div', [
      h(SceneControls), h(MidiControl, { control: controls.volume, vista: 'fader', modelValue: 120 }),
      h(MidiControl, { control: controls.pan, modelValue: 8 }),
    ]) });
    recallFromApp(root);
    await settle();
    const sliders = all(root, el => el.props.role === 'slider');
    expect(cls(root, 'fader-tapa')[0]!.props.style.top).toContain('0.496');
    pressKey(sliders[0]!);
    await settle();
    expect(midiService.sendControlChange).toHaveBeenCalledExactlyOnceWith(controls.volume, 65);
    expect(sliders[0]!.props['aria-valuenow']).toBe(65);
    expect(sliders[1]!.props['aria-valuenow']).toBeUndefined();
  });

  it('invalidates again for incoming PC, ignores unrelated programs/channels and never echoes MIDI', async () => {
    const control = globalControlsL6Max.compressor;
    const { root } = mount({ render: () => h('div', [h(SceneControls, { mixerType: 'l6max' }), h(MidiControl, { control })]) });
    all(cls(root, 'control-toggle')[0]!, el => el.type === 'button')[0]!.props.onClick();
    await settle();
    const knowledge = useSceneKnowledge(() => ccKnowledgeKey(control));
    expect(knowledge.known.value).toBe(true);
    fakeInput.receiveProgram(127, 1);
    fakeInput.receiveProgram(sceneControlsL6Max[2]!.program, 16);
    expect(knowledge.known.value).toBe(true);
    vi.clearAllMocks();
    fakeInput.receiveProgram(sceneControlsL6Max[2]!.program, sceneControlsL6Max[2]!.channel);
    await settle();
    await vi.advanceTimersByTimeAsync(1200);
    expect(knowledge.known.value).toBe(false);
    expect(text(cls(root, 'control-toggle')[0]!)).toContain('—');
    expect(midiService.sendProgramChange).not.toHaveBeenCalled();
    expect(midiService.sendControlChange).not.toHaveBeenCalled();
    expect(editorSession.refreshState).toHaveBeenCalledTimes(1);
  });

  it('pauses an active LFO on recall and does not restore knowledge from an old model value or incoming CC', async () => {
    const control = channelControlsL6Max[0]!.controls.pan;
    const value = ref(10);
    const controlRef = ref<{ lfo: { state: string } }>();
    const { root } = mount({ render: () => h(MidiControl, { control, modelValue: value.value, ref: controlRef }) });
    controlRef.value!.lfo.state = 'active';
    await settle();
    recallScene('D');
    await settle();
    expect(controlRef.value!.lfo.state).toBe('paused');
    fakeInput.receiveCC(control.cc, 90, control.channel);
    value.value = 91;
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).toBe('—');
    expect(midiService.sendControlChange).not.toHaveBeenCalled();
    pressKey(all(root, el => el.props.role === 'slider')[0]!);
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).toBe('65');
    recallScene('D');
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).toBe('—');
  });

  it('keeps effect parameters and AUX points unknown through remounts and app-side value changes; edits restore only one', async () => {
    const device = useDeviceSettings();
    device.values['fx.hall.decay'] = 95;
    device.values['fx.hall.tone'] = 10;
    device.values['aux1SendPoint.ch1'] = 1;
    recallScene('B');
    const { root } = mount({ render: () => h('div', [
      h(ParamKnob, { paramId: 'fx.hall.decay' }), h(ParamKnob, { paramId: 'fx.hall.tone' }),
      h(DeviceParamField, { paramId: 'aux1SendPoint.ch1' }),
    ]) });
    await settle();
    expect(cls(root, 'perilla-valor').map(text)).toEqual(['—', '—']);
    expect(all(root, el => el.type === 'select')[0]!.props.value).toBe('');
    device.values['fx.hall.decay'] = 70;
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).toBe('—');
    pressKey(all(root, el => el.props.role === 'slider')[0]!);
    await settle();
    expect(editorSession.setValue).toHaveBeenCalledWith('fx.hall.decay', 51, expect.anything());
    expect(cls(root, 'perilla-valor').map(text)).toEqual(['51', '—']);
    all(root, el => el.type === 'select')[0]!.props.onChange({ target: { value: '0' } });
    await settle();
    expect(editorSession.setValue).toHaveBeenCalledWith('aux1SendPoint.ch1', 0, expect.anything());
    expect(all(root, el => el.type === 'select')[0]!.props.value).toBe(0);
    const remounted = mount(ParamKnob, { paramId: 'fx.hall.tone' });
    expect(cls(remounted.root, 'perilla-valor')[0]!.text).toBe('—');
  });

  it('shows again what the mixer reports in the re-read after a recall (verified slots only)', async () => {
    const payload = firstPayload('06-fx-room');
    const reported = decodeSnapshot(payload).values['fx.room.decay'];
    expect(reported).toBeDefined();
    useDeviceSettings();
    recallScene('C');
    const { root } = mount(ParamKnob, { paramId: 'fx.room.decay' });
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).toBe('—');
    (editorSession.info as unknown as Vue.Ref<unknown>).value = { editorState: { payload }, openedAt: 1 };
    await settle();
    expect(cls(root, 'perilla-valor')[0]!.text).not.toBe('—');
  });

  it('does not let an acknowledgement from before recall trigger a readback afterwards', async () => {
    let acknowledge!: () => void;
    vi.mocked(editorSession.setValue).mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    const device = useDeviceSettings();
    device.set('fx.room.decay', 80);
    await settle();
    expect(editorSession.setValue).toHaveBeenCalledOnce();
    device.sceneChanged();
    recallScene('A');
    acknowledge();
    await settle();
    await vi.advanceTimersByTimeAsync(1200);
    expect(device.values['fx.room.decay']).toBeUndefined();
    // Only the scene's own re-read, not the one the old write would have scheduled.
    expect(editorSession.refreshState).toHaveBeenCalledTimes(1);
    expect(editorSession.getValue).not.toHaveBeenCalled();
  });

  it('cancels queued device writes and readbacks when a scene interrupts a gesture', async () => {
    const device = useDeviceSettings();
    device.set('fx.hall.decay', 20);
    await settle();
    device.set('fx.hall.decay', 30);
    device.sceneChanged();
    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(1200);
    expect(editorSession.setValue).not.toHaveBeenCalled();
    expect(editorSession.refreshState).toHaveBeenCalledTimes(1);
  });
});
