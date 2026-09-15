import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// NOTE: this app has no server functions — the browser talks to the Django API
// directly — so no CSRF middleware is registered here. Defining src/start.ts
// opts out of Start's automatic CSRF protection, so if a `createServerFn` is
// ever added, re-add it explicitly by importing `createCsrfMiddleware` from
// "@tanstack/react-start" alongside the imports above, then:
//   const csrfMiddleware = createCsrfMiddleware({
//     filter: (ctx) => ctx.handlerType === "serverFn",
//   });
// and adding it to requestMiddleware below.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
