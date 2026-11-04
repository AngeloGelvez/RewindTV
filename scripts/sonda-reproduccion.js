/**
 * Sonda de reproduccion REAL. Se pega en la consola del navegador, en una pagina
 * del sitio (no en Node: lo que mide es lo que hace el navegador).
 *
 * Un canal cuenta como bueno solo si su video AVANZA. La sonda anterior miraba
 * el atributo CODECS y un `fetch`, y se equivocaba mucho: 216 de 237 marcados por
 * "codec" reproducian. Usa los mismos dos caminos que Player.js: hls.js y, si
 * falla, el reproductor del navegador.
 *
 * Resultado: `window.malos`, listo para copiarlo a un .json y pasarlo a
 *   node scripts/marcar-canales.mjs ids.json
 * Ese script DESMARCA lo que no este en la lista, asi que la lista tiene que
 * cubrir todos los canales que se quieren dejar marcados.
 *
 * Dejar la pestana visible, y no tocar ficheros mientras corre: el HMR de Vite
 * recarga la pagina y se lleva la medicion.
 */
const { default: Hls } = await import('/node_modules/hls.js/dist/hls.mjs');

const indice = await (await fetch('/data/channels/index.json')).json();
const canales = [];
for (const categoria of indice.categorias) {
  for (const trozo of categoria.trozos) {
    canales.push(...(await (await fetch(`/data/channels/${trozo.file}`)).json()));
  }
}

const PLAZO = 25000;
const HILOS = 6;

const motivoDe = (detalles) => {
  const texto = detalles.join(',');
  const carga = texto.match(/manifestLoadError:(\d+)/);
  if (carga) return carga[1] === '0' ? 'cors' : 'http';
  return /Append|Parsing|Incompat/i.test(texto) ? 'codec' : 'cors';
};

const probar = (canal) =>
  new Promise((resolver) => {
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:36px;z-index:99999';
    document.body.appendChild(video);

    let hecho = false;
    let nativo = false;
    let inicio;
    let hls = null;
    const detalles = [];

    const fin = (bien) => {
      if (hecho) return;
      hecho = true;
      clearTimeout(plazo);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
      video.remove();
      resolver(bien ? null : { id: canal.id, motivo: motivoDe(detalles) });
    };
    const plazo = setTimeout(() => fin(false), PLAZO);

    video.addEventListener('timeupdate', () => {
      if (video.currentTime <= 0) return;
      inicio ??= video.currentTime;
      if (video.currentTime - inicio > 1) fin(true);
    });
    video.addEventListener('error', () => {
      if (nativo) fin(false);
    });

    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_e, data) => {
      detalles.push(`${data.details}:${data.response?.code ?? ''}`);
      if (!data.fatal || nativo) return;
      nativo = true;
      hls.destroy();
      hls = null;
      video.src = canal.stream;
      video.load();
      video.play().catch(() => {});
    });
    hls.loadSource(canal.stream);
    hls.attachMedia(video);
  });

window.malos = [];
let siguiente = 0;
await Promise.all(
  Array.from({ length: HILOS }, async () => {
    while (siguiente < canales.length) {
      const malo = await probar(canales[siguiente++]);
      if (malo) window.malos.push(malo);
    }
  }),
);
console.log(`${window.malos.length} de ${canales.length} no reproducen`);
