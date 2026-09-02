/**
 * Progress indicator for the registration wizard. Full horizontal step
 * list on wider screens; collapses to a compact "Step X of N" line plus a
 * thin progress bar on narrow screens so it never wraps or scrolls.
 * Only completed steps (and the current one) are clickable — you can jump
 * back to fix something, but not skip ahead of data that doesn't exist yet.
 */
export default function Stepper({ steps, currentIndex, maxReachedIndex, onStepClick }) {
  return (
    <div className="sf-stepper">
      <div className="sf-stepper-full d-none d-md-flex">
        {steps.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
          const clickable = i <= maxReachedIndex;
          return (
            <div key={s.key} className="sf-stepper-item">
              <button type="button" disabled={!clickable} onClick={() => clickable && onStepClick(i)}
                      className={`sf-stepper-dot sf-stepper-${state}`} aria-label={s.label}>
                {state === "done" ? "✓" : i + 1}
              </button>
              <span className={`sf-stepper-label ${state === "active" ? "fw-bold" : ""}`}>{s.label}</span>
              {i < steps.length - 1 && <div className={`sf-stepper-line ${i < currentIndex ? "sf-stepper-line-done" : ""}`} />}
            </div>
          );
        })}
      </div>
      <div className="d-md-none">
        <div className="fw-bold mb-1">Step {currentIndex + 1} of {steps.length}: {steps[currentIndex].label}</div>
        <div className="sf-stepper-bar"><div className="sf-stepper-bar-fill" style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }} /></div>
      </div>
    </div>
  );
}
