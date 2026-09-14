V2.9.0 - KPIs

Cambios:
- Se elimina visualmente el bloque superior izquierdo "≡ Swagelok Perú".
- Se agrega la pestaña "KPIs" en el menú lateral.
- "Registros por año" ahora abre la pestaña KPIs al hacer clic en la tarjeta o en "Ver detalle".
- Nueva pantalla KPI con:
  * Total de registros
  * Registros del año actual
  * Item Master asignado y porcentaje
  * Clientes únicos
  * Evolución de registros por año
  * Cobertura de clasificación Item Master
  * Top Group
  * Top Category
- Se conserva la lista desplegable de Responsable de la V2.8.9.
- Se conserva el backup automático, edición y eliminación sin borrar el Excel.

Instalación:
1. Reemplaza index.html, styles.css y app.js.
2. Conserva config.js, item-master-hierarchy.js y assets.
3. Ejecuta:
   git add .
   git commit -m "Add KPI workspace"
   git push
4. Ctrl+Shift+R.
