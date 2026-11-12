# 🎟️ Plataforma Web para Gestión de Rifas por WhatsApp (Fase 1)

Plataforma web independiente desarrollada para reemplazar la selección manual de números en grupos de WhatsApp por una experiencia autónoma, en tiempo real y optimizada para celulares y pagos por **Nequi**.

---

## 🚀 Características Principales

1. **Cuadrícula en Tiempo Real (100 números):**
   - Estados: **Libre** (verde), **Reservado** (amarillo con cuenta regresiva), **Pagado** (rojo/tachado), **Tu selección** (morado).
   - Conexión vía *Server-Sent Events (SSE)*: si alguien reserva o paga, se actualiza al instante en la pantalla de todos los participantes sin recargar la página.
2. **Reserva Atómica Anti-Colisión:**
   - La base de datos SQLite previene que dos personas tomen el mismo número simultáneamente mediante transacciones seguras.
3. **Flujo de Pago por Nequi:**
   - Valor exacto calculado según los números escogidos.
   - Botón *"Copiar Nequi"* en 1 toque.
   - Botón *"Enviar Comprobante por WhatsApp"* que abre directamente el chat con la organizadora con el mensaje formateado y los números reservados.
4. **Liberación Automática a los 20 Minutos:**
   - Si el participante no envía el pago a tiempo, los números se liberan automáticamente para que otros los tomen.
5. **Panel Administrativo Protegido con PIN (`/admin.html`):**
   - PIN por defecto: `1234` (configurable desde el mismo panel).
   - Métricas financieras en vivo: total recaudado, pendiente en reserva, meta total y porcentaje de boletas vendidas.
   - Lista interactiva de compradores con buscador y filtros.
   - Acciones de 1 clic: **Marcar como Pagado**, **Liberar Número** y enlace directo a **WhatsApp del Comprador**.
   - Botón para **Copiar enlace y mensaje promocional** listo para pegar en el grupo de WhatsApp.
   - Zona de reinicio para comenzar una nueva rifa.
6. **Diseño Mobile-First y Modo Claro / Oscuro:**
   - Adaptado a la vista web de WhatsApp y navegadores móviles.

---

## 💻 Cómo Ejecutar en tu Computador

1. Abre tu terminal en la carpeta del proyecto (`c:\Users\YASUAN\Desktop\dinero-express`).
2. Instala dependencias (si no lo has hecho):
   ```bash
   npm install
   ```
3. Inicia el servidor:
   ```bash
   npm start
   ```
4. Accede en tu navegador:
   - **Vista pública de participantes:** [http://localhost:3000](http://localhost:3000)
   - **Panel de la organizadora:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html) (PIN: `1234`)

---

## 🌐 Cómo Publicarlo en Internet Gratis (para compartir el link por WhatsApp)

Puedes publicarlo gratis en plataformas como **Render.com** o **Railway.app**:

### Opción Rápida con Render (Recomendada):
1. Sube este proyecto a tu repositorio de GitHub.
2. Ingresa a [render.com](https://render.com) y crea una cuenta gratuita.
3. Haz clic en **New +** > **Web Service**.
4. Conecta tu repositorio de GitHub.
5. Configura los siguientes campos:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Haz clic en **Deploy Web Service**.
7. En 2 minutos Render te dará un enlace público seguro (ejemplo: `https://tu-rifa.onrender.com`) que podrás compartir en tu grupo de WhatsApp.
