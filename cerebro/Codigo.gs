/*************************************************************
 *  CEREBRO Activaciones Malcriado — Google Apps Script (gratis)
 *  Guarda TODO en tu Google Drive:
 *   - Carpeta "Activaciones"
 *       - "Planilla Activaciones" (Google Sheet) con pestañas:
 *            Activaciones (datos) · Usuarios · Dashboard
 *       - "Fotos" / "<fecha> - <nombre activacion>" / foto1.jpg ...
 *  NO toca Bsale para nada.
 *
 *  Configuración (Project Settings > Script properties):
 *     CLAVE = una clave secreta (la misma que pondrás en la app)
 *************************************************************/

var CARPETA_RAIZ = "Activaciones";
var NOMBRE_PLANILLA = "Planilla Activaciones";
var CABECERAS = ["Fecha registro","Fecha activacion","Nombre activacion","Lugar","Comuna",
  "Persona Branican","Quien contacto","Contacto futuro nombre","Contacto futuro dato",
  "Personas invitadas","Personal cantidad","Pago personal","Gasto adicionales","Formato",
  "Gin inicial","Gin sobrante","Gin consumido","Gin cortesia","Costo total",
  "Registrado por","Usuario email","Carpeta fotos","N fotos"];

function prop_(k){ return PropertiesService.getScriptProperties().getProperty(k); }
function responder_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e){
  var clave = e && e.parameter ? e.parameter.clave : "";
  if (clave !== prop_("CLAVE")) return responder_({ok:false,error:"Clave incorrecta"});
  return responder_({ok:true, msg:"Cerebro Activaciones conectado"});
}

// Ejecuta esta función UNA vez desde el editor para autorizar permisos de Drive/Sheets.
function autorizar(){ planilla_(); return "OK, permisos concedidos"; }

function doPost(e){
  try{
    var data = JSON.parse(e.postData.contents);
    if (data.clave !== prop_("CLAVE")) return responder_({ok:false,error:"Clave incorrecta"});
    switch(data.accion){
      case "login":            return responder_(login_(data));
      case "crear_usuario":    return responder_(crearUsuario_(data));
      case "cambiar_pass":     return responder_(cambiarPass_(data));
      case "listar_usuarios":  return responder_(listarUsuarios_());
      case "guardar_activacion": return responder_(guardarActivacion_(data));
      case "historial":        return responder_(historial_());
      default:                 return responder_({ok:false,error:"Accion desconocida"});
    }
  }catch(err){ return responder_({ok:false,error:String(err)}); }
}

/* ---------- Drive: carpeta raíz y planilla ---------- */
function raiz_(){
  var it = DriveApp.getFoldersByName(CARPETA_RAIZ);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_RAIZ);
}
function subcarpeta_(parent, nombre){
  var it = parent.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : parent.createFolder(nombre);
}
function planilla_(){
  var raiz = raiz_();
  var files = raiz.getFilesByName(NOMBRE_PLANILLA);
  var ss;
  if (files.hasNext()){
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(NOMBRE_PLANILLA);
    // mover a la carpeta raíz
    var f = DriveApp.getFileById(ss.getId());
    raiz.addFile(f); DriveApp.getRootFolder().removeFile(f);
  }
  asegurarHojas_(ss);
  return ss;
}
function asegurarHojas_(ss){
  // Activaciones
  var act = ss.getSheetByName("Activaciones");
  if (!act){ act = ss.getSheets()[0]; act.setName("Activaciones"); }
  if (act.getLastRow() === 0){
    act.getRange(1,1,1,CABECERAS.length).setValues([CABECERAS]).setFontWeight("bold").setBackground("#0a0a0a").setFontColor("#ffffff");
    act.setFrozenRows(1);
  }
  // Usuarios
  if (!ss.getSheetByName("Usuarios")){
    var u = ss.insertSheet("Usuarios");
    u.getRange(1,1,1,6).setValues([["Nombre","Email","PassHash","Rol","Activo","Creado"]]).setFontWeight("bold");
    u.setFrozenRows(1);
  }
  // Dashboard
  if (!ss.getSheetByName("Dashboard")) crearDashboard_(ss);
}
function crearDashboard_(ss){
  var d = ss.insertSheet("Dashboard", 0);
  d.getRange("B2").setValue("DASHBOARD · ACTIVACIONES MALCRIADO").setFontSize(16).setFontWeight("bold");
  var filas = [
    ["Total de activaciones", '=COUNTA(Activaciones!C2:C)'],
    ["Costo total acumulado", '=SUM(Activaciones!S2:S)'],
    ["Gin consumido total",   '=SUM(Activaciones!Q2:Q)'],
    ["Gin cortesia total",    '=SUM(Activaciones!R2:R)'],
    ["Personas invitadas total", '=SUM(Activaciones!J2:J)'],
    ["Personal contratado total", '=SUM(Activaciones!K2:K)'],
    ["Pago a personal total", '=SUM(Activaciones!L2:L)'],
    ["Gasto adicionales total", '=SUM(Activaciones!M2:M)']
  ];
  d.getRange(4,2,filas.length,2).setValues(filas);
  d.getRange(4,2,filas.length,1).setFontWeight("bold");
  d.getRange(5,3).setNumberFormat("$#,##0"); d.getRange(10,3,2,1).setNumberFormat("$#,##0");
  d.setColumnWidth(2,230); d.setColumnWidth(3,160);
  d.getRange("B13").setValue("Tip: Inserta > Gráfico sobre la pestaña Activaciones para ver tendencias.").setFontColor("#888");
}

/* ---------- Seguridad de contraseñas ---------- */
function hashPass_(pass){
  var salt = Utilities.getUuid().replace(/-/g,"").slice(0,16);
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pass);
  return salt + "$" + raw.map(function(b){ return ("0"+(b&255).toString(16)).slice(-2); }).join("");
}
function verifyPass_(pass, stored){
  if (!stored || stored.indexOf("$") < 0) return false;
  var parts = stored.split("$"), salt = parts[0];
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pass);
  var hex = raw.map(function(b){ return ("0"+(b&255).toString(16)).slice(-2); }).join("");
  return hex === parts[1];
}

/* ---------- Usuarios ---------- */
function login_(data){
  var ss = planilla_(), u = ss.getSheetByName("Usuarios");
  var n = u.getLastRow();
  // Bootstrap: si no hay usuarios, el primero que entra queda como ADMIN.
  if (n < 2){
    u.appendRow([data.email.split("@")[0], (data.email||"").toLowerCase(), hashPass_(data.pass), "admin", true, new Date()]);
    return {ok:true, usuario:{nombre:data.email.split("@")[0], email:(data.email||"").toLowerCase(), rol:"admin"}, primer:true};
  }
  var datos = u.getRange(2,1,n-1,5).getValues();
  var email = (data.email||"").toLowerCase();
  for (var i=0;i<datos.length;i++){
    if (String(datos[i][1]).toLowerCase() === email){
      if (datos[i][4] === false) return {ok:false,error:"Usuario inactivo"};
      if (verifyPass_(data.pass, datos[i][2])) return {ok:true, usuario:{nombre:datos[i][0], email:email, rol:datos[i][3]||"usuario"}};
      return {ok:false,error:"Contraseña incorrecta"};
    }
  }
  return {ok:false,error:"Email no registrado"};
}
function crearUsuario_(data){
  var ss = planilla_(), u = ss.getSheetByName("Usuarios");
  var email = (data.email||"").toLowerCase();
  var n = u.getLastRow();
  if (n >= 2){
    var datos = u.getRange(2,2,n-1,1).getValues();
    for (var i=0;i<datos.length;i++) if (String(datos[i][0]).toLowerCase() === email) return {ok:false,error:"Ya existe ese email"};
  }
  u.appendRow([data.nombre, email, hashPass_(data.pass), data.rol||"usuario", true, new Date()]);
  return {ok:true};
}
function cambiarPass_(data){
  var ss = planilla_(), u = ss.getSheetByName("Usuarios"); var n = u.getLastRow();
  if (n < 2) return {ok:false,error:"No hay usuarios"};
  var datos = u.getRange(2,1,n-1,5).getValues();
  var email = (data.email||"").toLowerCase();
  for (var i=0;i<datos.length;i++){
    if (String(datos[i][1]).toLowerCase() === email){
      if (!verifyPass_(data.pass_actual, datos[i][2])) return {ok:false,error:"Tu contraseña actual no es correcta"};
      u.getRange(2+i, 3).setValue(hashPass_(data.pass_nueva));
      return {ok:true};
    }
  }
  return {ok:false,error:"Usuario no encontrado"};
}
function listarUsuarios_(){
  var ss = planilla_(), u = ss.getSheetByName("Usuarios"); var n = u.getLastRow();
  if (n < 2) return {ok:true, lista:[]};
  var datos = u.getRange(2,1,n-1,4).getValues();
  return {ok:true, lista: datos.map(function(r){ return {nombre:r[0], email:r[1], rol:r[3]||"usuario"}; })};
}

/* ---------- Guardar activación + fotos ---------- */
function guardarActivacion_(data){
  var ss = planilla_(), sh = ss.getSheetByName("Activaciones");
  var d = data.datos || {};
  // Carpeta de fotos: Activaciones/Fotos/<fecha> - <nombre>
  var raiz = raiz_();
  var fotosRoot = subcarpeta_(raiz, "Fotos");
  var fecha = d.fecha || Utilities.formatDate(new Date(), "GMT-4", "yyyy-MM-dd");
  var safe = String(d.nombre_activacion||"activacion").replace(/[\\/:*?"<>|]/g,"").slice(0,60).trim();
  var carpeta = fotosRoot.createFolder(fecha + " - " + safe);
  var nFotos = 0;
  (data.fotos||[]).forEach(function(f, i){
    try{
      var b64 = String(f.dataUrl||"").replace(/^data:[^,]+,/, "");
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), "image/jpeg", "foto" + (i+1) + ".jpg");
      carpeta.createFile(blob); nFotos++;
    }catch(e){}
  });
  var fila = [ new Date(), fecha, d.nombre_activacion||"", d.lugar||"", d.comuna||"",
    d.persona_branican||"", d.quien_contacto||"", d.contacto_futuro_nombre||"", d.contacto_futuro_dato||"",
    Number(d.personas_invitadas)||0, Number(d.personal_cantidad)||0, Number(d.pago_personal)||0, Number(d.gasto_adicionales)||0,
    d.formato||"", Number(d.gin_inicial)||0, Number(d.gin_sobrante)||0, Number(d.gin_consumido)||0, Number(d.gin_cortesia)||0,
    Number(d.costo_total)||0, d.registrado_por||"", d.usuario_email||"", carpeta.getUrl(), nFotos ];
  sh.appendRow(fila);
  // formato $ a las columnas de dinero (L, M, S)
  var r = sh.getLastRow();
  sh.getRange(r,12).setNumberFormat("$#,##0"); sh.getRange(r,13).setNumberFormat("$#,##0"); sh.getRange(r,19).setNumberFormat("$#,##0");
  return {ok:true, fotos:nFotos, carpeta:carpeta.getUrl()};
}

/* ---------- Historial ---------- */
function historial_(){
  var ss = planilla_(), sh = ss.getSheetByName("Activaciones"); var n = sh.getLastRow();
  if (n < 2) return {ok:true, lista:[]};
  var datos = sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var lista = datos.map(function(r){
    return { fecha:r[1], nombre_activacion:r[2], lugar:r[3], comuna:r[4],
             gin_consumido:r[16], costo_total:r[18], registrado_por:r[19] };
  }).reverse(); // más nuevas primero
  return {ok:true, lista:lista};
}
