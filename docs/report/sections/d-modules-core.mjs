/** Chapters 13-18: authentication, competency framework, learning, assessment, the engine, certification. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, figure, figurePair, note, warn, pre, chain, status } from '../kit.mjs';

export const ch13 = `${chapterOpen(13, 'Authentication, Users and Access Control')}
${h2('Purpose')}
${p(
  `This module decides who may use the system and what they may reach. Everything else in the platform depends on it being right, so the rules are enforced on the server twice — once by the route and once inside the service, at record level — and the browser is never the access control.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('Registration and approval')}
${p(
  `A self-registered account is created as a trainee in a pending state and cannot sign in until an administrator approves it. Registration can be restricted to organisation e-mail domains, and the approval requirement itself is configurable — both are environment settings, and the registration screen reads the live policy from the server rather than assuming it.`,
)}
${figure(
  '26-registration.png',
  'Registration, with the live policy shown to the applicant',
  'The form states the password policy before it is enforced, and the department and job-role lists come from the framework rather than being free text, so an account arrives already attached to the requirements it will be measured against. The notice that an administrator must approve the account is rendered from the server’s configuration, so it cannot drift from what the server will actually do.',
)}

${h2('Sign-in')}
${figure(
  '01-sign-in.png',
  'Sign-in, with demonstration shortcuts visible in development builds',
  'The account shortcuts on the right are present only in a development build, or when a production build is deliberately made with the demonstration flag set. Behind this screen: the same error message for an unknown address and a wrong password, a dummy Argon2id verification for unknown addresses so response time reveals nothing, a lock-out after five failed attempts, and a distinct message for a suspended, pending or rejected account — which is safe to distinguish, because it tells an authorised user something they need to know rather than telling an attacker which addresses exist.',
)}
${table(
  'Authentication controls',
  ['Control', 'Implementation'],
  [
    ['Password storage', 'Argon2id (<code>@node-rs/argon2</code>), memory and time cost exposed as configuration so they can be raised on production hardware. Only the hash is stored.'],
    ['Password policy', 'At least ten characters with lower case, upper case, a digit and a symbol. One module enforces it for registration, password change and administrator-created accounts alike.'],
    ['Enumeration resistance', 'Identical message and comparable response time for an unknown address and a wrong password.'],
    ['Lock-out', 'Five failed attempts locks the account for fifteen minutes. The sign-in rate limit counts failures only, so colleagues behind one address do not lock each other out.'],
    ['Temporary passwords', 'An administrator-created account or a reset shows a generated password once. The account is held on the change-password screen — every other endpoint answers <code>403 PASSWORD_CHANGE_REQUIRED</code> — until the user chooses their own. A reset also revokes that account’s sessions and clears any lock.'],
    ['First administrator', 'Created by a command-line tool, never by the seed. The seed refuses to run in production.'],
  ],
  { widths: ['24%', '76%'] },
)}

${h2('Sessions')}
${p(
  `Sign-in sets two HttpOnly cookies: a short-lived access token (a JWT, issuer-checked, fifteen minutes by default) and an opaque refresh token with a seven-day lifetime whose cookie path is restricted to <code>/api/auth</code>, so it never travels with an ordinary API call.`,
)}
${ul([
  `**The token's claims are not trusted for authorisation.** The access token carries the user id, session id and access role, but on every request the session, the account status and the current role are re-read from the database. A revoked session, a suspended account or a demotion therefore takes effect on the very next request, not when the token expires.`,
  `**Only the SHA-256 of a refresh token is stored**, along with the hash of the previous one.`,
  `**Rotation with reuse detection.** Every refresh issues a new token. Presenting an already-rotated token outside a fifteen-second grace window — which covers a double click or two tabs refreshing at once — revokes the entire session and writes a <code>SESSION_REUSE_DETECTED</code> audit entry, because that pattern indicates a stolen token.`,
  `**Changing a password signs out every other session.** Logout revokes the session and clears both cookies, and in the web app it also flushes and erases everything the device was holding offline.`,
])}

${h2('Authorisation')}
${p(
  `Three access roles, and two independent layers of checking on every request: the route's role requirement, and the record-level rule inside the service.`,
)}
${table(
  'What each access role may do',
  ['Capability', 'Trainee', 'Trainer', 'Administrator'],
  [
    ['Own competencies, gaps, recommendations, passport', 'Yes', '—', '—'],
    ['Browse published courses, enrol, learn, be assessed, hold certificates', 'Yes', '—', '—'],
    ['Create and edit courses, modules, materials, assessments', '—', 'Own courses only', 'Any'],
    ['See results and passports', 'Own only', 'Only trainees enrolled in their own courses', 'All'],
    ['Record trainer evaluations', '—', 'For their own trainees', 'For anyone'],
    ['Manage users, departments, job roles, competencies, engine settings', '—', '—', 'Yes'],
    ['Revoke certificates, read the audit log, run workforce analytics', '—', '—', 'Yes'],
  ],
  { className: 'rbac', widths: ['46%', '18%', '20%', '16%'] },
)}
${p(`Specific rules, each pinned by a test in the role-based access-control suite:`)}
${ul([
  `A trainee who knows an administrator URL still gets 403, and cannot promote themselves — the access role is not an editable profile field.`,
  `A trainer cannot change another trainer's course, assessment or modules, and can view or evaluate only trainees enrolled in their own courses.`,
  `A trainee cannot read another learner's attempt, certificate or notifications, and cannot see a draft course or an unpublished assessment.`,
  `Course materials download only for enrolled trainees, the course's trainer and administrators.`,
  `An inactive or suspended user loses access on the next request.`,
  `The last active administrator cannot be deleted, demoted or suspended.`,
])}

${h2('User administration')}
${figure(
  '38-admin-users.png',
  'User administration: approvals, status and role management',
  'The pending registrations and the suspended account visible here come from the demonstration seed, which deliberately leaves the approval workflow in a state that can be exercised. Creating an account here generates a one-time temporary password; the new user is held on the change-password screen until they set their own. Every action on this screen — approval, rejection, role change, suspension, password reset — writes an audit entry.',
)}

${h2('The audit trail')}
${figure(
  '39-audit-log.png',
  'The audit log, filterable by actor, action, entity and date',
  'Append-only. It records sign-ins and failures, lock-outs, refresh-token reuse, account creation and approval, role and status changes, password resets, framework changes, competency adjustments, course and assessment authoring and publication, submissions, certificate issue, revocation and reinstatement, engine settings changes, announcements, reminder runs and AI use — each with the actor, the affected record, the IP address and the user agent. The indexes behind this screen exist specifically for these filters. A failure to write an audit row is logged but never blocks the operation it describes, because losing the operation would be worse than losing the record of it.',
)}
${chapterClose}`;

export const ch14 = `${chapterOpen(14, 'Competency Framework and Skill-Gap Analysis')}
${h2('Purpose')}
${p(
  `This is the module that makes the rest of the system possible. It defines what the organisation needs, records what each person holds, and computes the distance between the two in a way that can be defended line by line.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('The framework')}
${p(`Four entities, in a deliberate order.`)}
${table(
  'The competency framework',
  ['Entity', 'What it carries', 'Who maintains it'],
  [
    ['Department', 'An organisational unit: Forecasting, Radar Operations, and so on.', 'Administrator'],
    ['Job role', 'A designation such as Severe Weather Forecaster, with a <strong>criticality</strong> from 1 to 5 describing how mission-critical the role is.', 'Administrator'],
    ['Competency', 'A skill area such as Radar Meteorology, with a code, a category and optional level descriptors.', 'Administrator'],
    ['Role requirement', 'For one job role and one competency: the <strong>required level</strong> from 0 to 100 and the <strong>importance</strong> from 1 to 5.', 'Administrator'],
  ],
  { widths: ['16%', '64%', '20%'] },
)}
${figure(
  '40-competencies-admin.png',
  'Competency administration',
  'Each competency carries a code, a category and its usage across job roles and courses. The freshness policy — whether this competency decays, its half-life, its minimum safe level, its recertification interval and its criticality — is attached here, and is opt-in: a competency with no policy does not decay, does not expire and has no minimum safe level, so an installation that never configures freshness behaves exactly as it would without the feature.',
)}

${h2('The skill gap')}
${pre('gap = max(0, required − current)', 'gap')}
${p(
  `Exceeding a requirement is "no gap", never a negative one — a person who is above what their role needs is not owed training, and allowing negative gaps would let strength in one competency mathematically cancel weakness in another.`,
)}
${table(
  'Severity bands (administrator-configurable)',
  ['Gap in points', 'Severity'],
  [['0 to 10', 'Low'], ['11 to 25', 'Moderate'], ['26 to 50', 'High'], ['51 or more', 'Critical']],
  { className: 'narrow', widths: ['50%', '50%'] },
)}

${h2('Training priority')}
${p(`The gap says how far somebody is. The priority says how much that distance matters.`)}
${pre('priority = gap × (importance ÷ 5) × (role criticality ÷ 5)      → 0 to 100, one decimal', 'training priority')}
${p(
  `This is the problem statement's <em>gap × importance × role criticality</em>, normalised by the largest possible product so the result is always on a 0 to 100 scale. A 45-point gap in a competency that is merely useful to a peripheral role scores low; the same gap in a major competency of a critical role scores high. Priority bands are Low below 12, Medium from 12, High from 25 and Critical from 45 — all administrator settings.`,
)}
${note(
  'Worked example, from the demonstration data',
  'Dr. Ananya Rao is a Severe Weather Forecaster, a role with criticality 4 (High). The role requires Radar Meteorology at 80 with importance 4 (Major). She holds 35. Gap = 80 − 35 = <strong>45</strong>, which is High severity. Priority = 45 × 4/5 × 4/5 = <strong>28.8</strong>, which is High priority. The platform shows her exactly that sentence, generated from the same numbers.',
)}

${h2('The Competency Passport')}
${figure(
  '02-competency-passport.png',
  'The Competency Passport: levels, requirements, gaps and the timeline behind each',
  'The passport is the employee’s own view of their record. Each competency shows the level held, the level the job role requires, and the gap; the timeline under a competency is drawn from the append-only history, so the sequence 35% → 52% → 72% is a record of real events with the evidence that caused each step, not a smoothed chart. A self-declared skill from the profile never appears as a competency level, which is why the passport can be used as evidence and a profile cannot.',
)}

${h2('Skill gaps and their explanations')}
${figure(
  '03-skill-gaps.png',
  'Skill gaps, with severity, priority and the reasoning written out',
  'Every row carries the sentence that explains it, assembled from the same values that produced the number — not a separate description that could fall out of step. This is the most direct expression of the explainability requirement (NFR-1): an employee who disagrees with a priority can see precisely which of the four inputs they disagree with. Ranking is by priority, then by gap, then by name, so the order is stable between visits.',
)}

${h2('Recommendations and the learning path')}
${p(`Recommendation is rule-based and deterministic: the same gaps, catalogue and enrolments always produce the same answer, and every reason is shown.`)}
${ol([
  `**Candidates.** Every published course the learner has not completed that overlaps a gap. A course maps to a competency across a band from <code>levelFrom</code> to <code>levelTo</code>; its <em>coverage</em> of a gap is the overlap of that band with the levels the learner still has to climb.`,
  `**Score.** For each gap the course helps with: <code>priority × (coverage ÷ gap) + urgency</code>, where urgency is 0.5, 1, 1.5 or 2 by priority band. A course that helps with several gaps adds them up.`,
  `**Adjustments.** Halved when a prerequisite is still open, so a course that cannot be started yet does not head the list; reduced to 70% when the course is a later step for this learner; raised by 15% when they have already started it.`,
  `**Rank** by score, then by stage, then by rating, then by title.`,
  `**Reasons.** Each recommendation lists which gap it addresses and how many points it can close, its position in the path, any prerequisite that comes first, and existing progress.`,
])}
${figure(
  '04-learning-path.png',
  'The learning path: Beginner to Advanced, with prerequisites locked',
  'A path is built per gap: the courses that can still raise this learner towards the requirement, ordered Beginner → Intermediate → Advanced and then by the band they cover, with prerequisites placed before the courses that need them even when the prerequisite is not itself mapped to that competency. A course whose prerequisites are unfinished is shown locked rather than hidden, so the learner can see the whole route. The <em>next step</em> is the first step that is neither finished nor locked. Prerequisite cycles are detected and cannot loop the builder.',
)}
${chapterClose}`;

export const ch15 = `${chapterOpen(15, 'Learning Management')}
${h2('Purpose')}
${p(
  `Everything the competency framework asks for has to be learnable. This module is the conventional half of the platform — catalogue, authoring, enrolment, delivery, progress — and it deliberately follows learning-management convention, because trainers already know how that works and there was no reason to be original about it.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('Where the trainee starts')}
${figure(
  '27-trainee-dashboard.png',
  'The trainee dashboard',
  'The dashboard leads with role readiness rather than with course activity, which is the whole platform in miniature: the first thing a learner sees is the distance between what their job needs and what they hold, and the courses are offered as the route to closing it. Continuing enrolments, upcoming deadlines, recommended next steps and any AR refresher the freshness engine has raised all appear here. Large assets — the 3D model in particular — are deliberately not loaded on this screen.',
)}

${h2('The catalogue')}
${figure(
  '05-course-catalog.png',
  'The course catalogue, with filters and plain-language search',
  'Filtering is by competency, category, difficulty and status. The search box accepts an ordinary sentence: a built-in keyword interpreter handles it with no AI configured, and when an AI key is present the same box can route through the optional plain-language search, which returns real catalogue identifiers that are validated against the database before anything is displayed. Courses that develop a competency the viewer has a gap in are marked as such, so the catalogue and the recommendations tell the same story.',
)}

${h2('Course delivery')}
${figure(
  '06-course-player.png',
  'The course player, with module progress and the optional assistant',
  'Modules are worked through in order and marked complete individually; the enrolment’s progress percentage is derived from them. Materials may be text, an uploaded document, a video or an external link. Uploaded documents and video stream through the API rather than from a public URL, so access is checked on every request and video seeking is supported through HTTP range requests. The "Save for offline" control here is what puts the course, its readings and its media onto the device — Chapter 23 follows that path.',
)}
${figure(
  '28-my-courses.png',
  'My courses: enrolments by state, with what is saved to this device',
  'Enrolments move through enrolled, in progress, assessment pending, completed and certified. The offline indicators on this screen come from the device’s own IndexedDB rather than from the server, so the list is accurate even with no connection at all.',
)}

${h2('Authoring')}
${figure(
  '10-course-editor.png',
  'The course editor, with the publication readiness checklist',
  'A trainer owns their courses: another trainer cannot open this screen for them, and the rule is enforced in the service rather than by hiding the link. The readiness checklist on the right is the publication gate — it names what is still missing (a competency mapping, a module, an assessment, a pass mark) rather than simply refusing to publish, which turns an error into a task list. The competency mapping set here is what makes the course appear in a recommendation, and its upper bound is the ceiling the engine will not let this course certify beyond.',
)}
${table(
  'What a trainer can author',
  ['Object', 'Detail'],
  [
    ['Course', 'Title, summary, description, category, difficulty, duration, thumbnail, pass mark, status.'],
    ['Competency mapping', 'Which competencies the course develops, and the level band from <code>levelFrom</code> to <code>levelTo</code> that it covers.'],
    ['Prerequisites', 'Other courses that must be completed first. Cycles are rejected.'],
    ['Modules', 'Ordered units within the course.'],
    ['Materials', 'Text, links, uploaded documents and video. Uploads are validated by content, not by extension.'],
    ['Assessment', 'At most one per course — see Chapter 16.'],
  ],
  { widths: ['22%', '78%'] },
)}

${h2('Enrolment and progress')}
${ul([
  `An enrolment is unique per learner and course, and carries a status and a denormalised progress percentage recomputed from module completions.`,
  `Marking a module complete is one of the three actions that work offline, and it is idempotent: applying the same completion twice does not double-count progress.`,
  `Course feedback — a rating of the course and of the trainer — is unique per learner and course, and also works offline.`,
  `Completing a course records practice against the competencies it develops, which resets their decay clock even though the course completion alone does not re-verify them. Chapter 19 explains why those are two different things.`,
])}
${chapterClose}`;

export const ch16 = `${chapterOpen(16, 'Assessment Engine')}
${h2('Purpose')}
${p(
  `An assessment is where a claim about capability becomes evidence. The engine therefore has one non-negotiable property: **the browser never holds a score**. It sends which options were selected and nothing more.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('Structure')}
${table(
  'What an assessment is made of',
  ['Element', 'Detail'],
  [
    ['Assessment', 'At most one per course. Carries the pass mark, the time limit, the attempt cap (zero meaning unlimited), an optional deadline, how many questions to draw per attempt, whether to shuffle, whether to allow review afterwards, and <code>mcqWeight</code>.'],
    ['Question bank', 'Single- or multiple-answer questions, each worth at least one mark. An attempt draws from the bank rather than using every question, so two learners rarely see the same paper.'],
    ['Practical scenario', 'A briefing describing a situation, optionally with an image, worked through as a sequence of steps.'],
    ['Scenario step', 'One decision: identify, interpret or act. Each carries its own marks and an explanation shown after submission whatever was chosen.'],
    ['Scenario option', 'A choice, with a <strong>credit between 0 and 1</strong>. Unlike a quiz option, a choice can be partly right — a defensible but slower decision earns part of the marks, and its rationale explains why.'],
  ],
  { widths: ['20%', '80%'] },
)}
${note(
  'Why partial credit exists',
  'Operational judgement is rarely binary. Issuing a warning an hour late is not the same mistake as not issuing one; escalating cautiously is not the same as escalating wrongly. A scoring model with only right and wrong answers cannot express that difference, and a practical assessment that cannot express it is measuring recall rather than judgement.',
)}

${h2('Taking an assessment')}
${figure(
  '31-assessment-in-progress.png',
  'An assessment in progress',
  'The question draw and order are fixed on the server when the attempt is created, so a refresh cannot reshuffle into an easier paper. Answers autosave as they are chosen, which is also what makes an in-progress assessment submittable offline. The countdown is a display of a server-held <code>expiresAt</code>, not the authority on it: a submission after that instant is refused and still counts as an attempt, whatever the browser’s clock says.',
)}

${h2('Scoring')}
${p(`All scoring happens on the server inside the submission transaction.`)}
${ol([
  `The attempt is **claimed** with a conditional update on its in-progress status, so two concurrent submissions cannot both score.`,
  `Questions are marked against the stored bank. A multiple-answer question is correct only when the selected set matches exactly.`,
  `Practical scenarios are marked step by step, each step awarding <code>credit × marks</code>, and both the credit and the marks awarded are stored so the result stays explainable even if the scenario is later rewritten.`,
  `The two halves combine by <code>mcqWeight</code>: a weight of 1 means questions only, and any lower value gives the practical component its share.`,
  `The percentage is compared with the pass mark. On a pass, a certificate is issued and the enrolment advances.`,
  `The result is handed to the competency engine as assessment evidence — Chapter 17.`,
])}
${pre('final = mcqPercentage × mcqWeight + practicalPercentage × (1 − mcqWeight)', 'combining the two halves of an assessment')}

${h2('The result')}
${figure(
  '07-assessment-result.png',
  'The assessment result, showing the competency movement it caused',
  'This screen is where the platform differs most visibly from a conventional quiz result. The score is reported, and immediately beneath it the consequence: which competency moved, from what to what, and the arithmetic that produced it — here the blend of a previous level of 35% with an assessment of 84% giving 72%, rather than the 84% a system that overwrote the level would have shown. Review of the questions is available when the assessment allows it; correct answers are revealed only then, never during an attempt.',
)}

${h2('Integrity controls')}
${table(
  'How the assessment engine resists misuse',
  ['Risk', 'Control'],
  [
    ['A client reporting its own score', 'Impossible by construction: the submission payload carries option identifiers only, and the server marks against the bank.'],
    ['Reading the answers from the page', 'Correct answers are never sent to the browser during an attempt. Review data is returned after submission, and only when the assessment permits review.'],
    ['Submitting twice, or a dropped connection replaying a submission', 'A per-user unique idempotency key generated when the learner pressed submit. A replay returns the original result rather than consuming a second attempt.'],
    ['A race between two tabs', 'The conditional claim of the attempt row means exactly one submission can transition it out of the in-progress state.'],
    ['Extending the time limit by tampering with the clock', '<code>expiresAt</code> is set and checked on the server.'],
    ['Exhausting attempts by accident', 'The attempt cap is enforced server-side, and a refused late submission is reported as such rather than silently discarded.'],
  ],
  { widths: ['32%', '68%'] },
)}
${chapterClose}`;

export const ch17 = `${chapterOpen(17, 'Trainer Evaluation and the Competency Engine')}
${h2('Purpose')}
${p(
  `The competency engine is the single place where a competency level changes. Assessments, trainer evaluations and AR practicals all arrive here as evidence, and the level that comes out is a blend, recorded with the inputs that produced it.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('Trainer evaluation')}
${figure(
  '09-trainer-dashboard.png',
  'The trainer dashboard',
  'A trainer sees their own courses, the learners enrolled in them, attempts awaiting review and evaluations still to record. The scope rule — only trainees enrolled in this trainer’s own courses — is applied in the service layer, so it holds for the API as well as for this screen.',
)}
${figurePair(
  figure('36-trainer-trainees.png', 'Trainees, scoped to this trainer’s own courses', 'Each learner can be opened to their passport and their attempts, within the same scope rule.', { size: 'half' }),
  figure('37-trainer-evaluations.png', 'The weighted evaluation rubric', 'Five criteria, each rated 1 to 5, combined by weights that must sum to 1.', { size: 'half' }),
)}
${table(
  'The evaluation rubric and its default weights',
  ['Criterion', 'Default weight'],
  [
    ['Technical knowledge', '0.30'],
    ['Practical ability', '0.25'],
    ['Application of knowledge', '0.20'],
    ['Overall competency', '0.15'],
    ['Participation', '0.10'],
  ],
  { className: 'narrow', widths: ['62%', '38%'] },
)}
${p(
  `Each rating becomes a percentage and the criteria are combined by weight. Ratings of 4, 5, 3, 4 and 4 give 24 + 25 + 6 + 16 + 12 = **83.0**. The weights in force are stored with the evaluation, so retuning the rubric later never rewrites an old score. An evaluation may be recorded as a *practical* assessment instead, in which case it feeds the practical evidence source rather than the trainer-evaluation one.`,
)}

${h2('The update rule')}
${p(`Passing an exam does not set the competency to the exam score.`)}
${pre(
  `evidence = weighted average of the evidence that exists
           (assessment 0.60, trainer evaluation 0.25, practical 0.15 by default,
            renormalised over the sources actually present)

blended  = 0.25 × previous + 0.75 × evidence`,
  'the competency update',
)}
${p(`Then two guard-rails, both on by default and both switchable:`)}
${ul([
  `**No decrease.** A weak result never lowers an existing level. The history row says so: *"A weaker result does not lower an existing competency level."*`,
  `**Course ceiling.** A course cannot lift a learner beyond the level it certifies — the upper bound of its competency mapping. A ceiling below the current level never pulls the level down; it only stops further gain.`,
])}
${p(`The result is rounded to a whole number and clamped to 0 to 100.`)}
${table(
  'Worked examples, all reproducible with a calculator',
  ['Situation', 'Calculation', 'Result'],
  [
    ['Previous 35, assessment 84, no other evidence', 'evidence = 84; 0.25 × 35 + 0.75 × 84 = 71.75', '<strong>72</strong>'],
    ['Previous 72, assessment 90, trainer evaluation 80', 'evidence = (0.60 × 90 + 0.25 × 80) ÷ 0.85 = 87.06; 0.25 × 72 + 0.75 × 87.06 = 83.29', '<strong>83</strong>'],
    ['Previous 35, assessment 95, course mapped only to 75', 'blended = 80, capped at the course ceiling', '<strong>75</strong>'],
    ['Previous 80, assessment 60', 'blended = 65, but no-decrease applies', '<strong>80</strong>'],
    ['Previous 35, AR practical 80, no theory yet', 'the practical is the only evidence; 0.25 × 35 + 0.75 × 80', '<strong>69</strong>'],
  ],
  { widths: ['32%', '48%', '20%'] },
)}
${note(
  'Why blend at all',
  'A single assessment is one observation of a broad competency, taken under exam conditions on one day. Setting the level equal to it would make the record swing with every attempt and would treat a lucky paper as proof. Blending gives the record memory: a run of good evidence raises a level steadily, and one anomalous result moves it a little.',
)}

${h2('Which evidence counts')}
${p(
  `After each submitted attempt, each trainer evaluation and each completed AR practical, the engine gathers <em>all</em> currently valid evidence for every affected competency: the most recent passed assessment on any course mapped to that competency, the latest trainer evaluation, and the latest practical — where "practical" means <strong>the more recent of</strong> a trainer evaluation recorded as practical and a completed AR attempt. Everything must fall inside the evidence window, 365 days by default. A failed attempt moves nothing unless an administrator has switched that on.`,
)}
${warn(
  'A real bug found during rehearsal, and fixed',
  'Evidence targets were originally resolved by <em>union</em>: an event naming both a course and a list of competencies evidenced the course’s competencies <em>and</em> the named ones. Driving the AR lab end to end against the demonstration database exposed the consequence — a radar practical also credited Weather Forecasting, a competency the lab never tested. The resolution was narrowed so that naming competencies alongside a course <strong>restricts</strong> the set rather than extending it. The same defect affected trainer evaluations. A regression test now pins the behaviour.',
)}

${h2('History')}
${p(
  `Every change appends a <code>CompetencyHistory</code> row: the previous and new level, the source (baseline, assessment, trainer evaluation, practical or administrator adjustment), the course, attempt or evaluation responsible, and a <code>details</code> record holding the evidence components, the blend, the limiting rule that applied and the explanation sentence. The competency level, the history row and the attempt that triggered them are written in one transaction, so they cannot disagree. The passport timeline, the heatmap's change-over-time column and the trend forecast are all reads of this table.`,
)}

${h2('Engine settings')}
${figure(
  '14-engine-settings.png',
  'Engine settings, with the simulator that previews a change before it is saved',
  'Every number in this chapter is on this screen: the severity and priority thresholds, the previous-level weight, the evidence weights, the evidence window, the two switches for failed attempts and for decreases, the course ceiling, the rubric weights, and the decay, succession and readiness-index parameters. Input is validated — thresholds must strictly increase, rubric weights must sum to 1 — and the simulator shows the effect on one worked gap and one worked update before anything is stored. Because gaps and priorities are computed on read, a saved change applies everywhere at once; existing levels and history rows are never rewritten, and every change is audited. <em>Restore defaults</em> removes the stored override entirely.',
)}

${h2('Administrator adjustment')}
${p(
  `An administrator can record a baseline or correct a level directly. That is not a back door around the engine: it writes a history row with source <code>ADMIN_ADJUSTMENT</code> and an audit entry, so a manually set level is as traceable as a calculated one and is visibly different from it.`,
)}
${chapterClose}`;

export const ch18 = `${chapterOpen(18, 'Certification and Public Verification')}
${h2('Purpose')}
${p(
  `A certificate is the artefact that leaves the system. It has to survive being forwarded as a PDF, being checked by somebody with no account, and being checked after the underlying records have moved on.`,
)}
${p(`Status: ${status('IMPLEMENTED')}.`)}

${h2('Issue')}
${p(
  `A certificate is issued inside the submission transaction when an attempt passes — never as a separate step that could fail after the pass was recorded. It is unique per learner and course.`,
)}
${ul([
  `**It snapshots what it claims.** Holder name, course title, issuer and the competencies certified are copied into the certificate row. Editing the user or the course afterwards cannot silently change what an issued certificate says.`,
  `**It carries a public number.** A prefix, a year and eight characters from a 31-symbol alphabet — roughly 8.5 × 10¹¹ possibilities — and the verification endpoint is rate-limited against enumeration.`,
  `**It is signed.** An Ed25519 signature over a canonical payload, stored with the key identifier and the signing timestamp.`,
  `**It is rendered on demand.** PDFKit draws the document server-side, including the QR code that points at the public verification page. No headless browser is needed in the deployment.`,
])}
${note(
  'Graceful degradation, stated honestly',
  'If no signing key is configured, a certificate is still issued — simply unsigned. Verification then reports it as <strong>unsigned</strong>, not as valid. Reporting an unsigned certificate as valid would be the easy path and the dishonest one, so the verification result distinguishes four states: valid, revoked, tampered and unsigned, plus unverifiable when the stored key identifier is not one the server holds.',
)}

${h2('Public verification')}
${figure(
  '08-public-certificate-verification.png',
  'Public certificate verification, requiring no account',
  'This page is reachable by scanning the QR code on the PDF or by typing the number. The server recomputes the canonical payload from the certificate’s own snapshotted fields and checks it against the stored signature, so tampering with either the PDF or the underlying records is detectable. The response contains only what is printed on the certificate — holder, course, score, date, issuer — and nothing else about the person: no e-mail address, no employee identifier, no department, no other competency. It is the smallest disclosure that makes verification meaningful.',
)}

${h2('Revocation')}
${p(
  `An administrator can revoke a certificate and reinstate it. The public page reflects the change immediately, because it reads the live status rather than a cached copy, and both actions are audited. Revocation does not delete the certificate: the record remains, which is why the holder's history stays coherent and why a revoked certificate can be reported as revoked rather than as unknown.`,
)}

${h2('Verification states')}
${table(
  'What public verification can report, and what each state means',
  ['State', 'Meaning', 'Cause'],
  [
    ['Valid', 'The certificate exists, is not revoked, and its signature matches the recomputed payload.', 'The normal case.'],
    ['Revoked', 'The certificate exists but has been withdrawn by an administrator.', 'Administrative action, recorded in the audit log.'],
    ['Tampered', 'The certificate exists but the signature does not match the payload.', 'The stored record was altered outside the application.'],
    ['Unsigned', 'The certificate exists and is not revoked, but carries no signature.', 'It was issued while no signing key was configured.'],
    ['Unverifiable', 'A signature exists but the key that made it is not available to this server.', 'Key rotation without retaining the previous public key.'],
    ['Not found', 'No certificate with that number.', 'A mistyped or invented number. Rate-limited.'],
  ],
  { widths: ['14%', '46%', '40%'] },
)}
${chapterClose}`;
