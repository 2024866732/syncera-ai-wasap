# Supabase Auth Middleware Pattern for Next.js App Router

## Problem
Without `src/middleware.ts`, the server-side client cannot read session cookies set by the browser client. `signInWithPassword` succeeds in the browser but the server always sees no session → 401 on every authenticated route.

## Root Cause
The `@supabase/ssr` browser client writes tokens to cookies. But without a middleware to refresh the session on every request, the server-side client (in route handlers, server components, etc.) doesn't see the updated cookies.

## Solution: middleware.ts

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // THIS IS THE CRITICAL LINE — refreshes the auth token
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

## Login Page Pattern

After `signInWithPassword`, use HARD navigation (not `router.push`):

```typescript
const supabase = createClient();
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (!error) {
  // Confirm session stored
  await supabase.auth.getSession();
  // Hard navigation — forces full page load, triggers middleware
  window.location.href = "/admin";
}
```

## RLS Gap: Policies Must Be Applied Separately
`npx prisma migrate deploy` only applies DDL (tables, indexes, constraints). RLS policies are NOT applied automatically. If RLS is enabled on a table without matching policies, ALL queries are blocked.

**Always apply RLS policies via Supabase SQL Editor after migration.**

## Gotchas
- `router.push()` = soft navigation = cookies may not be sent → use `window.location.href`
- Route groups `(auth)` build locally but 404 on Vercel production → use top-level paths
- `createBrowserClient` from `@supabase/ssr` uses default cookie storage — do NOT add custom `storage` adapter (type error)
- Vercel deploy: commit author email must be valid (not `@localhost`)
