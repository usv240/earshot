import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/*
  eslint-config-next is still a legacy shareable config, so it has to
  come through the compatibility layer rather than being called as a
  flat-config function. The first version of this file did call it, and
  `npm run lint` failed with a stack trace out of an internal patch
  module, which says nothing about what is wrong.
*/
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "out/**", "node_modules/**"] },
];
