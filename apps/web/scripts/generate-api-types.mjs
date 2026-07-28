// Generates apps/web/src/api/schema.ts from the committed OpenAPI document.
//
// Run via `pnpm --filter @snaveevans/pineapple-web api:types`. The output is
// committed and CI drift-checks it (see .github/workflows/ci.yml), so the web
// client's types can never fall behind the contract.
//
// This uses openapi-typescript's Node API rather than its CLI for one reason:
// the `transform` hook below. Everything else is stock.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";

const SPEC = new URL("../../../docs/reference/openapi.json", import.meta.url);
const OUT = new URL("../src/api/schema.ts", import.meta.url);

const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

/**
 * Matches the OpenAPI 3.0 idiom for a nullable `$ref`:
 *
 *   { allOf: [{ $ref: "#/components/schemas/Team" }, { nullable: true }] }
 *
 * 3.0 has no `type: "null"`, and `nullable` is ignored as a sibling of `$ref`,
 * so wrapping in `allOf` is how the spec expresses it — and what zod-to-openapi
 * emits for `.nullable()` on a registered schema. openapi-typescript renders
 * the second member as `unknown`, collapsing the union to `Team & unknown` and
 * silently dropping the null. Rebuild it as `components["schemas"]["Team"] | null`.
 *
 * Returns undefined for anything else, leaving the default transform in place.
 */
function nullableRef(schemaObject) {
  const members = schemaObject.allOf;
  if (!Array.isArray(members) || members.length !== 2) return undefined;

  const ref = members.find((member) => typeof member?.$ref === "string");
  const nullMarker = members.find(
    (member) => member?.nullable === true && Object.keys(member).length === 1,
  );
  if (!ref || !nullMarker) return undefined;

  const name = ref.$ref.replace("#/components/schemas/", "");
  if (name === ref.$ref) return undefined; // a $ref to something other than a schema

  const reference = ts.factory.createIndexedAccessTypeNode(
    ts.factory.createIndexedAccessTypeNode(
      ts.factory.createTypeReferenceNode("components"),
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("schemas")),
    ),
    ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(name)),
  );

  return ts.factory.createUnionTypeNode([reference, NULL]);
}

const ast = await openapiTS(SPEC, {
  transform: (schemaObject) => nullableRef(schemaObject),
});

const banner = [
  "// Generated from docs/reference/openapi.json — do not edit by hand.",
  "// Regenerate with: pnpm --filter @snaveevans/pineapple-web api:types",
  "",
].join("\n");

await writeFile(fileURLToPath(OUT), `${banner}${astToString(ast)}`);
