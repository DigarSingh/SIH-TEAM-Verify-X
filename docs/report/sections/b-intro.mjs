/** Chapters 1-6: introduction, problem, existing systems, proposed system, feasibility, requirements. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, figure, note, warn, pre, chain, status } from '../kit.mjs';

export const ch1 = `${chapterOpen(1, 'Introduction')}
${h2('Background')}
${p(
  `The India Meteorological Department (IMD), under the Ministry of Earth Sciences, operates a national observation and forecasting network: Doppler weather radars, automatic weather stations, upper-air observatories, satellite reception, numerical models and a warning service that reaches state disaster authorities and the public. The department runs continuously, and its output is consumed at the moment a cyclone is approaching a coast or a cloudburst is developing over a hill station.`,
  `Operating that network is a skilled activity. A forecaster reading a Doppler velocity image has to distinguish a mesocyclone signature from range folding; a radar engineer has to know which subsystem a fault belongs to before dispatching a team; a duty officer has to apply the warning matrix correctly under time pressure. These are competencies, and they are the real assets of the organisation.`,
  `To build and maintain them, the department trains. Training is delivered through institutes, workshops, on-the-job attachment and online material, and it is recorded. The record, though, is a record of **attendance**: who enrolled, who completed, who received a certificate. That is what a learning management system is designed to store.`,
)}

${h2('The gap between attendance and capability')}
${p(
  `There is a real distance between "attended the radar course" and "can interpret a radar image under operational pressure today". Four things drive that distance apart.`,
)}
${ol([
  `**Completion is not competence.** A course covers a syllabus; a person absorbs part of it. A completion record cannot say which part.`,
  `**Competence is not permanent.** A skill not exercised fades. Somebody certified in cyclone warning procedure three monsoons ago, who has not been on cyclone duty since, is not where the certificate says they are.`,
  `**Requirements are per role, not per person.** What a Severe Weather Forecaster must be able to do is different from what a Radar Maintenance Engineer must be able to do. Without that mapping, a training record is a list without a yardstick.`,
  `**Theory is not practice.** Reading about a radar's receiver chain and identifying the receiver on the equipment are different abilities, and the second is the one the job needs.`,
])}
${p(
  `Every one of these is a measurement problem before it is a training problem. A department that cannot measure capability cannot target training, cannot plan for a hazard season, and cannot tell whether last year's training budget changed anything.`,
)}

${h2('What this project is')}
${p(
  `**Capacity Connect** is a web platform that changes the unit of account from the course to the **competency**, and then keeps that competency honest over time. It was built for Smart India Hackathon problem statement **SIH26075**.`,
  `The shift is small to state and large in its consequences. Instead of storing "Ananya Rao completed Radar Fundamentals on 12 March", the system stores "Ananya Rao holds Radar Meteorology at 72%, most recently evidenced by an assessment on 12 March and a practical on 19 March, against a role requirement of 80%". Everything else in the platform follows from being able to say that sentence and defend every number in it.`,
)}
${chain(['Role requirement', 'Skill gap', 'Recommended learning', 'Assessed evidence', 'Competency update', 'Certificate', 'Decay over time', 'Refresher'])}
${p(
  `The loop closes. A competency that fades is detected, a refresher is recommended, the refresher produces fresh evidence, and the competency returns. Nothing in that loop is a manual judgement recorded after the fact; each step is produced by code from the step before it, and the code shows its working.`,
)}

${h2('Scope of this report')}
${p(
  `This report documents the system that exists in the project repository. It was written after a full audit of the source: the Prisma schema, the registered API routes, every page component, the test suites and a running instance of the application. Where a capability is complete it is described and shown; where it is demonstration content, partly built, or built but not verified on real hardware, the report says so in those words.`,
)}
${table(
  'How capability is labelled throughout this report',
  ['Label', 'Meaning'],
  [
    [status('IMPLEMENTED'), 'Built, wired end to end, exercised by tests or by hand against a running system.'],
    [status('PARTIALLY IMPLEMENTED'), 'The core works; a named part of it is missing or narrower than the feature suggests.'],
    [status('SIMULATED'), 'The mechanism is real; the values it runs on are demonstration content, not institutional policy.'],
    [status('PLANNED'), 'Not built. Described only in the future-scope chapter.'],
    [status('NOT VERIFIED'), 'Written, but never executed in the environment it targets.'],
  ],
  { widths: ['28%', '72%'] },
)}
${note('Appendix A', 'carries the complete register: every feature in the system with its label and the evidence behind it.')}

${h2('Organisation of the report')}
${p(
  `Chapters 2 to 6 state the problem, review what existing systems do, set out the proposed solution and its requirements. Chapters 7 to 12 are the design: architecture, technology, database, data flow, use cases and sequence diagrams, all derived from the implementation rather than drawn beforehand. Chapters 13 to 24 describe each functional module in turn, with the screens that implement it. Chapters 25 to 27 cover the API surface, the security controls and the testing that was actually performed. Chapter 28 states the limitations honestly and closes. Appendices A to H hold the reference material.`,
)}
${chapterClose}`;

export const ch2 = `${chapterOpen(2, 'Problem Statement and Objectives')}
${h2('The problem statement')}
${p(
  `Smart India Hackathon problem statement **SIH26075**, from the Ministry of Earth Sciences, asks for a digital capacity building and learning management portal for the India Meteorological Department. The requirement, in the department's framing, is not merely to digitise course delivery. It is to connect training to capability: to know which competencies the workforce holds, where the shortfalls are, and what training would close them.`,
)}
${table(
  'The problem statement, restated as questions the system must answer',
  ['#', 'Question the organisation needs answered', 'What answering it requires'],
  [
    ['Q1', 'What must a person in this job role be able to do, and how well?', 'A competency framework with per-role required levels and importance.'],
    ['Q2', 'What can this person actually do today?', 'A verified competency level per person, derived from evidence rather than self-report.'],
    ['Q3', 'Where is the shortfall, and how much does it matter?', 'A gap calculation weighted by competency importance and role criticality.'],
    ['Q4', 'What should this person learn next?', 'Rule-based recommendation and a prerequisite-ordered learning path.'],
    ['Q5', 'Did the training work?', 'Assessment and evaluation that feed back into the competency level, with history.'],
    ['Q6', 'Can the certificate be trusted by someone outside the office that issued it?', 'Signed certificates with public verification.'],
    ['Q7', 'Is the capability still current?', 'A decay model, recertification tracking and practice records.'],
    ['Q8', 'Will the organisation be ready for the next cyclone season?', 'Readiness measured at a future date, without altering stored data.'],
    ['Q9', 'What happens when the one person who can do this retires?', 'Knowledge-continuity analysis over recorded levels and retirement dates.'],
    ['Q10', 'Can they do it, not just describe it?', 'Practical assessment on the instrument, feeding the same competency record.'],
    ['Q11', 'Can field staff use it where there is no network?', 'Offline-capable delivery with queued, idempotent writes.'],
    ['Q12', 'Where is the organisation as a whole short?', 'Workforce analytics: heatmap, ranked training needs, trend forecast.'],
  ],
  { widths: ['6%', '44%', '50%'] },
)}

${h2('Primary objective')}
${p(
  `To build a working platform in which **a competency level is never a claim, always a calculation** — traceable to dated evidence, recomputed when the evidence changes, and visible to the person it describes along with the arithmetic that produced it.`,
)}

${h2('Specific objectives')}
${ol([
  `Model the organisation: departments, job roles with a criticality rating, competencies, and the level and importance each role requires of each competency.`,
  `Compute skill gaps and a training priority that reflects both the size of the gap and how much it matters, and explain each in a sentence the employee can read.`,
  `Recommend courses and build a prerequisite-aware learning path from those gaps, deterministically, with the reason for every recommendation.`,
  `Deliver learning: courses, modules, materials of several kinds, enrolment, progress tracking.`,
  `Assess: timed assessments drawn from a question bank, scored on the server, plus scenario-based practical questions and a weighted trainer rubric.`,
  `Update competency from evidence by blending rather than overwriting, and record an append-only history of every change with its inputs.`,
  `Issue certificates as PDFs, sign them, and let anybody verify one from a QR code without an account.`,
  `Model competency decay as a function of time since practice, track recertification, and make both configurable per competency.`,
  `Support readiness planning: operational periods with their own requirements, measured at the date they begin, and the ability to recompute the whole workforce at any future date without writing anything.`,
  `Identify knowledge-continuity risk where too few people hold a competency, and support mentor pairing.`,
  `Assess practical ability on a three-dimensional instrument model, in augmented reality where the device supports it, and feed the result into the same competency engine.`,
  `Work offline for saved content, with queued writes that cannot be double-applied.`,
  `Give administrators workforce analytics: a competency heatmap, ranked training needs and a trend-based forecast.`,
  `Enforce access control, protect the data, and record an audit trail of everything that matters.`,
])}

${h2('Objectives deliberately excluded')}
${p(
  `Stating what the project does not attempt is part of stating what it does. The following were considered and left out, and none of them is claimed anywhere in this report.`,
)}
${ul([
  `**No predictive model of individual performance.** The engine is arithmetic on recorded evidence. It does not attempt to infer aptitude, predict who will fail, or rank people against each other.`,
  `**No prediction of who will leave.** Continuity analysis uses recorded retirement dates only; it does not forecast resignation.`,
  `**No claim of operational outcome.** The system has never been deployed in service, so no improvement in any real training or readiness measure is claimed.`,
  `**No replacement of human judgement in certification.** A trainer's evaluation is an input to the engine; the engine does not decide who is fit for duty.`,
])}
${chapterClose}`;

export const ch3 = `${chapterOpen(3, 'Study of Existing Systems')}
${h2('Approach')}
${p(
  `Existing systems were studied for what they measure and what they cannot measure, rather than for feature counts. Three categories are relevant: general-purpose learning management systems, corporate talent and competency suites, and the training arrangements typical of a government technical department.`,
)}

${h2('Learning management systems')}
${p(
  `Open-source and commercial learning management systems — Moodle, Open edX, Canvas and their equivalents — are mature at what they do: authoring, enrolment, delivery, quizzing, grading, certificates and reporting on course activity. Their data model is organised around the **course**. A learner has enrolments, attempts and completions; the strongest statement the system can make about a person is a list of completed courses with grades.`,
  `Competency support, where it exists, is usually a tagging layer: a course or an activity can be marked as relating to a competency, and a learner is marked as having "achieved" it when a rule fires. That achievement is a flag, not a measured level, and nothing degrades it with time. Plugins can extend this, but the underlying question the platform answers stays "what did this person do" rather than "what can this person do".`,
)}

${h2('Corporate talent and competency suites')}
${p(
  `Enterprise talent management suites — the learning and competency modules of large human-capital platforms — do model competencies with levels and job-role requirements, and do produce gap reports. They are the closest existing answer to this problem statement. Three things make them a poor fit here.`,
)}
${ul([
  `**The level is usually asserted, not derived.** Levels come from manager rating, self-assessment or an appraisal cycle. Where assessment feeds a level at all, it typically sets it rather than blending it with what was known before, and the calculation is rarely shown to the employee.`,
  `**Currency is handled as expiry, not decay.** A certification has an expiry date; until that date the person is fully qualified and after it they are not. Real skill fades continuously, and a binary expiry cannot express "this person is at 51% of a level they once held at 72%".`,
  `**Cost, hosting and fit.** Licensing per employee, cloud hosting outside the department's control, and a generic competency vocabulary that has to be bent to fit radar subsystems and warning procedures.`,
])}

${h2('Current practice in a technical government department')}
${p(
  `The arrangement this project is meant to replace is, characteristically, a set of disconnected records rather than a system: nomination registers and attendance sheets for institute courses, spreadsheets held by the training office, certificates issued on paper or as unsigned PDFs, and competency knowledge that lives in the judgement of senior staff rather than in any record. It works, in the sense that training happens, but it cannot answer questions Q2, Q3, Q7, Q8, Q9 or Q12 from Table 2.1 at all, and answers Q6 only by telephoning the issuing office.`,
)}

${h2('Comparison')}
${table(
  'What existing approaches measure',
  ['Capability', 'Records and spreadsheets', 'Learning management system', 'Talent suite', 'Capacity Connect'],
  [
    ['Course delivery and completion', 'Partly', 'Yes', 'Yes', 'Yes'],
    ['Per-role competency requirements', 'No', 'Rarely', 'Yes', 'Yes'],
    ['Competency level derived from assessed evidence', 'No', 'No', 'Sometimes, by overwrite', 'Yes, blended with history'],
    ['The calculation shown to the person', 'No', 'No', 'Rarely', 'Yes, as a sentence and its inputs'],
    ['Gap weighted by importance and role criticality', 'No', 'No', 'Sometimes', 'Yes'],
    ['Continuous decay of unused skill', 'No', 'No', 'Expiry dates only', 'Yes, half-life model'],
    ['Recompute the workforce at a future date', 'No', 'No', 'No', 'Yes, without writing anything'],
    ['Readiness for a named operational period', 'No', 'No', 'No', 'Yes, measured at its start date'],
    ['Knowledge-continuity risk', 'No', 'No', 'Sometimes', 'Yes, from levels and retirement dates'],
    ['Practical assessment on the instrument', 'In person only', 'No', 'No', 'Yes, AR / 3D, server-marked'],
    ['Public verification of a certificate', 'By telephone', 'Rarely', 'Sometimes', 'Yes, signed, QR, no sign-in'],
    ['Usable without a network', 'Paper', 'Rarely', 'Mobile app only', 'Yes, offline-first web app'],
  ],
  { className: 'compare', widths: ['28%', '16%', '18%', '18%', '20%'] },
)}

${h2('What was taken from each')}
${p(
  `The study was not only a search for shortcomings. The course, module, material, enrolment and question-bank model in this project follows learning-management convention closely, because that convention is sound and familiar to trainers. The job-role and requirement structure follows talent-suite practice. What is new here is the treatment of a competency level as a **derived, dated, decaying quantity** rather than a stored attribute, and the decision that every number must carry the sentence that explains it.`,
)}
${chapterClose}`;

export const ch4 = `${chapterOpen(4, 'Proposed System')}
${h2('The central idea')}
${p(
  `A learning management system records an event: a person completed a course. Capacity Connect records a **state**: a person holds a competency at a level, as of a date, on the strength of named evidence. Every feature in the platform is either a way of producing that state, a way of checking it, or a way of acting on it.`,
)}
${figure(
  'flow-comparison.svg',
  'The shift from a course-centred record to a competency-centred one',
  'Above: what a conventional learning management system stores — an enrolment that becomes a completion and a certificate, after which nothing changes. Below: what this system stores. A role requirement and a current level produce a gap; the gap drives learning; learning produces evidence; evidence updates the level through the engine; the level decays with time until fresh evidence resets it. The loop has no end state, which is the point.',
  { diagram: true, size: 'wide' },
)}

${h2('The nine capabilities')}
${p(
  `The proposed system is built from nine capabilities. Each is described in its own chapter later; this is the shape of the whole.`,
)}
${table(
  'The capabilities of the proposed system',
  ['#', 'Capability', 'What it produces', 'Chapter'],
  [
    ['1', 'Competency framework', 'Departments, job roles with criticality, competencies, per-role required levels and importance.', '14'],
    ['2', 'Skill-gap engine', 'Gap, severity, training priority and an explanation, per person per competency.', '14'],
    ['3', 'Learning delivery', 'Courses, modules, materials, enrolment, progress, recommendations and learning paths.', '15'],
    ['4', 'Assessment', 'Timed assessments from a question bank plus scenario-based practicals, scored on the server.', '16'],
    ['5', 'Competency engine', 'A new level blended from the previous level and all current evidence, with an append-only history.', '17'],
    ['6', 'Certification', 'Signed PDF certificates with a QR code and a public verification page.', '18'],
    ['7', 'Freshness', 'Decay as a function of time since practice, recertification tracking, readiness simulation.', '19'],
    ['8', 'Operational readiness', 'Readiness events measured at their start date, assignment of preparation, a headline index, continuity risk.', '20, 21'],
    ['9', 'Practical assessment in AR', 'A marked practical on a 3D instrument, combined with theory and fed to the engine.', '22'],
  ],
  { widths: ['5%', '20%', '62%', '13%'] },
)}

${h2('Four design decisions that shaped everything else')}
${h3('Decision 1: evidence blends, it does not overwrite')}
${p(
  `Scoring 84% on an assessment does not set the competency to 84. The engine blends the previous level with the current evidence:`,
)}
${pre('blended = 0.25 x previous + 0.75 x evidence', 'the update rule')}
${p(
  `A learner at 35% who scores 84% moves to 72%, not 84%. This is deliberate. A single assessment is one observation of a broad competency under exam conditions; treating it as the whole truth would make the record swing with each attempt. Blending also means the record has memory, so a run of good evidence raises a level steadily and one lucky result does not. The weight is an administrator setting, and both guard-rails — a weak result never lowers an existing level, and a course cannot certify beyond the level it teaches to — are switchable.`,
)}

${h3('Decision 2: decay is calculated, never stored')}
${p(
  `The obvious way to implement skill decay is a scheduled job that walks the workforce and reduces levels. It is also the wrong way: it destroys the verified level, it makes the record depend on whether the job ran, and it makes any question about a future date unanswerable. Instead the stored level is always the **verified baseline**, and the effective level is a pure function of the baseline, the policy and the date being asked about:`,
)}
${pre('effectiveLevel = baselineLevel x 0.5 ^ (daysSincePractice / halfLifeDays)', 'the decay function')}
${p(
  `Nothing is written. The consequence is that every readiness question becomes a query parameter: asking what the workforce looks like in ninety days is the same code path as asking what it looks like today, with a different date. Chapter 19 develops this.`,
)}

${h3('Decision 3: the server owns every score')}
${p(
  `The browser never computes, sends or is trusted with a score, a competency level or a completion. An assessment submission carries selected option identifiers; an AR practical submission carries the component keys the trainee tapped. The server marks both against data the client has never seen, applies the engine and returns the result. This is an integrity requirement, not a performance one: a training record that a determined user could edit from the developer console would be worthless as an operational record.`,
)}

${h3('Decision 4: deterministic engine, AI only at the edges')}
${p(
  `No part of a competency decision involves a language model. The engine is pure arithmetic in pure functions, unit-tested against worked examples, and reproducible by hand. The optional AI features — a course assistant, a quiz drafter, a study-plan explanation, plain-language search and a written briefing on the forecast — sit outside it. They can word a result the engine produced; they cannot produce one. Every AI response is validated against the database before it is used, and the features are off unless a key is configured.`,
)}
${warn('On novelty', 'No claim of being first is made anywhere in this report. Augmented reality in technical training, competency frameworks and skill-decay models all pre-date this project. What is offered as the contribution is the integration: one auditable path from an AR practical through to a competency level, a readiness projection and a refresher recommendation, in a single system.')}

${h2('Who uses it')}
${table(
  'The three access roles and what each does',
  ['Role', 'Primary use', 'Cannot'],
  [
    ['Trainee', 'See their passport, gaps and priorities; follow a learning path; take courses, assessments and AR practicals; hold certificates; work offline.', 'See another learner’s record, author content, or change any competency value.'],
    ['Trainer', 'Author courses, modules and assessments; monitor their own trainees; record weighted evaluations that feed the engine.', 'Touch another trainer’s course, or see trainees not enrolled with them.'],
    ['Administrator', 'Manage people, the framework and engine settings; run workforce analytics; plan readiness events; revoke certificates; read the audit log.', 'Bypass the audit trail, or alter history rows.'],
  ],
  { widths: ['14%', '54%', '32%'] },
)}
${note('A note on the word "role"', 'The system uses it for two different things, and keeps them strictly apart. The **access role** (trainee, trainer, administrator) decides permissions. The **job role** ("Severe Weather Forecaster") is an organisational designation that carries competency requirements. Nothing in the platform lets one influence the other.')}
${chapterClose}`;

export const ch5 = `${chapterOpen(5, 'Feasibility Study')}
${h2('Technical feasibility')}
${p(
  `The system is a three-tier web application: a React single-page app, a stateless Node.js API and PostgreSQL. Every component is mature, widely deployed and available under a permissive open-source licence. Nothing in the design requires a proprietary service, a message queue, a cache tier, a search cluster or a machine-learning runtime.`,
)}
${table(
  'Technical risks identified and how they were resolved',
  ['Risk', 'Assessment', 'Resolution in the built system'],
  [
    [
      'Augmented reality normally implies a native application and a game engine, which is beyond a project of this size.',
      'Real, and it would also have meant two more codebases and app-store distribution.',
      'Web AR through the WebXR-backed <code>&lt;model-viewer&gt;</code> component. No Unity, no Unreal, no native build. On a device without AR the same component renders an interactive 3D model, so the assessment is never blocked by hardware.',
    ],
    [
      'A licensed 3D model of a Doppler weather radar may not exist under terms this project can use.',
      'Confirmed: nothing suitable was found with a licence that could be relied on.',
      'An original low-poly model was generated by a script in this repository (<code>scripts/build-ar-models.mjs</code>), so its provenance is the repository itself. Documented in <code>docs/AR_ASSETS.md</code>.',
    ],
    [
      'Skill decay implemented as a scheduled recomputation would corrupt verified records and make future projection impossible.',
      'Real, and it was the first design that was tried on paper.',
      'Decay was made a pure function of a date. Nothing is stored, so projection is free and no record is ever damaged.',
    ],
    [
      'Offline work could produce duplicate submissions when a connection returns.',
      'Real, and costly: a duplicated assessment submission consumes an attempt.',
      'Every queued write carries an idempotency key generated at the moment the learner acted. The database enforces uniqueness per user, and a replay returns the original result.',
    ],
    [
      'A browser service worker replaying queued writes is hard to reason about and easy to get wrong.',
      'Real.',
      'The service worker handles GET requests only. Writes are queued and sent by the application itself, which owns ordering, retry, idempotency and what the learner is told.',
    ],
  ],
  { widths: ['28%', '26%', '46%'] },
)}

${h2('Economic feasibility')}
${p(
  `The software carries no licence cost. The running cost of a deployment is a virtual machine or container host for the API, a PostgreSQL instance, object storage for uploaded course material, and a TLS certificate — all of which a department of this size already operates. The AI features are optional and off by default, so no external API spend is incurred unless an operator deliberately enables them and supplies a key.`,
)}
${table(
  'Cost components',
  ['Component', 'Basis', 'Note'],
  [
    ['Application software', 'None', 'Open-source dependencies only; no per-seat licence.'],
    ['Compute', 'One or more small instances', 'The API is stateless, so capacity is added by running more instances behind a load balancer.'],
    ['Database', 'One PostgreSQL instance', 'A managed instance with point-in-time recovery is recommended.'],
    ['Object storage', 'Per gigabyte', 'Only for uploaded documents and video; an S3-compatible bucket or local disk.'],
    ['AI features', 'Per request, optional', 'Off unless a provider key is set. Usage is rate limited per user and audited.'],
  ],
  { widths: ['22%', '26%', '52%'] },
)}

${h2('Operational feasibility')}
${p(
  `Three groups have to adopt it. Trainees get a personal view that answers a question they actually have — what should I learn next, and why — rather than a compliance chore. Trainers get authoring tools and an evaluation rubric that is a structured version of the judgement they already exercise. The training office gets the analytics that are the reason to run the platform at all.`,
  `The competency framework is the real adoption cost. Somebody has to define the competencies, decide what each job role requires, set importance and criticality, and record baseline levels. The platform makes this as light as it can — the framework is editable in the interface, decay is opt-in per competency so an installation can ignore it entirely, and a competency with no policy behaves exactly as it would in a system without the feature — but the work is genuine and it is human work.`,
)}

${h2('Schedule feasibility')}
${p(
  `The system was built within the hackathon timeframe as a sequence of phases, each ending with a working system rather than a set of pieces to integrate later. The database schema grew through ten reviewed migrations rather than one large design, which is visible in the migration list in Appendix C and is the reason later features such as the AR lab could be added without disturbing the competency engine they feed.`,
)}

${h2('Legal and data-protection considerations')}
${ul([
  `**Personal data is minimised and listed.** Chapter 26 and the database documentation name every table that holds personal data. Public certificate verification exposes only what is printed on the certificate.`,
  `**No third party receives data by default.** The AI features are the only outbound path, they are off unless configured, and what each one sends is tabulated in Chapter 26 and shown to the user next to the feature.`,
  `**Asset provenance is documented.** The 3D model is original to this repository; every dependency and its licence is in the lockfile.`,
  `**The demonstration content is labelled.** Decay half-lives, readiness events and practical scenarios shipped with the seed are stored with an <code>isSimulation</code> flag and the interface says so wherever they appear. They are plausible training content, not IMD policy.`,
])}

${h2('Conclusion of the feasibility study')}
${p(
  `The project is technically, economically and operationally feasible, and the working system is the evidence. The remaining risks are not technical: they are the effort of populating a real competency framework, and the fact that container images and the scheduled-deployment path have been written but never executed, which Chapter 28 states plainly.`,
)}
${chapterClose}`;

export const ch6 = `${chapterOpen(6, 'Requirement Analysis')}
${h2('Method')}
${p(
  `Requirements were derived from the problem statement, from the twelve questions in Table 2.1, and from the study of existing systems. They are listed here in the form they were built to, and each functional requirement names the chapter where its implementation is described, so a reader can check any claim against the corresponding module chapter and the register in Appendix A.`,
)}

${h2('Functional requirements')}
${table(
  'Functional requirements and where each is implemented',
  ['ID', 'Requirement', 'Status', 'Chapter'],
  [
    ['FR-1', 'Register an account, subject to administrator approval and an optional e-mail-domain restriction.', status('IMPLEMENTED'), '13'],
    ['FR-2', 'Authenticate with a password policy, account lock-out, and sessions that an administrator can revoke.', status('IMPLEMENTED'), '13'],
    ['FR-3', 'Force a password change on an administrator-created or reset account before any other action.', status('IMPLEMENTED'), '13'],
    ['FR-4', 'Maintain departments, job roles with a criticality rating, and competencies.', status('IMPLEMENTED'), '14'],
    ['FR-5', 'Define, per job role, the required level and importance of each competency.', status('IMPLEMENTED'), '14'],
    ['FR-6', 'Hold a verified competency level per employee, with an append-only history of every change and its inputs.', status('IMPLEMENTED'), '14, 17'],
    ['FR-7', 'Compute gap, severity and training priority per employee per competency, each with a written explanation.', status('IMPLEMENTED'), '14'],
    ['FR-8', 'Recommend courses from the gaps and build a prerequisite-ordered learning path, showing every reason.', status('IMPLEMENTED'), '15'],
    ['FR-9', 'Author courses with modules and materials of several types, competency mappings and prerequisites, with a publish workflow.', status('IMPLEMENTED'), '15'],
    ['FR-10', 'Enrol, track module progress, and record course feedback.', status('IMPLEMENTED'), '15'],
    ['FR-11', 'Deliver timed assessments drawn from a question bank, with autosave, and score them on the server.', status('IMPLEMENTED'), '16'],
    ['FR-12', 'Support scenario-based practical questions with partial credit and an explanation after submission.', status('IMPLEMENTED'), '16'],
    ['FR-13', 'Record a weighted trainer evaluation against five criteria.', status('IMPLEMENTED'), '17'],
    ['FR-14', 'Update a competency by blending the previous level with all current evidence, under configurable guard-rails.', status('IMPLEMENTED'), '17'],
    ['FR-15', 'Expose every engine threshold and weight as an administrator setting, with a simulator that previews a change.', status('IMPLEMENTED'), '17'],
    ['FR-16', 'Issue a PDF certificate with a QR code on a pass, and verify it publicly without a sign-in.', status('IMPLEMENTED'), '18'],
    ['FR-17', 'Sign certificates cryptographically and report the signature state on verification.', status('IMPLEMENTED'), '18'],
    ['FR-18', 'Revoke and reinstate a certificate, with the public page reflecting the change.', status('IMPLEMENTED'), '18'],
    ['FR-19', 'Apply competency decay as a function of time since practice, configurable per competency and opt-in.', status('IMPLEMENTED'), '19'],
    ['FR-20', 'Track recertification separately from practice, and report an expired competency as expired whatever its level.', status('IMPLEMENTED'), '19'],
    ['FR-21', 'Recompute gaps, freshness and readiness at any future date without modifying stored data.', status('IMPLEMENTED'), '19'],
    ['FR-22', 'Maintain readiness events for operational periods and measure readiness at each event’s own start date.', status('IMPLEMENTED'), '20'],
    ['FR-23', 'Assign preparation to the people who are short for an event, idempotently.', status('IMPLEMENTED'), '20'],
    ['FR-24', 'Present an organisation-wide readiness index with its arithmetic shown, labelled as a demonstration metric.', status('IMPLEMENTED'), '20'],
    ['FR-25', 'Identify competencies held by too few people, using recorded levels and recorded retirement dates.', status('IMPLEMENTED'), '21'],
    ['FR-26', 'Pair a mentor with somebody developing a competency.', status('PARTIALLY IMPLEMENTED'), '21'],
    ['FR-27', 'Run a practical on a 3D instrument model, in AR where supported and as interactive 3D otherwise.', status('IMPLEMENTED'), '22'],
    ['FR-28', 'Mark the practical on the server and combine it with the theory result at a configurable weighting.', status('IMPLEMENTED'), '22'],
    ['FR-29', 'Apply the practical to the competency engine as practical evidence and reset that competency’s freshness.', status('IMPLEMENTED'), '22'],
    ['FR-30', 'Recommend a short AR refresher automatically when a competency has faded.', status('IMPLEMENTED'), '22'],
    ['FR-31', 'Install as a progressive web app and keep saved content usable with no network.', status('IMPLEMENTED'), '23'],
    ['FR-32', 'Queue work done offline and send it on reconnection, in order, without duplicating it.', status('IMPLEMENTED'), '23'],
    ['FR-33', 'Clear every device-held copy on sign-out.', status('IMPLEMENTED'), '23'],
    ['FR-34', 'Provide a competency heatmap by department or job role, with a freshness layer and change over time.', status('IMPLEMENTED'), '24'],
    ['FR-35', 'Rank organisation-wide training needs by aggregate demand and flag competencies with no course.', status('IMPLEMENTED'), '24'],
    ['FR-36', 'Forecast where each competency is heading from its own history, by calculation rather than by model.', status('IMPLEMENTED'), '24'],
    ['FR-37', 'Send in-app notifications and run scheduled reminders idempotently.', status('IMPLEMENTED'), '24'],
    ['FR-38', 'Record an append-only audit trail of security- and governance-relevant actions, searchable by an administrator.', status('IMPLEMENTED'), '24, 26'],
    ['FR-39', 'Offer optional AI assistance that can word a result but never produce one.', status('IMPLEMENTED'), '24'],
    ['FR-40', 'Deliver notifications by e-mail or SMS.', status('PLANNED'), '28'],
  ],
  { className: 'reqs', widths: ['7%', '65%', '17%', '11%'] },
)}
${note(
  'On FR-26',
  'Mentor pairing stores the pairing, its competency, its status and its dates, and surfaces it in the continuity view. It is a record of intent: the platform does not schedule sessions, track what was transferred, or evidence a competency from a mentorship. It is labelled partially implemented for that reason.',
)}

${h2('Non-functional requirements')}
${table(
  'Non-functional requirements',
  ['ID', 'Area', 'Requirement', 'How it is met'],
  [
    ['NFR-1', 'Explainability', 'Every number shown to a user must be reproducible by hand from its inputs.', 'The engine is pure functions with no randomness and no model; each result carries the sentence that explains it.'],
    ['NFR-2', 'Auditability', 'Every change to a competency and every governance action must be recoverable after the fact.', 'Append-only <code>CompetencyHistory</code> and <code>AuditLog</code>; history rows carry the formula inputs.'],
    ['NFR-3', 'Integrity', 'A client must not be able to influence a score, a level or a completion.', 'All marking is server-side; requests are validated by strict schemas; the database enforces value ranges with CHECK constraints.'],
    ['NFR-4', 'Security', 'Authentication, authorisation and data protection appropriate to staff records.', 'Chapter 26 in full: Argon2id, HttpOnly cookies with refresh rotation and reuse detection, per-route and per-record authorisation, CSRF, CSP, rate limits.'],
    ['NFR-5', 'Consistency', 'A scored attempt, the competency it changes and its history row must never disagree.', 'One database transaction, with the attempt claimed by a conditional update so a double submit cannot score twice.'],
    ['NFR-6', 'Availability under poor connectivity', 'Saved learning must work with no network.', 'Offline-first progressive web app with an idempotent mutation queue.'],
    ['NFR-7', 'Accessibility', 'Usable with a keyboard and a screen reader.', 'Semantic landmarks, labelled controls, focus-managed dialogs, live regions, WCAG AA text contrast; an automated axe-core scan of 31 screens came back clean.'],
    ['NFR-8', 'Portability', 'No dependency on a proprietary platform.', 'Node.js, PostgreSQL, standard web APIs; storage behind an interface with disk and S3 implementations.'],
    ['NFR-9', 'Scalability', 'Capacity added without redesign.', 'The API is stateless; sessions live in cookies and the database. Known limit: rate-limit counters are per instance.'],
    ['NFR-10', 'Maintainability', 'A change must have an obvious home.', 'One folder per feature with the same three layers (routes, service, schemas); the engine is separate from both HTTP and the database.'],
    ['NFR-11', 'Documentation fidelity', 'Documentation must not drift from the code.', '<code>npm run routes -- --check</code> fails the build when the API reference and the registered routes disagree.'],
    ['NFR-12', 'Graceful degradation', 'A missing capability must narrow the system, not break it.', 'No AI key disables the AI endpoints only; no signing key leaves certificates unsigned and says so; no AR support falls back to 3D; decay is inert without a policy.'],
  ],
  { widths: ['7%', '15%', '34%', '44%'] },
)}

${h2('Constraints')}
${ul([
  `**No native application.** Delivery is a web application; AR had to be achieved in the browser.`,
  `**No game engine.** Unity and Unreal were excluded, so the 3D pipeline is glTF and <code>&lt;model-viewer&gt;</code>.`,
  `**No reliance on a licensed 3D asset.** The instrument model had to be original.`,
  `**No AI in a decision path.** Generative features may present a result; they may never compute one.`,
  `**Development environment.** The system was developed on Windows without Docker available, which is why the container images in the repository have never been built. This is stated again in Chapter 28.`,
])}

${h2('Assumptions')}
${ul([
  `An administrator populates the competency framework; the platform does not infer competencies from course text.`,
  `Retirement dates, where continuity analysis uses them, come from the personnel record and are treated as recorded facts, not predictions.`,
  `Trainers evaluate honestly; the rubric structures the judgement and records the weights in force, but does not audit it.`,
  `Learners take assessments themselves. There is no proctoring, and Chapter 28 lists it as future work.`,
])}
${chapterClose}`;
