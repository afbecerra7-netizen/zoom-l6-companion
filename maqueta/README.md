# Maqueta de interfaz — Zoom L6max

Propuesta de la pantalla principal de la app de Mac, con el lenguaje visual de
TAPE 101 (grafito mudo, lámparas con un solo significado, perillas de aluminio) y
una **cinta gaffer con rotulador por canal**, editable, para escribir qué va en
cada uno.

Es una página estática sin dependencias. **No tiene scroll**: ocupa la ventana entera y,
por debajo de 1400 × 720, se encoge completa. **Simula: no manda MIDI**, y las
unidades (dB, Hz) son de ejemplo hasta medir la curva real de cada control.

```bash
python3 -m http.server 5180 --directory maqueta
```

- La cinta: clic para escribir (12 caracteres; mide el texto y encoge la letra antes de cortar), `Enter`
  confirma, `Esc` deshace, y al enfocarla aparecen los colores de cinta. Se
  guarda en el navegador. Los nombres iniciales son un ejemplo.
- Perillas y faders: arrastre vertical relativo (no saltan al tocarlos), `Shift`
  para ajuste fino, flechas con el teclado.
- `MODULACIÓN` muestra los LFO por perilla; fuera de ese modo no se ven.

Los canales, sus interruptores (`MONO x2`, `USB 1/2`, `USB 3/4`) y los
parámetros de cada efecto salen de `src/config/midiConfigL6Max.ts` y
`src/midi/sysex/zoomL6/params.ts`. Las fuentes y la textura vienen de TAPE 101;
sus licencias están en `assets/licencias/` (la textura es CC0, ambientCG Metal012).
