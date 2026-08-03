import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const watching = Boolean(process.env.ROLLUP_WATCH);

export default {
  input: "src/plugin.ts",
  output: {
    file: "dev.herdr.streamdeck.sdPlugin/bin/plugin.js",
    sourcemap: watching
  },
  plugins: [
    typescript(),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
    !watching && terser(),
    {
      name: "module-package",
      generateBundle() {
        this.emitFile({ fileName: "package.json", source: "{\"type\":\"module\"}", type: "asset" });
      }
    }
  ]
};
