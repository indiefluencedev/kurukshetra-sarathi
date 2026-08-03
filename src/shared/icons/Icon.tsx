import { ICON } from "./icons";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
}

/**
 * Renders one of the project's hand-drawn 24x24 icons. The icon bodies are raw
 * SVG markup (paths/circles), injected verbatim so the demo's CSS still applies.
 */
export function Icon({ name, ...rest }: IconProps) {
  // A name with no glyph used to render a silent empty box — that is how three
  // of them (spark, ios, phone) survived in shipped screens. Say so in dev.
  if (import.meta.env.DEV && !ICON[name]) console.warn("Icon: no glyph named " + JSON.stringify(name));
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
      dangerouslySetInnerHTML={{ __html: ICON[name] || "" }}
    />
  );
}
