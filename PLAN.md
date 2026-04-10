# ProjectX Plan

## 1. Product thesis

ProjectX should become the daily operating workspace for analysts and decision-makers who move from **finding companies** to **forming a view** to **tracking change**.

### What ProjectX should be
- A company-centric workflow product for:
  - discovery (finding relevant companies/signals)
  - understanding (building a grounded view from real sources)
  - decision support (documenting thesis, evidence, and conclusions)
  - monitoring (tracking what changed and why it matters)
- A system where company profile, vertical modules, DD rooms, and watches are connected, not isolated pages.

### What ProjectX should not be
- Not a generic company directory.
- Not a static BI dashboard layer with disconnected charts.
- Not a “score generator” built on weak or synthetic assumptions.
- Not a product that claims broad coverage where data is not actually available.

### Core users
- Investor teams (public/private market workflows)
- Credit analysts
- Corporate / M&A teams
- Sector analysts

### Why company page + verticals + DD + monitoring must be connected
- Company page is where context is assembled.
- Verticals (Distress, Petroleum, IP) provide domain-specific signal depth.
- DD turns observations into structured decisions.
- Monitoring closes the loop by surfacing new events against existing theses.

Without this chain, ProjectX becomes fragmented and loses workflow value.

---

## 2. Product model

ProjectX should be operated as a four-layer product model.

### A. Discovery

**Meaning**
- Identify relevant companies, sectors, and early signals quickly.

**Existing capabilities in repo**
- Search and filtering flows.
- AI-assisted query interpretation in search.
- Distress company listing and monitoring entry points.
- Oil & gas market entry points with map/table exploration.

**Current gaps**
- Discovery-to-company handoff is not yet consistently “one-click with preserved context”.
- Limited saved views / reusable search workflows by workspace.
- Signal prioritization in discovery views is still uneven across modules.

### B. Understanding

**Meaning**
- Build a reliable company-level understanding from traceable data.

**Existing capabilities in repo**
- Company profile with overview, financials, key figures, organization, announcements.
- Industry-code enrichment.
- Legal structure / ownership context where available.
- Dynamic company tabs, including petroleum and IP overlays.

**Current gaps**
- Dynamic tab relevance rules are present but not yet standardized as a shared framework.
- Source status and data freshness communication is inconsistent between modules.
- Some module UX differs in interaction patterns, reducing comparability.

### C. Decision support

**Meaning**
- Convert analysis into explicit decision artifacts.

**Existing capabilities in repo**
- DD rooms with mandate, tasks, findings, evidence references, comments, conclusion history.
- Company-context discussion support.

**Current gaps**
- Evidence objects are not yet fully universal across all vertical modules.
- Friction remains when moving from a module insight into DD objects.
- Decision templates/workflows are still mostly manual and room-local.

### D. Monitoring

**Meaning**
- Track changes post-analysis and route them to the right workspace/users.

**Existing capabilities in repo**
- Workspace watches and notification sync flow.
- Distress monitors and inbox-style notifications.
- Petroleum market sync and source-state logic.

**Current gaps**
- Watch semantics vary by module and are not yet a unified capability.
- Alert relevance/ranking and action routing can be more explicit.
- Monitoring links back to prior thesis/evidence are still lightweight.

---

## 3. Current state

### What is already strong
- Real-data discipline is established (no mock/seed in core product direction).
- Layered architecture exists (integrations → services/persistence → API/UI).
- Company profile is substantial and already supports multiple high-value tabs.
- Distress module, DD workflows, and workspace model provide a real operating base.
- Petroleum market module has meaningful breadth (map, series, events, company exposure).

### What is partially implemented
- Dynamic sector tabs are functional but not fully standardized as one product system.
- Petroleum company tab visibility/relevance logic exists, but cross-vertical parity is incomplete.
- Watches/notifications are live, but cross-module behavior and triage experience are uneven.
- Feature gating/subscription scaffolding exists; commercial packaging remains lightweight.

### What remains weak or fragmented
- Cross-module interaction consistency (navigation patterns, CTA patterns, source-state presentation).
- End-to-end flow from “signal seen” → “DD artifact created” → “monitoring linked”.
- Shared abstraction for vertical modules (capability contract, UX standards, relevance contract).
- Product analytics layer for workflow outcomes (not just page usage).

### Areas to consolidate before major new expansion
- Dynamic tab framework and relevance engine contract.
- Company profile as primary command surface.
- Shared evidence/watch primitives across modules.
- Module-level quality baseline: source status, empty states, tests, and docs.

---

## 4. Strategic priorities

1. **Make company profile the product center**
   - Company profile should be the default workspace for understanding and next actions.

2. **Consolidate dynamic tabs and vertical integration as a system**
   - Move from per-feature tab additions to a standard vertical capability model.

3. **Deepen 2–3 verticals before adding many more**
   - Distress, Petroleum, and IP should become clearly strong before broad expansion.

4. **Make DD/evidence/watch cross-cutting and universal**
   - Every meaningful signal should be attachable to DD and watchable in a uniform way.

5. **Only build new modules that improve one of the four product layers**
   - Any new module must clearly strengthen Discovery, Understanding, Decision support, or Monitoring.

---

## 5. Phased roadmap

### Phase 1 — Consolidate the foundation

**Goal**
- Standardize dynamic tabs and relevance logic.
- Improve consistency/robustness of company-page experience.
- Raise baseline quality in tests, source-status communication, and documentation.

**Why this phase matters**
- Without consolidation, every new module increases UI and maintenance fragmentation.

**Focus areas**
- Define a shared tab contract (visibility, priority, empty state, source status).
- Standardize relevance/visibility engine patterns across existing tabs.
- Normalize module-level loading/error/empty semantics.
- Strengthen service-level tests for visibility, ranking, and fallback behavior.
- Document data availability boundaries clearly in docs/README.

**What not to prioritize in this phase**
- New major vertical modules.
- Heavy commercial packaging expansion.
- Broad redesign not tied to consistency and robustness.

### Phase 2 — Make company profile the hub

**Goal**
- Turn company profile into the main operational surface across workflows.

**Why this phase matters**
- Users need one place to move from context to action (DD, watch, compare, triage).

**Focus areas**
- Build a consistent investor/analyst overview section at top-level company context.
- Add a clear signal rail (material changes, relevant events, unresolved items).
- Introduce persistent action surfaces (add to DD, watch entity/signal, assign follow-up).
- Improve deep linking between company profile and module-specific views.

**What not to prioritize in this phase**
- Building additional standalone dashboards.
- Expanding low-usage pages before company-hub flow is reliable.

### Phase 3 — Strengthen the first verticals

**Goal**
- Make Distress, Petroleum, and IP each feel like strong, usable vertical products.

**Why this phase matters**
- Strong verticals create differentiated workflow value and better retention.

**Focus areas**
- Distress V2: better triage quality, trend interpretation, and follow-up workflows.
- Petroleum V2: stronger company-to-market linking, cleaner insight summaries, improved analyst flow.
- IP V2: clearer relevance on company page, better event/signal utility for analysis.
- For each vertical: tighten DD handoff and monitoring hooks.

**What not to prioritize in this phase**
- Launching many thin verticals with shallow utility.
- Advanced scoring features without source-backed confidence.

### Phase 4 — Turn DD and monitoring into platform capabilities

**Goal**
- Generalize evidence and watches as reusable platform-level capabilities.

**Why this phase matters**
- Decision support and monitoring must work the same way regardless of module.

**Focus areas**
- Introduce a universal evidence object contract across modules.
- Standardize “send to DD” pathways from company page and vertical modules.
- Unify watch types (entity watch, signal watch, threshold/event watch).
- Strengthen traceability from notification to related company context and DD artifacts.

**What not to prioritize in this phase**
- Cosmetic notification redesign without workflow improvements.
- Over-complex automation before base watch semantics are stable.

### Phase 5 — Add the next high-value vertical

**Goal**
- Add one next vertical with high strategic fit and data realism.

**Why this phase matters**
- Controlled expansion keeps product quality high and avoids fragmentation.

**Focus areas**
- Candidate: Public contracts.
- Define scope tightly: contract signals relevant for company risk/opportunity monitoring.
- Integrate directly with company profile, DD evidence, and watch workflows.
- Launch with clear source boundaries and explicit availability messaging.

**What not to prioritize in this phase**
- Simultaneous rollout of multiple new verticals.
- Vertical launches without clear company-page and DD/monitoring integration.

---

## 6. Vertical strategy

Verticals are central because they bring domain-specific signal density that a generic company profile cannot provide. But each vertical must be built as part of one system, not as isolated feature islands.

### Distress

**Module contribution**
- Early-warning and deterioration signals for company risk review.

**Connection to company profile**
- Show distress relevance in company context with explicit source/freshness framing.

**Connection to DD and monitoring**
- Direct create/add evidence flows into DD.
- Watch distress transitions and trigger follow-up tasks.

**Next natural uplift**
- Better triage ranking and clearer actionability (what changed, what to do next).

### Petroleum

**Module contribution**
- Sector-specific operational/market context (assets, events, series, exposure).

**Connection to company profile**
- Surface petroleum tab only when relevance is real and explainable.

**Connection to DD and monitoring**
- Convert material petroleum events/signals into evidence and watch triggers.

**Next natural uplift**
- Improve company exposure quality and company-to-market decision context.

### IP

**Module contribution**
- Intangible-rights context as a strategic/competitive signal layer.

**Connection to company profile**
- Dynamic relevance at company level with clear boundaries when data is sparse.

**Connection to DD and monitoring**
- Enable DD evidence links for meaningful IP changes and watch-driven updates.

**Next natural uplift**
- Increase analytic usefulness beyond listing (change, concentration, materiality cues).

### Next likely vertical: Public contracts

**Why this is a strong candidate**
- Direct relevance for opportunity pipeline, concentration risk, and dependency analysis.

**How it should connect**
- Company profile: contract footprint and change signals.
- DD: attach contract events and concentration observations as evidence.
- Monitoring: watch new awards/renewals/terminations with workspace routing.

**Why not build everything at once**
- Vertical quality depends on deep integration with profile, DD, and monitoring.
- Parallel expansion across many sectors would dilute product coherence.

---

## 7. What not to do

- Do not build many verticals simultaneously.
- Do not let the UI fragment into independent mini-products.
- Do not ship generic dashboards without clear decision utility.
- Do not introduce pseudo-precise scoring without robust source support.
- Do not over-invest in billing/packaging complexity before workflow value is clear.
- Do not allow company page to become “just another info page”.

---

## 8. Operating plan

Use execution tracks that map directly to roadmap priorities.

### Track A — Platform consolidation

**Build**
- Shared contracts for dynamic tabs, source status, empty states, and relevance rules.

**Tighten**
- Service-level boundaries, test coverage, and module consistency checks.

**Can wait**
- New vertical scope.

### Track B — Company profile as hub

**Build**
- Action-first company surface (signal rail, DD/watch CTAs, contextual navigation).

**Tighten**
- Information architecture and consistency of cross-tab interaction.

**Can wait**
- Secondary UI polish unrelated to workflow completion.

### Track C — Petroleum V2

**Build**
- Better company exposure interpretation and analyst action flows.

**Tighten**
- Visibility relevance confidence and source messaging.

**Can wait**
- Peripheral features not tied to company-level decisions.

### Track D — Distress V2

**Build**
- Triage workflows and higher-signal monitoring outcomes.

**Tighten**
- Relevance ranking and downstream actionability.

**Can wait**
- Distress-only visual embellishments with limited workflow impact.

### Track E — IP V2

**Build**
- Material-change driven IP insights for company analysis.

**Tighten**
- Cross-linking to DD and watch semantics.

**Can wait**
- Broad IP breadth before relevance quality is high.

### Track F — Next vertical (Public contracts)

**Build**
- Narrow but deep first release tied to company profile and monitoring.

**Tighten**
- Data quality boundaries and availability communication.

**Can wait**
- Additional new verticals.

---

## 9. Success criteria

Measure progress against workflow outcomes, not only traffic.

### Discovery
- Share of sessions that move from search/listing to company profile.
- Time-to-first-relevant-company from entry page.
- Reuse rate of filters/search intents per workspace.

### Understanding
- Tab engagement depth on company profile (multi-tab analysis sessions).
- Completion rate of key context actions (open financials, organization, vertical tab).
- Source-status comprehension signals (fewer dead-end interactions when data unavailable).

### Decision support
- Rate of creating DD artifacts from company/vertical contexts.
- Evidence attachment usage per DD room.
- Share of DD conclusions with traceable evidence references.

### Monitoring
- Watch creation rate from company and module contexts.
- Notification-to-action rate (open company, update DD, assign task).
- Percentage of notifications linked to actionable entities/signals.

### Commercial / product value
- Active workspace retention over monthly periods.
- Repeat analysis sessions per workspace.
- Conversion from free usage to gated features once workflow value is clear.

---

## 10. Recommended order of execution

1. Consolidate dynamic tabs and platform behavior.
2. Make company profile the operating hub.
3. Deliver Petroleum V2 (deeper company-level utility).
4. Deliver Distress V2 (stronger triage and follow-up).
5. Deliver IP V2 (materiality-driven insights).
6. Generalize DD/evidence/watch as cross-product capabilities.
7. Add next vertical: Public contracts.

---

## 11. Short conclusion

ProjectX should be built as one connected workflow product where company context, vertical depth, decision artifacts, and monitoring reinforce each other. The immediate priority is consolidation and integration quality, then focused depth in a small number of verticals, before controlled expansion to the next high-value module.
