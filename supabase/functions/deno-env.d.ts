// The little of Deno's runtime the Edge Functions touch, so tsc can check
// them here without Deno's own type library. Kept to what is used: a name
// declared here that a function misuses is an error tsc cannot see.
declare namespace Deno {
  const env: {
    get(name: string): string | undefined
  }
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
