// Supabase Edge Function: recibe el INSERT desde un Database Webhook y lo reenvía al Apps Script.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const appsScriptUrl = Deno.env.get('GOOGLE_BACKUP_WEBAPP_URL');
  const backupSecret = Deno.env.get('GOOGLE_BACKUP_SECRET');
  if (!appsScriptUrl || !backupSecret) return new Response('Backup env missing', { status: 500 });

  const payload = await req.json();
  const record = payload.record ?? payload;

  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: backupSecret, record })
  });

  const body = await response.text();
  return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
});
