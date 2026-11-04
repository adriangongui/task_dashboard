// Genera los iconos PNG de la PWA sin dependencias: dibuja con muestreo
// múltiple y codifica el PNG a mano (zlib + CRC32).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [91, 93, 214]; // #5B5DD6
const BLANCO = [255, 255, 255];

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const nombre = Buffer.from(tipo, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nombre, datos])));
  return Buffer.concat([largo, nombre, datos, crc]);
}

function codificarPNG(ancho, alto, rgba) {
  const filaBytes = ancho * 4 + 1;
  const crudo = Buffer.alloc(filaBytes * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * filaBytes] = 0; // filtro "none"
    rgba.copy(crudo, y * filaBytes + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(crudo, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

function distanciaRectRedondeado(x, y, cx, cy, w, h, r) {
  const qx = Math.abs(x - cx) - (w / 2 - r);
  const qy = Math.abs(y - cy) - (h / 2 - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function distanciaSegmento(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(
    0,
    Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)),
  );
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/** Dibuja el icono: cuadrado redondeado índigo con un check blanco. */
function dibujar(tamano, { maskable = false } = {}) {
  const MUESTRAS = 4;
  const salida = Buffer.alloc(tamano * tamano * 4);

  const A = [0.28, 0.52];
  const B = [0.44, 0.68];
  const C = [0.73, 0.35];
  const grosor = 0.05;

  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      let sumaR = 0;
      let sumaG = 0;
      let sumaB = 0;
      let sumaA = 0;

      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          const px = (x + (sx + 0.5) / MUESTRAS) / tamano;
          const py = (y + (sy + 0.5) / MUESTRAS) / tamano;

          const dentro = maskable
            ? true
            : distanciaRectRedondeado(px, py, 0.5, 0.5, 1, 1, 0.22) <= 0;

          if (!dentro) continue;

          const cercaCheck =
            Math.min(
              distanciaSegmento(px, py, A[0], A[1], B[0], B[1]),
              distanciaSegmento(px, py, B[0], B[1], C[0], C[1]),
            ) <= grosor;

          const color = cercaCheck ? BLANCO : BG;
          sumaR += color[0];
          sumaG += color[1];
          sumaB += color[2];
          sumaA += 255;
        }
      }

      const total = MUESTRAS * MUESTRAS;
      const i = (y * tamano + x) * 4;
      if (sumaA === 0) {
        salida[i] = 0;
        salida[i + 1] = 0;
        salida[i + 2] = 0;
        salida[i + 3] = 0;
      } else {
        const cubiertos = sumaA / 255;
        salida[i] = Math.round(sumaR / cubiertos);
        salida[i + 1] = Math.round(sumaG / cubiertos);
        salida[i + 2] = Math.round(sumaB / cubiertos);
        salida[i + 3] = Math.round(sumaA / total);
      }
    }
  }

  return codificarPNG(tamano, tamano, salida);
}

mkdirSync("public/icons", { recursive: true });

// Nombres versionados: si un deploy anterior dejó un 404 cacheado para un
// icono, Chrome se niega a instalar la PWA. Con nombres nuevos se evita.
writeFileSync("public/icons/icon-192-v2.png", dibujar(192));
writeFileSync("public/icons/icon-512-v2.png", dibujar(512));
writeFileSync(
  "public/icons/icon-maskable-512-v2.png",
  dibujar(512, { maskable: true }),
);
writeFileSync(
  "public/apple-touch-icon-v2.png",
  dibujar(180, { maskable: true }),
);

console.log("Iconos generados en public/");
