# Práctica profesional · Aviación

Presentación web de nueve diapositivas, con escenas de aviación y transiciones animadas.

## Versiones publicadas

- **[Versión 1](https://natch1623.github.io/yatce_aviacion/v1/)** — archivo autónomo en [`v1/index.html`](v1/index.html).
- **[Versión 2](https://natch1623.github.io/yatce_aviacion/v2/)** — vuelo 3D de 20 diapositivas en [`v2/index.html`](v2/index.html); código fuente en [`v2/fuente/`](v2/fuente/).
- **[Versión 3](https://natch1623.github.io/yatce_aviacion/v3/)** — bitácora dibujada a mano, en [`v3/index.html`](v3/index.html). Veinte láminas de cuaderno que se dibujan con lápiz, tinta y acuarela y pasan como hojas sobre la espiral.

La [dirección principal](https://natch1623.github.io/yatce_aviacion/) abre la versión 2; la versión 1 sigue disponible en su propia URL.

## Uso

Abre el enlace público o descarga `v1/index.html` y ábrelo en un navegador moderno. Las bibliotecas y las fuentes están incrustadas; la presentación funciona sin conexión.

- Flechas, espacio, Inicio/Fin, rueda, deslizamiento y puntos: navegación.
- **F:** pantalla completa. **N:** notas del orador. **P:** pausa del ambiente.
- Enlace directo a una diapositiva: `v1/#/3`, por ejemplo.
- **Ctrl+P:** impresión horizontal o exportación a PDF.

## Versión 2: vuelo 3D

Un solo vuelo de principio a fin en Three.js: despegue desde el aeropuerto, crucero entre nubes volumétricas, tormenta, aurora, borde del espacio, paracaídas, mar y aterrizaje con saludo de agua y Blue Angels que escriben GRACIAS. Por ahora las diapositivas solo tienen títulos.

- Abre `v2/index.html`; funciona sin conexión (Three.js va incrustado).
- **→ / espacio / clic:** avanzar. **←:** retroceder. **F:** pantalla completa. **P:** pausa.
- Enlace directo a una diapositiva: `v2/#5`. Calidad: `v2/?calidad=baja` o `v2/?calidad=alta`.
- Edición: títulos en `v2/fuente/src/slides.js`. Para regenerar el HTML: `cd v2/fuente`, `npm install` y `npm run build`.

## Versión 3: bitácora dibujada a mano

- Flechas, espacio, clic, rueda o deslizamiento: navegación. **F:** pantalla completa. **P:** pausa de la animación.
- Enlace directo a una diapositiva: `v3/#5`, por ejemplo.
- Funciona sin conexión; las fuentes están incrustadas. Se respeta la preferencia de movimiento reducido.
- El código editable (textos y fotos en `slides.js`) está fuera de este repositorio, en `presentacion-dibujo/src`; `node build.mjs` genera el HTML autónomo.

## Edición

Textos, notas, temas, cámaras y fotos se editan en `PRESENTATION`, al principio de `v1/index.html`. Los comentarios del archivo explican los campos. Para conservar el HTML autónomo, usa imágenes o modelos con datos base64 en sus campos `src` y `cinema.modelGLB`.

La escena y los aviones actuales se generan por código. La calidad se adapta al equipo; no se garantizan 60 fps constantes. Se respeta la preferencia de movimiento reducido y hay un respaldo para navegadores sin WebGL.

## Publicación

GitHub Pages publica la rama `main`, carpeta raíz (`/`). El archivo `.nojekyll` permite servir los archivos estáticos directamente. Cada versión tiene su propio directorio y su propia URL.
