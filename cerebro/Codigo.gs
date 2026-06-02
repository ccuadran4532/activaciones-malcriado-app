/*************************************************************
 *  CEREBRO Activaciones Malcriado — Google Apps Script (gratis)
 *  Panel admin: aprobar usuarios y activaciones, activar/desactivar,
 *  configuracion. Guarda TODO en tu Google Drive. NO toca Bsale.
 *  Script property:  CLAVE = clave secreta (la misma de la app)
 *************************************************************/

var CARPETA_RAIZ = "Activaciones";
var NOMBRE_PLANILLA = "Planilla Activaciones";
var CABECERAS = ["Fecha registro","Fecha activacion","Nombre activacion","Lugar","Comuna",
  "Persona Branican","Quien contacto","Contacto futuro nombre","Contacto futuro dato",
  "Personas invitadas","Personal cantidad","Pago personal","Gasto adicionales","Formato",
  "Gin inicial","Gin sobrante","Gin consumido","Gin cortesia","Costo total",
  "Registrado por","Usuario email","Carpeta fotos","N fotos","Estado","ID"];
var COL_ESTADO = 24, COL_ID = 25;
var CFG_DEFAULT = { aprobar_usuarios: "si", aprobar_activaciones: "si" };

function prop_(k){ return PropertiesService.getScriptProperties().getProperty(k); }
function responder_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e){
  var clave = e && e.parameter ? e.parameter.clave : "";
  if (clave !== prop_("CLAVE")) return responder_({ok:false,error:"Clave incorrecta"});
  return responder_({ok:true, msg:"Cerebro Activaciones conectado"});
}
function autorizar(){
  planilla_();
  // Manda un correo de prueba a tu propia cuenta para pedir/confirmar el permiso de envio.
  MailApp.sendEmail(Session.getActiveUser().getEmail(),
    "Activaciones Malcriado - permisos OK",
    "Listo. La app ya puede enviar codigos de verificacion por correo.");
  return "OK, permisos concedidos (incluye correo)";
}

function doPost(e){
  try{
    var data = JSON.parse(e.postData.contents);
    if (data.clave !== prop_("CLAVE")) return responder_({ok:false,error:"Clave incorrecta"});
    switch(data.accion){
      case "login":              return responder_(login_(data));
      case "registrar":          return responder_(registrar_(data));
      case "verificar_codigo":   return responder_(verificarCodigo_(data));
      case "crear_usuario":      return responder_(crearUsuario_(data));
      case "eliminar_activacion":return responder_(eliminarActivacion_(data));
      case "cambiar_pass":       return responder_(cambiarPass_(data));
      case "listar_usuarios":    return responder_(listarUsuarios_());
      case "aprobar_usuario":    return responder_(aprobarUsuario_(data));
      case "activar_usuario":    return responder_(activarUsuario_(data));
      case "guardar_activacion": return responder_(guardarActivacion_(data));
      case "get_activacion":     return responder_(getActivacion_(data));
      case "editar_activacion":  return responder_(editarActivacion_(data));
      case "historial":          return responder_(historial_(data));
      case "revisar_activacion": return responder_(revisarActivacion_(data));
      case "get_config":         return responder_({ok:true, config:getConfig_()});
      case "set_config":         return responder_(setConfig_(data));
      default:                   return responder_({ok:false,error:"Accion desconocida"});
    }
  }catch(err){ return responder_({ok:false,error:String(err)}); }
}

/* ---------- Drive / planilla ---------- */
function raiz_(){ var it = DriveApp.getFoldersByName(CARPETA_RAIZ); return it.hasNext()?it.next():DriveApp.createFolder(CARPETA_RAIZ); }
function subcarpeta_(p,n){ var it=p.getFoldersByName(n); return it.hasNext()?it.next():p.createFolder(n); }
function planilla_(){
  var raiz = raiz_();
  var files = raiz.getFilesByName(NOMBRE_PLANILLA), ss;
  if (files.hasNext()) ss = SpreadsheetApp.open(files.next());
  else { ss = SpreadsheetApp.create(NOMBRE_PLANILLA); var f=DriveApp.getFileById(ss.getId()); raiz.addFile(f); DriveApp.getRootFolder().removeFile(f); }
  asegurarHojas_(ss);
  return ss;
}
function asegurarHojas_(ss){
  var act = ss.getSheetByName("Activaciones");
  if (!act){ act = ss.getSheets()[0]; act.setName("Activaciones"); }
  // Cabecera siempre actualizada (incluye Estado e ID)
  act.getRange(1,1,1,CABECERAS.length).setValues([CABECERAS]).setFontWeight("bold").setBackground("#0a0a0a").setFontColor("#ffffff");
  act.setFrozenRows(1);
  var u = ss.getSheetByName("Usuarios");
  if (!u){ u = ss.insertSheet("Usuarios"); }
  u.getRange(1,1,1,7).setValues([["Nombre","Email","PassHash","Rol","Activo","Creado","Estado"]]).setFontWeight("bold");
  u.setFrozenRows(1);
  if (!ss.getSheetByName("Config")){
    var c = ss.insertSheet("Config");
    c.getRange(1,1,1,2).setValues([["Clave","Valor"]]).setFontWeight("bold");
    c.getRange(2,1,2,2).setValues([["aprobar_usuarios","si"],["aprobar_activaciones","si"]]);
  }
  if (!ss.getSheetByName("Codigos")){
    var cg = ss.insertSheet("Codigos");
    cg.getRange(1,1,1,5).setValues([["Email","Codigo","Expira","Nombre","PassHash"]]).setFontWeight("bold");
  }
  if (!ss.getSheetByName("Dashboard")) crearDashboard_(ss);
}
function crearDashboard_(ss){
  var d = ss.insertSheet("Dashboard", 0);
  d.getRange("B2").setValue("DASHBOARD · ACTIVACIONES MALCRIADO").setFontSize(16).setFontWeight("bold");
  var filas = [
    ["Total de activaciones", '=COUNTA(Activaciones!C2:C)'],
    ["Aprobadas", '=COUNTIF(Activaciones!X2:X,"aprobado")'],
    ["Pendientes", '=COUNTIF(Activaciones!X2:X,"pendiente")'],
    ["Costo total acumulado", '=SUM(Activaciones!S2:S)'],
    ["Gin consumido total",   '=SUM(Activaciones!Q2:Q)'],
    ["Gin cortesia total",    '=SUM(Activaciones!R2:R)'],
    ["Personas invitadas total", '=SUM(Activaciones!J2:J)'],
    ["Pago a personal total", '=SUM(Activaciones!L2:L)'],
    ["Gasto adicionales total", '=SUM(Activaciones!M2:M)']
  ];
  d.getRange(4,2,filas.length,2).setValues(filas);
  d.getRange(4,2,filas.length,1).setFontWeight("bold");
  d.setColumnWidth(2,230); d.setColumnWidth(3,160);
}

/* ---------- Config ---------- */
function getConfig_(){
  var ss = planilla_(), c = ss.getSheetByName("Config"); var cfg = {};
  for (var k in CFG_DEFAULT) cfg[k] = CFG_DEFAULT[k];
  var n = c.getLastRow();
  if (n >= 2){ var d = c.getRange(2,1,n-1,2).getValues(); d.forEach(function(r){ if(r[0]) cfg[r[0]] = String(r[1]); }); }
  return cfg;
}
function setConfig_(data){
  var ss = planilla_(), c = ss.getSheetByName("Config"); var n = c.getLastRow();
  var d = n>=2 ? c.getRange(2,1,n-1,2).getValues() : [];
  for (var i=0;i<d.length;i++) if (d[i][0] === data.clave_cfg){ c.getRange(2+i,2).setValue(data.valor); return {ok:true}; }
  c.appendRow([data.clave_cfg, data.valor]); return {ok:true};
}

/* ---------- Seguridad ---------- */
function hashPass_(p){ var s=Utilities.getUuid().replace(/-/g,"").slice(0,16); var r=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s+p); return s+"$"+r.map(function(b){return("0"+(b&255).toString(16)).slice(-2);}).join(""); }
function verifyPass_(p,st){ if(!st||st.indexOf("$")<0)return false; var pa=st.split("$"),s=pa[0]; var r=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s+p); var h=r.map(function(b){return("0"+(b&255).toString(16)).slice(-2);}).join(""); return h===pa[1]; }

/* ---------- Usuarios ---------- */
function uSheet_(){ return planilla_().getSheetByName("Usuarios"); }
function login_(data){
  var u = uSheet_(); var n = u.getLastRow();
  // Bootstrap: si no hay usuarios, el primero queda ADMIN aprobado.
  if (n < 2){
    u.appendRow([data.email.split("@")[0], (data.email||"").toLowerCase(), hashPass_(data.pass), "admin", true, new Date(), "aprobado"]);
    return {ok:true, usuario:{nombre:data.email.split("@")[0], email:(data.email||"").toLowerCase(), rol:"admin"}};
  }
  var datos = u.getRange(2,1,n-1,7).getValues();
  var email = (data.email||"").toLowerCase();
  for (var i=0;i<datos.length;i++){
    if (String(datos[i][1]).toLowerCase() === email){
      var estado = datos[i][6] || "aprobado"; // legado vacio = aprobado
      if (estado === "pendiente") return {ok:false,error:"Tu cuenta esta pendiente de aprobacion del administrador"};
      if (estado === "rechazado") return {ok:false,error:"Tu cuenta fue rechazada"};
      if (datos[i][4] === false) return {ok:false,error:"Tu cuenta esta desactivada"};
      if (verifyPass_(data.pass, datos[i][2])) return {ok:true, usuario:{nombre:datos[i][0], email:email, rol:datos[i][3]||"usuario"}};
      return {ok:false,error:"Contrasena incorrecta"};
    }
  }
  return {ok:false,error:"Email no registrado"};
}
function existeEmail_(email){
  var u = uSheet_(), n = u.getLastRow(); if (n<2) return false;
  var d = u.getRange(2,2,n-1,1).getValues();
  for (var i=0;i<d.length;i++) if (String(d[i][0]).toLowerCase()===email) return true;
  return false;
}
// Auto-registro PASO 1: genera codigo de 6 digitos y lo envia por correo (vence 15 min)
function registrar_(data){
  var email=(data.email||"").toLowerCase();
  if (!data.nombre||!email||!data.pass) return {ok:false,error:"Completa nombre, email y contrasena"};
  if (existeEmail_(email)) return {ok:false,error:"Ya existe ese email"};
  var code = "" + Math.floor(100000 + Math.random()*900000);
  var expira = new Date(Date.now() + 15*60*1000);
  var cs = planilla_().getSheetByName("Codigos");
  borrarCodigo_(cs, email);
  cs.appendRow([email, code, expira, data.nombre, hashPass_(data.pass)]);
  try{
    MailApp.sendEmail(email, "Tu codigo - Activaciones Malcriado",
      "Hola " + data.nombre + ",\n\nTu codigo de verificacion es:  " + code +
      "\n\nVence en 15 minutos.\n\nActivaciones - The Branican Company");
  }catch(e){ return {ok:false, error:"No se pudo enviar el correo: " + e}; }
  return {ok:true, need_code:true};
}
function borrarCodigo_(cs, email){
  var n=cs.getLastRow(); if(n<2) return;
  var d=cs.getRange(2,1,n-1,1).getValues();
  for(var i=d.length-1;i>=0;i--) if(String(d[i][0]).toLowerCase()===email) cs.deleteRow(2+i);
}
// Auto-registro PASO 2: valida el codigo y recien ahi crea el usuario
function verificarCodigo_(data){
  var email=(data.email||"").toLowerCase();
  var cs=planilla_().getSheetByName("Codigos"), n=cs.getLastRow();
  if(n<2) return {ok:false,error:"Pide un codigo primero"};
  var d=cs.getRange(2,1,n-1,5).getValues();
  for(var i=0;i<d.length;i++){
    if(String(d[i][0]).toLowerCase()===email){
      if(new Date() > new Date(d[i][2])) { cs.deleteRow(2+i); return {ok:false,error:"El codigo expiro, pide uno nuevo"}; }
      if(String(d[i][1])!==String(data.code||"").trim()) return {ok:false,error:"Codigo incorrecto"};
      if(existeEmail_(email)){ cs.deleteRow(2+i); return {ok:false,error:"Ya existe ese email"}; }
      var requiere=getConfig_().aprobar_usuarios==="si";
      var estado=requiere?"pendiente":"aprobado";
      uSheet_().appendRow([d[i][3], email, d[i][4], "usuario", true, new Date(), estado]);
      cs.deleteRow(2+i);
      return {ok:true, pendiente:requiere};
    }
  }
  return {ok:false,error:"No hay codigo para ese email"};
}
// Admin crea usuario (queda aprobado directo)
function crearUsuario_(data){
  var email=(data.email||"").toLowerCase();
  if (existeEmail_(email)) return {ok:false,error:"Ya existe ese email"};
  uSheet_().appendRow([data.nombre, email, hashPass_(data.pass), data.rol||"usuario", true, new Date(), "aprobado"]);
  return {ok:true};
}
function cambiarPass_(data){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:false,error:"No hay usuarios"};
  var d=u.getRange(2,1,n-1,7).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][1]).toLowerCase()===email){
    if(!verifyPass_(data.pass_actual,d[i][2])) return{ok:false,error:"Tu contrasena actual no es correcta"};
    u.getRange(2+i,3).setValue(hashPass_(data.pass_nueva)); return{ok:true};
  }
  return{ok:false,error:"Usuario no encontrado"};
}
function listarUsuarios_(){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:true,lista:[]};
  var d=u.getRange(2,1,n-1,7).getValues();
  return {ok:true, lista:d.map(function(r){ return {nombre:r[0],email:r[1],rol:r[3]||"usuario",activo:r[4]!==false,estado:r[6]||"aprobado"}; })};
}
function aprobarUsuario_(data){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:false,error:"Sin usuarios"};
  var d=u.getRange(2,2,n-1,1).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][0]).toLowerCase()===email){
    u.getRange(2+i,7).setValue(data.aprobar?"aprobado":"rechazado"); return{ok:true};
  }
  return{ok:false,error:"Usuario no encontrado"};
}
function activarUsuario_(data){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:false,error:"Sin usuarios"};
  var d=u.getRange(2,2,n-1,1).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][0]).toLowerCase()===email){
    u.getRange(2+i,5).setValue(!!data.activo); return{ok:true};
  }
  return{ok:false,error:"Usuario no encontrado"};
}

/* ---------- Activaciones ---------- */
function guardarActivacion_(data){
  var ss=planilla_(), sh=ss.getSheetByName("Activaciones"), d=data.datos||{};
  var fotosRoot=subcarpeta_(raiz_(),"Fotos");
  var fecha=d.fecha||Utilities.formatDate(new Date(),"GMT-4","yyyy-MM-dd");
  var safe=String(d.nombre_activacion||"activacion").replace(/[\\/:*?"<>|]/g,"").slice(0,60).trim();
  var carpeta=fotosRoot.createFolder(fecha+" - "+safe), nFotos=0;
  (data.fotos||[]).forEach(function(f,i){ try{ var b=String(f.dataUrl||"").replace(/^data:[^,]+,/,""); carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b),"image/jpeg","foto"+(i+1)+".jpg")); nFotos++; }catch(e){} });
  var requiere = getConfig_().aprobar_activaciones === "si";
  var estado = requiere ? "pendiente" : "aprobado";
  var id = Utilities.getUuid();
  var fila=[ new Date(),fecha,d.nombre_activacion||"",d.lugar||"",d.comuna||"",d.persona_branican||"",d.quien_contacto||"",
    d.contacto_futuro_nombre||"",d.contacto_futuro_dato||"",Number(d.personas_invitadas)||0,Number(d.personal_cantidad)||0,
    Number(d.pago_personal)||0,Number(d.gasto_adicionales)||0,d.formato||"",Number(d.gin_inicial)||0,Number(d.gin_sobrante)||0,
    Number(d.gin_consumido)||0,Number(d.gin_cortesia)||0,Number(d.costo_total)||0,d.registrado_por||"",d.usuario_email||"",
    carpeta.getUrl(),nFotos,estado,id ];
  sh.appendRow(fila);
  var r=sh.getLastRow();
  sh.getRange(r,12).setNumberFormat("$#,##0"); sh.getRange(r,13).setNumberFormat("$#,##0"); sh.getRange(r,19).setNumberFormat("$#,##0");
  return {ok:true, fotos:nFotos, pendiente:requiere};
}
function historial_(data){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:true,lista:[]};
  var d=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var esAdmin = data && data.rol === "admin";
  var miEmail = data ? String(data.email||"").toLowerCase() : "";
  var lista=[];
  d.forEach(function(r){
    var estado=r[COL_ESTADO-1]||"aprobado";
    var row={ id:r[COL_ID-1], fecha:r[1], nombre_activacion:r[2], lugar:r[3], comuna:r[4],
      gin_consumido:r[16], costo_total:r[18], registrado_por:r[19], usuario_email:r[20], estado:estado };
    // Admin ve todo; usuario ve solo lo suyo
    if (esAdmin || String(r[20]).toLowerCase()===miEmail) lista.push(row);
  });
  return {ok:true, lista:lista.reverse()};
}
// Admin: obtiene todos los datos de una activacion (para editarla)
function getActivacion_(data){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:false,error:"Sin activaciones"};
  var rows=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  for(var i=0;i<rows.length;i++) if(String(rows[i][COL_ID-1])===String(data.id)){
    var r=rows[i];
    return {ok:true, datos:{ fecha:Utilities.formatDate(new Date(r[1]),"GMT-4","yyyy-MM-dd"), nombre_activacion:r[2], lugar:r[3], comuna:r[4],
      persona_branican:r[5], quien_contacto:r[6], contacto_futuro_nombre:r[7], contacto_futuro_dato:r[8],
      personas_invitadas:r[9], personal_cantidad:r[10], pago_personal:r[11], gasto_adicionales:r[12], formato:r[13],
      gin_inicial:r[14], gin_sobrante:r[15], gin_consumido:r[16], gin_cortesia:r[17], costo_total:r[18], registrado_por:r[19] }};
  }
  return {ok:false,error:"No encontrada"};
}
// Admin: edita los datos de una activacion (no toca fotos ni el ID)
function editarActivacion_(data){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:false,error:"Sin activaciones"};
  var ids=sh.getRange(2,COL_ID,n-1,1).getValues();
  for(var i=0;i<ids.length;i++) if(String(ids[i][0])===String(data.id)){
    var d=data.datos||{}, fila=2+i;
    sh.getRange(fila,2,1,19).setValues([[ d.fecha||"", d.nombre_activacion||"", d.lugar||"", d.comuna||"", d.persona_branican||"",
      d.quien_contacto||"", d.contacto_futuro_nombre||"", d.contacto_futuro_dato||"",
      Number(d.personas_invitadas)||0, Number(d.personal_cantidad)||0, Number(d.pago_personal)||0, Number(d.gasto_adicionales)||0,
      d.formato||"", Number(d.gin_inicial)||0, Number(d.gin_sobrante)||0, Number(d.gin_consumido)||0, Number(d.gin_cortesia)||0,
      Number(d.costo_total)||0, d.registrado_por||"" ]]);
    sh.getRange(fila,12).setNumberFormat("$#,##0"); sh.getRange(fila,13).setNumberFormat("$#,##0"); sh.getRange(fila,19).setNumberFormat("$#,##0");
    return {ok:true};
  }
  return {ok:false,error:"No encontrada"};
}
function revisarActivacion_(data){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:false,error:"Sin activaciones"};
  var ids=sh.getRange(2,COL_ID,n-1,1).getValues();
  for(var i=0;i<ids.length;i++) if(String(ids[i][0])===String(data.id)){
    sh.getRange(2+i,COL_ESTADO).setValue(data.estado); return{ok:true};
  }
  return{ok:false,error:"Activacion no encontrada"};
}
// Admin: elimina una activacion (borra la fila y manda sus fotos a la papelera de Drive)
function eliminarActivacion_(data){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:false,error:"Sin activaciones"};
  var rows=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  for(var i=0;i<rows.length;i++) if(String(rows[i][COL_ID-1])===String(data.id)){
    try{ var url=String(rows[i][21]); var m=url.match(/folders\/([^\/?]+)/); if(m) DriveApp.getFolderById(m[1]).setTrashed(true); }catch(e){}
    sh.deleteRow(2+i);
    return {ok:true};
  }
  return {ok:false,error:"Activacion no encontrada"};
}
