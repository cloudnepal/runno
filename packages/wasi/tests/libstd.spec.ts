// TODO: Investigate these tests https://github.com/caspervonb/wasi-test-suite

// TODO: Also investigate these tests https://github.com/bytecodealliance/wasmtime/tree/main/crates/test-programs/wasi-tests

import * as fs from "fs";

import { test, expect } from "@playwright/test";

import type { WASI, WASIContext } from "../lib/main";
import {
  getEnv,
  getStatus,
  getStdin,
  getStderr,
  getStdout,
  getFS,
  getArgs,
} from "./helpers.js";

const files = fs.readdirSync("public/bin/wasi-test-suite-main/libstd");
const wasmFiles = files.filter((f) => f.endsWith(".wasm"));

test.beforeEach(async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.waitForLoadState("domcontentloaded");
});

for (const name of wasmFiles) {
  const expectedStatus = getStatus("libstd", name);
  const env = getEnv("libstd", name);
  const stdin = getStdin("libstd", name);
  const stdout = getStdout("libstd", name);
  const stderr = getStderr("libstd", name);
  const wasifs = getFS("libstd", name);
  const args = [name, ...getArgs("libstd", name)];

  test.describe(`libstd/${name}`, () => {
    test(`Gives a ${expectedStatus} exit code${
      env ? ` with env ${JSON.stringify(env)}` : ""
    }${args ? ` with args ${JSON.stringify(args)}` : ""}${
      Object.keys(wasifs).length
        ? ` with files ${JSON.stringify(Object.keys(wasifs))}`
        : ""
    }`, async ({ page }) => {
      const {
        exitCode,
        stderr: stderrResult,
        stdout: stdoutResult,
      } = await page.evaluate(
        async function ({ url, env, args, stdin, fs }) {
          while (window["WASI"] === undefined) {
            await new Promise((resolve) => setTimeout(resolve));
          }

          const W: typeof WASI = (window as any)["WASI"];
          const WC: typeof WASIContext = (window as any)["WASIContext"];

          let stderr = "";
          let stdout = "";
          let stdinBytes = new TextEncoder().encode(stdin ?? "");

          return W.start(
            fetch(url),
            new WC({
              args,
              env,
              stdout: (s) => {
                stdout += s;
              },
              stderr: (s) => {
                stderr += s;
              },
              stdin: (maxByteLength) => {
                const chunk = stdinBytes.slice(0, maxByteLength);
                stdinBytes = stdinBytes.slice(maxByteLength);
                return new TextDecoder().decode(chunk);
              },
              fs,
            })
          ).then((result) => {
            return {
              ...result,
              stderr,
              stdout,
            };
          });
        },
        {
          url: `/bin/wasi-test-suite-main/libstd/${name}`,
          args,
          env,
          stdin,
          fs: wasifs,
        }
      );

      expect(exitCode).toBe(expectedStatus);

      if (stdout) {
        expect(stdoutResult).toEqual(stdout);
      }

      if (stderr) {
        expect(stderrResult).toEqual(stderr);
      }
    });
  });
}
