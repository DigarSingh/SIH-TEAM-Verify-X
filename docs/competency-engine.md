# Competency engine

The engine is the heart of the platform: it turns "who completed which course" into "which competencies do people
actually have, where are the gaps, and what should each person learn next". It is **deterministic and explainable**. There is
no trained model and no randomness; every number can be reproduced by hand from the inputs and the settings below, and the
platform shows its working next to the result.

The code lives in `backend/src/modules/competencies/engine/` as pure functions (no database, no clock) so that it can be
tested exhaustively; the services around it load the inputs and store the results.

| File | Responsibility |
|---|---|
| `config.ts` | Every tunable number, its defaults and its validation |
| `skill-gap.ts` | Gap, severity, training priority, ranking, per-employee summary |
| `update.ts` | The competency update rule (evidence blended with the previous level) |
| `evaluation.ts` | Weighted score of the trainer rubric |
| `bands.ts` | Descriptive proficiency bands |
| `recommendation.ts` | Course recommendations and Beginner → Intermediate → Advanced learning paths |

## Vocabulary

* **Competency level**: an integer from 0 to 100 for one employee and one competency (for example Radar Meteorology 72).
* **Required level**: what the employee's *job role* needs for that competency (0 to 100). A job role is the organisational
  designation ("Severe Weather Forecaster"), not the access role (trainee, trainer, admin).
* **Importance** (1 to 5): how important the competency is *for that job role*.
* **Role criticality** (1 to 5): how mission critical the job role is.
* **Evidence**: an assessment result, a trainer evaluation or a practical assessment. Self-declared skills in a profile are
  informational and never move a competency level.

## Skill gap

```
gap = max(0, required − current)
```

Exceeding the requirement is "no gap", never a negative gap. Severity classifies the size of the gap:

| Gap (points) | Severity |
|---|---|
| 0 to 10 | Low |
| 11 to 25 | Moderate |
| 26 to 50 | High |
| 51 or more | Critical |

The thresholds are administrator settings (`severity.lowMax`, `moderateMax`, `highMax`; defaults 10, 25, 50).

## Training priority

The gap says how far someone is; the priority says how much it matters:

```
priority = gap × (importance ÷ 5) × (role criticality ÷ 5)        (0 to 100, one decimal)
```

This is the brief's `gap × importance × role criticality`, normalised by dividing by the largest possible product
(100 × 5 × 5). Priority levels:

| Priority score | Level (default thresholds) |
|---|---|
| below 12 | Low |
| 12 to below 25 | Medium |
| 25 to below 45 | High |
| 45 or more | Critical |

**Worked example (the demo).** Dr. Ananya Rao is a Severe Weather Forecaster (criticality 4, "High"). Her role requires
Radar Meteorology at 80 (importance 4, "Major"); she is at 35.

* gap = 80 − 35 = **45** → severity **High** (26 to 50)
* priority = 45 × 4/5 × 4/5 = **28.8** → **High** priority

The sentence the platform shows her is generated from the same numbers: *"Radar Meteorology: you are at 35% and your role
requires 80%, a gap of 45 points (High severity). Priority = gap 45 × importance 4/5 (Major) × role criticality 4/5 (High)
= 28.8 out of 100, which is High priority."* Employees are ranked by priority, then by gap, then by name, so the order is
stable. An employee "needs training" when at least one gap is High or Critical priority.

## Competency update

Passing an exam does **not** set the competency equal to the exam score. The engine blends what was already known with the
new evidence:

```
evidence = weighted average of the evidence that exists
           (assessment 0.60, trainer evaluation 0.25, practical assessment 0.15 by default;
            the weights are renormalised over the sources actually present)

blended  = previousWeight × previous + (1 − previousWeight) × evidence           (previousWeight = 0.25)
```

then two guard-rails, both on by default and both switchable:

* **No decrease** (`allowDecrease = false`): a weak result never lowers an existing level.
* **Course ceiling** (`capAtCourseTarget = true`): a course cannot lift a learner beyond the level it certifies (the
  `levelTo` of the course's competency mapping). A ceiling below the current level never *pulls the level down*; it only
  stops further gains.

The result is rounded to a whole number and clamped to 0 to 100.

**Worked example (the demo).** Previous level 35, assessment score 84, no other evidence:

* evidence = 84 (a single source carries all the weight)
* blended = 0.25 × 35 + 0.75 × 84 = 8.75 + 63 = 71.75 → **72**

Her Radar gap falls from 45 to 8 and the platform writes a history entry that records the inputs. The same rule applied
twice gives a believable timeline (illustrative: a first assessment of 58, then 79):

| Event | Previous | Evidence | Blended | New level |
|---|---|---|---|---|
| Baseline | 0 | | | 35 |
| Assessment 58% | 35 | 58 | 0.25 × 35 + 0.75 × 58 = 52.25 | **52** |
| Assessment 79% | 52 | 79 | 0.25 × 52 + 0.75 × 79 = 72.25 | **72** |

**Several sources.** Previous 72, assessment 90%, trainer evaluation 80%: evidence = (0.60 × 90 + 0.25 × 80) ÷ 0.85 = 87.06;
blended = 0.25 × 72 + 0.75 × 87.06 = 83.29 → **83**. The practical weight is left out because there is no practical
assessment; the other two are renormalised to add up to 1.

**Guard-rails.**

* Ceiling: previous 35, assessment 95, course mapped to 0 to 75 → blended 80, capped at **75**. The history entry says why:
  *"This course certifies competency up to 75%, so the level was capped there."*
* No decrease: previous 80, assessment 60 → blended 65, kept at **80**. *"A weaker result does not lower an existing
  competency level."*

**Which evidence counts.** After each submitted attempt (and each trainer evaluation) the engine gathers *all* currently
valid evidence for every affected competency: the most recent **passed** assessment on any course mapped to the competency,
the latest trainer evaluation and the latest practical assessment, each within the evidence window (default 365 days).
A failed attempt does not move a competency unless `updateOnFailedAttempt` is switched on. The competency level, the
history row and the attempt that triggered them are written in **one database transaction**, so they can never disagree.

**History.** Every change is an append-only `CompetencyHistory` row: previous level, new level, the source (`BASELINE`,
`ASSESSMENT`, `TRAINER_EVALUATION`, `PRACTICAL`, `ADMIN_ADJUSTMENT`), the course, attempt or evaluation that caused it, and
a `details` record with the evidence components, the blend, the limiting rule and the explanation sentence. The Competency
Passport draws its timeline from it. An administrator can record a baseline or correct a level
(`PUT /api/users/:id/competencies/:competencyId`); that also writes a history row and an audit entry.

## Trainer evaluation

A trainer rates five criteria from 1 to 5. Each rating becomes a percentage (rating ÷ 5 × 100) and the criteria are combined
with weights that must add up to 1:

| Criterion | Default weight |
|---|---|
| Technical knowledge | 0.30 |
| Practical ability | 0.25 |
| Participation | 0.10 |
| Application of knowledge | 0.20 |
| Overall competency | 0.15 |

Example: ratings 4, 5, 3, 4, 4 give 24 + 25 + 6 + 16 + 12 = **83.0**. The weights in force are stored with the evaluation, so
changing the settings later never rewrites an old score. An evaluation recorded as *practical assessment* feeds the
practical source instead of the trainer-evaluation source.

## Proficiency bands

A descriptive label only (it never changes a calculation): 0 to 39 **Foundation**, 40 to 69 **Developing**, 70 to 89
**Proficient**, 90 to 100 **Expert**.

## Competency freshness (decay and recertification)

A competency that is never used fades. Capacity Connect models that explicitly, so the question it answers moves from
"did this person once demonstrate the skill?" to "can they demonstrate it *now*?".

> The half-lives and intervals shipped with the demo data are a **plausible simulation for demonstration**, not an
> approved IMD policy. Every seeded policy is stored with `isSimulation` set, and the interface says so.

### The model

```text
effectiveLevel = baselineLevel × 0.5 ^ (daysSincePractice ÷ halfLifeDays)
```

clamped to 0 to 100, where `baselineLevel` is the verified level the competency engine recorded. One half-life costs
half the level:

| Days since practice | 0 | 90 | 180 | 360 |
|---|---|---|---|---|
| Level, from 72% with a 180-day half-life | 72 | **51** | 36 | 18 |

The worked example from the brief: `72 × 0.5^(90/180) = 72 × 0.7071 = 50.9` → **51%**.

**Nothing is stored.** `EmployeeCompetency.currentLevel` always holds the verified level; the effective level is
derived on every read from the policy and the date being asked about. That is what makes the readiness simulation
below possible, and it means a decayed competency is never silently destroyed — practise it and the full level returns.

### What resets the clock

Two different dates, because using a skill and proving it are not the same thing:

| Date | Set by | Effect |
|---|---|---|
| `lastPracticedAt` | a practice record (`POST /api/competencies/practice`), course completion, an assessment | resets decay: the level stops falling |
| `lastEvidenceAt` | an assessment, trainer evaluation or practical that the engine accepted | resets **recertification**: the competency counts as verified again |

Practice keeps a competency usable; only assessed evidence makes it verified. A competency can therefore be freshly
practised and still expire, which is exactly the situation recertification exists to catch.

### Status

Evaluated in this order, against configurable thresholds:

| Status | When |
|---|---|
| `EXPIRED` | the recertification date has passed — an unverified competency is not a demonstrated one, whatever the level |
| `CRITICAL` | below the competency's **minimum safe level**, or decay has cost at or beyond the critical threshold while leaving a shortfall |
| `AT_RISK` | decay has cost at or beyond the at-risk threshold (15 points by default) and left a shortfall |
| `WATCH` | any smaller gap, or recertification due within the watch window (30 days by default) |
| `CURRENT` | meets the requirement and is not near recertification |

Criticality tightens the critical threshold: criticality 1 leaves it alone, criticality 5 tightens it by
`criticalityWeight` (0.4 by default), so the same 30-point loss is critical on a mission-critical competency and merely
at risk elsewhere.

**What the thresholds are applied to matters.** `AT_RISK` and `CRITICAL` measure **how much decay has cost**, not the
size of the shortfall. Someone 25 points below their role requirement who has lost 5 points to decay has a *training
gap* with a little decay on top; the skill-gap engine already reports that, with its own severity and priority. Someone
who has lost 21 points is actively losing a capability they once demonstrated, and only that is a freshness risk.
Applying the thresholds to the gap instead would double-count every training need and drown the signal this view exists
to give. A shortfall still has to be real, though: decay that has not yet taken anyone below what their role needs is
`WATCH`, not a warning.

Every status carries the sentence that explains it, for example:

> Last practised 90 days ago. With a configured half-life of 180 days, the recorded 72% has decayed to an effective
> 51%. Your role requires 80%, so there is a gap of 29 points.

### Configuration

Freshness is **opt-in per competency**. A competency with no `CompetencyDecayPolicy` row does not decay, does not
expire and has no minimum safe level, so an installation that has not configured freshness behaves exactly as it did
before. An administrator sets, per competency: whether decay applies, the half-life, the minimum safe level, the
recertification interval (0 switches it off) and the criticality. The installation-wide defaults and the status
thresholds live in the engine configuration alongside every other engine setting.

A global switch (`decay.enabled`) turns the whole feature off in one place.

### Readiness simulation ("time travel")

Because the effective level is a pure function of a date, any read-only endpoint that reports freshness accepts a date
to answer for:

```text
GET /api/skill-gaps/me?offsetDays=90
GET /api/skill-gaps/me?asOf=2027-01-15T00:00:00Z
```

The response recalculates decay, recertification, gaps and training priorities for that date and reports `asOf`
with `simulated: true`. **No stored timestamp is modified**, so it is safe to hand to anyone; the request is bounded by
`decay.simulationMaxDays` (five years by default) and rejects a date it cannot read.

This is what lets a reviewer ask "who will be unready for the cyclone season?" and get an answer from the same code
that produces today's numbers, rather than from a separate projection.

## Recommendations and learning paths

Recommendations are rule-based and every reason is shown to the learner. The function is pure: the same gaps, catalogue
and enrollments always give the same answer.

1. **Candidates.** Every published course the learner has not completed that overlaps a gap. A course is mapped to a
   competency with a band `levelFrom` to `levelTo`; its *coverage* of a gap is the overlap of that band with the levels
   the learner still has to climb: `max(0, min(levelTo, required) − max(levelFrom, current))`.
2. **Score.** For each gap the course helps with: `gap priority × (coverage ÷ gap) + urgency`, where urgency is 0.5, 1, 1.5
   or 2 for Low, Medium, High or Critical priority. A course that helps with several gaps adds them up.
3. **Adjustments.** ×0.5 when a prerequisite is still open (it cannot be started yet), ×0.7 when it is a later step for the
   learner (its entry level is more than 20 points above where they are), ×1.15 when they already started it.
4. **Rank.** By score, then by stage (Beginner first), then by rating, then by title.
5. **Reasons.** Each recommendation lists why: the gap and how many points it can close, the position in the learning path,
   any prerequisite that comes first, and progress if the learner already started.

A **learning path** is built per gap: the courses mapped to the competency that can still raise the learner towards the
requirement (plus finished ones, for context), ordered **Beginner → Intermediate → Advanced**, then by the level band they
cover. A course's prerequisites are placed before it, even when they are not mapped to that competency (marked
*Prerequisite*), and a course whose prerequisites are unfinished is *locked* until they are done. The **next step** is the
first step that is neither finished nor locked. Prerequisite cycles are detected and cannot loop the builder.

The optional AI study-plan feature only *words* this result (see [api.md](api.md#ai-features)): it cannot add a course,
remove one or change the order.

## Organisation view

Administrators see the same engine applied to the workforce (`/api/admin/*`). An employee is an active user with a job
role; each competency the role requires is one row, analysed with exactly the individual formulas, so an administrator's
figures always agree with what each employee sees.

* **Heatmap:** average level, required level and average gap per department (or job role) × competency, with severity from
  the *average* gap using the same thresholds, and the change over 30, 90, 180 or 365 days from the history.
* **Training needs:** per competency, the employees below target, their average gap, the mean priority of those employees,
  how many are already enrolled in a course that develops it, how many have not started one, and how many courses exist. The
  ranking key is the *demand score*: the **sum** of the affected employees' priority scores, so a large gap in a critical
  competency for many people rises to the top. A competency with gaps but no published course is flagged *No course* so the
  training team knows to commission one.
* Employees who have never been assessed on a competency count at level 0 (an unassessed requirement is a gap, and is
  flagged as such).

## Training-needs forecast

`GET /api/admin/predictive-needs?horizon=6` estimates where each gap is heading. It is **calculated, not generated**: no AI
service is involved, and the method is shown on the page.

1. **Monthly averages.** For each competency, the average level of the employees whose role requires it, month by month
   (12 months by default), from the append-only history. The *same* employees are counted in every month: each one at the
   level they had at the end of that month, and before their first record at that first level, so a person who was only
   assessed recently does not look like progress. Months before the first record are left out.
2. **Pace.** A straight line is fitted through those averages (ordinary least squares). Its slope is the pace in points per
   month. With fewer than three months of data there is no trend and the forecast says so.
3. **Projection.** From **today's** average, at that pace: `projected = current + pace × months`, kept between 0 and 100.
4. **Employees still short.** Every employee is moved by `pace × months` and those still below their required level are
   counted, next to today's count.
5. **Outlook.** *On target* (nothing to close), *Closing* (the pace is closing the gap), *Stagnant* (a flat trend: it will not
   close by itself), *Widening* (moving away), or *Not enough history*. *Months to close* is `gap ÷ pace` when the trend
   really is closing the gap. A pace within ±0.25 points a month counts as flat.
6. **Confidence.** *High* needs at least 8 months of data and R² ≥ 0.6, *Medium* at least 5 months and R² ≥ 0.3, otherwise
   *Low*. "Competencies at risk" are those that are flat or widening *and* still leave employees below target.

**Worked example.** Two employees, Radar Meteorology required at 80. Their monthly averages over five months are 40, 45, 50,
55, 60, a pace of +5 a month. Over six months the projection is 60 + 5 × 6 = **90**; the gap of 20 closes in 20 ÷ 5 = **4
months**. The integration test `predictive-needs.test.ts` builds exactly this data and checks these numbers.

It is a projection of the recent pace, not a promise: it knows nothing about planned courses, retirements or new joiners.
The optional written briefing (AI) only describes these numbers; it never computes them.

## Administrator settings

*Engine settings* (`/admin/settings`, `GET/PUT /api/competencies/engine/config`) edits every number above: severity and
priority thresholds, the previous-level weight, the evidence weights, the evidence window, the two switches for failed
attempts and decreases, the course ceiling and the rubric weights. Input is validated (thresholds must strictly increase,
the rubric weights must add up to 1) and stored in `SystemSetting` under `engine.config`; a stored configuration from an
older release is merged over the defaults, so adding an option later never breaks an installation. A **simulator**
(`POST /api/competencies/engine/simulate`) shows the effect of a change on one gap and one update before it is saved, and
*Restore defaults* removes the stored override. Gaps and priorities are computed on read, so a change applies everywhere at
once; existing competency levels and history rows are never rewritten. Every change is audited.

## Reproducing the numbers

The unit tests in `backend/tests/unit/` (`skill-gap.test.ts`, `update.test.ts`, `scoring.test.ts`, `recommendation.test.ts`)
pin every rule above, including the two worked examples from the brief. `tests/integration/demo-scenario.test.ts` replays the
whole demo (Radar 35%, gap 45, High → recommended course → enrol → complete modules → assessment 84% → competency 72% →
certificate → public verification → trainer views) through the HTTP API against a real PostgreSQL database.
