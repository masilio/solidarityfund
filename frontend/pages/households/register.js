import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import WizardShell from "../../components/WizardShell";
import FieldsGrid from "../../components/FieldsGrid";
import RepeatGroupForm from "../../components/RepeatGroupForm";
import ConfirmDialog from "../../components/ConfirmDialog";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { loadDraft, saveDraft, clearDraft, emptyDraft } from "../../lib/wizardDraft";

const STEPS = [
  { key: "household", label: "Household" },
  { key: "members", label: "Members" },
  { key: "assessment", label: "Assessment" },
  { key: "assets", label: "Affected Assets" },
  { key: "request", label: "Support Request" },
];

const HOUSEHOLD_FIELDS = [
  { name: "district", label: "District", required: true },
  { name: "sector", label: "Sector", required: true },
  { name: "cell", label: "Cell", required: true },
  { name: "village", label: "Village", required: true },
  { name: "phone_number", label: "Phone Number" },
  { name: "alternative_phone", label: "Alternative Phone" },
  { name: "housing_status", label: "Housing Status", type: "select",
    options: ["Owned", "Rented", "Hosted", "Other"].map((v) => ({ value: v, label: v })) },
  { name: "address_details", label: "Address Details", type: "textarea" },
];

const MEMBER_FIELDS = [
  { name: "first_name", label: "First Name", required: true },
  { name: "middle_name", label: "Middle Name" },
  { name: "last_name", label: "Last Name", required: true },
  { name: "gender", label: "Gender", required: true, type: "select", options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }] },
  { name: "date_of_birth", label: "Date of Birth", type: "date", required: true },
  { name: "relationship_to_head", label: "Relationship to Head", required: true, type: "select",
    options: ["Head", "Spouse", "Child", "Parent", "Sibling", "Other Relative", "Non-Relative"].map((v) => ({ value: v, label: v })) },
  { name: "national_id", label: "National ID" },
  { name: "phone_number", label: "Phone Number" },
  { name: "marital_status", label: "Marital Status", type: "select",
    options: ["Single", "Married", "Widowed", "Divorced"].map((v) => ({ value: v, label: v })) },
  { name: "disability_status", label: "Disability Status" },
  { name: "vulnerability_status", label: "Vulnerability Status" },
];

const LEVELS = ["Low", "Medium", "High", "Severe"].map((v) => ({ value: v, label: v }));

const ASSET_FIELDS = [
  { name: "asset_name", label: "Asset Name", required: true },
  { name: "asset_type", label: "Asset Type", required: true, type: "select",
    options: ["House", "Livestock", "Crop", "Equipment", "Other"].map((v) => ({ value: v, label: v })) },
  { name: "damage_status", label: "Damage Status", required: true, type: "select",
    options: ["Damaged", "Destroyed", "Lost"].map((v) => ({ value: v, label: v })) },
  { name: "damage_level", label: "Damage Level", type: "select",
    options: ["Minor", "Moderate", "Severe", "Total"].map((v) => ({ value: v, label: v })) },
  { name: "quantity", label: "Quantity", type: "number", required: true },
  { name: "unit", label: "Unit", required: true },
  { name: "estimated_loss", label: "Estimated Loss (RWF)", type: "number" },
  { name: "description", label: "Description", type: "textarea" },
];

const REQUEST_FIELDS = [
  { name: "request_type", label: "Request Type", required: true, type: "select",
    options: ["Cash", "Material", "Service"].map((v) => ({ value: v, label: v })) },
  { name: "priority", label: "Priority", type: "select",
    options: ["Low", "Normal", "High", "Urgent"].map((v) => ({ value: v, label: v })) },
  { name: "request_date", label: "Request Date", type: "date", required: true },
  { name: "justification", label: "Justification (describe amount/items needed and why)", type: "textarea", required: true },
];

function firstMissingLabel(fields, values) {
  for (const f of fields) {
    if (f.required && !f.readOnly && (values[f.name] === undefined || values[f.name] === "" || values[f.name] === null)) {
      return f.label;
    }
  }
  return null;
}

export default function RegisterHousehold() {
  const router = useRouter();
  const { notifySuccess, notifyError } = useToast();
  const [draft, setDraft] = useState(emptyDraft());
  const [maxReached, setMaxReached] = useState(0);
  const [resuming, setResuming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [disasters, setDisasters] = useState([]);
  const [members, setMembers] = useState([]);
  const [assets, setAssets] = useState([]);

  // Hydrate from a previous, unfinished session (survives a refresh, a crash, or lost connectivity).
  useEffect(() => {
    const existing = loadDraft();
    if (existing) {
      setDraft(existing);
      setMaxReached(existing.step);
      setResuming(true);
    }
  }, []);

  useEffect(() => { api.get("/disasters", { params: { page_size: 100 } }).then((r) => setDisasters(r.data.items)); }, []);

  useEffect(() => {
    if (draft.household.id && draft.step === 1) {
      api.get(`/households/${draft.household.id}`).then((r) => setMembers(r.data.members || []));
    }
  }, [draft.household.id, draft.step]);

  useEffect(() => {
    if (draft.assessment.id && draft.step === 3) {
      api.get(`/assessments/${draft.assessment.id}`).then((r) => setAssets(r.data.affected_assets || []));
    }
  }, [draft.assessment.id, draft.step]);

  function persist(next) {
    setDraft(next);
    saveDraft(next);
  }

  function goToStep(index, next = draft) {
    const updated = { ...next, step: index };
    persist(updated);
    setMaxReached((m) => Math.max(m, index));
  }

  function startOver() {
    clearDraft();
    setDraft(emptyDraft());
    setMaxReached(0);
    setResuming(false);
    setMembers([]);
    setAssets([]);
  }

  const disasterFields = useMemo(() => [
    { name: "disaster_id", label: "Disaster", required: true, type: "select",
      options: disasters.map((d) => ({ value: d.disaster_id, label: d.disaster_name })) },
    { name: "assessment_date", label: "Assessment Date", type: "date", required: true },
    { name: "vulnerability_level", label: "Vulnerability Level", required: true, type: "select", options: LEVELS },
    { name: "impact_level", label: "Impact Level", required: true, type: "select", options: LEVELS },
    { name: "house_condition", label: "House Condition", required: true, type: "select",
      options: ["Intact", "Minor Damage", "Major Damage", "Destroyed"].map((v) => ({ value: v, label: v })) },
    { name: "displacement_status", label: "Displacement Status", required: true, type: "select",
      options: ["Not Displaced", "Temporarily Displaced", "Permanently Displaced"].map((v) => ({ value: v, label: v })) },
    { name: "livelihood_condition", label: "Livelihood Condition" },
    { name: "current_shelter", label: "Current Shelter" },
    { name: "people_injured", label: "People Injured", type: "number" },
    { name: "people_missing", label: "People Missing", type: "number" },
    { name: "people_deceased", label: "People Deceased", type: "number" },
    { name: "assessment_notes", label: "Assessment Notes", type: "textarea" },
  ], [disasters]);

  // ---- Step handlers ----

  async function handleHouseholdNext() {
    const missing = firstMissingLabel(HOUSEHOLD_FIELDS, draft.household.values);
    if (missing) return notifyError(null, `Please fill in: ${missing}`);
    setSaving(true);
    try {
      if (draft.household.id) {
        await api.put(`/households/${draft.household.id}`, draft.household.values);
        notifySuccess("Household updated");
        goToStep(1);
      } else {
        const res = await api.post("/households", draft.household.values);
        notifySuccess("Household registered — now add its members");
        goToStep(1, { ...draft, household: { ...draft.household, id: res.data.id, code: res.data.household_code } });
      }
    } catch (err) {
      notifyError(err, "Could not save household");
    } finally {
      setSaving(false);
    }
  }

  async function addMember(values) {
    try {
      await api.post(`/households/${draft.household.id}/members`, values);
      notifySuccess("Member added");
      const r = await api.get(`/households/${draft.household.id}`);
      setMembers(r.data.members || []);
      return true;
    } catch (err) {
      notifyError(err, "Could not add member");
      return false;
    }
  }

  async function removeMember(m) {
    try {
      await api.delete(`/households/${draft.household.id}/members/${m.member_id}`);
      notifySuccess("Member removed");
      setMembers((list) => list.filter((x) => x.member_id !== m.member_id));
    } catch (err) {
      notifyError(err, "Could not remove member");
    }
  }

  async function handleAssessmentNext() {
    const missing = firstMissingLabel(disasterFields, draft.assessment.values);
    if (missing) return notifyError(null, `Please fill in: ${missing}`);
    setSaving(true);
    try {
      if (draft.assessment.id) {
        await api.put(`/assessments/${draft.assessment.id}`, draft.assessment.values);
        notifySuccess("Assessment updated");
        goToStep(3);
      } else {
        const payload = { ...draft.assessment.values, household_id: draft.household.id };
        const res = await api.post("/assessments", payload);
        notifySuccess("Assessment recorded — now add any affected assets");
        goToStep(3, { ...draft, assessment: { ...draft.assessment, id: res.data.id } });
      }
    } catch (err) {
      notifyError(err, "Could not save assessment");
    } finally {
      setSaving(false);
    }
  }

  async function addAsset(values) {
    try {
      await api.post(`/assessments/${draft.assessment.id}/assets`, values);
      notifySuccess("Affected asset added");
      const r = await api.get(`/assessments/${draft.assessment.id}`);
      setAssets(r.data.affected_assets || []);
      return true;
    } catch (err) {
      notifyError(err, "Could not add affected asset");
      return false;
    }
  }

  async function removeAsset(a) {
    try {
      await api.delete(`/assessments/${draft.assessment.id}/assets/${a.affected_asset_id}`);
      notifySuccess("Affected asset removed");
      setAssets((list) => list.filter((x) => x.affected_asset_id !== a.affected_asset_id));
    } catch (err) {
      notifyError(err, "Could not remove affected asset");
    }
  }

  async function handleFinish() {
    const missing = firstMissingLabel(REQUEST_FIELDS, draft.request.values);
    if (missing) return notifyError(null, `Please fill in: ${missing}`);
    setSaving(true);
    try {
      const payload = { ...draft.request.values, assessment_id: draft.assessment.id };
      const res = await api.post("/support-requests", payload);
      notifySuccess("Registration complete — support request submitted");
      clearDraft();
      router.push(`/support-requests/${res.data.id}`);
    } catch (err) {
      notifyError(err, "Could not submit support request");
    } finally {
      setSaving(false);
    }
  }

  function setStepValues(stepKey, name, value) {
    persist({ ...draft, [stepKey]: { ...draft[stepKey], values: { ...draft[stepKey].values, [name]: value } } });
  }

  const householdDisplayFields = [
    { name: "_household", label: "Household", readOnly: true, displayValue: draft.household.code ? `${draft.household.code}` : "(not yet saved)" },
  ];

  return (
    <Layout title="Register Household">
      <WizardShell
        title="Household Registration"
        steps={STEPS}
        currentIndex={draft.step}
        maxReachedIndex={maxReached}
        onStepClick={(i) => goToStep(i)}
        onCancel={() => setConfirmCancel(true)}
        onBack={() => goToStep(Math.max(0, draft.step - 1))}
        backDisabled={draft.step === 0}
        saving={saving}
        nextLabel={draft.step === STEPS.length - 1 ? "Submit & Finish" : "Next"}
        nextDisabled={draft.step === 2 && disasters.length === 0}
        onNext={() => {
          if (draft.step === 0) return handleHouseholdNext();
          if (draft.step === 1) return goToStep(2);
          if (draft.step === 2) return handleAssessmentNext();
          if (draft.step === 3) return goToStep(4);
          return handleFinish();
        }}
      >
        {resuming && (
          <div className="sf-draft-banner mb-4">
            <span>Resuming an unfinished registration{draft.household.code ? ` for ${draft.household.code}` : ""}.</span>
            <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={startOver}>Start Over Instead</button>
          </div>
        )}

        {draft.step === 0 && (
          <div className="sf-card">
            <h6 className="fw-bold mb-3">Household Details</h6>
            <FieldsGrid fields={HOUSEHOLD_FIELDS} values={draft.household.values} onChange={(n, v) => setStepValues("household", n, v)} />
          </div>
        )}

        {draft.step === 1 && (
          <>
            <div className="sf-card mb-3"><FieldsGrid fields={householdDisplayFields} values={{}} onChange={() => {}} columns={1} /></div>
            <h6 className="fw-bold mb-2">Household Members</h6>
            <p className="text-secondary fw-semibold">Add each member one at a time — they're saved immediately, so you can add as many as needed.</p>
            <RepeatGroupForm fields={MEMBER_FIELDS} items={members}
                              itemLabel={(m) => `${m.first_name} ${m.middle_name || ""} ${m.last_name} — ${m.relationship_to_head}`}
                              onAdd={addMember} onRemove={removeMember} addLabel="+ Add Member" />
          </>
        )}

        {draft.step === 2 && (
          <div className="sf-card">
            <h6 className="fw-bold mb-3">Disaster Assessment</h6>
            {disasters.length === 0 ? (
              <p className="text-secondary fw-semibold mb-0">
                No disasters are on file yet — record one on the <a href="/disasters">Disasters</a> page first, then come back to continue.
              </p>
            ) : (
              <FieldsGrid fields={disasterFields} values={draft.assessment.values} onChange={(n, v) => setStepValues("assessment", n, v)} />
            )}
          </div>
        )}

        {draft.step === 3 && (
          <>
            <h6 className="fw-bold mb-2">Affected Assets</h6>
            <p className="text-secondary fw-semibold">Record each damaged or lost asset — optional if nothing besides the dwelling was affected.</p>
            <RepeatGroupForm fields={ASSET_FIELDS} items={assets}
                              itemLabel={(a) => `${a.asset_name} — ${a.quantity} ${a.unit} (${a.damage_status})`}
                              onAdd={addAsset} onRemove={removeAsset} addLabel="+ Add Affected Asset" />
          </>
        )}

        {draft.step === 4 && (
          <div className="sf-card">
            <h6 className="fw-bold mb-3">Support Request</h6>
            <FieldsGrid fields={REQUEST_FIELDS} values={draft.request.values} onChange={(n, v) => setStepValues("request", n, v)} />
          </div>
        )}
      </WizardShell>

      {confirmCancel && (
        <ConfirmDialog title="Cancel Registration" danger
                       message="Any household, member, or assessment records already saved will stay on file — only this in-progress wizard session is discarded. Continue?"
                       confirmLabel="Discard & Exit" onConfirm={() => { startOver(); router.push("/households"); }} onClose={() => setConfirmCancel(false)} />
      )}
    </Layout>
  );
}
