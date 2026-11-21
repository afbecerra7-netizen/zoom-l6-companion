// Zoom L6max · maqueta de interfaz. Simula el panel: no manda MIDI.
// Los canales, sus interruptores y los parámetros de efecto salen de
// src/config/midiConfigL6Max.ts y src/midi/sysex/zoomL6/params.ts.
'use strict'

const CANALES = [
  { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 },
  { n: 5, estereo: true, extra: 'MONO x2' }, { n: 6, estereo: true, extra: 'MONO x2' },
  { n: 7, estereo: true, extra: 'USB 1/2' }, { n: 8, estereo: true, extra: 'USB 3/4' },
]
const EFECTOS = [
  { id: 'AI NR', params: [] },
  { id: 'HALL', params: ['DECAY', 'TONE'] }, { id: 'ROOM', params: ['DECAY', 'TONE'] },
  { id: 'SPRING', params: ['DWELL', 'TONE'] },
  { id: 'DELAY', params: ['TIME', 'FEEDBACK'] }, { id: 'ECHO', params: ['TIME', 'REPEAT'] },
]

// ------------------------------------------------------------------ unidades (de ejemplo, por medir)
// Coma decimal y signo explícito, como en TAPE 101.
const num = (x, dec = 1) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(dec).replace('.', ',')
const conSigno = (x, dec = 1) => (Math.abs(x) < 0.05 ? '0' : (x > 0 ? '+' : '') + num(x, dec))
const dBdeNivel = (v) => (v >= 100 ? ((v - 100) / 27) * 10 : 40 * Math.log10(v / 100))
const nivelDedB = (dB) => (dB >= 0 ? 100 + (dB / 10) * 27 : 100 * Math.pow(10, dB / 40))
const UNIDAD = {
  eq: (v) => conSigno(((v - 64) / 63) * 15) + ' dB',
  // 100 Hz – 8 kHz: el rango sí es del manual; que el recorrido sea logarítmico es una suposición
  frec: (v) => { const hz = 100 * Math.pow(80, v / 127); return hz < 1000 ? Math.round(hz / 10) * 10 + ' Hz' : num(hz / 1000) + ' kHz' },
  pan: (v) => (v === 64 ? 'C' : (v < 64 ? 'L ' + Math.round(((64 - v) / 64) * 100) : 'R ' + Math.round(((v - 64) / 63) * 100))),
  envio: (v) => num((v / 127) * 10),
  nivel: (v) => (v === 0 ? '−∞ dB' : conSigno(dBdeNivel(v)) + ' dB'),
}
const limita = (v) => Math.max(0, Math.min(127, Math.round(v)))

// ------------------------------------------------------------------ escala
// La consola se encoge por CSS cuando la ventana es menor que el lienzo base (maqueta.css).
// Aquí solo se lee cuánto, para pasar de píxeles de pantalla a unidades del lienzo.
const escala = () => document.body.getBoundingClientRect().width / document.body.offsetWidth

// ------------------------------------------------------------------ piezas
function crea(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta)
  if (clase) el.className = clase
  if (texto != null) el.textContent = texto
  return el
}

// Arrastre relativo: el control no salta al tocarlo; solo se mueve con la mano.
function arrastrable(zona, lee, pon, recorrido) {
  zona.addEventListener('pointerdown', (e) => {
    zona.setPointerCapture(e.pointerId)
    const y0 = e.clientY, v0 = lee()
    const mueve = (ev) => pon(v0 + ((y0 - ev.clientY) / escala() / recorrido()) * 127 * (ev.shiftKey ? 0.2 : 1))
    const suelta = () => { zona.removeEventListener('pointermove', mueve); zona.removeEventListener('pointerup', suelta) }
    zona.addEventListener('pointermove', mueve)
    zona.addEventListener('pointerup', suelta)
  })
  zona.addEventListener('keydown', (e) => {
    const paso = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (paso) { e.preventDefault(); pon(lee() + paso) }
  })
}

function perilla(nombre, tipo, inicial) {
  let v = inicial
  const el = crea('div', 'perilla' + (tipo === 'eq' || tipo === 'pan' ? ' bipolar' : ''))
  const zona = crea('div', 'perilla-zona')
  zona.tabIndex = 0
  zona.setAttribute('role', 'slider')
  zona.setAttribute('aria-label', nombre)
  zona.setAttribute('aria-valuemin', 0)
  zona.setAttribute('aria-valuemax', 127)
  const tapa = crea('div', 'perilla-tapa')
  tapa.append(crea('i', 'perilla-indice'))
  zona.append(crea('div', 'perilla-falda'), tapa, crea('i', 'perilla-lfo'))
  const valor = crea('span', 'perilla-valor')
  const pinta = () => {
    tapa.style.transform = `rotate(${-135 + (v / 127) * 270}deg)`
    valor.textContent = UNIDAD[tipo](v)
    zona.setAttribute('aria-valuenow', v)
    zona.setAttribute('aria-valuetext', valor.textContent)
  }
  arrastrable(zona, () => v, (n) => { v = limita(n); pinta() }, () => 160)
  el.append(zona, crea('span', 'perilla-nombre', nombre), valor)
  pinta()
  return el
}

function fader(inicial) {
  let v = inicial
  const el = crea('div', 'fader')
  const escala = crea('div', 'fader-escala')
  const pista = crea('div', 'fader-pista')
  pista.tabIndex = 0
  pista.setAttribute('role', 'slider')
  pista.setAttribute('aria-label', 'Nivel')
  pista.setAttribute('aria-valuemin', 0)
  pista.setAttribute('aria-valuemax', 127)
  const tapa = crea('div', 'fader-tapa')
  const valor = crea('div', 'fader-valor')
  const altura = (x) => `calc(10px + ${1 - x / 127} * (100% - 20px))`
  for (const dB of [10, 0, -10, -20, -40, -Infinity]) {
    const marca = crea('span', dB === 0 ? 'cero' : '', dB === -Infinity ? '−∞' : conSigno(dB, 0))
    marca.style.top = altura(dB === -Infinity ? 0 : nivelDedB(dB))
    escala.append(marca)
  }
  const pinta = () => {
    tapa.style.top = altura(v)
    valor.textContent = UNIDAD.nivel(v)
    pista.setAttribute('aria-valuenow', v)
    pista.setAttribute('aria-valuetext', valor.textContent)
  }
  arrastrable(pista, () => v, (n) => { v = limita(n); pinta() }, () => pista.clientHeight - 20)
  pista.append(tapa)
  el.append(escala, pista)
  pinta()
  return { el, valor }
}

function teclaConLampara(clase, texto, color) {
  const b = crea('button', 'tecla ' + clase)
  b.append(crea('i', 'lampara ' + color), texto)
  b.setAttribute('aria-pressed', 'false')
  b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.classList.toggle('on'))))
  return b
}

// ------------------------------------------------------------------ cintas: gaffer con rotulador
// Lo único que la maqueta guarda. Los nombres iniciales son un ejemplo, no lo que dice tu cinta real.
const CLAVE = 'zoom-l6.cintas'
const TELAS = ['#efece4', '#f4e04d', '#ff8fbd', '#ff9a3c', '#86e08a']
const GIROS = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.6, -1.9, 1.3]
const EJEMPLO = { 1: 'MINITAUR', 2: 'VOLCA KEYS', 3: 'DRUMBRUTE', 4: 'EP-40', 5: 'QY100', 6: 'LEMONDROP' }
const MAX = 12
const repintaCintas = []
let cintas = {}
try { cintas = JSON.parse(localStorage.getItem(CLAVE)) || null } catch { cintas = null }
if (!cintas) cintas = Object.fromEntries(Object.entries(EJEMPLO).map(([n, t]) => [n, { t, c: 0 }]))
const guarda = () => { try { localStorage.setItem(CLAVE, JSON.stringify(cintas)) } catch { /* sin almacenamiento, la maqueta sigue */ } }

const colores = document.getElementById('colores')
let cintaActiva = null

function cinta(n) {
  const el = crea('div', 'cinta')
  el.contentEditable = 'plaintext-only'
  el.spellcheck = false
  el.setAttribute('role', 'textbox')
  el.setAttribute('aria-label', 'Cinta del canal ' + n)
  el.style.setProperty('--giro', GIROS[n - 1] + 'deg')
  const dato = () => cintas[n] || (cintas[n] = { t: '', c: 0 })
  const pinta = () => {
    const vacia = el.textContent.length === 0 && document.activeElement !== el
    el.classList.toggle('vacia', vacia)
    el.style.setProperty('--tela', TELAS[dato().c])
    // Encoge antes de cortar el nombre: se mide el texto ya pintado, no se adivina por su largo
    // (con umbrales por número de letras, DRUMBRUTE y LEMONDROP se cortaban en tiras estrechas).
    el.style.fontSize = ''
    if (vacia) return
    for (let t = 18; t >= 8; t -= 0.5) {
      el.style.fontSize = t + 'px'
      if (el.scrollWidth <= el.clientWidth) break
    }
  }
  el.textContent = dato().t
  el.addEventListener('focus', () => { cintaActiva = { el, n, pinta }; pinta(); muestraColores() })
  el.addEventListener('beforeinput', (e) => {
    const sel = window.getSelection()
    if (e.inputType.startsWith('insert') && sel.isCollapsed && el.textContent.length >= MAX) e.preventDefault()
  })
  el.addEventListener('input', () => {
    if (/\n/.test(el.textContent) || el.textContent.length > MAX) el.textContent = el.textContent.replace(/\n/g, ' ').slice(0, MAX)
    pinta()
  })
  el.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); el.blur() }
    if (e.key === 'Escape') { el.textContent = dato().t; el.blur() }
  })
  el.addEventListener('blur', () => {
    el.textContent = el.textContent.trim()
    dato().t = el.textContent
    guarda()
    colores.hidden = true
    cintaActiva = null
    pinta()
  })
  repintaCintas.push(pinta)   // medir exige estar en la página y con la fuente cargada
  return el
}

function muestraColores() {
  const r = cintaActiva.el.getBoundingClientRect()
  colores.hidden = false
  // el rectángulo viene en píxeles de pantalla; la posición va en unidades del lienzo
  colores.style.left = Math.max(8, (r.left + r.width / 2) / escala() - colores.offsetWidth / 2) + 'px'
  colores.style.top = r.top / escala() - colores.offsetHeight - 10 + 'px'
  ;[...colores.children].forEach((b, i) => b.classList.toggle('on', i === cintas[cintaActiva.n].c))
}
TELAS.forEach((tela, i) => {
  const b = crea('button')
  b.style.background = tela
  b.setAttribute('aria-label', 'Color de cinta ' + (i + 1))
  b.addEventListener('pointerdown', (e) => e.preventDefault())   // el foco se queda en la cinta
  b.addEventListener('click', () => { cintas[cintaActiva.n].c = i; guarda(); cintaActiva.pinta(); muestraColores() })
  colores.append(b)
})

// ------------------------------------------------------------------ montaje
const tiras = document.getElementById('tiras')
for (const c of CANALES) {
  const tira = crea('article', 'tira' + (c.estereo ? ' estereo' : ''))
  tira.setAttribute('aria-label', 'Canal ' + c.n)

  const cab = crea('div', 'tira-cab')
  cab.append(crea('span', 'tira-num', c.n), crea('span', 'tira-tipo', c.estereo ? 'ESTÉREO' : 'MONO'))
  if (c.extra) cab.append(teclaConLampara('tecla-mini', c.extra, 'blanco'))

  const eq = crea('div', 'rejilla')
  eq.append(perilla('HIGH', 'eq', 64), perilla('MID', 'eq', 64), perilla('FREQ', 'frec', 64), perilla('LOW', 'eq', 64))
  const envios = crea('div', 'rejilla')
  envios.append(perilla('AUX 1', 'envio', 0), perilla('AUX 2', 'envio', 0), perilla('EFX', 'envio', 0), perilla('SUB', 'envio', 0))

  const filaPan = crea('div', 'fila-pan')
  const mute = teclaConLampara('tecla-mute', 'MUTE', 'ambar')
  mute.addEventListener('click', () => tira.classList.toggle('muda', mute.classList.contains('on')))
  filaPan.append(perilla('PAN', 'pan', 64), mute)

  const f = fader(100)
  const zonaCinta = crea('div', 'cinta-zona')
  zonaCinta.append(cinta(c.n))

  const grupo = (titulo, cuerpo) => { const g = crea('div'); g.append(crea('h2', '', titulo), cuerpo); return g }
  tira.append(cab, grupo('EQ', eq), grupo('ENVÍOS', envios), filaPan, f.el, f.valor, zonaCinta)
  tiras.append(tira)
}

const repinta = () => repintaCintas.forEach((pinta) => pinta())
repinta()
document.fonts.ready.then(repinta)

// efecto: una sola tecla encendida, y sus dos perillas cambian con el tipo
const efectos = document.getElementById('efectos')
const efectoParams = document.getElementById('efecto-params')
function eligeEfecto(id) {
  for (const b of efectos.children) {
    const on = b.dataset.id === id
    b.classList.toggle('on', on)
    b.setAttribute('aria-checked', String(on))
  }
  const { params } = EFECTOS.find((e) => e.id === id)
  efectoParams.replaceChildren(...(params.length ? params.map((p) => perilla(p, 'envio', 64)) : [crea('em', '', 'AI Noise Reduction no tiene parámetros')]))
}
for (const e of EFECTOS) {
  const b = crea('button', 'tecla')
  b.dataset.id = e.id
  b.setAttribute('role', 'radio')
  b.append(crea('i', 'lampara blanco'), e.id)
  b.addEventListener('click', () => eligeEfecto(e.id))
  efectos.append(b)
}
eligeEfecto('HALL')

// escenas: una sola activa
const escenas = [...document.querySelectorAll('.tecla-escena')]
const eligeEscena = (id) => escenas.forEach((b) => {
  const on = b.dataset.escena === id
  b.classList.toggle('on', on)
  b.setAttribute('role', 'radio')
  b.setAttribute('aria-checked', String(on))
})
escenas.forEach((b) => b.addEventListener('click', () => eligeEscena(b.dataset.escena)))
eligeEscena('A')

const comp = document.getElementById('btn-comp')
comp.addEventListener('click', () => comp.setAttribute('aria-pressed', String(comp.classList.toggle('on'))))

// MODULACIÓN: los LFO de cada perilla solo se ven en este modo
const modulacion = document.getElementById('btn-modulacion')
modulacion.addEventListener('click', () => modulacion.setAttribute('aria-pressed', String(document.body.classList.toggle('modulacion'))))
