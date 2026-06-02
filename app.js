/* App Activaciones Malcriado — PWA (diseño Indomable) */
(function () {
  "use strict";
  const C = window.ACTIVACIONES_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  let usuario = null;       // {nombre,email,rol}
  let formato = "Botella";  // "Botella" | "Granel"
  let fotos = [];           // [{name, dataUrl}]
  let guardando = false;

  // --- Conexión y sesión guardadas en el teléfono ---
  const store = {
    get url() { return localStorage.getItem("api_url") || C.API_URL_DEFAULT || ""; },
    set url(v) { localStorage.setItem("api_url", (v || "").trim()); },
    get key() { return localStorage.getItem("api_key") || C.API_KEY_DEFAULT || ""; },
    set key(v) { localStorage.setItem("api_key", (v || "").trim()); },
    get user() { try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch (e) { return null; } },
    set user(v) { v ? localStorage.setItem("usuario", JSON.stringify(v)) : localStorage.removeItem("usuario"); },
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
    const resp = await fetch(store.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
      body: JSON.stringify(payload)
    });
    return await resp.json();
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
        usuario = d.usuario; store.user = usuario;
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
    usuario = null; store.user = null;
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
    if (fotos.length < 1) { toast("Sube al menos 1 foto", "bad"); return false; }
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
    const btn = $("btnGuardar"); guardando = true; btn.disabled = true; const txt = btn.textContent; btn.textContent = "Guardando…";
    try {
      const d = await postCerebro({ accion: "guardar_activacion", datos: datos, fotos: fotos });
      if (d && d.ok) {
        btn.classList.add("ok"); btn.textContent = "✓ Guardado";
        mostrarTicket("¡Registro guardado!", "Queda en el historial",
          ["✓ Guardado en Google Drive", "✓ Planilla actualizada", "✓ " + fotos.length + " foto(s) subidas"]);
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
      const d = await postCerebro({ accion: "historial" });
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
      '<div class="meta">' + esc(v.lugar || "") + (v.comuna ? " · " + esc(v.comuna) : "") +
      ' · consumo ' + esc(String(v.gin_consumido || 0)) + ' · ' + esc(v.registrado_por || "") + '</div></div>' +
      '<div class="der"><div class="monto">' + fmt(v.costo_total) + '</div>' +
      '<div class="fecha">' + fechaCorta(v.fecha) + '</div></div></div>'
    ).join("");
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

  // ===== Admin: usuarios =====
  async function crearUsuario() {
    const est = $("estadoUser");
    const nombre = $("nuNombre").value.trim(), email = $("nuEmail").value.trim().toLowerCase(), pass = $("nuPass").value, rol = $("nuRol").value;
    if (!nombre || !email || !pass) { est.className = "estado bad"; est.textContent = "Completa nombre, email y contraseña"; return; }
    est.className = "estado"; est.textContent = "Creando…";
    try {
      const d = await postCerebro({ accion: "crear_usuario", nombre, email, pass, rol });
      if (d && d.ok) { est.textContent = "✓ Usuario creado"; $("nuNombre").value = $("nuEmail").value = $("nuPass").value = ""; verUsuarios(); }
      else { est.className = "estado bad"; est.textContent = (d && d.error) || "No se pudo crear"; }
    } catch (e) { est.className = "estado bad"; est.textContent = "Error de conexión"; }
  }
  async function verUsuarios() {
    try {
      const d = await postCerebro({ accion: "listar_usuarios" });
      const lista = (d && d.ok && d.lista) ? d.lista : [];
      $("listaUsuarios").innerHTML = lista.map((u) =>
        '<div class="userline"><span>' + esc(u.nombre) + ' · ' + esc(u.email) + '</span>' +
        '<span class="rolbadge ' + (u.rol === "admin" ? "admin" : "") + '">' + esc(u.rol) + '</span></div>').join("");
    } catch (e) { toast("No se pudo cargar usuarios", "bad"); }
  }

  // ===== Navegación =====
  let vista = "form";
  function mostrarVista(v) {
    vista = v;
    $("vistaForm").style.display = v === "form" ? "" : "none";
    $("footerForm").style.display = v === "form" ? "" : "none";
    $("vistaHistorial").style.display = v === "historial" ? "" : "none";
    $("btnHist").textContent = v === "form" ? "🕘" : "←";
    if (v === "historial") { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); }
  }

  // ===== Init =====
  function init() {
    // login
    $("btnLogin").addEventListener("click", login);
    $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    $("btnIrAjustes").addEventListener("click", abrirSheet);
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
    $("btnHist").addEventListener("click", () => mostrarVista(vista === "form" ? "historial" : "form"));
    $("busca").addEventListener("input", (e) => { $("limpiaBusca").classList.toggle("show", !!e.target.value); renderHistorial(e.target.value); });
    $("limpiaBusca").addEventListener("click", () => { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); });
    // ajustes / admin
    $("btnGear").addEventListener("click", abrirSheet);
    $("guardar").addEventListener("click", guardarConn);
    $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) cerrarSheet(); });
    $("btnCrearUsuario").addEventListener("click", crearUsuario);
    $("btnVerUsuarios").addEventListener("click", verUsuarios);
    $("btnLogout").addEventListener("click", logout);

    setFormato("Botella");
    // sesión recordada
    if (store.user) { usuario = store.user; entrarApp(false); }
  }
  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
