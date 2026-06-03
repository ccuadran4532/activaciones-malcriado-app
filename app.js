/* App Activaciones Malcriado — PWA (diseño Indomable) */
(function () {
  "use strict";
  const C = window.ACTIVACIONES_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  let usuario = null;       // {nombre,email,rol}
  let formato = "Botella";  // "Botella" | "Granel"
  let fotos = [];           // [{name, dataUrl}]
  let guardando = false;
  let editandoId = null;    // si != null, el admin está editando esa activación

  // --- Conexión y sesión guardadas en el teléfono ---
  const store = {
    get url() { return localStorage.getItem("api_url") || C.API_URL_DEFAULT || ""; },
    set url(v) { localStorage.setItem("api_url", (v || "").trim()); },
    get key() { return localStorage.getItem("api_key") || C.API_KEY_DEFAULT || ""; },
    set key(v) { localStorage.setItem("api_key", (v || "").trim()); },
    get user() { try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch (e) { return null; } },
    set user(v) { v ? localStorage.setItem("usuario", JSON.stringify(v)) : localStorage.removeItem("usuario"); },
    get token() { return localStorage.getItem("token") || ""; },
    set token(v) { v ? localStorage.setItem("token", v) : localStorage.removeItem("token"); },
  };

  const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
  const soloNum = (s) => parseFloat(String(s).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) || 0;
  const soloInt = (s) => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ===== Sonido tipo ICQ (generado por código) =====
  let audioCtx;
  function initAudio() {
    try {
      if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function tono(freq, t0, dur, vol, tipo) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || "square"; o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function sonidoICQ() { initAudio(); tono(660, 0, 0.13, 0.25, "square"); tono(990, 0.14, 0.20, 0.25, "square"); } // "uh-oh!"
  function sonidoBotella() { initAudio(); tono(880, 0, 0.10, 0.18, "sine"); tono(1320, 0.11, 0.18, 0.18, "sine"); }

  // ===== Toast =====
  let toastT;
  function toast(msg, kind) {
    const t = $("toast"); t.textContent = msg; t.className = "toast show " + (kind || "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 3200);
  }

  // ===== Llamada al cerebro (Apps Script) =====
  async function postCerebro(payload) {
    if (!store.url) throw new Error("Falta configurar la conexión (⚙︎)");
    payload.clave = store.key;
    payload.token = store.token;   // identidad de sesión
    const resp = await fetch(store.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    // Si la sesión ya no es válida, cierra sesión y vuelve al login
    if (data && data.auth === false && usuario) { toast("Tu sesión expiró, entra de nuevo", "bad"); logout(); }
    return data;
  }

  // ===== Ticket OK + Botella que se desvanece (igual que app de ventas) =====
  let ticketT, botellaT = [];
  function mostrarTicket(titulo, sub, pasos) {
    $("tkTitulo").textContent = titulo;
    $("tkSub").textContent = sub || "";
    $("tkPasos").innerHTML = (pasos || []).map((p) => "<div>" + p + "</div>").join("");
    const ov = $("ticket"); ov.classList.add("show"); sonidoICQ();
    clearTimeout(ticketT);
    ticketT = setTimeout(() => { ov.classList.remove("show"); mostrarBotella(); }, 2400);
  }
  function mostrarBotella() {
    const ov = $("botella");
    botellaT.forEach(clearTimeout); botellaT = [];
    ov.classList.remove("fade"); ov.classList.add("show"); sonidoBotella();
    botellaT.push(setTimeout(() => ov.classList.add("fade"), 1700));
    botellaT.push(setTimeout(() => ov.classList.remove("show", "fade"), 3700));
  }

  // ===== LOGIN =====
  async function login() {
    initAudio(); // desbloquea audio dentro del gesto (toque)
    const email = $("loginEmail").value.trim().toLowerCase();
    const pass = $("loginPass").value;
    const msg = $("loginMsg");
    if (!store.url) { msg.className = "login-msg bad"; msg.textContent = "Primero configura la conexión ⚙︎"; abrirSheet(); return; }
    if (!email || !pass) { msg.className = "login-msg bad"; msg.textContent = "Completa email y contraseña"; return; }
    msg.className = "login-msg"; msg.textContent = "Entrando…";
    try {
      const d = await postCerebro({ accion: "login", email: email, pass: pass });
      if (d && d.ok && d.usuario) {
        usuario = d.usuario; store.user = usuario; store.token = d.token || "";
        msg.textContent = "";
        entrarApp(true);
      } else {
        msg.className = "login-msg bad"; msg.textContent = (d && d.error) || "Email o contraseña incorrectos";
      }
    } catch (e) {
      msg.className = "login-msg bad"; msg.textContent = "Sin conexión. Revisa Ajustes ⚙︎";
    }
  }

  function entrarApp(conAnimacion) {
    $("vistaLogin").style.display = "none";
    $("vistaApp").style.display = "flex";
    document.body.classList.toggle("es-admin", usuario && usuario.rol === "admin");
    $("f_registra").value = usuario ? usuario.nombre : "";
    if (!$("f_fecha").value) $("f_fecha").value = new Date().toISOString().slice(0, 10);
    recalcular();
    cargarHistorial();
    if (conAnimacion) mostrarTicket("¡Acceso OK!", "Bienvenido " + (usuario ? usuario.nombre.split(" ")[0] : ""), ["✓ Sesión iniciada"]);
  }

  function logout() {
    usuario = null; store.user = null; store.token = "";
    cerrarSheet();
    $("vistaApp").style.display = "none";
    $("vistaLogin").style.display = "flex";
    $("loginPass").value = "";
  }

  // ===== Formato Botella/Granel =====
  function setFormato(f) {
    formato = f;
    $("bBotella").classList.toggle("on", f === "Botella");
    $("bGranel").classList.toggle("on", f === "Granel");
    const u = f === "Botella" ? "botellas" : "litros";
    $("uni1").textContent = u; $("uni2").textContent = u; $("uni3").textContent = u;
  }

  // ===== Cálculos (consumo y costo) =====
  function recalcular() {
    // Gin consumido = inicial - sobrante (nunca negativo)
    const consumido = Math.max(soloNum($("f_inicial").value) - soloNum($("f_sobrante").value), 0);
    // Costo total = pago al personal + gasto en adicionales
    const costo = soloInt($("f_pago").value) + soloInt($("f_adic").value);
    const u = formato === "Botella" ? "botellas" : "litros";
    $("rConsumido").textContent = consumido + " " + u;
    $("rCosto").textContent = fmt(costo);
    return { consumido, costo };
  }
  function pintarPesos(input) { const n = soloInt(input.value); input.value = n > 0 ? "$" + n.toLocaleString("es-CL") : ""; }

  // ===== Fotos (con reducción de tamaño) =====
  function pedirFotos() { $("fileInput").click(); }
  function aceptarFotos(files) {
    const libres = 10 - fotos.length;
    const arr = Array.from(files).slice(0, Math.max(0, libres));
    if (files.length > libres) toast("Máximo 10 fotos", "bad");
    arr.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => reducir(e.target.result, file.name);
      reader.readAsDataURL(file);
    });
  }
  function reducir(dataUrl, name) {
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      let { width: w, height: h } = img;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      fotos.push({ name: name || "foto.jpg", dataUrl: cv.toDataURL("image/jpeg", 0.72) });
      renderFotos();
    };
    img.src = dataUrl;
  }
  function renderFotos() {
    const grid = $("fotosGrid");
    grid.querySelectorAll(".foto-thumb").forEach((n) => n.remove());
    fotos.forEach((f, i) => {
      const div = document.createElement("div"); div.className = "foto-thumb";
      div.innerHTML = '<img src="' + f.dataUrl + '"><button class="quita" data-i="' + i + '">✕</button>';
      grid.insertBefore(div, $("addFoto"));
    });
    grid.querySelectorAll(".quita").forEach((b) => b.addEventListener("click", () => { fotos.splice(+b.dataset.i, 1); renderFotos(); }));
    $("addFoto").style.display = fotos.length >= 10 ? "none" : "flex";
    $("fotoCount").textContent = fotos.length + " / 10 fotos" + (fotos.length === 0 ? " — sube al menos 1." : "");
  }

  // ===== Guardar activación =====
  function validar() {
    const req = [["f_nombre", "el nombre de la activación"], ["f_lugar", "el lugar"], ["f_comuna", "la comuna"],
                 ["f_branican", "la persona de The Branican Company"], ["f_registra", "quién registra"]];
    for (const [id, lbl] of req) if (!$(id).value.trim()) { toast("Falta " + lbl, "bad"); $(id).focus(); return false; }
    if (!editandoId && fotos.length < 1) { toast("Sube al menos 1 foto", "bad"); return false; }
    return true;
  }
  function pedirConfirmacion() {
    if (!validar()) return;
    const c = recalcular();
    $("cfNombre").textContent = $("f_nombre").value.trim();
    $("cfLugar").textContent = $("f_lugar").value.trim() + " (" + $("f_comuna").value.trim() + ")";
    $("cfConsumo").textContent = c.consumido + (formato === "Botella" ? " botellas" : " litros");
    $("cfCosto").textContent = fmt(c.costo);
    $("confirmSheet").classList.add("show");
  }
  async function guardarDefinitivo() {
    if (guardando) return;
    $("confirmSheet").classList.remove("show");
    const c = recalcular();
    const datos = {
      nombre_activacion: $("f_nombre").value.trim(), lugar: $("f_lugar").value.trim(), comuna: $("f_comuna").value.trim(),
      fecha: $("f_fecha").value, persona_branican: $("f_branican").value.trim(), quien_contacto: $("f_contacto").value.trim(),
      contacto_futuro_nombre: $("f_cfut_nom").value.trim(), contacto_futuro_dato: $("f_cfut_dato").value.trim(),
      personas_invitadas: soloInt($("f_invitados").value), personal_cantidad: soloInt($("f_personal").value),
      pago_personal: soloInt($("f_pago").value), gasto_adicionales: soloInt($("f_adic").value),
      formato: formato, gin_inicial: soloNum($("f_inicial").value), gin_sobrante: soloNum($("f_sobrante").value),
      gin_consumido: c.consumido, gin_cortesia: soloNum($("f_cortesia").value), costo_total: c.costo,
      registrado_por: $("f_registra").value.trim(),
      usuario_email: usuario ? usuario.email : ""
    };
    // Modo edición (admin): actualiza y vuelve, sin animación de ticket
    if (editandoId) {
      const be = $("btnGuardar"); guardando = true; be.disabled = true; const t0 = be.textContent; be.textContent = "Guardando…";
      try {
        const d = await postCerebro({ accion: "editar_activacion", id: editandoId, datos: datos });
        if (d && d.ok) { toast("Cambios guardados", "ok"); salirEdicion(); limpiarFormulario(); cargarHistorial(); mostrarVista("historial"); }
        else { toast((d && d.error) || "Error", "bad"); be.textContent = t0; }
      } catch (e) { toast("Sin conexión", "bad"); be.textContent = t0; }
      finally { guardando = false; be.disabled = false; }
      return;
    }
    const btn = $("btnGuardar"); guardando = true; btn.disabled = true; const txt = btn.textContent; btn.textContent = "Guardando…";
    try {
      const d = await postCerebro({ accion: "guardar_activacion", datos: datos, fotos: fotos });
      if (d && d.ok) {
        btn.classList.add("ok"); btn.textContent = "✓ Guardado";
        const pend = d.pendiente;
        mostrarTicket(pend ? "¡Enviado a revisión!" : "¡Registro guardado!",
          pend ? "Pendiente de aprobación del admin" : "Queda en el historial",
          [pend ? "✓ Enviado al administrador" : "✓ Guardado en Google Drive",
           "✓ Planilla actualizada", "✓ " + fotos.length + " foto(s) subidas"]);
        limpiarFormulario();
        setTimeout(() => { btn.classList.remove("ok"); btn.textContent = txt; cargarHistorial(); }, 2600);
      } else { throw new Error((d && d.error) || "Respuesta no válida"); }
    } catch (e) {
      btn.textContent = txt;
      toast(/fetch|network|load failed/i.test(e.message) ? "Sin internet — intenta de nuevo" : ("Error: " + e.message), "bad");
    } finally { guardando = false; btn.disabled = false; }
  }
  function limpiarFormulario() {
    ["f_nombre", "f_lugar", "f_comuna", "f_contacto", "f_cfut_nom", "f_cfut_dato", "f_invitados",
     "f_personal", "f_pago", "f_adic", "f_inicial", "f_sobrante", "f_cortesia"].forEach((id) => ($(id).value = ""));
    fotos = []; renderFotos(); setFormato("Botella");
    $("f_fecha").value = new Date().toISOString().slice(0, 10);
    recalcular();
  }

  // ===== Historial =====
  let cacheHist = [];
  async function cargarHistorial() {
    try {
      const d = await postCerebro({ accion: "historial", email: usuario ? usuario.email : "", rol: usuario ? usuario.rol : "" });
      cacheHist = (d && d.ok && d.lista) ? d.lista : [];
    } catch (e) { cacheHist = []; }
    renderHistorial("");
  }
  function fechaCorta(s) { try { const d = new Date(s); return isNaN(d) ? (s || "") : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" }); } catch (e) { return s || ""; } }
  function renderHistorial(filtro) {
    const cont = $("listaHist"); const norm = (s) => String(s).toLowerCase();
    const q = norm(filtro || "");
    const datos = !q ? cacheHist : cacheHist.filter((v) => norm([v.nombre_activacion, v.lugar, v.comuna, v.registrado_por, v.fecha].join(" ")).includes(q));
    $("histResumen").textContent = cacheHist.length + (cacheHist.length === 1 ? " activación" : " activaciones") + (q ? " · " + datos.length + " encontradas" : "");
    $("histVacio").style.display = cacheHist.length === 0 ? "block" : "none";
    cont.innerHTML = datos.map((v) =>
      '<div class="hcard"><div class="izq">' +
      '<div class="cli">' + esc(v.nombre_activacion || "Sin nombre") + '</div>' +
      '<div class="meta">' + (v.estado && v.estado !== "aprobado" ? '<span class="tag factura">' + esc(v.estado) + '</span>' : '') +
      esc(v.lugar || "") + (v.comuna ? " · " + esc(v.comuna) : "") +
      ' · consumo ' + esc(String(v.gin_consumido || 0)) + ' · ' + esc(v.registrado_por || "") + '</div></div>' +
      '<div class="der"><div class="monto">' + fmt(v.costo_total) + '</div>' +
      '<div class="fecha">' + fechaCorta(v.fecha) + '</div>' +
      (usuario && usuario.rol === "admin" && v.id ? '<div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end">' +
        '<button class="mini editAct" data-id="' + esc(v.id) + '" style="background:#3a3a3a">✏️</button>' +
        '<button class="mini bad delAct" data-id="' + esc(v.id) + '">🗑</button></div>' : '') +
      '</div></div>'
    ).join("");
    cont.querySelectorAll(".delAct").forEach((b) => b.addEventListener("click", () => eliminarActivacion(b.dataset.id)));
    cont.querySelectorAll(".editAct").forEach((b) => b.addEventListener("click", () => abrirEdicion(b.dataset.id)));
    if (q && datos.length === 0) cont.innerHTML = '<div class="vacio">Sin resultados para "' + esc(filtro) + '".</div>';
  }

  // ===== Ajustes / conexión =====
  function abrirSheet() { $("apiUrl").value = store.url; $("apiKey").value = store.key; $("estadoConn").textContent = ""; $("sheet").classList.add("show"); }
  function cerrarSheet() { $("sheet").classList.remove("show"); }
  async function guardarConn() {
    store.url = $("apiUrl").value; store.key = $("apiKey").value;
    const est = $("estadoConn");
    if (!store.url) { est.className = "estado bad"; est.textContent = "Falta la URL"; return; }
    est.className = "estado"; est.textContent = "Probando conexión…";
    try {
      const r = await fetch(store.url + (store.url.includes("?") ? "&" : "?") + "ping=1&clave=" + encodeURIComponent(store.key));
      const d = await r.json();
      if (d && d.ok) { est.textContent = "✓ Conectado correctamente"; setTimeout(cerrarSheet, 900); }
      else { est.className = "estado bad"; est.textContent = "Respondió pero sin OK"; }
    } catch (e) { est.className = "estado bad"; est.textContent = "No se pudo conectar (revisa la URL)"; }
  }

  // ===== Mi cuenta: cambiar contraseña =====
  async function cambiarPass() {
    const est = $("estadoPass");
    const a = $("cpActual").value, b = $("cpNueva").value;
    if (!a || !b) { est.className = "estado bad"; est.textContent = "Completa ambas contraseñas"; return; }
    if (b.length < 4) { est.className = "estado bad"; est.textContent = "La nueva contraseña es muy corta"; return; }
    est.className = "estado"; est.textContent = "Cambiando…";
    try {
      const d = await postCerebro({ accion: "cambiar_pass", email: usuario.email, pass_actual: a, pass_nueva: b });
      if (d && d.ok) { est.textContent = "✓ Contraseña actualizada"; $("cpActual").value = ""; $("cpNueva").value = ""; }
      else { est.className = "estado bad"; est.textContent = (d && d.error) || "No se pudo cambiar"; }
    } catch (e) { est.className = "estado bad"; est.textContent = "Error de conexión"; }
  }

  // ===== Auto-registro con código por correo =====
  let regEmailPend = "";
  function irRegistro() { $("loginCard").style.display = "none"; $("registroCard").style.display = ""; $("regMsg").textContent = ""; $("regPaso1").style.display = ""; $("regPaso2").style.display = "none"; }
  function volverLogin() { $("registroCard").style.display = "none"; $("loginCard").style.display = ""; }
  async function registrar() {
    initAudio();
    const nombre = $("regNombre").value.trim(), email = $("regEmail").value.trim().toLowerCase(), pass = $("regPass").value;
    const m = $("regMsg");
    if (!nombre || !email || !pass) { m.className = "login-msg bad"; m.textContent = "Completa todos los campos"; return; }
    m.className = "login-msg"; m.textContent = "Enviando código…";
    try {
      const d = await postCerebro({ accion: "registrar", nombre: nombre, email: email, pass: pass });
      if (d && d.ok && d.need_code) {
        regEmailPend = email; $("regPaso1").style.display = "none"; $("regPaso2").style.display = "";
        m.className = "login-msg ok"; m.textContent = "✓ Código enviado a " + email;
      } else { m.className = "login-msg bad"; m.textContent = (d && d.error) || "No se pudo enviar"; }
    } catch (e) { m.className = "login-msg bad"; m.textContent = "Sin conexión"; }
  }
  async function confirmarCodigo() {
    const code = $("regCodigo").value.trim(), m = $("regMsg");
    if (!code) { m.className = "login-msg bad"; m.textContent = "Escribe el código"; return; }
    m.className = "login-msg"; m.textContent = "Verificando…";
    try {
      const d = await postCerebro({ accion: "verificar_codigo", email: regEmailPend, code: code });
      if (d && d.ok) {
        m.className = "login-msg ok";
        m.textContent = d.pendiente ? "✓ Verificado. Espera la aprobación del admin." : "✓ Verificado. Ya puedes entrar.";
        setTimeout(() => { volverLogin(); $("loginEmail").value = regEmailPend; }, 2600);
      } else { m.className = "login-msg bad"; m.textContent = (d && d.error) || "Código incorrecto"; }
    } catch (e) { m.className = "login-msg bad"; m.textContent = "Sin conexión"; }
  }
  // ===== Eliminar activación (admin) =====
  async function eliminarActivacion(id) {
    if (!window.confirm("¿Eliminar esta activación? Se borra el registro y sus fotos. No se puede deshacer.")) return;
    try {
      const d = await postCerebro({ accion: "eliminar_activacion", id: id });
      if (d && d.ok) { toast("Activación eliminada", "ok"); cargarHistorial(); }
      else toast((d && d.error) || "Error", "bad");
    } catch (e) { toast("Sin conexión", "bad"); }
  }
  // ===== Editar activación (admin) =====
  async function abrirEdicion(id) {
    try {
      const d = await postCerebro({ accion: "get_activacion", id: id });
      if (!d || !d.ok) { toast("No se pudo cargar", "bad"); return; }
      const x = d.datos;
      $("f_nombre").value = x.nombre_activacion || ""; $("f_lugar").value = x.lugar || ""; $("f_comuna").value = x.comuna || "";
      $("f_fecha").value = x.fecha || ""; $("f_branican").value = x.persona_branican || ""; $("f_contacto").value = x.quien_contacto || "";
      $("f_cfut_nom").value = x.contacto_futuro_nombre || ""; $("f_cfut_dato").value = x.contacto_futuro_dato || "";
      $("f_invitados").value = x.personas_invitadas || ""; $("f_personal").value = x.personal_cantidad || "";
      $("f_pago").value = x.pago_personal ? ("$" + Number(x.pago_personal).toLocaleString("es-CL")) : "";
      $("f_adic").value = x.gasto_adicionales ? ("$" + Number(x.gasto_adicionales).toLocaleString("es-CL")) : "";
      setFormato(x.formato === "Granel" ? "Granel" : "Botella");
      $("f_inicial").value = x.gin_inicial || ""; $("f_sobrante").value = x.gin_sobrante || ""; $("f_cortesia").value = x.gin_cortesia || "";
      $("f_registra").value = x.registrado_por || "";
      fotos = []; renderFotos();
      editandoId = id;
      $("btnGuardar").textContent = "Guardar cambios";
      $("tituloForm").innerHTML = "Editar activación <small>Modo administrador · las fotos no cambian</small>";
      recalcular(); mostrarVista("form");
    } catch (e) { toast("Sin conexión", "bad"); }
  }
  function salirEdicion() {
    editandoId = null;
    $("btnGuardar").textContent = "Confirmar y Guardar Registro";
    $("tituloForm").innerHTML = "Nueva activación <small>The Branican Company · Gin Malcriado</small>";
  }

  // ===== Panel de administración =====
  function abrirAdmin() { cerrarSheet(); mostrarVista("admin"); cargarAdmin(); }
  async function cargarAdmin() {
    try { const c = await postCerebro({ accion: "get_config" }); if (c && c.ok && c.config) { $("cfgUsuarios").checked = c.config.aprobar_usuarios === "si"; $("cfgActiv").checked = c.config.aprobar_activaciones === "si"; } } catch (e) {}
    try {
      const u = await postCerebro({ accion: "listar_usuarios" });
      const lista = (u && u.ok && u.lista) ? u.lista : [];
      renderPendientes(lista.filter((x) => x.estado === "pendiente"));
      renderUsuarios(lista);
    } catch (e) {}
    try {
      const h = await postCerebro({ accion: "historial", rol: "admin", email: usuario.email });
      renderActivPend(((h && h.ok && h.lista) ? h.lista : []).filter((x) => x.estado === "pendiente"));
    } catch (e) {}
  }
  function renderPendientes(lista) {
    const c = $("admPendientes");
    if (!lista.length) { c.innerHTML = '<div class="vacio">Sin pendientes.</div>'; return; }
    c.innerHTML = lista.map((u) => '<div class="userline"><span>' + esc(u.nombre) + ' · ' + esc(u.email) + '</span><span>' +
      '<button class="mini ok" data-e="' + esc(u.email) + '">Aprobar</button> <button class="mini bad" data-e="' + esc(u.email) + '">Rechazar</button></span></div>').join("");
    c.querySelectorAll(".mini.ok").forEach((b) => b.addEventListener("click", () => accionUsuario("aprobar_usuario", { email: b.dataset.e, aprobar: true })));
    c.querySelectorAll(".mini.bad").forEach((b) => b.addEventListener("click", () => accionUsuario("aprobar_usuario", { email: b.dataset.e, aprobar: false })));
  }
  function renderUsuarios(lista) {
    const c = $("admUsuarios");
    c.innerHTML = lista.map((u) => '<div class="userline"><span>' + esc(u.nombre) + ' · ' + esc(u.email) +
      ' <span class="rolbadge ' + (u.rol === "admin" ? "admin" : "") + '">' + esc(u.rol) + '</span>' + (u.estado === "pendiente" ? ' <span class="rolbadge">pendiente</span>' : '') + '</span>' +
      '<button class="mini ' + (u.activo ? "bad" : "ok") + '" data-e="' + esc(u.email) + '" data-a="' + (u.activo ? "0" : "1") + '">' + (u.activo ? "Desactivar" : "Activar") + '</button></div>').join("");
    c.querySelectorAll("button.mini").forEach((b) => b.addEventListener("click", () => accionUsuario("activar_usuario", { email: b.dataset.e, activo: b.dataset.a === "1" })));
  }
  function renderActivPend(lista) {
    const c = $("admActiv");
    if (!lista.length) { c.innerHTML = '<div class="vacio">Sin activaciones por revisar.</div>'; return; }
    c.innerHTML = lista.map((a) => '<div class="userline"><span><b>' + esc(a.nombre_activacion) + '</b><br><small style="color:var(--gris)">' + esc(a.lugar || "") + ' · ' + esc(a.registrado_por || "") + '</small></span><span>' +
      '<button class="mini ok" data-id="' + esc(a.id) + '">Aprobar</button> <button class="mini bad" data-id="' + esc(a.id) + '">Rechazar</button></span></div>').join("");
    c.querySelectorAll(".mini.ok").forEach((b) => b.addEventListener("click", () => revisarAct(b.dataset.id, "aprobado")));
    c.querySelectorAll(".mini.bad").forEach((b) => b.addEventListener("click", () => revisarAct(b.dataset.id, "rechazado")));
  }
  async function accionUsuario(accion, extra) {
    try { const d = await postCerebro(Object.assign({ accion: accion }, extra)); if (d && d.ok) { toast("Hecho", "ok"); cargarAdmin(); } else toast((d && d.error) || "Error", "bad"); } catch (e) { toast("Sin conexión", "bad"); }
  }
  async function revisarAct(id, estado) {
    try { const d = await postCerebro({ accion: "revisar_activacion", id: id, estado: estado }); if (d && d.ok) { toast(estado === "aprobado" ? "Aprobada" : "Rechazada", "ok"); cargarAdmin(); } else toast((d && d.error) || "Error", "bad"); } catch (e) { toast("Sin conexión", "bad"); }
  }
  async function guardarConfig() {
    try {
      await postCerebro({ accion: "set_config", clave_cfg: "aprobar_usuarios", valor: $("cfgUsuarios").checked ? "si" : "no" });
      await postCerebro({ accion: "set_config", clave_cfg: "aprobar_activaciones", valor: $("cfgActiv").checked ? "si" : "no" });
      toast("Configuración guardada", "ok");
    } catch (e) { toast("No se pudo guardar", "bad"); }
  }
  async function crearUsuarioAdmin() {
    const est = $("auEstado");
    const nombre = $("auNombre").value.trim(), email = $("auEmail").value.trim().toLowerCase(), pass = $("auPass").value, rol = $("auAdmin").checked ? "admin" : "usuario";
    if (!nombre || !email || !pass) { est.className = "estado bad"; est.textContent = "Completa nombre, email y contraseña"; return; }
    est.className = "estado"; est.textContent = "Creando…";
    try {
      const d = await postCerebro({ accion: "crear_usuario", nombre: nombre, email: email, pass: pass, rol: rol });
      if (d && d.ok) { est.textContent = "✓ Usuario creado"; $("auNombre").value = $("auEmail").value = $("auPass").value = ""; $("auAdmin").checked = false; cargarAdmin(); }
      else { est.className = "estado bad"; est.textContent = (d && d.error) || "No se pudo crear"; }
    } catch (e) { est.className = "estado bad"; est.textContent = "Error de conexión"; }
  }

  // ===== Navegación =====
  let vista = "form";
  function mostrarVista(v) {
    vista = v;
    $("vistaForm").style.display = v === "form" ? "" : "none";
    $("footerForm").style.display = v === "form" ? "" : "none";
    $("vistaHistorial").style.display = v === "historial" ? "" : "none";
    $("vistaAdmin").style.display = v === "admin" ? "" : "none";
    $("btnHist").textContent = v === "form" ? "🕘" : "←";
    if (v === "historial") { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); }
  }

  // ===== Init =====
  function init() {
    // login / registro
    $("btnLogin").addEventListener("click", login);
    $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    $("btnIrRegistro").addEventListener("click", irRegistro);
    $("btnVolverLogin").addEventListener("click", volverLogin);
    $("btnRegistrar").addEventListener("click", registrar);
    $("btnConfirmarCodigo").addEventListener("click", confirmarCodigo);
    $("btnReenviar").addEventListener("click", registrar);
    // formato
    $("bBotella").addEventListener("click", () => { setFormato("Botella"); recalcular(); });
    $("bGranel").addEventListener("click", () => { setFormato("Granel"); recalcular(); });
    // cálculos en vivo
    ["f_inicial", "f_sobrante", "f_pago", "f_adic"].forEach((id) => $(id).addEventListener("input", recalcular));
    $("f_pago").addEventListener("blur", () => pintarPesos($("f_pago")));
    $("f_adic").addEventListener("blur", () => pintarPesos($("f_adic")));
    // fotos
    $("addFoto").addEventListener("click", pedirFotos);
    $("fileInput").addEventListener("change", (e) => { aceptarFotos(e.target.files); e.target.value = ""; });
    // guardar
    $("btnGuardar").addEventListener("click", pedirConfirmacion);
    $("btnConfirmar").addEventListener("click", guardarDefinitivo);
    $("btnCancelarGuardar").addEventListener("click", () => $("confirmSheet").classList.remove("show"));
    $("confirmSheet").addEventListener("click", (e) => { if (e.target === $("confirmSheet")) $("confirmSheet").classList.remove("show"); });
    // historial / nav
    $("btnHist").addEventListener("click", () => { if (editandoId && vista === "form") { salirEdicion(); limpiarFormulario(); } mostrarVista(vista === "form" ? "historial" : "form"); });
    $("busca").addEventListener("input", (e) => { $("limpiaBusca").classList.toggle("show", !!e.target.value); renderHistorial(e.target.value); });
    $("limpiaBusca").addEventListener("click", () => { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); });
    // ajustes / admin
    $("btnGear").addEventListener("click", abrirSheet);
    $("guardar").addEventListener("click", guardarConn);
    $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) cerrarSheet(); });
    $("btnCambiarPass").addEventListener("click", cambiarPass);
    $("btnLogout").addEventListener("click", logout);
    // panel admin
    $("btnAbrirAdmin").addEventListener("click", abrirAdmin);
    $("btnCerrarAdmin").addEventListener("click", () => mostrarVista("form"));
    $("cfgUsuarios").addEventListener("change", guardarConfig);
    $("cfgActiv").addEventListener("change", guardarConfig);
    $("btnAuCrear").addEventListener("click", crearUsuarioAdmin);

    setFormato("Botella");
    // sesión recordada
    if (store.user) { usuario = store.user; entrarApp(false); }
  }
  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
