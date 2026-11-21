import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { baseParse, type TemplateChildNode } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import es from '../es';
import en from '../en';
import { language, t, paramLabel, paramDescription, translatedText, errorMessage, diagnosticText } from '..';
import { connectionStatus } from '../connectionStatus';
import { zoomL6ParamList } from '../../midi/sysex/zoomL6/params';

afterEach(() => {
  language.value = 'es';
  vi.unstubAllGlobals();
});

describe('UI dictionaries', () => {
  it('has exactly the same non-empty keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const dict of [es, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('keeps interpolation placeholders identical', () => {
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(en[key]), key).toEqual(placeholders(es[key]));
    }
  });

  it('covers every registry id with a label and explanation in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      language.value = lang;
      for (const param of zoomL6ParamList) {
        expect(paramLabel(param.id).trim(), param.id).not.toBe('');
        expect(paramDescription(param.id).trim(), param.id).not.toBe('');
      }
    }
  });

  it('switches text reactively and persists only the dedicated language key', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    expect(t('language')).toBe('Idioma');
    language.value = 'en';
    await nextTick();
    expect(t('language')).toBe('Language');
    expect(setItem).toHaveBeenCalledWith('zoom-l6-idioma', 'en');
    expect(t('channel', { n: 3 })).toBe('Channel 3');
  });

  it('translates configuration labels without altering protocol values', () => {
    expect(translatedText('Not Mapped')).toBe('Sin nota asignada');
    expect(translatedText('Channel 16')).toBe('Canal 16');
    expect(translatedText('Pre Fader')).toBe('Pre Fader');
    expect(translatedText('Hall')).toBe('HALL');
    expect(translatedText('L6max Mixer Control Port')).toBe('L6max Mixer Control Port');
  });

  it('gives actionable errors and preserves diagnostic numeric data', () => {
    expect(errorMessage(new Error('Editor session is closed'))).toContain('Ábrelo');
    expect(errorMessage('request timed out')).toContain('Editor');
    expect(errorMessage('That range is 900 requests; the sweep limit is 512. Narrow the range.')).toContain('900');
    expect(diagnosticText('CC81 = 100 on channel 1')).toBe('CC81 = 100 · canal 1');
    expect(diagnosticText('Param 1:2 = [4 5]')).toBe('Parámetro 1:2 = [4 5]');
    expect(diagnosticText('Snapshot 12:30')).toBe('Copia del estado 12:30');
  });

  it('keeps all visible template copy and accessibility labels in dictionaries', () => {
    const root = resolve('src');
    const files = ['App.vue', ...readdirSync(resolve(root, 'components'), { recursive: true })
      .filter((file) => typeof file === 'string' && file.endsWith('.vue'))
      .map((file) => `components/${file}`)];
    for (const file of files) {
      const { descriptor } = parse(readFileSync(resolve(root, file), 'utf8'));
      const walk = (node: TemplateChildNode): void => {
        if (node.type === 2) expect(node.content, file).not.toMatch(/[a-záéíóúñ]/i);
        if (node.type === 1) {
          for (const prop of node.props) {
            if (prop.type === 6 && ['title', 'aria-label', 'placeholder', 'text', 'rotulo'].includes(prop.name)) {
              expect(prop.value?.content ?? '', `${file}: ${prop.name}`).not.toMatch(/[a-záéíóúñ]/i);
            }
          }
          node.children.forEach(walk);
        }
      };
      baseParse(descriptor.template!.content).children.forEach(walk);
    }
  });
});

describe('honest connection status', () => {
  it.each(['es', 'en'] as const)('never reports connected with an input only (%s)', (lang) => {
    language.value = lang;
    const status = connectionStatus(true, false);
    expect(status.complete).toBe(false);
    expect(status.tone).toBe('ambar');
    expect(status.key).toBe('missingOutput');
    expect(t(status.key)).not.toMatch(/^(conectada|connected)$/i);
    expect(t(status.key)).toMatch(lang === 'es' ? /FALTA LA SALIDA/ : /OUTPUT MISSING/);
  });

  it('covers all four port combinations without changing the service state', () => {
    expect(connectionStatus(false, false)).toEqual({ key: 'ui.disconnected', tone: 'blanco', complete: false });
    expect(connectionStatus(false, true)).toEqual({ key: 'missingInput', tone: 'ambar', complete: false });
    expect(connectionStatus(true, true)).toEqual({ key: 'connected', tone: 'verde', complete: true });
  });
});
