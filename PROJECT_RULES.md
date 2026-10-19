# PROJECT_RULES.md — SkillPulse Intelligence (SIH26246)

These rules apply to every task in this repository, for every session,
unless a specific prompt explicitly overrides one.

1. Inspect before you change. Read existing files and run `git status`
   before creating, editing, or deleting anything. Never overwrite work
   you haven't read.
2. Preserve what works. Before adding a feature, confirm existing tests
   pass and the app runs. After your change, re-verify both. Never break
   a working feature to add a new one.
3. Build real things. Every file you create must be a complete, runnable
   implementation — never a stub, a TODO, a mock returning hardcoded data,
   or an "example" meant to be replaced later. If something can't be
   finished in this task, say so explicitly instead of faking it.
4. Never fabricate. Never invent dataset contents, model accuracy numbers,
   forecasts, or claim a feature "works" without having actually run it
   and observed the result. If a dataset is inaccessible or a model
   underperforms, report that honestly.
5. Label synthetic data. Any fixture/synthetic data lives only under
   `tests/fixtures/` or `**/fixtures/`, is named with a `fixture_` or
   `synthetic_` prefix, is never read by production code paths, and is
   never shown in the UI as if it were real.
6. No fake real-time. All data in this project is historical and
   periodically refreshed, never live. Every place the UI shows data must
   show its vintage/last-updated date. Never describe or implement
   anything as "real-time" or "live."
7. Respect the statistical-sufficiency gate. A forecast may only be
   produced for a series that passes the sufficiency check defined in
   docs/product_blueprint.md. A series that fails must show "insufficient
   history to forecast" — never a number anyway.
8. Time-aware validation only. Any time-series train/test split must be
   chronological (walk-forward / expanding window). Never randomly
   shuffle time-series data for evaluation.
9. Test before declaring done. Run the verification commands specified in
   the current task. Fix failures before reporting completion. Never
   report a stage "done" with known failing tests.
10. Report honestly at the end of every task: what was built, the exact
    commands run and their real output, what remains incomplete or
    unverified, and any place reality (a library, dataset, API) didn't
    match the plan.
11. Don't invent requirements. Treat docs/problem_statement_analysis.md as
    the only source of "official" SIH requirements. If asked to assume
    something it doesn't cover, flag it as an assumption, not a fact.
