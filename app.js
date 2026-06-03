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
    // Clave temporal: obliga a cambiarla antes de operar
    if (usuario && usuario.debe_cambiar) {
      setTimeout(() => { abrirSheet(); toast("Cambia tu clave temporal para empezar a operar", "bad"); }, conAnimacion ? 4300 : 500);
    }
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
    $("bBotella").classList.toggle("on", f === "Botellas");
    $("bGranel").classList.toggle("on", f === "Granel");
    $("bAmbas").classList.toggle("on", f === "Ambas");
    $("gBotellas").style.display = (f === "Granel") ? "none" : "";
    $("gGranel").style.display = (f === "Botellas") ? "none" : "";
  }
  function calcHoras() {
    const hi = $("f_hora_ini").value, hf = $("f_hora_fin").value;
    if (!hi || !hf) return 0;
    const a = hi.split(":").map(Number), b = hf.split(":").map(Number);
    let min = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
    if (min < 0) min += 24 * 60; // cruza medianoche
    return Math.round((min / 60) * 100) / 100;
  }
  // ===== Cálculos (consumo, duración y costo) =====
  function recalcular() {
    const botCons = Math.max(soloNum($("f_bot_ini").value) - soloNum($("f_bot_sob").value), 0);
    const graCons = Math.max(soloNum($("f_gra_ini").value) - soloNum($("f_gra_sob").value), 0);
    const costo = soloInt($("f_pago").value) + soloInt($("f_adic").value);
    const horas = calcHoras();
    const litros = Math.round((botCons * 0.7 + graCons) * 100) / 100; // total en litros
    const txt = [];
    if (botCons) txt.push(botCons + " bot.");
    if (graCons) txt.push(graCons + " L granel");
    $("rConsumido").textContent = txt.length ? txt.join(" + ") : "0";
    $("rCosto").textContent = fmt(costo);
    $("rDuracion").textContent = horas ? (horas + " h") : "0 h";
    return { botCons, graCons, litros, costo, horas };
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

  // ===== Ventas (precio editable) =====
  let ventas = [];
  function agregarVenta() {
    let item = $("vItem").value;
    if (item === "Otro") { const x = window.prompt("Nombre del producto:"); if (!x || !x.trim()) return; item = x.trim(); }
    const cant = soloInt($("vCant").value) || 1, precio = soloInt($("vPrecio").value) || 0;
    if (precio <= 0) { toast("Ingresa un precio", "bad"); return; }
    ventas.push({ item: item, cant: cant, precio: precio });
    $("vPrecio").value = ""; $("vCant").value = "1";
    renderVentas();
  }
  function renderVentas() {
    const c = $("vLista");
    c.innerHTML = ventas.map((v, i) => '<div class="userline"><span>' + esc(v.item) + ' × ' + v.cant + ' · ' + fmt(v.precio) + '</span><span><b>' + fmt(v.cant * v.precio) + '</b> &nbsp;<button class="mini bad delV" data-i="' + i + '">✕</button></span></div>').join("");
    c.querySelectorAll(".delV").forEach((b) => b.addEventListener("click", () => { ventas.splice(+b.dataset.i, 1); renderVentas(); }));
    $("vTotal").textContent = fmt(ventasTotal());
    $("vResumen").style.display = ventas.length ? "" : "none";
  }
  function ventasTotal() { return ventas.reduce((s, v) => s + v.cant * v.precio, 0); }
  function ventasTexto() { return ventas.map((v) => v.item + " x" + v.cant + " $" + v.precio).join("; "); }
  function parseVentas(txt) {
    ventas = [];
    String(txt || "").split(";").forEach((p) => {
      const m = p.trim().match(/^(.*) x(\d+) \$(\d+)$/);
      if (m) ventas.push({ item: m[1], cant: +m[2], precio: +m[3] });
    });
    renderVentas();
  }

  // ===== Checklist de insumos =====
  const CHECKLIST = {
    "Bebestibles": [
      { n: "Hielo", u: "kg", key: "hielo" }, { n: "Tónica", u: "L", key: "tonica" },
      { n: "Cítricos / deshidratados", u: "u" }, { n: "Botellas 250ml", u: "u" }
    ],
    "Activos": [
      { n: "Toalla nova", u: "u" }, { n: "Alcohol para limpiar", u: "u" }, { n: "Mantel", u: "u" }, { n: "Perchero", u: "u" },
      { n: "Poleras", u: "u" }, { n: "Jockey", u: "u" }, { n: "Libro", u: "u" }, { n: "Máquina Mercado Pago", u: "u" },
      { n: "Cargador Mercado Pago", u: "u" }, { n: "Papel máquina MP", u: "u" }, { n: "Pizarra digital + lápices", u: "u" },
      { n: "Alargador", u: "u" }, { n: "Mesa", u: "u" }, { n: "Letrero", u: "u" }, { n: "Hielera", u: "u" }, { n: "Poruña para hielo", u: "u" },
      { n: "Pinzas", u: "u" }, { n: "Barra", u: "u" }, { n: "Pendón", u: "u" }, { n: "QR", u: "u" }, { n: "Vasos plásticos", u: "u" },
      { n: "Vasos de vidrio", u: "u" }, { n: "Cuchillo", u: "u" }, { n: "Plato", u: "u" }, { n: "Refrigerador", u: "u" }, { n: "Vasos de degustación", u: "u" }
    ]
  };
  function buildChecklist() {
    let html = "";
    Object.keys(CHECKLIST).forEach((grupo) => {
      html += '<div class="grupo" style="padding:10px 0 4px;color:#888">' + grupo.toUpperCase() + '</div>';
      CHECKLIST[grupo].forEach((it) => {
        html += '<div class="chk-item"><span>' + esc(it.n) + ' <small style="color:var(--gris)">(' + it.u + ')</small></span>' +
          '<input type="number" inputmode="decimal" min="0" step="0.5" value="0" data-n="' + esc(it.n) + '" data-u="' + esc(it.u) + '"' + (it.key ? ' data-key="' + it.key + '"' : "") + ' class="chkInput"></div>';
      });
    });
    $("checklistBox").innerHTML = html;
  }
  function checklistTexto() {
    const arr = [];
    $("checklistBox").querySelectorAll(".chkInput").forEach((inp) => { const v = soloNum(inp.value); if (v > 0) arr.push(inp.dataset.n + ": " + v + " " + inp.dataset.u); });
    return arr.join("; ");
  }
  function checklistHieloTonica() {
    let hielo = 0, tonica = 0;
    $("checklistBox").querySelectorAll(".chkInput").forEach((inp) => { if (inp.dataset.key === "hielo") hielo = soloNum(inp.value); if (inp.dataset.key === "tonica") tonica = soloNum(inp.value); });
    return { hielo: hielo, tonica: tonica };
  }
  function resetChecklist() { $("checklistBox").querySelectorAll(".chkInput").forEach((i) => (i.value = "0")); }
  function parseChecklist(txt) {
    const map = {}; String(txt || "").split(";").forEach((p) => { const m = p.trim().match(/^(.*): ([\d.]+) /); if (m) map[m[1]] = m[2]; });
    $("checklistBox").querySelectorAll(".chkInput").forEach((inp) => { inp.value = (map[inp.dataset.n] !== undefined) ? map[inp.dataset.n] : "0"; });
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
    $("cfConsumo").textContent = ((c.botCons ? c.botCons + " bot. " : "") + (c.graCons ? c.graCons + " L" : "")).trim() || "0";
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
      formato: formato,
      gin_inicial: soloNum($("f_bot_ini").value), gin_sobrante: soloNum($("f_bot_sob").value),
      gin_consumido: c.litros, gin_cortesia: soloNum($("f_cortesia").value), costo_total: c.costo,
      registrado_por: $("f_registra").value.trim(),
      usuario_email: usuario ? usuario.email : "",
      hora_inicio: $("f_hora_ini").value, hora_fin: $("f_hora_fin").value, duracion_horas: c.horas,
      botellas_ini: soloNum($("f_bot_ini").value), botellas_sob: soloNum($("f_bot_sob").value),
      granel_ini: soloNum($("f_gra_ini").value), granel_sob: soloNum($("f_gra_sob").value),
      botellas_rellenadas: soloInt($("f_rellenadas").value),
      hielo_cliente: $("f_hielo_cli").checked, tonica_cliente: $("f_tonica_cli").checked,
      contactos_nuevos: $("f_contactos_nuevos").value.trim(),
      ventas_detalle: ventasTexto(), ingreso_ventas: ventasTotal(),
      checklist: checklistTexto(), hielo_kg: checklistHieloTonica().hielo, tonica_litros: checklistHieloTonica().tonica
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
     "f_personal", "f_pago", "f_adic", "f_bot_ini", "f_bot_sob", "f_gra_ini", "f_gra_sob",
     "f_rellenadas", "f_cortesia", "f_contactos_nuevos"].forEach((id) => ($(id).value = ""));
    $("f_hielo_cli").checked = false; $("f_tonica_cli").checked = false;
    $("f_hora_ini").value = "20:00"; $("f_hora_fin").value = "23:00";
    ventas = []; renderVentas();
    resetChecklist();
    fotos = []; renderFotos(); setFormato("Botellas");
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
        '<button class="mini ' + (v.estado === "aprobado" ? "ok" : "bad") + ' togAct" data-id="' + esc(v.id) + '" data-s="' + (v.estado === "aprobado" ? "pendiente" : "aprobado") + '">' + (v.estado === "aprobado" ? "✓ Aprobada" : "○ Aprobar") + '</button>' +
        '<button class="mini editAct" data-id="' + esc(v.id) + '" style="background:#3a3a3a">✏️</button>' +
        '<button class="mini bad delAct" data-id="' + esc(v.id) + '">🗑</button></div>' : '') +
      '</div></div>'
    ).join("");
    cont.querySelectorAll(".delAct").forEach((b) => b.addEventListener("click", () => eliminarActivacion(b.dataset.id)));
    cont.querySelectorAll(".editAct").forEach((b) => b.addEventListener("click", () => abrirEdicion(b.dataset.id)));
    cont.querySelectorAll(".togAct").forEach((b) => b.addEventListener("click", () => revisarAct(b.dataset.id, b.dataset.s)));
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
      if (d && d.ok) {
        est.textContent = "✓ Contraseña actualizada"; $("cpActual").value = ""; $("cpNueva").value = "";
        if (usuario) { usuario.debe_cambiar = false; store.user = usuario; }
        setTimeout(cerrarSheet, 1200);
      }
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
      setFormato(["Botellas", "Granel", "Ambas"].indexOf(x.formato) >= 0 ? x.formato : "Botellas");
      $("f_bot_ini").value = x.botellas_ini || ""; $("f_bot_sob").value = x.botellas_sob || "";
      $("f_gra_ini").value = x.granel_ini || ""; $("f_gra_sob").value = x.granel_sob || "";
      $("f_rellenadas").value = x.botellas_rellenadas || ""; $("f_cortesia").value = x.gin_cortesia || "";
      $("f_hora_ini").value = x.hora_inicio || "20:00"; $("f_hora_fin").value = x.hora_fin || "23:00";
      $("f_hielo_cli").checked = !!x.hielo_cliente; $("f_tonica_cli").checked = !!x.tonica_cliente;
      $("f_contactos_nuevos").value = x.contactos_nuevos || "";
      parseVentas(x.ventas_detalle);
      parseChecklist(x.checklist);
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
    // 3 cargas EN PARALELO (mucho más rápido que una tras otra)
    const [c, u, h, e] = await Promise.all([
      postCerebro({ accion: "get_config" }).catch(() => null),
      postCerebro({ accion: "listar_usuarios" }).catch(() => null),
      postCerebro({ accion: "historial" }).catch(() => null),
      postCerebro({ accion: "estadisticas" }).catch(() => null)
    ]);
    if (c && c.ok && c.config) { $("cfgUsuarios").checked = c.config.aprobar_usuarios === "si"; $("cfgActiv").checked = c.config.aprobar_activaciones === "si"; }
    const lista = (u && u.ok && u.lista) ? u.lista : [];
    renderPendientes(lista.filter((x) => x.estado === "pendiente"));
    renderUsuarios(lista);
    renderActivPend(((h && h.ok && h.lista) ? h.lista : []).filter((x) => x.estado === "pendiente"));
    renderStats(e && e.ok ? e.stats : null);
  }
  function renderStats(s) {
    if (!s || !s.total) { $("statsBox").innerHTML = '<div class="vacio">Aún no hay datos suficientes.</div>'; return; }
    const row = (l, v) => '<div class="r"><span>' + l + '</span><b>' + v + '</b></div>';
    $("statsBox").innerHTML = '<div class="resumen">' +
      row("Activaciones", s.total) +
      row("Ingreso por ventas", fmt(s.ingreso)) +
      row("Gasto total (con honorarios)", fmt(s.gastoTotal)) +
      row("Impuesto honorarios (~14,5%)", fmt(s.impuesto)) +
      '<div class="total"><span>Resultado</span><b>' + fmt(s.resultado) + '</b></div></div>' +
      '<div class="resumen" style="margin-top:8px">' +
      row("Gin por persona", s.ginPorPersona + " L") +
      row("Hielo por persona", s.hieloPorPersona + " kg") +
      row("Tónica por persona", s.tonicaPorPersona + " L") + '</div>';
  }
  async function rehacerDash() {
    toast("Actualizando dashboard…", "ok");
    try { const d = await postCerebro({ accion: "rehacer_dashboard" }); toast(d && d.ok ? "✓ Dashboard actualizado en Google Sheets" : "Error", d && d.ok ? "ok" : "bad"); }
    catch (e) { toast("Sin conexión", "bad"); }
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
    c.innerHTML = lista.map((u) =>
      '<div class="userline"><span>' + esc(u.nombre) + ' · ' + esc(u.email) +
      ' <span class="rolbadge ' + (u.rol === "admin" ? "admin" : "") + '">' + esc(u.rol) + '</span>' +
      (u.estado === "pendiente" ? ' <span class="rolbadge">pendiente</span>' : '') +
      (!u.activo ? ' <span class="rolbadge">bloqueado</span>' : '') + '</span>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
        '<button class="mini ' + (u.activo ? "bad" : "ok") + ' actToggle" data-e="' + esc(u.email) + '" data-a="' + (u.activo ? "0" : "1") + '">' + (u.activo ? "Bloquear" : "Activar") + '</button>' +
        '<button class="mini editU" data-e="' + esc(u.email) + '" data-n="' + esc(u.nombre) + '" data-r="' + esc(u.rol) + '" style="background:#3a3a3a">Editar</button>' +
        '<button class="mini delU bad" data-e="' + esc(u.email) + '">Eliminar</button>' +
      '</span></div>').join("");
    c.querySelectorAll("button.actToggle").forEach((b) => b.addEventListener("click", () => accionUsuario("activar_usuario", { email: b.dataset.e, activo: b.dataset.a === "1" })));
    c.querySelectorAll("button.editU").forEach((b) => b.addEventListener("click", () => editarUsuarioAdmin(b.dataset.e, b.dataset.n, b.dataset.r)));
    c.querySelectorAll("button.delU").forEach((b) => b.addEventListener("click", () => eliminarUsuarioAdmin(b.dataset.e)));
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
    try {
      const d = await postCerebro({ accion: "revisar_activacion", id: id, estado: estado });
      if (d && d.ok) { toast(estado === "aprobado" ? "Aprobada ✓" : "Marcada pendiente", "ok"); await cargarHistorial(); if (vista === "admin") cargarAdmin(); }
      else toast((d && d.error) || "Error", "bad");
    } catch (e) { toast("Sin conexión", "bad"); }
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
    const nombre = $("auNombre").value.trim(), email = $("auEmail").value.trim().toLowerCase(), rol = $("auAdmin").checked ? "admin" : "usuario";
    if (!nombre || !email) { est.className = "estado bad"; est.textContent = "Completa nombre y email"; return; }
    est.className = "estado"; est.textContent = "Creando y enviando clave…";
    try {
      const d = await postCerebro({ accion: "crear_usuario", nombre: nombre, email: email, rol: rol });
      if (d && d.ok) { est.textContent = "✓ Usuario creado. Se le envió su clave temporal por correo."; $("auNombre").value = $("auEmail").value = ""; $("auAdmin").checked = false; cargarAdmin(); }
      else { est.className = "estado bad"; est.textContent = (d && d.error) || "No se pudo crear"; }
    } catch (e) { est.className = "estado bad"; est.textContent = "Error de conexión"; }
  }
  async function editarUsuarioAdmin(email, nombreActual, rolActual) {
    const nuevo = window.prompt("Nuevo nombre para " + email + ":", nombreActual || "");
    if (nuevo === null) return;
    const haceAdmin = window.confirm("¿Debe ser ADMINISTRADOR?\n\nAceptar = admin · Cancelar = usuario normal");
    try {
      const d = await postCerebro({ accion: "editar_usuario", email: email, nombre: nuevo.trim() || nombreActual, rol: haceAdmin ? "admin" : "usuario" });
      if (d && d.ok) { toast("Usuario actualizado", "ok"); cargarAdmin(); } else toast((d && d.error) || "Error", "bad");
    } catch (e) { toast("Sin conexión", "bad"); }
  }
  async function eliminarUsuarioAdmin(email) {
    if (!window.confirm("¿Eliminar al usuario " + email + "? No se puede deshacer.")) return;
    try {
      const d = await postCerebro({ accion: "eliminar_usuario", email: email });
      if (d && d.ok) { toast("Usuario eliminado", "ok"); cargarAdmin(); } else toast((d && d.error) || "Error", "bad");
    } catch (e) { toast("Sin conexión", "bad"); }
  }

  // ===== Navegación =====
  let vista = "form";
  function mostrarVista(v) {
    vista = v;
    $("vistaForm").style.display = v === "form" ? "" : "none";
    $("footerForm").style.display = v === "form" ? "" : "none";
    $("vistaHistorial").style.display = v === "historial" ? "" : "none";
    $("vistaAdmin").style.display = v === "admin" ? "" : "none";
    $("vistaCalendario").style.display = v === "calendario" ? "" : "none";
    if (v === "historial") { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); }
    if (v === "calendario") renderCalendario();
  }

  // ===== Menú lateral (drawer) =====
  function openDrawer() { $("drNombre").textContent = usuario ? usuario.nombre : ""; $("drRol").textContent = usuario ? usuario.rol : ""; $("drawer").classList.add("show"); $("drawerOv").classList.add("show"); }
  function closeDrawer() { $("drawer").classList.remove("show"); $("drawerOv").classList.remove("show"); }

  // ===== Calendario =====
  let calY, calM;
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  function renderCalendario() {
    const now = new Date();
    if (calY === undefined) { calY = now.getFullYear(); calM = now.getMonth(); }
    $("calMes").textContent = MESES[calM] + " " + calY;
    const porDia = {};
    cacheHist.forEach((v) => { const f = (v.fecha || "").slice(0, 10); if (f) porDia[f] = (porDia[f] || 0) + 1; });
    const primero = new Date(calY, calM, 1);
    const dow = (primero.getDay() + 6) % 7; // lunes = 0
    const dias = new Date(calY, calM + 1, 0).getDate();
    const dows = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    let html = dows.map((d) => '<div class="dow">' + d + '</div>').join("");
    for (let i = 0; i < dow; i++) html += '<div class="cal-cell vacia"></div>';
    const hoy = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    for (let d = 1; d <= dias; d++) {
      const f = calY + "-" + String(calM + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const cnt = porDia[f] || 0;
      html += '<div class="cal-cell' + (f === hoy ? " hoy" : "") + '" data-f="' + f + '">' + d + (cnt ? '<div class="dot"></div>' : "") + (cnt > 1 ? '<div class="num2">' + cnt + '</div>' : "") + '</div>';
    }
    $("calGrid").innerHTML = html;
    $("calGrid").querySelectorAll(".cal-cell[data-f]").forEach((c) => c.addEventListener("click", () => verDia(c.dataset.f)));
    $("calDia").innerHTML = "";
  }
  function verDia(f) {
    const items = cacheHist.filter((v) => (v.fecha || "").slice(0, 10) === f);
    const d = new Date(f + "T00:00:00");
    let html = '<h4>' + d.toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" }) + '</h4>';
    if (!items.length) html += '<div class="vacio">Sin activaciones este día.</div>';
    else html += items.map((v) => '<div class="hcard"><div class="izq"><div class="cli">' + esc(v.nombre_activacion || "") + '</div><div class="meta">' + esc(v.lugar || "") + (v.comuna ? " · " + esc(v.comuna) : "") + '</div></div><div class="der"><div class="fecha">' + esc(v.registrado_por || "") + '</div></div></div>').join("");
    $("calDia").innerHTML = html;
  }
  function calMover(delta) { calM += delta; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } renderCalendario(); }

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
    $("bBotella").addEventListener("click", () => { setFormato("Botellas"); recalcular(); });
    $("bGranel").addEventListener("click", () => { setFormato("Granel"); recalcular(); });
    $("bAmbas").addEventListener("click", () => { setFormato("Ambas"); recalcular(); });
    // cálculos en vivo
    ["f_bot_ini", "f_bot_sob", "f_gra_ini", "f_gra_sob", "f_pago", "f_adic", "f_hora_ini", "f_hora_fin"].forEach((id) => $(id).addEventListener("input", recalcular));
    $("f_pago").addEventListener("blur", () => pintarPesos($("f_pago")));
    $("f_adic").addEventListener("blur", () => pintarPesos($("f_adic")));
    // fotos
    $("addFoto").addEventListener("click", pedirFotos);
    $("fileInput").addEventListener("change", (e) => { aceptarFotos(e.target.files); e.target.value = ""; });
    // ventas
    $("vAdd").addEventListener("click", agregarVenta);
    $("vPrecio").addEventListener("blur", () => pintarPesos($("vPrecio")));
    // checklist
    buildChecklist();
    $("toggleChecklist").addEventListener("click", () => { const b = $("checklistBox"); const show = b.style.display === "none"; b.style.display = show ? "" : "none"; $("toggleChecklist").textContent = show ? "▲ Ocultar checklist" : "▼ Mostrar checklist"; });
    // guardar
    $("btnGuardar").addEventListener("click", pedirConfirmacion);
    $("btnConfirmar").addEventListener("click", guardarDefinitivo);
    $("btnCancelarGuardar").addEventListener("click", () => $("confirmSheet").classList.remove("show"));
    $("confirmSheet").addEventListener("click", (e) => { if (e.target === $("confirmSheet")) $("confirmSheet").classList.remove("show"); });
    // menú lateral / navegación
    $("btnMenu").addEventListener("click", openDrawer);
    $("drawerOv").addEventListener("click", closeDrawer);
    document.querySelectorAll(".drawer .item[data-nav]").forEach((b) => b.addEventListener("click", () => {
      closeDrawer();
      if (editandoId) { salirEdicion(); limpiarFormulario(); }
      mostrarVista(b.dataset.nav);
      if (b.dataset.nav === "admin") cargarAdmin();
    }));
    $("drInstalar").addEventListener("click", () => { closeDrawer(); $("installSheet").classList.add("show"); });
    $("drAjustes").addEventListener("click", () => { closeDrawer(); abrirSheet(); });
    $("drLogout").addEventListener("click", () => { closeDrawer(); logout(); });
    $("cerrarInstall").addEventListener("click", () => $("installSheet").classList.remove("show"));
    $("installSheet").addEventListener("click", (e) => { if (e.target === $("installSheet")) $("installSheet").classList.remove("show"); });
    $("calPrev").addEventListener("click", () => calMover(-1));
    $("calNext").addEventListener("click", () => calMover(1));
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
    $("btnDashGoogle").addEventListener("click", rehacerDash);

    setFormato("Botella");
    // sesión recordada
    if (store.user) { usuario = store.user; entrarApp(false); }
  }
  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
