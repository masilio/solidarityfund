import Stepper from "./Stepper";

/**
 * Full-screen (not modal) shell for the household registration wizard.
 * Header holds the step progress; footer is a sticky Back/Next bar so the
 * primary action is always reachable without scrolling, on phone or
 * desktop; the middle scrolls independently for long steps.
 */
export default function WizardShell({ title, steps, currentIndex, maxReachedIndex, onStepClick,
                                       onBack, onNext, nextLabel = "Next", nextDisabled, saving,
                                       backDisabled, onCancel, children }) {
  return (
    <div className="sf-wizard">
      <div className="sf-wizard-header">
        <h1 className="sf-wizard-title">{title}</h1>
        <Stepper steps={steps} currentIndex={currentIndex} maxReachedIndex={maxReachedIndex} onStepClick={onStepClick} />
      </div>
      <div className="sf-wizard-body">{children}</div>
      <div className="sf-wizard-footer">
        <button type="button" className="btn btn-link text-secondary fw-bold text-decoration-none" onClick={onCancel}>Cancel Registration</button>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary fw-bold" onClick={onBack} disabled={backDisabled}>&larr; Back</button>
          <button type="button" className="btn btn-sf-primary" onClick={onNext} disabled={nextDisabled || saving}>
            {saving ? "Saving…" : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
