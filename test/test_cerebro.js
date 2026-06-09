/* Simulador del cerebro (Apps Script) en Node con Google falso (in-memory).
   Corre un flujo completo para verificar columnas, cálculos y lógica.
   node test_cerebro.js */
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const path = require("path");

let PASS = 0, FAIL = 0;
function ok(cond, msg) { if (cond) { PASS++; console.log("  ✓ " + msg); } else { FAIL++; console.log("  ✗ FALLA: " + msg); } }

/* ---------- Mock de una Hoja (Sheet) en memoria ---------- */
function makeSheet(name) {
  const data = []; // data[r][c], 0-indexed
  function ensure(r, c) { while (data.length < r) data.push([]); for (let i = 0; i < r; i++) while (data[i].length < c) data[i].push(""); }
  const sheet = {
    _name: name, _frozen: 0,
    getName: () => sheet._name, setName: (n) => { sheet._name = n; return sheet; },
    setFrozenRows: (n) => { sheet._frozen = n; return sheet; },
    setColumnWidth: () => sheet, autoResizeColumn: () => sheet, setTabColor: () => sheet,
    getMaxRows: () => Math.max(1000, data.length),
    getLastRow: () => data.length,
    appendRow: (arr) => { data.push(arr.slice()); },
    deleteRow: (r) => { data.splice(r - 1, 1); },
    insertSheet: undefined,
    getRange: (row, col, numRows = 1, numCols = 1) => {
      if (typeof row === "string") { // notación A1, ej "B2"
        const m = row.match(/^([A-Z]+)(\d+)$/);
        let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
        col = c; row = parseInt(m[2], 10); numRows = 1; numCols = 1;
      }
      const range = {
        setValues: (vals) => { ensure(row + numRows - 1, col + numCols - 1); for (let i = 0; i < numRows; i++) for (let j = 0; j < numCols; j++) data[row - 1 + i][col - 1 + j] = vals[i][j]; return range; },
        getValues: () => { ensure(row + numRows - 1, col + numCols - 1); const out = []; for (let i = 0; i < numRows; i++) { const rr = []; for (let j = 0; j < numCols; j++) rr.push(data[row - 1 + i][col - 1 + j]); out.push(rr); } return out; },
        setValue: (v) => { ensure(row, col); data[row - 1][col - 1] = v; return range; },
        getValue: () => { ensure(row, col); return data[row - 1][col - 1]; },
        setNumberFormat: () => range, setFontWeight: () => range, setBackground: () => range,
        setFontColor: () => range, setFontSize: () => range, copyTo: () => range,
      };
      return range;
    },
    _data: data,
  };
  return sheet;
}
function makeSpreadsheet(nombre) {
  const sheets = [makeSheet("Hoja 1")];
  return {
    _id: "ss_" + Math.random().toString(36).slice(2),
    getId: function () { return this._id; },
    getName: () => nombre,
    getSheets: () => sheets,
    getSheetByName: (n) => sheets.find((s) => s._name === n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
    deleteSheet: (s) => { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); },
  };
}

/* ---------- Mock Drive ---------- */
function makeFolder(name) {
  const folders = [], files = [];
  const f = {
    getName: () => name, getId: () => "fld_" + name, getUrl: () => "https://drive.google.com/drive/folders/fld_" + encodeURIComponent(name),
    getFoldersByName: (n) => iter(folders.filter((x) => x.getName() === n)),
    createFolder: (n) => { const nf = makeFolder(n); folders.push(nf); return nf; },
    getFilesByName: (n) => iter(files.filter((x) => x._name === n)),
    getFiles: () => iter(files.slice()),
    createFile: (blob) => { const file = { _name: (blob && blob._name) || "file", getName: () => file._name, getId: () => "file_" + Math.random(), getMimeType: () => "x", setName: (nn) => { file._name = nn; return file; }, setTrashed: () => {} }; files.push(file); return file; },
    addFile: () => {}, removeFile: () => {}, setTrashed: () => {},
  };
  return f;
}
function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
const rootFolder = makeFolder("MiDrive");
const allTopFolders = [];

/* ---------- Mocks globales de Apps Script ---------- */
let uuidN = 0;
const mailsEnviados = [];
const cache = {};
const sandbox = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === "CLAVE" ? "test-clave" : null) }) },
  ContentService: { createTextOutput: (s) => ({ _s: s, setMimeType: function () { return this; }, getContent: function () { return this._s; } }), MimeType: { JSON: "json" } },
  MailApp: { sendEmail: (to, subj, body) => mailsEnviados.push({ to, subj, body }) },
  Session: { getActiveUser: () => ({ getEmail: () => "carlos@branican.com" }) },
  CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
  UrlFetchApp: { fetch: () => ({ getContentText: () => "", getResponseCode: () => 200, getBlob: () => ({ setName: () => ({}) }) }) },
  Utilities: {
    getUuid: () => "uuid-" + (++uuidN),
    computeDigest: (algo, str) => Array.from(crypto.createHash("sha256").update(String(str)).digest()),
    DigestAlgorithm: { SHA_256: "sha256" },
    formatDate: (date, tz, fmt) => {
      const d = date instanceof Date ? date : new Date(date);
      const p = (n) => String(n).padStart(2, "0");
      return fmt.replace("yyyy", d.getFullYear()).replace("MM", p(d.getMonth() + 1)).replace("dd", p(d.getDate())).replace("HH", p(d.getHours())).replace("mm", p(d.getMinutes()));
    },
    newBlob: (bytes, type, name) => ({ _name: name, setName: function (n) { this._name = n; return this; } }),
    base64Decode: (s) => Buffer.from(String(s), "base64"),
  },
  DriveApp: {
    getFoldersByName: (n) => iter(allTopFolders.filter((x) => x.getName() === n)),
    createFolder: (n) => { const f = makeFolder(n); allTopFolders.push(f); return f; },
    getFileById: (id) => ({ setTrashed: () => {} }),
    getRootFolder: () => rootFolder,
  },
  SpreadsheetApp: {
    create: (n) => { const ss = makeSpreadsheet(n); sandbox._lastSS = ss; sandbox._ssById[ss.getId()] = ss; return ss; },
    open: (file) => sandbox._ssByFile[file._name] || sandbox._lastSS,
    openById: (id) => sandbox._ssById[id],
  },
  _ssById: {}, _ssByFile: {}, _lastSS: null,
};
// SpreadsheetApp.create debe quedar "dentro" de la carpeta raíz como archivo: simulamos planilla_ que crea y mueve.
// Para que raiz.getFilesByName(NOMBRE) la encuentre luego, conectamos: cuando se crea la planilla, la registramos por nombre.
const origCreate = sandbox.SpreadsheetApp.create;
sandbox.SpreadsheetApp.create = (n) => { const ss = origCreate(n); sandbox._ssByFile[n] = ss; return ss; };

vm.createContext(sandbox);
const code = fs.readFileSync(path.join(__dirname, "..", "cerebro", "Codigo.gs"), "utf8");
vm.runInContext(code, sandbox);

/* Para que planilla_() reencuentre la planilla creada: parchamos raiz_().getFilesByName.
   El cerebro hace: raiz.getFilesByName(NOMBRE_PLANILLA). Cuando crea, hace raiz.addFile(file) (no-op aquí).
   Solución: cuando SpreadsheetApp.create corre, agregamos un "file" a la carpeta raíz con ese nombre que al abrir devuelva la ss. */
const raizFolder = makeFolder("Activaciones");
allTopFolders.push(raizFolder);
const _origCreate2 = sandbox.SpreadsheetApp.create;
sandbox.SpreadsheetApp.create = (n) => {
  const ss = _origCreate2(n);
  // simular archivo en la carpeta para que getFilesByName lo halle
  raizFolder._injectFile = { _name: n };
  sandbox._ssByFile[n] = ss;
  return ss;
};
// Parchar getFilesByName de la carpeta raíz para devolver el "archivo" de la planilla si existe
const _origGFBN = raizFolder.getFilesByName;
raizFolder.getFilesByName = (n) => {
  if (raizFolder._injectFile && raizFolder._injectFile._name === n) return iter([raizFolder._injectFile]);
  return iter([]);
};

const call = (obj) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(obj) } }).getContent());
const CL = "test-clave";

console.log("\n=== TEST CEREBRO ACTIVACIONES ===\n");

// 1) Login bootstrap (primer usuario = admin) + token
console.log("1) Login bootstrap admin");
let r = call({ clave: CL, accion: "login", email: "carlos@branican.com", pass: "Clave123" });
if (!r.ok) console.log("   DEBUG login:", JSON.stringify(r));
ok(r.ok === true, "login ok");
ok(r.usuario && r.usuario.rol === "admin", "primer usuario es admin");
ok(typeof r.token === "string" && r.token.length > 0, "devuelve token de sesión");
const TOKEN = r.token;

// 2) Sin token, acción admin debe rechazarse
console.log("2) Seguridad");
r = call({ clave: CL, accion: "get_config" });
ok(r.ok === false && r.auth === false, "sin token → sesión inválida");
r = call({ clave: "mala", accion: "get_config" });
ok(r.ok === false && /Clave/.test(r.error), "clave incorrecta → rechazado");

// 3) get_config con token admin
console.log("3) Configuración");
r = call({ clave: CL, accion: "get_config", token: TOKEN });
ok(r.ok && r.config && r.config.aprobar_usuarios === "si", "config por defecto aprobar_usuarios=si");

// 4) Guardar activación completa y verificar round-trip
console.log("4) Guardar y leer activación (columnas)");
const datos = {
  nombre_activacion: "Bar La Mar", lugar: "La Mar", comuna: "Providencia", fecha: "2026-06-10",
  persona_branican: "Carlos", quien_contacto: "Juan", contacto_futuro_nombre: "Ana", contacto_futuro_dato: "+569",
  personas_invitadas: 50, personal_cantidad: 3, pago_personal: 105000, gasto_adicionales: 20000,
  formato: "Ambas", gin_inicial: 10, gin_sobrante: 3, gin_consumido: 7.7, gin_cortesia: 1, costo_total: 125000,
  hora_inicio: "20:00", hora_fin: "23:30", duracion_horas: 3.5, botellas_ini: 10, botellas_sob: 3,
  granel_ini: 5, granel_sob: 2, botellas_rellenadas: 4, hielo_cliente: true, tonica_cliente: false,
  contactos_nuevos: "Pedro 12345", ventas_detalle: "Cóctel x3 $5000; Jigger x2 $8000", ingreso_ventas: 31000,
  checklist: "Hielo: 20 kg; Mesa: 2 u", hielo_kg: 20, tonica_litros: 12,
  ig_inicio: 4944, ig_fin: 4981, ig_ganados: 37,
  trabajadores_detalle: "Ana Pérez|11.111.111-1|Bartender; Luis Soto|22.222.222-2|Promotor"
};
r = call({ clave: CL, accion: "guardar_activacion", token: TOKEN, datos: datos, fotos: [] });
ok(r.ok === true, "guardar_activacion ok");

let h = call({ clave: CL, accion: "historial", token: TOKEN });
ok(h.ok && h.lista.length === 1, "historial tiene 1 activación");
ok(h.lista[0].nombre_activacion === "Bar La Mar", "nombre correcto en historial");
ok(h.lista[0].ig_ganados === 37, "ig_ganados correcto en historial");
const ID = h.lista[0].id;
ok(!!ID, "activación tiene ID");

let g = call({ clave: CL, accion: "get_activacion", token: TOKEN, id: ID });
ok(g.ok, "get_activacion ok");
ok(g.datos.nombre_activacion === "Bar La Mar", "nombre round-trip");
ok(g.datos.lugar === "La Mar", "lugar round-trip");
ok(Number(g.datos.pago_personal) === 105000, "pago_personal round-trip");
ok(g.datos.formato === "Ambas", "formato round-trip");
ok(Number(g.datos.botellas_ini) === 10 && Number(g.datos.granel_ini) === 5, "botellas/granel round-trip");
ok(g.datos.hora_inicio === "20:00" && g.datos.hora_fin === "23:30", "horario round-trip");
ok(Number(g.datos.botellas_rellenadas) === 4, "botellas rellenadas round-trip");
ok(g.datos.hielo_cliente === true && g.datos.tonica_cliente === false, "toggles cliente round-trip");
ok(g.datos.contactos_nuevos === "Pedro 12345", "contactos round-trip");
ok(g.datos.ventas_detalle === "Cóctel x3 $5000; Jigger x2 $8000", "ventas round-trip");
ok(Number(g.datos.ingreso_ventas) === 31000, "ingreso round-trip");
ok(g.datos.checklist === "Hielo: 20 kg; Mesa: 2 u", "checklist round-trip");
ok(Number(g.datos.hielo_kg) === 20 && Number(g.datos.tonica_litros) === 12, "hielo/tonica round-trip");
ok(Number(g.datos.ig_inicio) === 4944 && Number(g.datos.ig_fin) === 4981, "IG round-trip");
ok(g.datos.trabajadores_detalle === "Ana Pérez|11.111.111-1|Bartender; Luis Soto|22.222.222-2|Promotor", "trabajadores round-trip");

// 4b) ver_activacion (solo lectura) accesible y con trabajadores + estado
let vd = call({ clave: CL, accion: "ver_activacion", token: TOKEN, id: ID });
ok(vd.ok && vd.datos && vd.datos.nombre_activacion === "Bar La Mar", "ver_activacion devuelve detalle");
ok(/Ana Pérez/.test(vd.datos.trabajadores_detalle), "ver_activacion incluye equipo de trabajo");
ok(!!vd.datos.estado, "ver_activacion incluye estado");

// 4c) Recién creada → etapa abierta (en planificación)
ok(h.lista[0].etapa === "abierta", "activación nueva nace 'abierta' (en planificación)");

// 5) Editar activación
console.log("5) Editar activación (admin)");
const datos2 = Object.assign({}, datos, { nombre_activacion: "Bar La Mar EDITADO", costo_total: 130000, ig_ganados: 50 });
r = call({ clave: CL, accion: "editar_activacion", token: TOKEN, id: ID, datos: datos2 });
ok(r.ok, "editar_activacion ok");
g = call({ clave: CL, accion: "get_activacion", token: TOKEN, id: ID });
ok(g.datos.nombre_activacion === "Bar La Mar EDITADO", "edición se guardó");

// 5b) Mientras está abierta NO cuenta; al cerrar entra al dashboard
console.log("5b) Cierre de activación");
let eAntes = call({ clave: CL, accion: "estadisticas", token: TOKEN });
ok(eAntes.ok && eAntes.stats.total === 0, "abierta NO cuenta en estadísticas");
r = call({ clave: CL, accion: "cerrar_activacion", token: TOKEN, id: ID, etapa: "cerrada" });
ok(r.ok && r.etapa === "cerrada", "cerrar_activacion ok");

// 6) Estadísticas
console.log("6) Estadísticas (dinero y promedios)");
let e = call({ clave: CL, accion: "estadisticas", token: TOKEN });
ok(e.ok && e.stats.total === 1, "stats total=1 (ya cerrada)");
ok(e.stats.ingreso === 31000, "ingreso=31000");
ok(e.stats.impuesto === Math.round(105000 * 0.145 / 0.855), "impuesto honorarios correcto (" + e.stats.impuesto + ")");
ok(e.stats.gastoTotal === Math.round(105000 / 0.855 + 20000), "gasto total con honorarios correcto");
ok(e.stats.resultado === Math.round(31000 - (105000 / 0.855 + 20000)), "resultado = ingreso - gasto");
ok(Math.abs(e.stats.ginPorPersona - (7.7 / 50)) < 0.01, "gin por persona correcto");
ok(Math.abs(e.stats.hieloPorPersona - (20 / 50)) < 0.01, "hielo por persona correcto");

// 7) Registro con código por correo + verificación
console.log("7) Registro con código + verificación");
mailsEnviados.length = 0;
r = call({ clave: CL, accion: "registrar", nombre: "Diego", email: "diego@x.com", pass: "Diego123" });
ok(r.ok && r.need_code === true, "registrar pide código");
ok(mailsEnviados.some((m) => m.to === "diego@x.com" && /codigo/i.test(m.subj)), "se envió correo con código a diego");
const codeMail = mailsEnviados.find((m) => m.to === "diego@x.com");
const codigo = (codeMail.body.match(/(\d{6})/) || [])[1];
ok(!!codigo, "código de 6 dígitos en el correo: " + codigo);
r = call({ clave: CL, accion: "verificar_codigo", email: "diego@x.com", code: codigo });
ok(r.ok === true, "verificar_codigo ok → usuario creado (pendiente)");
ok(r.pendiente === true, "queda pendiente de aprobación");

// 8) Login pendiente debe fallar; aprobar; luego entra
console.log("8) Flujo de aprobación");
r = call({ clave: CL, accion: "login", email: "diego@x.com", pass: "Diego123" });
ok(r.ok === false && /pendiente/i.test(r.error), "diego pendiente no puede entrar");
r = call({ clave: CL, accion: "aprobar_usuario", token: TOKEN, email: "diego@x.com", aprobar: true });
ok(r.ok, "admin aprueba a diego");
r = call({ clave: CL, accion: "login", email: "diego@x.com", pass: "Diego123" });
ok(r.ok === true, "diego ya puede entrar tras aprobación");
const TOKEN_DIEGO = r.token;

// 9) Diego (usuario) NO puede acciones de admin
console.log("9) Usuario normal bloqueado de admin");
r = call({ clave: CL, accion: "eliminar_usuario", token: TOKEN_DIEGO, email: "carlos@branican.com" });
ok(r.ok === false && /autorizado/i.test(r.error), "diego no puede eliminar usuarios");
r = call({ clave: CL, accion: "set_config", token: TOKEN_DIEGO, clave_cfg: "aprobar_usuarios", valor: "no" });
ok(r.ok === false, "diego no puede cambiar configuración");

// 10) Admin crea usuario con clave temporal
console.log("10) Admin crea usuario (clave temporal)");
mailsEnviados.length = 0;
r = call({ clave: CL, accion: "crear_usuario", token: TOKEN, nombre: "Sofía", email: "sofia@x.com", rol: "usuario" });
ok(r.ok && r.temp === true, "crear_usuario genera clave temporal");
ok(mailsEnviados.some((m) => m.to === "sofia@x.com"), "se envió la clave temporal por correo");
let lu = call({ clave: CL, accion: "listar_usuarios", token: TOKEN });
ok(lu.ok && lu.lista.length === 3, "hay 3 usuarios (carlos, diego, sofia)");

// 11) Historial: todos ven todas (con marca 'mio'); usuario no puede editar lo ajeno
console.log("11) Historial compartido (solo lectura para lo ajeno)");
const hDiego = call({ clave: CL, accion: "historial", token: TOKEN_DIEGO });
ok(hDiego.ok && hDiego.lista.length === 1, "diego ve la activación de carlos");
ok(hDiego.lista[0].mio === false, "para diego esa activación NO es suya (mio=false)");
// Diego puede VER el detalle (solo lectura) de la activación ajena
const vDiego = call({ clave: CL, accion: "ver_activacion", token: TOKEN_DIEGO, id: ID });
ok(vDiego.ok && vDiego.datos.nombre_activacion === "Bar La Mar EDITADO", "diego ve el detalle (solo lectura)");
// Pero NO puede editar NI cerrar lo ajeno
const eDiego = call({ clave: CL, accion: "editar_activacion", token: TOKEN_DIEGO, id: ID, datos: datos });
ok(eDiego.ok === false && /propias/i.test(eDiego.error), "diego no puede editar lo ajeno");
const cDiego = call({ clave: CL, accion: "cerrar_activacion", token: TOKEN_DIEGO, id: ID, etapa: "abierta" });
ok(cDiego.ok === false && /propias/i.test(cDiego.error), "diego no puede cerrar/reabrir lo ajeno");

// 12) Dueño crea, edita y cierra SU propia activación; fotos opcionales
console.log("12) Dueño edita y cierra lo suyo (fotos opcionales)");
let rD = call({ clave: CL, accion: "guardar_activacion", token: TOKEN_DIEGO, datos: {
  nombre_activacion: "Evento Diego", lugar: "Centro", comuna: "Santiago", fecha: "2026-07-01",
  persona_branican: "Diego", personal_cantidad: 1, pago_personal: 30000, formato: "Botellas",
  botellas_ini: 2, costo_total: 30000 }, fotos: [] });
ok(rD.ok === true, "diego guarda su activación SIN fotos (opcionales)");
let hD = call({ clave: CL, accion: "historial", token: TOKEN_DIEGO });
let mia = hD.lista.find((x) => x.nombre_activacion === "Evento Diego");
ok(mia && mia.mio === true && mia.etapa === "abierta", "su activación sale 'tuya' y 'abierta'");
let reD = call({ clave: CL, accion: "editar_activacion", token: TOKEN_DIEGO, id: mia.id, datos: {
  nombre_activacion: "Evento Diego", lugar: "Centro", comuna: "Santiago", fecha: "2026-07-01",
  persona_branican: "Diego", personal_cantidad: 1, pago_personal: 30000, formato: "Botellas",
  botellas_ini: 2, botellas_sob: 1, costo_total: 30000 } });
ok(reD.ok === true, "diego edita SU propia activación");
let rcD = call({ clave: CL, accion: "cerrar_activacion", token: TOKEN_DIEGO, id: mia.id, etapa: "cerrada" });
ok(rcD.ok === true && rcD.etapa === "cerrada", "diego cierra SU propia activación");

// 13) Dashboard + Desglose se reconstruyen sin error y con desglose por activación
console.log("13) Dashboard y Desglose");
r = call({ clave: CL, accion: "rehacer_dashboard", token: TOKEN });
ok(r.ok === true, "rehacer_dashboard ok (Dashboard + Desglose)");
const ssTest = sandbox._lastSS;
const desg = ssTest.getSheetByName("Desglose");
ok(!!desg, "existe la pestaña Desglose");
ok(desg._data[2] && desg._data[2][0] === "Fecha", "Desglose tiene cabecera en fila 3");
ok(desg._data.length >= 4, "Desglose tiene al menos una activación listada");
const dash = ssTest.getSheetByName("Dashboard");
const dashTxt = JSON.stringify(dash._data);
ok(/RESULTADOS POR AÑO/.test(dashTxt), "Dashboard incluye 'RESULTADOS POR AÑO'");
ok(/RESULTADOS POR SEMESTRE/.test(dashTxt), "Dashboard incluye 'RESULTADOS POR SEMESTRE'");

console.log("\n=== RESULTADO: " + PASS + " OK, " + FAIL + " fallas ===\n");
process.exit(FAIL ? 1 : 0);
