import { useEffect, useState } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { toast } from "@/shared/ui/overlays";
import {
  currentUser,
  isAdmin,
  signIn,
  signUp,
  signOut,
  googleUrl,
  canUseGoogle,
  changePassword,
  requestPasswordReset,
  resetPassword,
  sendVerificationOtp,
  verifyEmailOtp,
} from "./auth";

/**
 * What the emailed links carry, and how they are cleared.
 *
 * `?reset=<token>` puts this screen into the "choose a new password" state;
 * `?verified=1` is where the Worker sends someone after they confirm their
 * address. Both are read once and then stripped from the URL with
 * `replaceState`, because a reset token sitting in the address bar is a token
 * that gets shared in a screenshot, restored by "reopen last tabs", and
 * offered back by autocomplete a week later.
 */
function takeLinkParam(name: string): string {
  const url = new URL(location.href);
  const value = url.searchParams.get(name);
  if (value === null) return "";
  url.searchParams.delete(name);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  return value;
}

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
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset" | "otp">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otp, setOtp] = useState("");

  // Read once, on arrival, before anything is typed — see takeLinkParam.
  useEffect(() => {
    const token = takeLinkParam("reset");
    if (token) {
      setResetToken(token);
      setMode("reset");
      setPassword("");
    }
    if (takeLinkParam("verified")) toast(t("emailConfirmed"));
  }, []);

  // Gated on what the SERVER reports, not on "a server exists". See auth.ts.
  const google = canUseGoogle() ? googleUrl() : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    // Checked here as well as on the server so the answer is instant and in
    // the reader's own language — a round trip to be told a field is empty is
    // a poor use of a rural connection.
    if (mode === "forgot") {
      if (!email.trim()) return setErr(t("fillAll"));
      setBusy(true);
      const problem = await requestPasswordReset(email.trim());
      setBusy(false);
      if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);
      // Says "sent" whether or not that address has an account. Answering
      // differently would turn this form into a way of asking who is
      // registered here. See requestPasswordReset.
      toast(t("resetSent"));
      setMode("in");
      return;
    }

    if (mode === "reset") {
      if (!password) return setErr(t("fillAll"));
      if (password.length < 8) return setErr(t("passwordShort"));
      setBusy(true);
      const problem = await resetPassword(resetToken, password);
      setBusy(false);
      if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);
      // Deliberately not signed in — the link may have been opened on a
      // borrowed laptop. See resetPassword.
      setPassword("");
      setResetToken("");
      setMode("in");
      toast(t("passwordChanged"));
      return;
    }

    if (mode === "otp") {
      if (!otp.trim()) return setErr(t("fillAll"));
      setBusy(true);
      const problem = await verifyEmailOtp(email.trim(), otp.trim());
      setBusy(false);
      if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);
      setOtp("");
      toast(t("emailConfirmed"));
      // Better Auth signs the session in on a correct code, so there is
      // nothing left to type. If it did not — an older server, or the token
      // header stripped by a proxy — the sign-in form is where they land.
      if (currentUser()) return go("/home");
      setMode("in");
      return;
    }

    if (!email.trim() || !password || (mode === "up" && !name.trim())) return setErr(t("fillAll"));
    if (mode === "up" && password.length < 8) return setErr(t("passwordShort"));

    setBusy(true);
    const problem =
      mode === "up" ? await signUp(email.trim(), password, name.trim()) : await signIn(email.trim(), password);
    setBusy(false);

    // An account that exists but was never confirmed. The password was right,
    // so telling them it "did not work" would be a lie and telling them "email
    // not verified" is a fact they cannot act on. Send a fresh code and put
    // them in front of the box it goes in.
    if (problem === "unverified") {
      await sendVerificationOtp(email.trim());
      setPassword("");
      setOtp("");
      setMode("otp");
      toast(t("codeSent"));
      return;
    }

    if (problem) return setErr(problem === "rate" ? t("tooManyTries") : problem);

    // Signing up no longer signs you in: the address has to be confirmed
    // first. Sending them to the home screen here would be a lie — they would
    // arrive signed out with no idea why — so they go straight to the box the
    // code goes in, with the address they just typed still filled in.
    if (mode === "up") {
      setPassword("");
      setOtp("");
      setMode("otp");
      toast(t("codeSent"));
      return;
    }

    toast(t("welcomeBack"));
    go("/home");
  }

  const heading =
    mode === "otp"
      ? t("confirmEmail")
      : mode === "reset"
        ? t("chooseNewPassword")
        : mode === "forgot"
          ? t("forgotPassword")
          : t("account");

  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" lang={S.lang}>
          {heading}
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
            {mode === "otp"
              ? t("confirmEmailWhy").replace("{email}", email.trim())
              : mode === "reset"
                ? t("chooseNewWhy")
                : mode === "forgot"
                  ? t("forgotWhy")
                  : t("accountWhy")}
          </p>

          {mode === "up" && (
            <div className="field">
              <label htmlFor="ac-name">{t("yourName")}</label>
              <input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}

          {/* The reset link already says which account it is for, so asking
              for the address again would be a field with one right answer
              that the reader has to remember. */}
          {mode !== "reset" && mode !== "otp" && (
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
          )}

          {/* "new-password" tells the keychain to offer a generated one on
              sign-up and not to overwrite a saved one on sign-in. */}
          {mode !== "forgot" && mode !== "otp" && (
            <PasswordField
              id="ac-password"
              label={mode === "reset" ? t("newPassword") : t("password")}
              value={password}
              onChange={setPassword}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
            />
          )}

          {mode === "otp" && (
            <>
              <div className="field">
                <label htmlFor="ac-otp">{t("confirmCode")}</label>
                {/* One-time-code gets the six digits out of the notification
                    bar or the SMS-style autofill without anyone typing them,
                    and numeric brings up the number pad rather than a
                    keyboard with letters on it. */}
                <input
                  id="ac-otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ fontSize: "calc(24px*var(--ts))", letterSpacing: ".3em", textAlign: "center" }}
                />
              </div>
              <button
                type="button"
                className="linkish"
                style={{ width: "100%", marginTop: 2 }}
                disabled={busy}
                onClick={async () => {
                  setErr("");
                  const problem = await sendVerificationOtp(email.trim());
                  toast(problem === "rate" ? t("tooManyTries") : problem ? problem : t("codeSent"));
                }}
              >
                {t("resendCode")}
              </button>
            </>
          )}

          {mode === "in" && (
            <button
              type="button"
              className="linkish"
              style={{ width: "100%", marginTop: 2 }}
              onClick={() => {
                setErr("");
                setMode("forgot");
              }}
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
            {busy
              ? t("working")
              : mode === "otp"
                ? t("confirmEmail")
                : mode === "reset"
                ? t("savePassword")
                : mode === "forgot"
                  ? t("sendResetLink")
                  : mode === "up"
                    ? t("signUp")
                    : t("signIn")}
          </button>

          {/* Only rendered when the server actually has Google credentials —
              a button that reliably fails is worse than no button. */}
          {google && mode === "in" && (
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
              // From either of the password-recovery states the way out is
              // back to signing in, not on to signing up.
              setMode(mode === "in" ? "up" : "in");
              setErr("");
            }}
          >
            {mode === "in" ? t("noAccount") : mode === "up" ? t("haveAccount") : t("backToSignIn")}
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
