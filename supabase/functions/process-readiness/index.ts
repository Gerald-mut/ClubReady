// Scaffold only. Implement authentication, validation and authorization before deployment.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'Not implemented' }),
  { status: 501, headers: { 'Content-Type': 'application/json' } },
))
