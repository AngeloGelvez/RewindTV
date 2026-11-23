// Node.js 22+. Renueva una fuente autorizada consultando su reproductor publicado.
// Uso: const {refreshSource}=require('./renovar-fuente.cjs');
// const nueva = await refreshSource(pelicula.sources[0]);
// Ejecutar en backend. No aceptar URLs arbitrarias del visitante.
function expiry(url){
  const q=new URL(url).searchParams,s=Number(q.get('s')),e=Number(q.get('e'));
  const valid=Number.isFinite(s)&&s>0&&Number.isFinite(e)&&e>0;
  return {s:q.get('s'),e:q.get('e'),expiracion_estimada_utc:valid?new Date((s+e)*1000).toISOString():null,semantica_caducidad_confirmada:false,vinculacion_ip:'no_verificada'};
}
function enrich(item){
  item.resolucion={modo:'bajo_demanda',firmante:'proveedor_externo',pagina_respaldo:item.reproductor_intermedio||null,no_firmar_localmente:true};
  for(const source of item.sources||[]){
    source.token=expiry(source.url);
    source.renovacion={metodo:'GET',url:source.reproductor_origen,tipo_respuesta:'html',estrategia:'Leer la configuracion HLS publicada por el reproductor; devolver la URL firmada completa sin modificar sus parametros.',al_abrir_pelicula:true};
  }
  return item;
}
function unpack(html){
  const m=html.match(/\}\('((?:\\.|[^'])*)',(\d+),(\d+),'([^']*)'\.split/);
  if(!m)return html;
  const words=m[4].split('|'),radix=Number(m[2]);
  return m[1].replace(/\b[0-9a-z]+\b/g,t=>words[parseInt(t,radix)]||t);
}
const allowedCdn=u=>u.protocol==='https:'&&['.acek-cdn.com','.dramiyos-cdn.com'].some(d=>u.hostname.endsWith(d));
async function read(url,accept){
  const u=new URL(url);if(!accept(u))throw Error('Dominio o ruta no autorizado');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});
  if(!r.ok)throw Error('Proveedor HTTP '+r.status);
  return {text:await r.text(),cors:r.headers.get('access-control-allow-origin')};
}
async function refreshSource(source){
  // Solo recibe registros de un catalogo de confianza del servidor.
  const html=await read(source.reproductor_origen,u=>u.protocol==='https:'&&u.hostname==='morencius.com'&&/^\/embed\/[a-z0-9]+$/.test(u.pathname));
  const decoded=unpack(html.text),block=decoded.match(/var links=(\{.*?\});/);
  if(!block)throw Error('El proveedor no publica una configuracion HLS reconocible');
  const links=JSON.parse(block[1]);
  const url=Object.values(links).find(v=>{try{return allowedCdn(new URL(v))}catch{return false}});
  if(!url)throw Error('No hay fuente del CDN esperado');
  const hls=await read(url,allowedCdn);
  if(!hls.text.startsWith('#EXTM3U'))throw Error('Respuesta distinta de HLS');
  return {...source,url,token:expiry(url),cors_manifiesto:hls.cors,http_manifiesto:200,verificado_utc:new Date().toISOString(),reproduccion_verificada:false,sin_anuncios_verificado:null};
}
module.exports={refreshSource,enrich,expiry};
