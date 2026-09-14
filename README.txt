V2.9.1 - Ajuste visual de KPIs

Cambios:
- La pestaña KPIs ahora usa los mismos márgenes internos que el resto de la web.
- Las 4 tarjetas superiores tienen la misma altura.
- Registros por año y Cobertura de clasificación quedan alineados en la misma fila.
- Top Group y Top Category quedan alineados en la segunda fila.
- Se igualaron alturas, paddings y separación entre tarjetas.
- Mejor respuesta a resoluciones menores.
- Se agregó cache-busting a styles.css y app.js para evitar que GitHub Pages/Chrome use CSS anterior.

Instalación:
1. Reemplaza index.html, styles.css y app.js.
2. Conserva config.js, item-master-hierarchy.js y assets.
3. Ejecuta:
   git add .
   git commit -m "Align KPI layout v2.9.1"
   git push
4. Luego Ctrl+Shift+R.
