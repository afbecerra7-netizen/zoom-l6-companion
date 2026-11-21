"""Mezclador simulado: dos puertos MIDI virtuales con el nombre del de la Zoom.

Apunta todo lo que la app le manda y, cuando recibe el compresor encendido (CC 119 = 127),
contesta como lo haria el aparato al mover sus propios mandos: nivel del canal 2 a 33 y mute
del canal 2 encendido. Asi se prueba el MIDI en los dos sentidos sin el hardware.
"""
import json, sys, time
import mido

NOMBRE = "ZOOM L6max Mixer Control Port"
salida_log = sys.argv[1]
dura = float(sys.argv[2]) if len(sys.argv) > 2 else 40
recibidos = []
hacia_app = mido.open_output(NOMBRE, virtual=True)      # la app lo ve como ENTRADA

def llega(msg):
    recibidos.append({"t": round(time.time() - t0, 2), **msg.dict()})
    if msg.type == "control_change" and msg.control == 119 and msg.value == 127:
        hacia_app.send(mido.Message("control_change", channel=0, control=82, value=33))
        hacia_app.send(mido.Message("control_change", channel=0, control=94, value=127))

t0 = time.time()
desde_app = mido.open_input(NOMBRE, virtual=True, callback=llega)   # la app lo ve como SALIDA
print("zoom falsa lista", flush=True)
while time.time() - t0 < dura:
    time.sleep(0.1)
    json.dump(recibidos, open(salida_log, "w"))
desde_app.close(); hacia_app.close()
