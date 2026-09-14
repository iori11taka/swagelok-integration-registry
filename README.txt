V2.9.2 - Fix Item Master al crear una integración

Problema corregido:
El RPC create_integration generaba correctamente la INT, pero en algunas versiones
no persistía category_code/category_name/group_code/group_name/series_code/series_name.
Por eso el registro aparecía como "Sin Item Master" inmediatamente después de crearlo.

Solución:
1. Se crea la INT con el RPC actual (se conserva el correlativo automático).
2. Se recupera la fila recién creada.
3. Se guarda Category / Group / Series mediante UPDATE directo, usando la misma
   lógica que ya funciona al editar una integración.
4. Luego se envía el registro completo al backup de Google.

No requiere cambios SQL ni altera registros existentes.

Nota:
Si la consola muestra CORS al llamar backup-integration, la INT y su Item Master
quedan guardados en Supabase; únicamente el backup de Google queda pendiente.
Ese CORS es un problema independiente de la clasificación.

Instalación:
- Reemplaza index.html, styles.css y app.js.
- Conserva config.js, item-master-hierarchy.js y assets.
- git add .
- git commit -m "Fix Item Master on create v2.9.2"
- git push
- Ctrl+Shift+R
