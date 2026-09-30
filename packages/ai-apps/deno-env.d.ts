// The little of Deno's runtime src/deno.ts touches, as supabase/functions declares it.
declare namespace Deno {
  const env: {
    get(name: string): string | undefined
  }
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
