console.log('--- Prebuild Diagnostics ---');
console.log('Node version:', process.version);
for (const k of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY']) {
  const v = process.env[k];
  console.log(k+':', v ? (v.length>40? v.slice(0,20)+'…'+v.slice(-6): v) : 'MISSING');
}
try {
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  const resolved = req.resolve('@supabase/supabase-js/package.json');
  console.log('@supabase/supabase-js resolved at:', resolved);
} catch (e) {
  console.log('Supabase resolution error:', e.message);
}
console.log('--- End Prebuild Diagnostics ---');
