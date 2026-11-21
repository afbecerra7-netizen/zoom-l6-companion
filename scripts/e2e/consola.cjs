// Prueba de punta a punta de la app real contra el mezclador simulado.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const [DIST, CAPTURA] = process.argv.slice(2)   // carpeta dist/ y dónde dejar la captura
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false } })
  const errores = []
  win.webContents.on('console-message', (_e, nivel, msg) => { if (nivel >= 3) errores.push(msg.slice(0, 160)) })
  await win.loadFile(path.join(DIST, 'index.html'))
  await win.webContents.executeJavaScript(`localStorage.removeItem('zoom-l6-cintas')`)
  await win.loadFile(path.join(DIST, 'index.html'))
  await espera(1500)
  const js = (codigo) => win.webContents.executeJavaScript(`(async () => { ${codigo} })()`)
  const r = {}

  r.antes = await js(`return { estado: document.querySelector('.estado').innerText.trim(), tiras: document.querySelectorAll('.tira').length, panelVisible: getComputedStyle(document.querySelector('.panel-conexion')).display !== 'none' }`)
  await js(`[...document.querySelectorAll('button')].find((b) => /Auto-Connect|Conectar Zoom|Connect Zoom/i.test(b.textContent)).click()`)
  await espera(1500)
  r.conectada = await js(`return { estado: document.querySelector('.estado').innerText.trim(), nombre: document.querySelector('.placa-nombre').innerText.replace(/\\n/g, ' / '), tiras: document.querySelectorAll('.tira').length,
    estereo: [...document.querySelectorAll('.tira')].map((t) => t.classList.contains('estereo') ? 'E' : 'M').join(''), panelVisible: getComputedStyle(document.querySelector('.panel-conexion')).display !== 'none',
    extras: [...document.querySelectorAll('.tecla-mini')].map((b) => b.innerText.trim()), cintasVacias: document.querySelectorAll('.cinta.vacia').length }`)

  // ---- de la app al mezclador
  r.acciones = await js(`
    const tecla = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    const t1 = document.querySelectorAll('.tira')[0]
    const high = t1.querySelector('[aria-label="HIGH"]')
    for (let i = 0; i < 5; i++) tecla(high, 'ArrowUp')
    t1.querySelector('.tecla-mute').click()
    tecla(t1.querySelector('.fader-pista'), 'PageDown')
    ;[...document.querySelectorAll('.selector .tecla')].find((b) => /room/i.test(b.textContent)).click()
    document.querySelectorAll('.tecla-escena')[1].click()
    const pad = document.querySelector('.pad')
    pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); pad.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    document.querySelectorAll('.tira')[4].querySelector('.tecla-mini').click()
    await new Promise((r) => setTimeout(r, 300))
    return { high: high.getAttribute('aria-valuetext'), mute1: t1.classList.contains('muda'), lamparaMute: getComputedStyle(t1.querySelector('.tecla-mute .lampara')).boxShadow.includes('255, 178, 62'),
      nivel1: t1.querySelector('.fader-pista').getAttribute('aria-valuenow') + ' -> ' + t1.querySelector('.fader-valor').innerText,
      efecto: [...document.querySelectorAll('.selector .tecla.on')].map((b) => b.innerText.trim()), escena: document.querySelector('.tecla-escena.on').innerText.trim() }`)

  // ---- arrastre real del fader del canal 3, con el ratón
  const caja = await js(`const p = document.querySelectorAll('.tira')[2].querySelector('.fader-tapa').getBoundingClientRect(); return { x: Math.round(p.left + p.width / 2), y: Math.round(p.top + p.height / 2) }`)
  win.webContents.sendInputEvent({ type: 'mouseDown', x: caja.x, y: caja.y, button: 'left', clickCount: 1 })
  for (let dy = 10; dy <= 60; dy += 10) { win.webContents.sendInputEvent({ type: 'mouseMove', x: caja.x, y: caja.y + dy, button: 'left' }); await espera(30) }
  win.webContents.sendInputEvent({ type: 'mouseUp', x: caja.x, y: caja.y + 60, button: 'left', clickCount: 1 })
  await espera(300)
  r.arrastre = await js(`const t = document.querySelectorAll('.tira')[2]; const p = t.querySelector('.fader-tapa').getBoundingClientRect(); return { nivel3: t.querySelector('.fader-pista').getAttribute('aria-valuenow'), tapaBajo: Math.round(p.top + p.height / 2) - ${caja.y} }`)

  // ---- del mezclador a la app: al encender COMP, el simulado contesta nivel 2 = 33 y mute 2
  await js(`document.querySelector('.tecla-ancha').click()`)
  await espera(800)
  r.desdeMezclador = await js(`const t = document.querySelectorAll('.tira')[1]; return { nivel2: t.querySelector('.fader-pista').getAttribute('aria-valuenow'), mute2: t.classList.contains('muda'), comp: document.querySelector('.tecla-ancha').classList.contains('on') }`)

  // ---- modulación y cinta
  r.modulacion = await js(`const n = () => document.querySelectorAll('.lfo-btn').length; const a = n(); document.querySelectorAll('.boton-barra')[0].click(); await new Promise((r) => setTimeout(r, 200)); const b = n(); document.querySelectorAll('.boton-barra')[0].click(); await new Promise((r) => setTimeout(r, 200)); return { antes: a, enModulacion: b, despues: n() }`)
  r.cinta = await js(`
    const c = document.querySelectorAll('.cinta')[0]
    c.dispatchEvent(new FocusEvent('focus')); await new Promise((r) => setTimeout(r, 100))
    c.textContent = 'MINITAUR'; c.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const colores = document.querySelectorAll('.cinta-colores button').length
    document.querySelectorAll('.cinta-colores button')[1].click()
    c.dispatchEvent(new FocusEvent('blur')); await new Promise((r) => setTimeout(r, 200))
    return { texto: c.textContent, vacia: c.classList.contains('vacia'), colores, tela: c.style.getPropertyValue('--tela'), guardado: localStorage.getItem('zoom-l6-cintas') }`)

  // ---- sin scroll, en varios tamaños
  r.tamanos = []
  for (const [w, h] of [[1400, 900], [900, 600], [1180, 720], [1728, 1000]]) {
    win.setContentSize(w, h); await espera(350); await win.webContents.capturePage()
    r.tamanos.push(await js(`const de = document.documentElement, c = document.querySelector('.consola-escala'), b = c.getBoundingClientRect(), tiras = [...document.querySelectorAll('.tira')], lat = document.querySelector('.lateral').getBoundingClientRect();
      return { v: innerWidth + 'x' + innerHeight, escala: +(b.width / c.offsetWidth).toFixed(3), esperada: +Math.min(1, innerWidth / 1400, innerHeight / 720).toFixed(3),
        scroll: de.scrollWidth > innerWidth || de.scrollHeight > innerHeight, desborda: tiras.some((t) => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1),
        dentro: tiras[tiras.length - 1].getBoundingClientRect().bottom <= innerHeight + 0.5 && lat.right <= innerWidth + 0.5 && lat.bottom <= innerHeight + 0.5,
        cabeceraChoca: tiras.some((t) => { const a = t.querySelector('.tira-tipo'), x = t.querySelector('.tecla-mini'); return x && a.getBoundingClientRect().right > x.getBoundingClientRect().left }) }`))
  }
  win.setContentSize(1400, 900); await espera(400)
  if (CAPTURA) fs.writeFileSync(CAPTURA, (await win.webContents.capturePage()).toPNG())
  r.erroresDeConsola = errores

  // ---- comprobaciones: cada una tiene que poder fallar
  const fallos = []
  const exige = (ok, que) => { if (!ok) fallos.push(que) }
  exige(r.antes.estado === 'SIN CONEXIÓN' && r.antes.tiras === 0 && r.antes.panelVisible, 'sin mezclador: estado, sin tiras y panel de conexión a la vista')
  exige(r.conectada.estado === 'CONECTADA' && r.conectada.tiras === 8 && r.conectada.estereo === 'MMMMEEEE' && !r.conectada.panelVisible, 'conectada: 8 tiras, 4 mono + 4 estéreo, panel oculto')
  exige(r.conectada.extras.join('|') === 'MONO x2|MONO x2|USB 1/2|USB 3/4', 'interruptores de los canales 5 a 8')
  exige(r.acciones.high === '+0,8' && r.acciones.mute1 && r.acciones.lamparaMute, 'perilla por teclado y mute con lámpara ámbar')
  exige(r.acciones.efecto.join() === 'ROOM' && r.acciones.escena === 'B', 'efecto y escena con una sola tecla encendida')
  exige(Number(r.arrastre.nivel3) < 100 && r.arrastre.tapaBajo === 60, 'el fader sigue al ratón: baja 60 px con 60 px de arrastre')
  exige(r.desdeMezclador.nivel2 === '33' && r.desdeMezclador.mute2 && r.desdeMezclador.comp, 'lo que manda el mezclador mueve la consola')
  exige(r.modulacion.antes === 0 && r.modulacion.enModulacion > 0 && r.modulacion.despues === 0, 'los LFO solo se ven en modo MODULACIÓN')
  exige(r.cinta.texto === 'MINITAUR' && !r.cinta.vacia && r.cinta.colores === 5 && /"texto":"MINITAUR","color":1/.test(r.cinta.guardado || ''), 'la cinta se escribe, cambia de color y se guarda')
  for (const t of r.tamanos) exige(t.escala === t.esperada && !t.scroll && !t.desborda && t.dentro && !t.cabeceraChoca, 'sin scroll ni desbordes a ' + t.v)
  exige(errores.length === 0, 'sin errores en la consola: ' + errores.join(' | '))

  console.log('E2E ' + JSON.stringify(r))
  for (const f of fallos) console.log('FALLA: ' + f)
  console.log(fallos.length ? 'CONSOLA: ' + fallos.length + ' fallo(s)' : 'CONSOLA: todo bien')
  app.exit(fallos.length ? 1 : 0)
})
