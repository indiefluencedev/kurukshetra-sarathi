/**
 * PageSkeleton — a generic shimmer placeholder shown while a new route mounts.
 *
 * It mimics the rough shape of a typical page (a heading block, a couple of
 * card rows) so the transition feels intentional rather than blank.  Because
 * it uses CSS custom-properties from the design system it adapts to light /
 * dark themes without any extra work.
 */
export function PageSkeleton() {
  return (
    <div className="psk" aria-hidden="true">
      {/* page title line */}
      <div className="psk-line psk-title" />
      <div className="psk-line psk-sub" />
      

      {/* horizontal chip strip */}
      <div className="psk-row">
        <div className="psk-chip" />
        <div className="psk-chip" />
        <div className="psk-chip" />
      </div>

      {/* card block 1 */}
      <div className="psk-card">
        <div className="psk-img" />
        <div className="psk-body">
          <div className="psk-line" />
          <div className="psk-line psk-sm" />
          <div className="psk-line psk-xs" />
        </div>
      </div>

      {/* card block 2 */}
      <div className="psk-card">
        <div className="psk-img" />
        <div className="psk-body">
          <div className="psk-line" />
          <div className="psk-line psk-sm" />
          <div className="psk-line psk-xs" />
        </div>
      </div>

      {/* card block 3 */}
      <div className="psk-card">
        <div className="psk-img" />
        <div className="psk-body">
          <div className="psk-line" />
          <div className="psk-line psk-sm" />
          <div className="psk-line psk-xs" />
        </div>
      </div>
    </div>
  );
}
