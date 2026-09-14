V2.9.3 - Renovación automática de sesión Supabase

Corrige:
- PGRST303 / JWT expired después de dejar la web abierta.
- La aplicación intenta renovar el token automáticamente.
- Si el JWT expira durante una consulta, renueva y repite la lectura.
- Evita cargas simultáneas de los 2,000+ registros.
- Al volver a la pestaña del navegador, comprueba la sesión.
- Si la renovación falla, muestra el login.
- Un error 401 ya no reemplaza visualmente los KPIs por ceros: conserva la última información válida.

Se conserva:
- Fix Item Master al crear una INT (V2.9.2).
- KPIs.
- Responsable desplegable.
- Edición / eliminación.
- Backup Google existente.

Instalación:
1. Reemplaza index.html, styles.css y app.js.
2. Conserva config.js, item-master-hierarchy.js, assets y carpetas Supabase/Google.
3. git add .
4. git commit -m "Auto refresh Supabase session v2.9.3"
5. git push
6. Ctrl+Shift+R.
