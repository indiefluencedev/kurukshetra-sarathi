import { useState } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { toast } from "@/shared/ui/overlays";
import { currentUser, isAdmin, signIn, signUp, signOut, googleUrl, canUseGoogle, changePassword } from "./auth";

/**
 * Sign in, create an account, or see the one you have — all on one screen.
 *
 * Deliberately not two routes. A separate /signin and /signup means a person
 * who guessed wrong has to find the other one, and the difference between the
 * two here is a single extra field.
 *
 * The screen never blocks anything. Nothing in the app requires an account;
 * this exists so a saved plan survives a new phone, and the copy says so
 * rather than implying a wall.
 */
/**
 * A password field you can read back.
 *
 * Typing a password blind on a phone keyboard is the most common reason a
 * correct password gets rejected, and this audience is the least likely to
 * enjoy guessing which character went wrong. The toggle is a button, not a
 * checkbox, so it is one tap and announces its own state.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pwwrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="button" className="pwtoggle" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? t("hidePassword") : t("showPassword")}
        </button>
      </div>
    </div>
  );
}

export function Account() {
  const user = currentUser();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Gated on what the SERVER reports, not on "a server exists". See auth.ts.
  const google = canUseGoogle() ? googleUrl() : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    // Checked here as well as on the server so the answer is instant and in
    // the reader's own language — a round trip to be told a field is empty is
    // a poor use of a rural connection.
    if (!email.trim() || !password || (mode === "up" && !name.trim())) return setErr(t("fillAll"));
    if (mode === "up" && password.length < 8) return setErr(t("passwordShort"));

    setBusy(true);
    const problem =
      mode === "up" ? await signUp(email.trim(), password, name.trim()) : await signIn(email.trim(), password);
    setBusy(false);

    if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);
    toast(mode === "up" ? t("accountMade") : t("welcomeBack"));
    go("/home");
  }

  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" lang={S.lang}>
          {t("account")}
        </h1>
      </div>

      {user ? (
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: "calc(13px*var(--ts))" }}>
            {t("signedInAs")}
          </div>
          <b style={{ fontSize: "calc(16px*var(--ts))", wordBreak: "break-all" }}>{user.email}</b>

          {isAdmin() && (
            <a
              className="btn ghost"
              style={{ marginTop: 14 }}
              href={(import.meta.env?.VITE_CONTENT_URL || "") + "/admin"}
              target="_blank"
              rel="noreferrer"
            >
              {t("adminArea")}
            </a>
          )}

          <ChangePassword />

          <button
            className="btn ghost"
            style={{ width: "100%", marginTop: 10 }}
            onClick={async () => {
              await signOut();
              toast(t("signedOut"));
              go("/home");
            }}
          >
            {t("signOut")}
          </button>
        </div>
      ) : (
        <form className="card" style={{ padding: 16 }} onSubmit={onSubmit}>
          <p className="muted" style={{ fontSize: "calc(13.5px*var(--ts))", marginTop: 0 }} lang={S.lang}>
            {t("accountWhy")}
          </p>

          {mode === "up" && (
            <div className="field">
              <label htmlFor="ac-name">{t("yourName")}</label>
              <input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}

          <div className="field">
            <label htmlFor="ac-email">{t("email")}</label>
            <input
              id="ac-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
            />
          </div>

          {/* "new-password" tells the keychain to offer a generated one on
              sign-up and not to overwrite a saved one on sign-in. */}
          <PasswordField
            id="ac-password"
            label={t("password")}
            value={password}
            onChange={setPassword}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
          />

          {mode === "in" && (
            <button
              type="button"
              className="linkish"
              style={{ width: "100%", marginTop: 2 }}
              onClick={() => toast(t("forgotHelp"))}
            >
              {t("forgotPassword")}
            </button>
          )}

          {err && (
            <div className="msg bad" role="alert" style={{ marginTop: 12 }}>
              {err}
              {/* The server cannot say "no such account" — answering that
                  differently from "wrong password" tells a stranger which
                  addresses are registered. So the hint goes here instead,
                  where it costs nothing and covers the commonest case: a
                  first-time visitor who landed on the sign-in form. */}
              {mode === "in" && <span className="msg-hint">{t("signInHint")}</span>}
            </div>
          )}

          <button className="btn primary" style={{ width: "100%", marginTop: 14 }} disabled={busy}>
            {busy ? t("working") : mode === "up" ? t("signUp") : t("signIn")}
          </button>

          {/* Only rendered when the server actually has Google credentials —
              a button that reliably fails is worse than no button. */}
          {google && (
            <>
              <div className="muted" style={{ textAlign: "center", margin: "12px 0", fontSize: "calc(12.5px*var(--ts))" }}>
                {t("or")}
              </div>
              <a className="btn ghost gbtn" href={google}>
                <Icon name="google" />
                <span>{t("withGoogle")}</span>
              </a>
            </>
          )}

          <button
            type="button"
            className="linkish"
            style={{ width: "100%", marginTop: 14 }}
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setErr("");
            }}
          >
            {mode === "in" ? t("noAccount") : t("haveAccount")}
          </button>
        </form>
      )}
    </>
  );
}

/**
 * Change password, collapsed until asked for.
 *
 * Requires the current one — a signed-in session on a phone left on a table
 * must not be enough to lock the owner out of their own account. Every other
 * device is signed out on success, which is the point of changing it.
 */
function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!open)
    return (
      <button type="button" className="linkish" style={{ width: "100%", marginTop: 14 }} onClick={() => setOpen(true)}>
        {t("changePassword")}
      </button>
    );

  return (
    <form
      style={{ marginTop: 14, borderTop: "1px solid var(--stone)", paddingTop: 4 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        if (!cur || !next) return setErr(t("fillAll"));
        if (next.length < 8) return setErr(t("passwordShort"));
        setBusy(true);
        const problem = await changePassword(cur, next);
        setBusy(false);
        if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);
        setCur("");
        setNext("");
        setOpen(false);
        toast(t("passwordChanged"));
      }}
    >
      <PasswordField id="cp-cur" label={t("currentPassword")} value={cur} onChange={setCur} autoComplete="current-password" />
      <PasswordField id="cp-new" label={t("newPassword")} value={next} onChange={setNext} autoComplete="new-password" />
      {err && (
        <div className="msg bad" role="alert" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}
      <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? t("working") : t("changePassword")}
      </button>
    </form>
  );
}
