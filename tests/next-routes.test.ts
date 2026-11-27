import { test } from "node:test";
import assert from "node:assert/strict";
import { nextBasePathFromConfig, nextRouteFromFile } from "../src/engine/next.js";
import { fillRoute, routeParameters } from "../src/engine/next-path.js";

test("Next route discovery handles groups, nested pages, and dynamic segments", () => {
  for (const [file, route] of [
    ["src/app/page.tsx", "/"],
    ["app/(shop)/products/[sku]/page.tsx", "/products/[sku]"],
    ["app/articles/[[...parts]]/page.jsx", "/articles/[[...parts]]"],
    ["pages/inventory/[item].tsx", "/inventory/[item]"],
    ["src/pages/inventory/index.jsx", "/inventory"],
    ["app/not-a-page.tsx", null],
    ["app/@modal/item/page.tsx", null],
    ["app/shop/(..)cart/page.tsx", null],
    ["pages/_app.tsx", null],
    ["pages/api/route.ts", null],
  ] as const) assert.equal(nextRouteFromFile(file), route, file);
});

test("Next route parameter values are encoded per segment", () => {
  const route = "/stores/[store]/[[...products]]";
  assert.deepEqual(routeParameters(route), [{ name: "store", kind: "single" }, { name: "products", kind: "optional" }]);
  assert.equal(fillRoute(route, new Map([["store", "West #1"]])), "/stores/West%20%231");
  assert.equal(fillRoute(route, new Map([["store", "West"], ["products", "books/Ω?"]])), "/stores/West/books/%CE%A9%3F");
  assert.equal(fillRoute(route, new Map([["store", "a/b"]])), null);
  assert.equal(fillRoute(route, new Map([["store", "West"], ["products", "../elsewhere"]])), null);
  assert.equal(fillRoute("/docs/[...slugs]", new Map()), null);
});

test("Next basePath reads literal config without evaluating dynamic values", () => {
  assert.equal(nextBasePathFromConfig("next.config.mjs", 'export default { basePath: "/studio-fixture" };'), "/studio-fixture");
  assert.equal(nextBasePathFromConfig("next.config.ts", 'const config = { basePath: "/docs/v2" } satisfies NextConfig; export default config;'), "/docs/v2");
  assert.equal(nextBasePathFromConfig("next.config.js", 'module.exports = { basePath: "/legacy" };'), "/legacy");
  for (const value of ['{ basePath: process.env.PREFIX }', '{ ...defaults, basePath: "/local" }', '{ ["basePath"]: "/local" }', '{ basePath: "//external" }', '{ basePath: "/trailing/" }']) {
    assert.equal(nextBasePathFromConfig("next.config.mjs", "export default " + value), undefined, value);
  }
});
