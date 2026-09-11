v2.8.7 - Backup automático robusto

- Corrige la creación de INT para recuperar siempre la fila recién creada usando también
  el código previsualizado.
- CREATE y UPDATE invocan backup-integration.
- DELETE no toca Google Sheets.

Instalación:
1. Reemplaza app.js.
2. No cambies config.js.
3. git add .
4. git commit -m "Fix automatic Google backup on create"
5. git push
6. Ctrl+Shift+R en la web.
7. Crea una INT y verifica que muestre "Backup Google OK".
