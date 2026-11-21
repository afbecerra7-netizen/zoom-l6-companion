// MESA 101: la app de Mac para la Zoom L6max, de la familia TAPE 101.
//
// Electron trae el motor de Chrome, asi que WebMIDI funciona igual que en el
// navegador. Ojo: Electron CONCEDE TODOS LOS PERMISOS por defecto (comprobado:
// sin manejadores, WebMIDI con SysEx se abre igual). Los manejadores de abajo
// sirven para lo contrario: conceder SOLO midi y midiSysex (la app usa SysEx
// para el puerto del editor de la Zoom) y negar todo lo demas, como camara,
// microfono o notificaciones.
const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')

const PERMITIDOS = new Set(['midi', 'midiSysex'])

// El nombre visible es MESA 101, pero los datos (cintas rotuladas, idioma, asignaciones) viven en
// la carpeta que Electron saca del nombre del paquete, «zoom-l6-companion». Se fija aquí, antes de
// cambiar el nombre, para que renombrar la app no la deje vacía.
app.setPath('userData', path.join(app.getPath('appData'), 'zoom-l6-companion'))
app.setName('MESA 101')
const ICONO = path.join(__dirname, '..', 'assets', 'icono', 'mesa101-512.png')

// `ZOOM_L6_AUTOCOMPROBAR=1 npx electron .` abre la app en una ventana oculta,
// pide WebMIDI con SysEx como lo hace la app, imprime lo que ve y se cierra.
// Sirve para comprobar el empaquetado sin mirar la pantalla.
const AUTOCOMPROBAR = process.env.ZOOM_L6_AUTOCOMPROBAR === '1'

function crearVentana() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    show: !AUTOCOMPROBAR,
    title: 'MESA 101',
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  if (AUTOCOMPROBAR) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const informe = await win.webContents.executeJavaScript(`(async () => {
        const midi = await navigator.requestMIDIAccess({ sysex: true })
          .then((m) => ({ ok: true, sysex: m.sysexEnabled,
                          entradas: [...m.inputs.values()].map((p) => p.name),
                          salidas: [...m.outputs.values()].map((p) => p.name) }))
          .catch((e) => ({ ok: false, error: String(e) }))
        const notificaciones = await Notification.requestPermission()
        return { midi, notificaciones, pantalla: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 220) }
      })()`)
      console.log('AUTOCOMPROBACION ' + JSON.stringify(informe))
      app.quit()
    }, 2500))
  }
  return win
}

app.whenReady().then(() => {
  // Empaquetada, el icono lo pone el .icns; corriendo desde el repo, se lo damos al Dock.
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) app.dock.setIcon(ICONO)
  session.defaultSession.setPermissionRequestHandler((_wc, permiso, cb) => cb(PERMITIDOS.has(permiso)))
  session.defaultSession.setPermissionCheckHandler((_wc, permiso) => PERMITIDOS.has(permiso))
  crearVentana()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

module.exports = { PERMITIDOS }
