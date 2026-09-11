# Registro de Integraciones — Swagelok Perú

V1 del reemplazo del registro histórico de códigos de integración.

## Arquitectura

1. Frontend estático: `index.html`, `styles.css`, `app.js`.
2. Base principal: Supabase/PostgreSQL.
3. Correlativo: se genera en PostgreSQL con bloqueo transaccional para evitar códigos repetidos.
4. Auditoría: cada alta deja un snapshot en `integration_audit`.
5. Backup externo: un Database Webhook de Supabase llama a `backup-integration` (Edge Function).
6. La Edge Function llama a un Google Apps Script privado.
7. Apps Script agrega una fila a un Google Sheet y crea un JSON independiente en una carpeta de Google Drive.

## Por qué el backup no depende del navegador

No se expone ninguna credencial de Google Drive en `app.js`. El navegador solo escribe en Supabase. El respaldo ocurre del lado servidor.

## Paso 1 - Supabase

- Crea un proyecto.
- SQL Editor > pega `supabase/schema.sql` > Run.
- En Authentication puedes empezar con email/password o, para pruebas, mantener temporalmente permisos anon y endurecerlos antes de producción.
- Copia Project URL + anon key en `config.js`.

## Paso 2 - Google Drive

Crea una carpeta, por ejemplo:

`Swagelok / Integraciones / BACKUP_REGISTRO`

Crea dentro (o en Drive) un Google Sheet llamado:

`BACKUP_REGISTRO_INTEGRACIONES`

Copia sus IDs en `google-apps-script/backup.gs`.

Recomendación: la carpeta y la hoja deben ser propiedad de una cuenta administrativa. Los usuarios normales deberían tener solo lectura o ningún acceso. La aplicación no tendrá ninguna función de borrado del backup.

## Paso 3 - Apps Script

- Abre Apps Script desde el Google Sheet o script.google.com.
- Pega `google-apps-script/backup.gs`.
- Cambia `BACKUP_FOLDER_ID`, `BACKUP_SHEET_ID` y `SECRET`.
- Implementa como Web App:
  - Ejecutar como: propietario del script.
  - Acceso: el mínimo disponible que permita la llamada desde la Edge Function.
- Copia la URL `/exec`.

## Paso 4 - Edge Function

Desde la terminal con Supabase CLI:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set GOOGLE_BACKUP_WEBAPP_URL="TU_URL_EXEC"
supabase secrets set GOOGLE_BACKUP_SECRET="EL_MISMO_SECRET"
supabase functions deploy backup-integration
```

## Paso 5 - Database Webhook

En Supabase > Database > Webhooks:

- Tabla: `integrations`
- Evento: `INSERT`
- Destino: la URL de la Edge Function `backup-integration`

Con esto cada registro nuevo dispara el backup automáticamente.

## Paso 6 - Ejecutar en VS Code

Puedes usar Live Server o:

```bash
python -m http.server 5500
```

Luego abre:

`http://localhost:5500`

## Protección recomendada del backup

Google Drive por sí solo no es almacenamiento WORM/inalterable. Para reducir al máximo el riesgo de borrado accidental:

- que la carpeta sea propiedad de una cuenta administrativa distinta;
- no compartir permiso de editor con usuarios de la aplicación;
- la app solo conoce la URL del Apps Script desde Supabase, nunca credenciales de Drive;
- no implementar endpoints de borrar/editar en Apps Script;
- proteger la hoja BACKUP;
- mantener un JSON separado por cada alta, además del Sheet;
- opcionalmente habilitar una copia diaria adicional en otra carpeta/cuenta.

## Próximo paso

Importar el Excel histórico a `integrations` y añadir login/roles y pantalla de detalle.


## Clasificación automática (V1.1)

Esta versión incluye un motor local de clasificación construido a partir del registro histórico entregado (más de 2,400 filas analizadas). Al escribir la descripción, propone Familia, Subfamilia y Sub-subfamilia.

- Reglas de alta confianza para patrones claros (por ejemplo, centrales de una/dos botellas, mangueras, cilindros de muestreo, paneles de muestreo, punto de uso).
- Respaldo estadístico usando palabras características de las clasificaciones históricas.
- Porcentaje de confianza visible.
- Los tres selectores quedan encadenados y continúan siendo editables manualmente.
- Se normalizaron variantes evidentes del histórico como “CENTRALES DE GASES” / “CENTRAL DE GASES” y “CENTRAL PARA 2 BOTELLAS” / “CENTRAL PARA DOS BOTELLAS”.

Para probar rápidamente: escriba `Central de gas para una botella, regulador KPR, entrada 500 psi, salida 100 psi` y la app propondrá `CENTRAL DE GASES > CENTRAL PARA UNA BOTELLA > CENTRAL PARA UNA BOTELLA`.


## V1.2 - Supabase Auth

La aplicación ahora exige sesión antes de consultar o registrar integraciones.

1. En Supabase abre **Authentication > Users**.
2. Crea manualmente los usuarios autorizados con correo y contraseña.
3. No es necesario habilitar registro público.
4. `config.js` usa únicamente la **Publishable key**; nunca coloques una Secret key en el frontend.
5. El frontend carga el histórico por páginas para superar el límite de 1000 filas de la API y mostrar los 2,422+ registros.
6. Al cerrar sesión se vacían los datos visibles y vuelve la pantalla de acceso.

El esquema SQL debe mantener las políticas RLS para el rol `authenticated`.


## V1.3 - Recuperación de contraseña

Configura en Supabase > Authentication > URL Configuration:

- Site URL: `http://localhost:5500/integration-registry-app/`
- Redirect URL permitida: `http://localhost:5500/integration-registry-app/`

Luego usa **Send password recovery**. El frontend detecta el evento `PASSWORD_RECOVERY`,
muestra un formulario para definir la nueva contraseña y usa `supabase.auth.updateUser()`.


## V2 Visual

Rediseño visual del portal manteniendo la lógica existente:
- dashboard corporativo más compacto;
- KPIs con jerarquía visual;
- panorama histórico por año;
- actividad reciente más legible;
- barra de búsqueda global;
- sidebar refinado;
- favicon incluido;
- diseño responsive.

No cambia el esquema de Supabase ni la lógica de autenticación.

## V2.8.2 - Auth hotfix
- Restaura el estado global de la aplicación y el helper DOM `$`.
- Restaura `showView`, `setAuthGate`, `showLoginMode`, `showRecoveryMode` y `setSessionUI`.
- Restaura `initializeAuth`, `signIn` y `signOut`.
- Mantiene Category -> Group -> Series y no incluye `config.js`.
