# Roadmap v2 — Activaciones Malcriado

## BLOQUE A — Usuarios y seguridad
- [ ] Email de confirmación cuando se crea la cuenta de un usuario nuevo.
- [ ] Flujo admin mejorado: admin crea clave temporal → llega por correo al usuario → usuario la cambia para operar. Correo de advertencia al admin Y al usuario.
- [ ] Admin puede eliminar / bloquear / editar a cualquier usuario.
- [ ] (Ya hecho, por publicar) Seguridad con token + roles + rate limit.

## BLOQUE B — Interfaz / UX
- [ ] Acelerar la pantalla de "aprobar" (hoy lenta).
- [ ] Aprobar activaciones con UN botón que prende/apaga (verde/rojo).
- [ ] Menú lateral (hamburguesa arriba-izquierda) estilo Canvas, con carpetas que se abren. Colores Malcriado (negro+rojo).
- [ ] Fotos: abrir GALERÍA, no la cámara.
- [ ] Calendario tipo Google Calendar dentro de la app (activaciones futuras y pasadas, varias por día).
- [ ] Instructivo de instalación al abrir el QR (iPhone se confunde).

## BLOQUE C — Formulario de activación
- [ ] Horario (desde/hasta, ej. 20:00–23:00) → calcula horas de trabajo / duración.
- [ ] Gin: Granel / Botellas / Ambas, con decimales (3,5 L). Líquido siempre en LITROS.
- [ ] Opción "botellas rellenadas" (además de botellas y bidones).
- [ ] Opción: hielo y tónicas las ponen los clientes (toggle).
- [ ] Agregar nuevos contactos generados en la activación.

## BLOQUE D — Ventas (precio siempre movible)
- [ ] Venta de Jigger, cucharas, vasos.
- [ ] Venta de botellas cerradas o cócteles.

## BLOQUE E — Checklist insumos (antes y al cerrar la activación)
Items con cantidad (parte en 0, modificable). Separar por carpetas: ACTIVOS vs BEBESTIBLES.
- Toalla nova (u), Alcohol limpiar (u), Tónica (L/botellas/latas), Hielo (kg), Cítricos/deshidratados (u),
  Mantel (u), Perchero (u), Poleras (u), Jockey (u), Libro (u), Botellas 250ml (u),
  Máquina Mercado Pago, Cargador MP, Papel MP, Pizarra digital + lápices, Alargador (u), Mesa (u),
  Letrero (u), Hielera (u), Poruña hielo (u), Pinzas (u), Barra, Pendón (u), QR (u),
  Vasos plásticos (cant), Vasos vidrio (cant), Cuchillo (u), Plato (u), Refrigerador, Vasos degustación (cant).

## BLOQUE F — Dashboard (CLP)
- [ ] Encabezados FIJOS e iguales para toda activación (nombre, lugar, fecha, etc.) → ver quién dejó algo sin llenar.
- [ ] Plata en $ chileno. Medir GASTO vs INGRESO.
  - Ej: 3 trabajadores × $35.000 → fila con total, luego sumatoria con desglose: Gasto total / Ingreso total → Resultado final.
- [ ] Pago trabajadores = LÍQUIDO a pagar; agregar desglose del impuesto boleta de honorarios (retención).
- [ ] Sección de PROMEDIOS (gasto, Gin, hielo kg, tónica L según nº personas) que mejora con los datos.

## BLOQUE G — Integraciones (REQUIEREN DECISIÓN / pueden tener costo)
- [ ] Notificaciones por **correo** + **app (push)** 3 días antes y el día (8:50am).
- [ ] Notificaciones por **WhatsApp** → requiere API de pago (Twilio/Meta). DECIDIR.
- [ ] **Instagram @ginmalcriado**: seguidores al inicio/fin, informe de ganados, estrellas si >20 → requiere API de Instagram/Meta (cuenta business + permisos). COMPLEJO/DECIDIR.

> Nota: el cerebro de seguridad (token/roles/rate-limit) ya está listo en código, se publica junto con el resto.
