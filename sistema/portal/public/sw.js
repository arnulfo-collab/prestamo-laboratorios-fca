/**
 * Trabajador de servicio del portal · HU-01, segundo incremento.
 *
 * Su único trabajo es que la aplicación abra. Guarda el armazón —la página,
 * el guion y la hoja de estilo— y lo sirve si la red no responde. Lo que NO
 * hace es guardar respuestas de la API: una disponibilidad de ayer mostrada
 * como si fuera la de hoy haría que dos docentes apartaran el mismo
 * laboratorio, y ese es justo el problema que el sistema viene a resolver.
 */
const CACHE = "prestamo-laboratorios-v1";
const ARMAZON = ["./", "./index.html", "./manifest.webmanifest", "./icono-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARMAZON)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // La API siempre va a la red. Sin conexión devuelve un error explícito, que
  // el portal ya sabe mostrar, en lugar de datos viejos disfrazados de nuevos.
  if (url.pathname.startsWith("/api/")) {
    evento.respondWith(
      fetch(peticion).catch(
        () =>
          new Response(
            JSON.stringify({ error: "Sin conexión. Vuelve a intentarlo cuando tengas red." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    return;
  }

  // El resto: primero la red, y si falla, lo guardado. Así una versión nueva
  // del portal se recoge en cuanto hay conexión, sin esperar a que caduque.
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok && respuesta.type === "basic") {
          const copia = respuesta.clone();
          void caches.open(CACHE).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(async () => (await caches.match(peticion)) ?? (await caches.match("./index.html"))),
  );
});
