# Práctica profesional · Aviación

Presentación web de nueve diapositivas, con escenas de aviación y transiciones animadas.

## Versiones publicadas

- **[Versión 1](https://natch1623.github.io/yatce_aviacion/v1/)** — archivo autónomo en [`v1/index.html`](v1/index.html).
- **Versión 2:** pendiente de incorporar. Se podrá añadir en `v2/` sin sustituir la versión 1.

La [dirección principal](https://natch1623.github.io/yatce_aviacion/) abre la versión 1.

## Uso

Abre el enlace público o descarga `v1/index.html` y ábrelo en un navegador moderno. Las bibliotecas y las fuentes están incrustadas; la presentación funciona sin conexión.

- Flechas, espacio, Inicio/Fin, rueda, deslizamiento y puntos: navegación.
- **F:** pantalla completa. **N:** notas del orador. **P:** pausa del ambiente.
- Enlace directo a una diapositiva: `v1/#/3`, por ejemplo.
- **Ctrl+P:** impresión horizontal o exportación a PDF.

## Edición

Textos, notas, temas, cámaras y fotos se editan en `PRESENTATION`, al principio de `v1/index.html`. Los comentarios del archivo explican los campos. Para conservar el HTML autónomo, usa imágenes o modelos con datos base64 en sus campos `src` y `cinema.modelGLB`.

La escena y los aviones actuales se generan por código. La calidad se adapta al equipo; no se garantizan 60 fps constantes. Se respeta la preferencia de movimiento reducido y hay un respaldo para navegadores sin WebGL.

## Publicación

GitHub Pages publica la rama `main`, carpeta raíz (`/`). El archivo `.nojekyll` permite servir los archivos estáticos directamente. Cada versión tiene su propio directorio y su propia URL.
