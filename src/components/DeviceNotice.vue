<script setup lang="ts">
export type DeviceNoticeVariant = 'success' | 'error' | 'warn' | 'info';

interface Props {
  variant?: DeviceNoticeVariant;
  text?: string;
  /** Render as an inline hint (no filled box) instead of a banner. */
  subtle?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'info',
  text: '',
  subtle: false,
});
</script>

<template>
  <div
    class="device-notice"
    :class="[`device-notice--${variant}`, { 'device-notice--subtle': subtle }]"
    role="status"
  >
    <slot>{{ text }}</slot>
  </div>
</template>

<style scoped>
/* Lenguaje visual de TAPE 101 (src/assets/tape101.css): placa hundida y un filo de color que dice
   qué clase de aviso es. Cada color de lámpara significa una sola cosa: verde bien, ámbar aviso,
   rojo error; la información va sin color. */
.device-notice {
  margin: 0 0 12px 0;
  padding: 9px 12px;
  border: 0;
  border-left: 3px solid var(--linea);
  border-radius: 6px;
  background: var(--hundido);
  box-shadow: var(--hueco);
  font: 400 13px/1.45 var(--f-texto);
  color: var(--serigrafia-2);
}

.device-notice--info {
  border-left-color: var(--serigrafia-3);
}

.device-notice--success {
  border-left-color: var(--verde);
  color: var(--verde);
}

.device-notice--warn {
  border-left-color: var(--ambar);
  color: var(--ambar);
}

.device-notice--error {
  border-left-color: var(--rojo);
  color: var(--rojo);
}

/* Pista en línea, sin placa. */
.device-notice--subtle {
  padding: 0;
  border-left: 0;
  background: none;
  box-shadow: none;
  font: 400 12.5px/1.45 var(--f-texto);
  color: var(--serigrafia-3);
}

.device-notice--subtle.device-notice--success { color: var(--verde); }
.device-notice--subtle.device-notice--warn { color: var(--ambar); }
.device-notice--subtle.device-notice--error { color: var(--rojo); }
</style>
