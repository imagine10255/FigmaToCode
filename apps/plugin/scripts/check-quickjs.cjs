// Compiles the built plugin code with QuickJS, the engine Figma runs plugins in, before it
// replaces dist/code.js. Some code that browsers accept does not compile there (for example
// `for (… of await …)` once built down to generators fails with "stack underflow"), and then
// the whole plugin fails to load in Figma. A build that does not compile is rejected and the
// previous dist/code.js is left in place.
//
// Usage: node scripts/check-quickjs.cjs <candidate.js> <target.js>

const fs = require("fs");
const { getQuickJS } = require("quickjs-emscripten");

const [candidate, target] = process.argv.slice(2);
if (!candidate || !target) {
  console.error("Usage: node scripts/check-quickjs.cjs <candidate.js> <target.js>");
  process.exit(2);
}

(async () => {
  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();
  const result = vm.evalCode(fs.readFileSync(candidate, "utf8"), candidate, {
    compileOnly: true,
  });

  if (result.error) {
    const error = vm.dump(result.error);
    result.error.dispose();
    vm.dispose();
    fs.rmSync(candidate, { force: true });
    console.error("");
    console.error("✗ QuickJS check failed: Figma would not be able to load this plugin.");
    console.error(`  ${error?.name ?? "Error"}: ${error?.message ?? JSON.stringify(error)}`);
    console.error("  The previous dist/code.js was kept. A known cause is `for (… of await …)`;");
    console.error("  await into a variable first, then loop over it.");
    console.error("");
    process.exit(1);
  }

  result.value.dispose();
  vm.dispose();
  fs.renameSync(candidate, target);
  console.log(`✓ QuickJS check passed, ${target} updated`);
})();
