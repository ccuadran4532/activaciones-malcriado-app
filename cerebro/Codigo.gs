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
  "Registrado por","Usuario email","Carpeta fotos","N fotos","Estado","ID",
  "Hora inicio","Hora fin","Duracion horas","Botellas inicial","Botellas sobrante",
  "Granel L inicial","Granel L sobrante","Botellas rellenadas","Hielo lo pone cliente",
  "Tonica la pone cliente","Contactos nuevos","Ventas detalle","Ingreso ventas",
  "Hielo kg","Tonica L","Checklist insumos","Aviso 3d","Aviso dia",
  "IG inicio","IG fin","IG ganados"];
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

// Acciones que SOLO puede ejecutar un administrador
var SOLO_ADMIN = ["crear_usuario","listar_usuarios","aprobar_usuario","activar_usuario",
  "eliminar_usuario","editar_usuario","get_config","set_config","get_activacion",
  "editar_activacion","eliminar_activacion","revisar_activacion","estadisticas","rehacer_dashboard"];

// Rate limit con CacheService: max solicitudes por 'key' en 'win' segundos
function rateOk_(key, max, win){
  try{
    var c = CacheService.getScriptCache(), k = "rl_" + key;
    var n = parseInt(c.get(k) || "0", 10);
    if (n >= max) return false;
    c.put(k, String(n + 1), win);
    return true;
  }catch(e){ return true; }
}

// Identifica al usuario REAL por su token (no se cree lo que mande el cliente)
function authUser_(data){
  var t = data && data.token; if (!t) return null;
  var u = uSheet_(), n = u.getLastRow(); if (n < 2) return null;
  var d = u.getRange(2,1,n-1,8).getValues();
  for (var i=0;i<d.length;i++){
    if (d[i][7] && String(d[i][7]) === String(t)){
      if (d[i][4] === false) return null;                 // inactivo
      if ((d[i][6] || "aprobado") !== "aprobado") return null; // no aprobado
      return { email:String(d[i][1]).toLowerCase(), nombre:d[i][0], rol:d[i][3]||"usuario" };
    }
  }
  return null;
}

function doPost(e){
  try{
    var data = JSON.parse(e.postData.contents);
    if (data.clave !== prop_("CLAVE")) return responder_({ok:false,error:"Clave incorrecta"});
    var accion = data.accion;

    // 1) Acciones PUBLICAS (sin sesion) — con limite anti-abuso
    if (accion === "login" || accion === "registrar" || accion === "verificar_codigo"){
      if (!rateOk_("pub_" + (data.email||"x").toLowerCase(), 8, 60))
        return responder_({ok:false,error:"Demasiados intentos. Espera un minuto."});
      if (accion === "login")            return responder_(login_(data));
      if (accion === "registrar")        return responder_(registrar_(data));
      if (accion === "verificar_codigo") return responder_(verificarCodigo_(data));
    }

    // 2) De aqui en adelante se requiere SESION (token valido)
    var u = authUser_(data);
    if (!u) return responder_({ok:false, error:"Sesion invalida. Vuelve a iniciar sesion.", auth:false});

    // Rate limit por usuario
    if (!rateOk_("u_" + u.email, 120, 60))
      return responder_({ok:false,error:"Demasiadas solicitudes. Espera un momento."});

    // 3) Bloqueo de funciones de admin (config, claves, gestion)
    if (SOLO_ADMIN.indexOf(accion) >= 0 && u.rol !== "admin")
      return responder_({ok:false, error:"No autorizado. Solo el administrador puede hacer esto."});

    switch(accion){
      case "crear_usuario":      return responder_(crearUsuario_(data));
      case "eliminar_activacion":return responder_(eliminarActivacion_(data));
      case "cambiar_pass":       return responder_(cambiarPass_(u, data));       // solo su propia clave
      case "listar_usuarios":    return responder_(listarUsuarios_());
      case "aprobar_usuario":    return responder_(aprobarUsuario_(data));
      case "activar_usuario":    return responder_(activarUsuario_(data));
      case "eliminar_usuario":   return responder_(eliminarUsuario_(data));
      case "editar_usuario":     return responder_(editarUsuario_(data));
      case "guardar_activacion": return responder_(guardarActivacion_(u, data)); // identidad real
      case "get_activacion":     return responder_(getActivacion_(data));
      case "editar_activacion":  return responder_(editarActivacion_(data));
      case "historial":          return responder_(historial_(u));               // ve solo lo suyo (admin = todo)
      case "revisar_activacion": return responder_(revisarActivacion_(data));
      case "get_config":         return responder_({ok:true, config:getConfig_()});
      case "set_config":         return responder_(setConfig_(data));
      case "estadisticas":       return responder_(estadisticas_());
      case "rehacer_dashboard":  return responder_(rehacerDashboard_());
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
  u.getRange(1,1,1,9).setValues([["Nombre","Email","PassHash","Rol","Activo","Creado","Estado","Token","DebeCambiar"]]).setFontWeight("bold");
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
  // Columnas: J=personas, L=pago liquido, M=adicionales, Q=gin L, S=costo, AL=ingreso ventas, AM=hielo kg, AN=tonica L, X=estado
  var filas = [
    ["Total de activaciones", '=COUNTA(Activaciones!C2:C)', ""],
    ["Aprobadas", '=COUNTIF(Activaciones!X2:X,"aprobado")', ""],
    ["Pendientes", '=COUNTIF(Activaciones!X2:X,"pendiente")', ""],
    ["", "", ""],
    ["DINERO (CLP)", "", ""],
    ["Ingreso por ventas (total)", '=SUM(Activaciones!AL2:AL)', "$"],
    ["Gasto en personal (líquido)", '=SUM(Activaciones!L2:L)', "$"],
    ["Impuesto boleta honorarios (~14,5%)", '=SUM(Activaciones!L2:L)*0.145/0.855', "$"],
    ["Gasto en adicionales", '=SUM(Activaciones!M2:M)', "$"],
    ["GASTO TOTAL (personal+impuesto+adic)", '=SUM(Activaciones!L2:L)/0.855+SUM(Activaciones!M2:M)', "$"],
    ["RESULTADO (ingreso - gasto)", '=SUM(Activaciones!AL2:AL)-(SUM(Activaciones!L2:L)/0.855+SUM(Activaciones!M2:M))', "$"],
    ["", "", ""],
    ["PROMEDIOS (para ajustar lo que se lleva)", "", ""],
    ["Personas invitadas (total)", '=SUM(Activaciones!J2:J)', ""],
    ["Gin consumido total (L)", '=SUM(Activaciones!Q2:Q)', ""],
    ["Gin L por persona", '=IFERROR(SUM(Activaciones!Q2:Q)/SUM(Activaciones!J2:J),0)', ""],
    ["Hielo kg por persona", '=IFERROR(SUM(Activaciones!AM2:AM)/SUM(Activaciones!J2:J),0)', ""],
    ["Tónica L por persona", '=IFERROR(SUM(Activaciones!AN2:AN)/SUM(Activaciones!J2:J),0)', ""]
  ];
  d.getRange(4,2,filas.length,2).setValues(filas.map(function(f){return [f[0],f[1]];}));
  for (var i=0;i<filas.length;i++){
    d.getRange(4+i,2).setFontWeight("bold");
    if (filas[i][2]==="$") d.getRange(4+i,3).setNumberFormat("$#,##0");
    if (filas[i][1]==="" && filas[i][0]!=="") d.getRange(4+i,2).setFontColor("#E1251B"); // subtitulos
  }
  d.setColumnWidth(2,300); d.setColumnWidth(3,170);
}

/* ---------- Dashboard / estadísticas ---------- */
function rehacerDashboard_(){
  var ss=planilla_(); var d=ss.getSheetByName("Dashboard"); if(d) ss.deleteSheet(d); crearDashboard_(ss); return {ok:true};
}
function estadisticas_(){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow();
  if(n<2) return {ok:true, stats:{total:0}};
  var d=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var personas=0,ginL=0,hielo=0,tonica=0,pago=0,adic=0,ingreso=0,total=0;
  d.forEach(function(r){
    total++; personas+=Number(r[9])||0; ginL+=Number(r[16])||0; pago+=Number(r[11])||0; adic+=Number(r[12])||0;
    ingreso+=Number(r[37])||0; hielo+=Number(r[38])||0; tonica+=Number(r[39])||0;
  });
  var impuesto=pago*0.145/0.855, gastoTotal=pago/0.855+adic;
  return {ok:true, stats:{
    total:total, personas:personas, ingreso:Math.round(ingreso), pago:Math.round(pago), impuesto:Math.round(impuesto),
    adic:Math.round(adic), gastoTotal:Math.round(gastoTotal), resultado:Math.round(ingreso-gastoTotal),
    ginPorPersona: personas? Math.round(ginL/personas*100)/100:0,
    hieloPorPersona: personas? Math.round(hielo/personas*100)/100:0,
    tonicaPorPersona: personas? Math.round(tonica/personas*100)/100:0
  }};
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

/* ---------- Notificaciones por correo ---------- */
function mail_(to, subj, body){ try{ if(to) MailApp.sendEmail(to, subj, body); }catch(e){} }
function adminsEmails_(){
  var u=uSheet_(), n=u.getLastRow(); if(n<2) return [];
  var d=u.getRange(2,1,n-1,7).getValues(), out=[];
  for(var i=0;i<d.length;i++) if((d[i][3]||"")==="admin" && d[i][4]!==false) out.push(d[i][1]);
  return out;
}
function diasEntre_(a,b){ var da=new Date(a+"T00:00:00"), db=new Date(b+"T00:00:00"); return Math.round((db-da)/86400000); }
// EJECUTAR CON UN ACTIVADOR DIARIO (~8:50am): avisa por correo 3 días antes y el día de la activación.
function notificarActivaciones(){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2) return;
  var d=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var tz="GMT-4", hoy=Utilities.formatDate(new Date(),tz,"yyyy-MM-dd"), admins=adminsEmails_();
  for(var i=0;i<d.length;i++){
    var r=d[i];
    if((r[23]||"")==="rechazado") continue;
    var f = (r[1] instanceof Date) ? Utilities.formatDate(r[1],tz,"yyyy-MM-dd") : String(r[1]).slice(0,10);
    if(!f) continue;
    var dif=diasEntre_(hoy,f), nombre=r[2], lugar=r[3], hora=r[25], uemail=r[20];
    var dest=[uemail].concat(admins).filter(function(x){return x;});
    if(dif===3 && r[41]!=="si"){
      dest.forEach(function(e){ mail_(e,"Recordatorio: activacion en 3 dias - "+nombre,
        "En 3 dias tienes una activacion:\n\n"+nombre+"\nLugar: "+lugar+"\nFecha: "+f+(hora?(" a las "+hora):"")+"\n\nActivaciones - The Branican Company"); });
      sh.getRange(2+i,42).setValue("si");
    }
    if(dif===0 && r[42]!=="si"){
      dest.forEach(function(e){ mail_(e,"HOY: activacion "+nombre,
        "Hoy es la activacion:\n\n"+nombre+"\nLugar: "+lugar+(hora?("\nHora inicio: "+hora):"")+"\n\nMucho exito!\nActivaciones - The Branican Company"); });
      sh.getRange(2+i,43).setValue("si");
    }
  }
}

/* ---------- Instagram (seguidores @ginmalcriado, perfil publico) ---------- */
function parseSeg_(s){ var n=parseInt(String(s).replace(/[.,\s]/g,"").replace(/[^\d]/g,""),10); return isNaN(n)?null:n; }
function seguidoresIG_(user){
  try{
    var r=UrlFetchApp.fetch("https://www.instagram.com/"+user+"/",{muteHttpExceptions:true,
      headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}});
    var t=r.getContentText();
    var m=t.match(/content="([\d.,]+)\s*(Followers|Seguidores)/i);
    return m? parseSeg_(m[1]) : null;
  }catch(e){ return null; }
}
// Captura seguidores al inicio y al fin de cada activacion de HOY (segun su horario)
function chequearInstagram(){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2) return;
  var d=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var tz="GMT-4", ahora=new Date();
  var hoy=Utilities.formatDate(ahora,tz,"yyyy-MM-dd"), hhmm=Utilities.formatDate(ahora,tz,"HH:mm");
  for(var i=0;i<d.length;i++){
    var r=d[i];
    if((r[23]||"")==="rechazado") continue;
    var f=(r[1] instanceof Date)?Utilities.formatDate(r[1],tz,"yyyy-MM-dd"):String(r[1]).slice(0,10);
    if(f!==hoy) continue;
    var hIni=String(r[25]||""), hFin=String(r[26]||""), igIni=r[43], igFin=r[44];
    if(hIni && hhmm>=hIni && igIni===""){ var s=seguidoresIG_("ginmalcriado"); if(s!=null) sh.getRange(2+i,44).setValue(s); }
    if(hFin && hhmm>=hFin && igIni!=="" && igFin===""){
      var s2=seguidoresIG_("ginmalcriado");
      if(s2!=null){ sh.getRange(2+i,45).setValue(s2); sh.getRange(2+i,46).setValue(s2-Number(igIni)); }
    }
  }
}
// UN activador (cada 15 min) hace todo: Instagram + recordatorios (estos solo a las 8am)
// Activador diario (8-9am): solo recordatorios por correo. Instagram se anota a mano en la app.
function tareasProgramadas(){ notificarActivaciones(); }

/* ---------- Usuarios ---------- */
function uSheet_(){ return planilla_().getSheetByName("Usuarios"); }
function login_(data){
  var u = uSheet_(); var n = u.getLastRow();
  // Bootstrap: si no hay usuarios, el primero queda ADMIN aprobado.
  if (n < 2){
    var tk0 = Utilities.getUuid();
    u.appendRow([data.email.split("@")[0], (data.email||"").toLowerCase(), hashPass_(data.pass), "admin", true, new Date(), "aprobado", tk0, false]);
    return {ok:true, usuario:{nombre:data.email.split("@")[0], email:(data.email||"").toLowerCase(), rol:"admin", debe_cambiar:false}, token:tk0};
  }
  var datos = u.getRange(2,1,n-1,9).getValues();
  var email = (data.email||"").toLowerCase();
  for (var i=0;i<datos.length;i++){
    if (String(datos[i][1]).toLowerCase() === email){
      var estado = datos[i][6] || "aprobado"; // legado vacio = aprobado
      if (estado === "pendiente") return {ok:false,error:"Tu cuenta esta pendiente de aprobacion del administrador"};
      if (estado === "rechazado") return {ok:false,error:"Tu cuenta fue rechazada"};
      if (datos[i][4] === false) return {ok:false,error:"Tu cuenta esta desactivada"};
      if (verifyPass_(data.pass, datos[i][2])){
        var tk = Utilities.getUuid();
        u.getRange(2+i, 8).setValue(tk);   // guarda el token de sesion
        return {ok:true, usuario:{nombre:datos[i][0], email:email, rol:datos[i][3]||"usuario", debe_cambiar: datos[i][8]===true}, token:tk};
      }
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
      var nom=d[i][3];
      uSheet_().appendRow([nom, email, d[i][4], "usuario", true, new Date(), estado, "", false]);
      cs.deleteRow(2+i);
      // Correo de confirmacion al usuario + aviso a los administradores
      mail_(email, "Cuenta creada - Activaciones Malcriado",
        "Hola "+nom+",\n\nTu cuenta fue creada"+(requiere?" y quedo PENDIENTE de aprobacion del administrador. Te avisaremos cuando este lista.":". Ya puedes ingresar.")+"\n\nActivaciones - The Branican Company");
      adminsEmails_().forEach(function(a){ mail_(a, "Nuevo usuario en Activaciones",
        "El usuario "+nom+" ("+email+") se registro y "+(requiere?"espera tu aprobacion en el panel.":"quedo activo.")); });
      return {ok:true, pendiente:requiere};
    }
  }
  return {ok:false,error:"No hay codigo para ese email"};
}
// Admin crea usuario (queda aprobado directo)
// Admin crea usuario: el sistema genera una clave TEMPORAL y se la envia por correo.
// El usuario debe cambiarla al entrar (DebeCambiar=true). Queda aprobado.
function crearUsuario_(data){
  var email=(data.email||"").toLowerCase();
  if (!data.nombre || !email) return {ok:false,error:"Falta nombre o email"};
  if (existeEmail_(email)) return {ok:false,error:"Ya existe ese email"};
  var temp = "Mal" + Math.floor(1000 + Math.random()*9000); // clave temporal
  uSheet_().appendRow([data.nombre, email, hashPass_(temp), data.rol||"usuario", true, new Date(), "aprobado", "", true]);
  mail_(email, "Tu acceso a Activaciones Malcriado",
    "Hola "+data.nombre+",\n\nTe crearon una cuenta. Tu clave TEMPORAL es:  "+temp+
    "\n\nEntra a la app y cambiala por una propia para empezar a operar.\n\nActivaciones - The Branican Company");
  adminsEmails_().forEach(function(a){ mail_(a, "Usuario creado",
    "Creaste al usuario "+data.nombre+" ("+email+"). Se le envio su clave temporal por correo."); });
  return {ok:true, temp:true};
}
function cambiarPass_(auth, data){
  var sh=uSheet_(), n=sh.getLastRow(); if(n<2)return{ok:false,error:"No hay usuarios"};
  var d=sh.getRange(2,1,n-1,7).getValues(), email=auth.email;   // solo SU propia clave
  for(var i=0;i<d.length;i++) if(String(d[i][1]).toLowerCase()===email){
    if(!verifyPass_(data.pass_actual,d[i][2])) return{ok:false,error:"Tu contrasena actual no es correcta"};
    sh.getRange(2+i,3).setValue(hashPass_(data.pass_nueva));
    sh.getRange(2+i,9).setValue(false);   // ya cambio su clave temporal
    return{ok:true};
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
  var d=u.getRange(2,1,n-1,2).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][1]).toLowerCase()===email){
    u.getRange(2+i,7).setValue(data.aprobar?"aprobado":"rechazado");
    mail_(email, data.aprobar?"Cuenta aprobada":"Solicitud rechazada",
      "Hola "+d[i][0]+",\n\n"+(data.aprobar?"Tu cuenta fue APROBADA. Ya puedes ingresar a Activaciones Malcriado.":"Tu solicitud de acceso fue rechazada."));
    return{ok:true};
  }
  return{ok:false,error:"Usuario no encontrado"};
}
// Admin: eliminar usuario (lo borra de la planilla)
function eliminarUsuario_(data){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:false,error:"Sin usuarios"};
  var d=u.getRange(2,2,n-1,1).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][0]).toLowerCase()===email){ u.deleteRow(2+i); return{ok:true}; }
  return{ok:false,error:"Usuario no encontrado"};
}
// Admin: editar nombre y/o rol de un usuario
function editarUsuario_(data){
  var u=uSheet_(), n=u.getLastRow(); if(n<2)return{ok:false,error:"Sin usuarios"};
  var d=u.getRange(2,1,n-1,2).getValues(), email=(data.email||"").toLowerCase();
  for(var i=0;i<d.length;i++) if(String(d[i][1]).toLowerCase()===email){
    if(data.nombre) u.getRange(2+i,1).setValue(data.nombre);
    if(data.rol)    u.getRange(2+i,4).setValue(data.rol);
    return{ok:true};
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
function guardarActivacion_(auth, data){
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
    Number(d.gin_consumido)||0,Number(d.gin_cortesia)||0,Number(d.costo_total)||0,d.registrado_por||auth.nombre,auth.email,
    carpeta.getUrl(),nFotos,estado,id,
    d.hora_inicio||"", d.hora_fin||"", Number(d.duracion_horas)||0, Number(d.botellas_ini)||0, Number(d.botellas_sob)||0,
    Number(d.granel_ini)||0, Number(d.granel_sob)||0, Number(d.botellas_rellenadas)||0,
    d.hielo_cliente?"si":"no", d.tonica_cliente?"si":"no", d.contactos_nuevos||"",
    d.ventas_detalle||"", Number(d.ingreso_ventas)||0,
    Number(d.hielo_kg)||0, Number(d.tonica_litros)||0, d.checklist||"", "no", "no",
    (Number(d.ig_inicio)||""), (Number(d.ig_fin)||""), (Number(d.ig_ganados)||"") ];
  sh.appendRow(fila);
  var r=sh.getLastRow();
  sh.getRange(r,12).setNumberFormat("$#,##0"); sh.getRange(r,13).setNumberFormat("$#,##0"); sh.getRange(r,19).setNumberFormat("$#,##0");
  return {ok:true, fotos:nFotos, pendiente:requiere};
}
function historial_(u){
  var sh=planilla_().getSheetByName("Activaciones"), n=sh.getLastRow(); if(n<2)return{ok:true,lista:[]};
  var d=sh.getRange(2,1,n-1,CABECERAS.length).getValues();
  var esAdmin = u && u.rol === "admin";
  var miEmail = u ? String(u.email||"").toLowerCase() : "";
  var lista=[];
  d.forEach(function(r){
    var estado=r[COL_ESTADO-1]||"aprobado";
    var row={ id:r[COL_ID-1], fecha:r[1], nombre_activacion:r[2], lugar:r[3], comuna:r[4],
      gin_consumido:r[16], costo_total:r[18], registrado_por:r[19], usuario_email:r[20], estado:estado,
      ig_ganados:(r[45]===""?null:Number(r[45])) };
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
      gin_inicial:r[14], gin_sobrante:r[15], gin_consumido:r[16], gin_cortesia:r[17], costo_total:r[18], registrado_por:r[19],
      hora_inicio:r[25], hora_fin:r[26], duracion_horas:r[27], botellas_ini:r[28], botellas_sob:r[29],
      granel_ini:r[30], granel_sob:r[31], botellas_rellenadas:r[32],
      hielo_cliente:(r[33]==="si"), tonica_cliente:(r[34]==="si"), contactos_nuevos:r[35],
      ventas_detalle:r[36], ingreso_ventas:r[37],
      hielo_kg:r[38], tonica_litros:r[39], checklist:r[40],
      ig_inicio:r[43], ig_fin:r[44] }};
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
    sh.getRange(fila,26,1,16).setValues([[ d.hora_inicio||"", d.hora_fin||"", Number(d.duracion_horas)||0, Number(d.botellas_ini)||0, Number(d.botellas_sob)||0,
      Number(d.granel_ini)||0, Number(d.granel_sob)||0, Number(d.botellas_rellenadas)||0,
      d.hielo_cliente?"si":"no", d.tonica_cliente?"si":"no", d.contactos_nuevos||"",
      d.ventas_detalle||"", Number(d.ingreso_ventas)||0,
      Number(d.hielo_kg)||0, Number(d.tonica_litros)||0, d.checklist||"" ]]);
    sh.getRange(fila,44,1,3).setValues([[ (Number(d.ig_inicio)||""), (Number(d.ig_fin)||""), (Number(d.ig_ganados)||"") ]]);
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
