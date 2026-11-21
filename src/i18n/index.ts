import { sourceKeys } from './sourceKeys';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import { ref, watch } from 'vue';
import es from './es';
import en from './en';

export type Language = 'es' | 'en';
export type TranslationKey = keyof typeof es;
function savedLanguage(): Language {
  try {
    return localStorage.getItem('zoom-l6-idioma') === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}
export const language = ref<Language>(savedLanguage());
watch(language, (value) => {
  try {
    localStorage.setItem('zoom-l6-idioma', value);
  } catch {
    // The selected language still works when storage is unavailable.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}, { immediate: true });

/** Interpolate named values without HTML injection. */
export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  const message = (language.value === 'en' ? en : es)[key];
  return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}


/** Translate text from configuration without changing names, values or protocol bindings. */
export function translatedText(text: string): string {
  const key = sourceKeys[text];
  if (key) return t(key);
  const channel = /^Channel (\d+)$/.exec(text);
  if (channel) return t('channel', { n: channel[1]! });
  return text;
}

export function paramLabel(id: ParamId): string {
  return t(`param.${id}.label`);
}
export function paramDescription(id: ParamId): string {
  return t(`param.${id}.description`);
}

/** Actionable UI error; raw diagnostic details remain available in the diagnostic log. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/timeout|timed out|stale/i.test(message)) return t('timeout');
  if (/turned off|link is off/i.test(message)) return t('editorDisabled');
  if (/session is (?:not open|closed)|link is not open|open aborted/i.test(message)) return t('editorClosed');
  if (/suspended/i.test(message)) return t('editorSuspended');
  if (/read-only|cannot be written/i.test(message)) return t('readOnly');
  if (/not available on this mixer/i.test(message)) return t('unavailable');
  if (/not in the registry/i.test(message)) return t('unknownAddress');
  const range = /That range is (\d+) requests; the sweep limit is (\d+)/.exec(message);
  if (range) return t('largeRange', { total: range[1]!, limit: range[2]! });
  if (/System Exclusive is not enabled/i.test(message)) return t('ui.system_exclusive_is_not_enabled_reload_the_app_and_allow_sysex_when_the_browser_promp');
  if (/JSON|export format/i.test(message)) return t('importError');
  if (/hex|F0|F7/i.test(message)) return t('hexError');
  const key = sourceKeys[message];
  return key ? t(key) : t('errorAction');
}

/** Render structured diagnostic summaries; preserve byte values and user-supplied names. */
export function diagnosticText(text: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^Snapshot (.+)$/.exec(text))) return t('snapshotName', { time: m[1]! });
  if ((m = /^CC(\d+) = (\d+) on channel (\d+)$/.exec(text))) return t('midiCC', { cc: m[1]!, value: m[2]!, channel: m[3]! });
  if ((m = /^Note (On|Off): (\d+) \((?:vel|velocity): (\d+)\) on channel (\d+)$/.exec(text))) return t('midiNote', { note: m[2]!, state: translatedText(m[1]!), velocity: m[3]!, channel: m[4]! });
  if ((m = /^Program Change: (\d+) on channel (\d+)$/.exec(text))) return t('midiPC', { program: m[1]!, channel: m[2]! });
  if ((m = /^SysEx (in|out): (.+)$/.exec(text))) return t('sysexTraffic', { direction: translatedText(m[1]!), hex: m[2]! });
  if ((m = /^Identity reply \(mfr (.+), fw (.+)\)$/.exec(text))) return t('identityReply', { manufacturer: m[1]!, firmware: m[2]! });
  if ((m = /^Editor open reply \(subtype (\d+), (\d+) ids, (\d+) bytes\)$/.exec(text))) return t('editorReply', { subtype: m[1]!, ids: m[2]!, bytes: m[3]! });
  if ((m = /^File transfer (ON|OFF)$/.exec(text))) return t('fileTransfer', { state: translatedText(m[1]!) });
  if ((m = /^Session cmd (\S+) \[(\d+) bytes\]$/.exec(text))) return t('sessionCmd', { code: m[1]!, bytes: m[2]! });
  if ((m = /^Get param (.+)$/.exec(text))) return t('getParam', { address: m[1]! });
  if ((m = /^Param (.+) = \[(.*)\]$/.exec(text))) return t('paramValue', { address: m[1]!, values: m[2]! });
  if ((m = /^Ack (\S+)(?: \((.+)\))?$/.exec(text))) return t('ack', { code: m[1]! }) + (m[2] ? ` (${translatedText(m[2])})` : '');
  if ((m = /^Scene info \(subtype (\d+), (\d+) bytes\)$/.exec(text))) return t('sceneInfo', { subtype: m[1]!, bytes: m[2]! });
  if ((m = /^Unknown Zoom cmd (\S+) \[(\d+) bytes\]$/.exec(text))) return t('unknownCmd', { code: m[1]!, bytes: m[2]! });
  const labels = { 'Identity request': 'identityRequest', 'Editor open': 'editorOpen', Heartbeat: 'heartbeat', 'Heartbeat ack': 'heartbeatAck', 'Non-Zoom SysEx': 'notZoom' } as const;
  if (Object.prototype.hasOwnProperty.call(labels, text)) return t(labels[text as keyof typeof labels]);
  if (text.startsWith('Error: ')) return errorMessage(text.slice(7));
  return translatedText(text);
}

export function payloadField(field: string): string {
  // Known fields contain the stable registry id; byte/CC coordinates stay intact.
  const id = Object.keys(es).find((key) => key.startsWith('param.') && key.endsWith('.label') && field.includes(key.slice(6, -6)));
  if (id) return t(id as TranslationKey);
  if (/unknown/i.test(field)) return t('payloadUnknown');
  if (/layout/i.test(field)) return t('payloadLayout');
  if (/CC/i.test(field)) return `${t('ccMapping')} · ${field.replace(/[A-Za-z ]+/g, '').trim()}`;
  return translatedText(field);
}
