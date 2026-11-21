#!/bin/sh
# Prueba de punta a punta de la consola contra un mezclador simulado.
#
#   PYTHON=/ruta/a/python sh scripts/e2e/correr.sh [captura.png]
#
# PYTHON tiene que tener `mido` y `python-rtmidi`: con ellos se crean dos puertos MIDI
# virtuales con el nombre del puerto de la Zoom. La app se conecta sola, se le mueven
# perillas, teclas y un fader, y se comprueba lo que llega al mezclador y lo que el
# mezclador devuelve. No sustituye a probar con el aparato: la curva de cada control, los
# parámetros de efecto y los ajustes por SysEx solo existen en la Zoom de verdad.
set -e
cd "$(dirname "$0")/../.."
PYTHON="${PYTHON:-python3}"
TMP="$(mktemp -d)"
npx vite build --base ./ --logLevel error
"$PYTHON" scripts/e2e/zoom_falsa.py "$TMP/midi.json" 30 > "$TMP/zoom.out" 2>&1 &
ZOOM=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do grep -q lista "$TMP/zoom.out" 2>/dev/null && break; sleep 0.5; done
grep -q lista "$TMP/zoom.out" || { cat "$TMP/zoom.out"; echo "el mezclador simulado no arrancó (¿PYTHON tiene mido y python-rtmidi?)"; exit 1; }
ESTADO=0
npx electron scripts/e2e/consola.cjs "$PWD/dist" "$1" > "$TMP/consola.out" 2>&1 || true
grep -E '^(FALLA|CONSOLA)' "$TMP/consola.out" || true
grep -q '^CONSOLA: todo bien' "$TMP/consola.out" || ESTADO=1
wait $ZOOM
"$PYTHON" - "$TMP/midi.json" <<'PY' || ESTADO=1
import json, sys
log = json.load(open(sys.argv[1]))
def cc(c, v=None): return [m for m in log if m["type"] == "control_change" and m["control"] == c and (v is None or m["value"] == v)]
fallos = []
def exige(ok, que):
    if not ok: fallos.append(que)
exige([m["value"] for m in cc(1)] == [65, 66, 67, 68, 69], "EQ HIGH del canal 1: CC 1 de 65 a 69")
exige(len(cc(93, 127)) == 1, "mute del canal 1: CC 93 = 127")
exige(len(cc(81, 90)) == 1, "nivel del canal 1: CC 81 = 90")
exige(len(cc(117, 43)) == 1, "efecto Room: CC 117 = 43")
exige(any(m["type"] == "program_change" and m["program"] == 1 for m in log), "escena B: Program Change 1")
exige([m["type"] for m in log if m["type"].startswith("note")] == ["note_on", "note_off"], "sound pad: nota 60, pulsar y soltar")
exige(len(cc(109, 127)) == 1, "MONO x2 del canal 5: CC 109 = 127")
arrastre = [m["value"] for m in cc(83)]
exige(len(arrastre) >= 3 and arrastre == sorted(arrastre, reverse=True) and len(set(arrastre)) == len(arrastre), "fader del canal 3: CC 83 bajando, sin repetir valores")
exige(len(cc(119, 127)) == 1, "compresor: CC 119 = 127")
exige(all(m["channel"] == 0 for m in log), "todo por el canal MIDI 1")
for f in fallos: print("FALLA:", f)
print("MIDI: %d mensajes, %s" % (len(log), "%d fallo(s)" % len(fallos) if fallos else "todo bien"))
sys.exit(1 if fallos else 0)
PY
exit $ESTADO
