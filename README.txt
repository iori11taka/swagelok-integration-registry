V2.8.8 - Ajuste visual

Cambios:
- Se eliminó el bloque superior izquierdo "≡ Swagelok Perú".
- Dashboard: Histórico de Integraciones ya no necesita scroll horizontal en escritorio.
- Histórico completo: columnas redistribuidas para entrar dentro del panel en escritorio.
- Descripciones y clasificación pueden ocupar varias líneas.
- Botones Editar/Eliminar se apilan para reducir el ancho de Acciones.
- En pantallas menores a 980 px se conserva scroll horizontal para mantener legibilidad.
- Se conserva el app.js entregado por el usuario, incluyendo backup y eliminación.

Instalación:
1. Reemplazar index.html, styles.css y app.js.
2. Mantener config.js y assets actuales.
3. git add .
4. git commit -m "Clean topbar and fit historical tables"
5. git push
6. Ctrl+Shift+R tras desplegar GitHub Pages.
