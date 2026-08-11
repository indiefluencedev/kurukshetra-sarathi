// `npm run dev` — the whole thing, one command.
//
// Starts the Worker (apps/api) and the app (apps/web), wires them to each
// other, and prints an address that a phone on the same wifi can open. Ctrl-C
// stops both.
//
// It is a script and not `"dev": "a & b"` in package.json for three reasons,
// none of them cosmetic:
//
//   1. Two servers on one terminal need labels, or you cannot tell which one
//      just printed the error.
//   2. Ctrl-C on a shell `&` leaves orphans holding ports 8787 and 5173, and
//      the next `npm run dev` fails in a way that looks like a code problem.
//   3. The two halves need to agree on ONE hostname — see below. That is a
//      lookup, not a constant, so something has to compute it.
//
// ── Why the LAN address rather than localhost ──────────────────────────────
//
// This app is used on phones, by people holding them at arm's length in bright
// sun. Testing it only in a desktop browser is how a tap target that is fine
// with a mouse ships as one that is not fine with a thumb.
//
// A phone cannot resolve `localhost` to this laptop, so both servers bind to
// every interface and the app is told to call the API by this machine's LAN
// address. The laptop can reach that address too, which is why there is one
// value here and not a desktop case and a phone case.
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

/** This machine's address on the wifi, or localhost if it is not on any. */
const lanHost = () => {
  for (const [, addrs] of Object.entries(networkInterfaces()))
    for (const a of addrs ?? [])
      // `internal` is the loopback; a phone cannot reach it. IPv4 only —
      // typing a link-local IPv6 address into a phone is not a thing anyone
      // is going to do.
      if (a.family === "IPv4" && !a.internal) return a.address;
  return "localhost";
};

const HOST = lanHost();
const API = `http://${HOST}:8787`;
const WEB = `http://${HOST}:5173`;

const children = [];

/** Run one server, tagging every line it prints so the two can be told apart. */
function start(label, colour, cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);

  const tag = `\x1b[${colour}m${label.padEnd(3)}\x1b[0m │ `;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) process.stdout.write(tag + line + "\n");
    });
  }

  child.on("exit", (code) => {
    // One half dying and the other carrying on is the confusing case: the app
    // is up, the API is gone, and every feed quietly falls back to the bundle.
    // Better to take both down and say why.
    if (!stopping) {
      process.stdout.write(`\n${tag}exited with code ${code} — stopping the other half too.\n`);
      stop(code ?? 1);
    }
  });

  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  // SIGTERM is asked, not enforced. wrangler in particular can sit on its port
  // if it is mid-build, and a held port is the thing that breaks the *next*
  // run rather than this one.
  setTimeout(() => {
    for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
    process.exit(code);
  }, 2000).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

console.log(`
  app   ${WEB}       ← open this on your phone
  api   ${API}
  admin ${API}/admin

  Both servers bind to every interface, so anything on this wifi can reach
  them. The database is the real Neon one — there is no local copy.
`);

// `--var` and not an environment variable. A Worker's vars come from
// wrangler.toml and .dev.vars; wrangler does not read `APP_URL` off the shell,
// so setting it in `env` here looked like it worked and silently did nothing.
// Caught by reading an actual verification email out of .wrangler/tmp and
// finding it linked to production.
start(
  "api",
  "33",
  "npm",
  [
    "run", "dev", "-w", "@kuk/api", "--",
    "--ip", "0.0.0.0",
    // Better Auth refuses a request whose Origin is not trusted, and in dev
    // the app is served from two addresses that are both legitimate: the LAN
    // one a phone uses, and localhost, which is what you type. Both are listed
    // or signing in works on one device and fails on the other.
    "--var", `APP_URL:${WEB},http://localhost:5173`,
    // The Worker's own address, which is what the verification link in an
    // email is built from. Left at the wrangler.toml value, a link emailed by
    // this laptop sends the reader to production to verify an account that
    // only exists here.
    "--var", `API_URL:${API}`,
  ],
  { cwd: process.cwd() },
);

// Vite, unlike wrangler, DOES read VITE_-prefixed variables off the
// environment, so this one is an env var and the two above are not.
start("web", "36", "npm", ["run", "dev", "-w", "@kuk/web", "--", "--host"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Point the app at the local Worker. Without this the app reads its
    // bundled catalogue and never calls the API at all — which was the right
    // default when the database was a copy on this laptop, and is the wrong
    // one now that we are trying to see admin edits appear in the app.
    // See apps/web/.env.development.
    VITE_CONTENT_URL: API,
  },
});
