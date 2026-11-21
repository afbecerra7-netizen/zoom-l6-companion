/** Presentation only: selecting ports does not prove that the mixer responds. */
export function connectionStatus(input: boolean, output: boolean) {
  if (input && output) return { key: 'connected', tone: 'verde', complete: true } as const;
  if (input) return { key: 'missingOutput', tone: 'ambar', complete: false } as const;
  if (output) return { key: 'missingInput', tone: 'ambar', complete: false } as const;
  return { key: 'ui.disconnected', tone: 'blanco', complete: false } as const;
}
