# Mary

**Anatomía humana en realidad aumentada.** Apunta la cámara a una persona de cuerpo entero (o usa una foto) y Mary dibuja sobre su cuerpo los músculos, los huesos, los órganos, las arterias, las venas y los nervios. Toca cualquier parte para ver su ficha: qué es, origen, inserción, acción, **inervación** e **irrigación**, con enlaces para saltar del músculo a su nervio o a su arteria.

Todo se procesa en el teléfono: las imágenes no salen del dispositivo.

## Abrirla

- **En línea:** la carpeta `docs/` es la app lista para publicar con GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `docs`). Después se abre en `https://apgbit.github.io/Mary/`.
- **Instalarla en el teléfono:** abre el enlace en Chrome (Android) → menú ⋮ → *Instalar app*; en iPhone (Safari) → Compartir → *Agregar a pantalla de inicio*. Después funciona sin internet.

## Cómo se usa

1. **Tomar foto**: foto de la persona de cuerpo entero, a 2–3 metros, con buena luz. Mary encuadra a la persona automáticamente.
2. Elige una vista: **Todo · Músculos · Huesos · Órganos · Irrigación · Inervación**.
3. En **Todo**, desliza **Foto → Hueso** para entrar capa por capa: piel, músculos superficiales, músculos profundos, órganos, vasos y nervios, y al final el esqueleto.
4. Toca cualquier estructura para abrir su ficha. Los botones de colores de la ficha llevan a su nervio (amarillo), su arteria (rojo) o su vena (azul) y la resaltan en el cuerpo.
5. **Tт** muestra los nombres sobre el cuerpo; la lupa busca cualquier estructura.
6. El botón redondo guarda o comparte la imagen con los nombres.

Otros modos: **Cámara en vivo** (tiempo real, cámara trasera o frontal), **Elegir de la galería** (foto o video) y **Ver en 3D** (modelo para girar con el dedo, sin cámara).

## Qué hay dentro

- **244 estructuras con ficha** en español: huesos y cartílagos, músculos superficiales y profundos, órganos, encéfalo y médula, 39 arterias, 26 venas y 36 nervios. Cada ficha enlaza con su irrigación, drenaje venoso e inervación, y las fichas de nervios y arterias muestran qué músculos inervan o irrigan.
- **Modelo 3D propio** generado por código (`tools/bake/`): huesos modelados con funciones de distancia (cráneo con dientes, vértebras con apófisis, costillas con cartílagos, pelvis, manos y pies), músculos como haces de fibras con tendones, órganos y redes de vasos y nervios. Se comprime en `public/anatomy.bin`.
- **Anclaje al cuerpo**: MediaPipe Pose (local, sin internet) detecta 33 puntos y la silueta; el modelo se deforma con 19 huesos de animación para seguir la pose, y se recorta a la silueta de la persona.

## Desarrollo

Necesitas Node.js 18 o más reciente.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run bake         # regenera public/anatomy.bin desde tools/bake/
npm run build        # compila la app en docs/
```

```
index.html               interfaz
src/main.js              modos, vistas, fichas, búsqueda, nombres, gestos y captura
src/render/view.js       motor 3D: skinning, composición sobre la foto, selección
src/render/materials.js  materiales (fibras, hueso, órganos, vasos, nervios, rayos X)
src/anatomy/atlas*.js    fichas de las 244 estructuras
src/anatomy/canon.js     cuerpo de referencia y huesos de animación
src/pose/                MediaPipe Pose local y pose de la demostración
tools/bake/              generación del modelo anatómico
```

## Límites

Modelo anatómico aproximado y con fines educativos; no es una imagen médica. Detecta una persona a la vez y funciona mejor de frente o de tres cuartos.
