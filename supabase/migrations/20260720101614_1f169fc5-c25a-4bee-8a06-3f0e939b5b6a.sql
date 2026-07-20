SELECT cron.schedule(
  'geopolitical-sentiment-refresh',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xsytjrvpqmbiedcmgebb.supabase.co/functions/v1/geopolitical-sentiment',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);