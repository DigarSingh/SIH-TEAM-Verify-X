/** Chapters 19-24: decay, operational readiness, succession, the AR lab, offline, analytics. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, figure, figurePair, note, warn, pre, chain, status } from '../kit.mjs';

export const ch19 = `${chapterOpen(19, 'Competency Decay and Recertification')}
${h2('Purpose')}
${p(
  `A competency verified three years ago is a historical fact, not a present capability. This module makes that distinction operational: the question the platform answers moves from *"did this person once demonstrate the skill?"* to *"can they demonstrate it now?"*.`,
)}
${p(`Status: ${status('IMPLEMENTED')}. The half-lives and intervals in the demonstration database are ${status('SIMULATED')} — see the warning below.`)}

${h2('The model')}
${pre('effectiveLevel = baselineLevel × 0.5 ^ (daysSincePractice ÷ halfLifeDays)', 'exponential decay, clamped to 0..100')}
${p(
  `One half-life costs half the level. Exponential decay was chosen over a linear model because forgetting is fastest immediately after learning and slows thereafter, and because a linear model reaches zero at an arbitrary date whereas an exponential one approaches it asymptotically, which is the more defensible claim about a skill somebody once held.`,
)}
${table(
  'A level of 72% with a 180-day half-life',
  ['Days since practice', '0', '90', '180', '270', '360'],
  [['Effective level', '72', '51', '36', '25', '18']],
  { className: 'narrow' },
)}
${p(`The worked example from the problem brief: 72 × 0.5^(90/180) = 72 × 0.7071 = 50.9, so **51%**.`)}

${h2('The decision that made everything else possible')}
${warn(
  'Nothing is stored',
  '<code>EmployeeCompetency.currentLevel</code> always holds the <strong>verified baseline</strong> — the level the competency engine recorded from evidence. The effective level is derived on every read from the policy and the date being asked about. No scheduled job walks the workforce reducing levels, and no timestamp is ever mutated by a readiness query.',
)}
${p(`Three consequences follow, and they are the reason this design was chosen over the obvious one.`)}
${ol([
  `**A decayed competency is never destroyed.** Practise it and the full verified level returns immediately, because the baseline was never touched.`,
  `**Any future date is answerable.** Asking what the workforce looks like in ninety days runs exactly the same code as asking what it looks like today, with a different date. The projection is not a separate model that could disagree with the live figures.`,
  `**The record never depends on whether a job ran.** A system that decays by scheduled write is wrong in a different way every time the scheduler is down.`,
])}

${h2('Two dates, because practising and proving are different')}
${table(
  'What resets what',
  ['Date', 'Set by', 'Effect'],
  [
    ['<code>lastPracticedAt</code>', 'A practice record, a course completion, an assessment, a completed AR practical.', 'Resets <strong>decay</strong>: the effective level stops falling.'],
    ['<code>lastEvidenceAt</code>', 'An assessment, trainer evaluation or practical that the engine accepted as evidence.', 'Resets <strong>recertification</strong>: the competency counts as verified again.'],
  ],
  { widths: ['22%', '42%', '36%'] },
)}
${p(
  `Practice keeps a competency usable; only assessed evidence makes it verified. A competency can therefore be freshly practised and still expire — which is exactly the situation recertification exists to catch, and a single-date model could not express it.`,
)}

${h2('Freshness status')}
${table(
  'Status, evaluated in this order',
  ['Status', 'When'],
  [
    ['<code>EXPIRED</code>', 'The recertification date has passed. An unverified competency is not a demonstrated one, whatever its level.'],
    ['<code>CRITICAL</code>', 'Below the competency’s minimum safe level, or decay has cost at or beyond the critical threshold while leaving a shortfall.'],
    ['<code>AT_RISK</code>', 'Decay has cost at or beyond the at-risk threshold (15 points by default) and left a shortfall.'],
    ['<code>WATCH</code>', 'Any smaller gap, or recertification falling due within the watch window (30 days by default).'],
    ['<code>CURRENT</code>', 'Meets the requirement and is not near recertification.'],
  ],
  { widths: ['18%', '82%'] },
)}
${p(
  `Criticality tightens the critical threshold: criticality 1 leaves it alone and criticality 5 tightens it by the configured weight, so the same 30-point loss is critical on a mission-critical competency and merely at risk elsewhere.`,
)}
${note(
  'What the thresholds are applied to, and why it matters',
  'The at-risk and critical thresholds measure <strong>how much decay has cost</strong>, not the size of the shortfall. Somebody 25 points below their role requirement who has lost 5 points to decay has a <em>training gap</em> with a little decay on top — the skill-gap engine already reports that, with its own severity and priority. Somebody who has lost 21 points is actively losing a capability they once demonstrated, and only that is a freshness risk. Applying these thresholds to the total gap instead would double-count every training need and drown the one signal this view exists to give. A shortfall still has to be real, though: decay that has not yet taken anyone below what their role needs is <em>Watch</em>, not a warning.',
)}

${h2('Opt-in configuration')}
${p(
  `Freshness is configured per competency, and it is off unless configured. A competency with no <code>CompetencyDecayPolicy</code> row does not decay, does not expire and has no minimum safe level, so an installation that has not thought about freshness behaves exactly as it would in a system without the feature. An administrator sets, per competency: whether decay applies, the half-life, the minimum safe level, the recertification interval (zero switches it off) and the criticality. A single global switch turns the whole feature off in one place.`,
)}

${h2('The trainee view')}
${figure(
  '22-my-readiness.png',
  'My Readiness: what has faded, what needs recertifying, what is needed next',
  'The employee’s own freshness view. Each competency carries the sentence that explains its status — for example <em>"Last practised 90 days ago. With a configured half-life of 180 days, the recorded 72% has decayed to an effective 51%. Your role requires 80%, so there is a gap of 29 points."</em> The simulation control at the top is the same "time travel" the administrator has, scoped to this person: a trainee can ask what their own record will look like at the start of the next cyclone season and see which competencies will have lapsed by then.',
)}

${h2('Readiness simulation')}
${p(`Because the effective level is a pure function of a date, every read-only endpoint that reports freshness accepts the date to answer for.`)}
${pre(
  `GET /api/skill-gaps/me?offsetDays=90
GET /api/skill-gaps/me?asOf=2027-01-15T00:00:00Z`,
  'the same endpoint, asked about a different date',
)}
${p(
  `The response recalculates decay, recertification, gaps and training priorities for that date, and reports the date it used together with <code>simulated: true</code> so no consumer can mistake a projection for a present figure. **No stored timestamp is modified**, which is why the feature is safe to hand to anybody. Requests are bounded by a configurable maximum horizon (five years by default) and a date the engine cannot answer for is refused rather than guessed at.`,
)}
${p(
  `This is what lets a reviewer ask *"who will be unready for the cyclone season?"* and get the answer from the same code that produces today's numbers, rather than from a separate projection that could drift away from it.`,
)}
${warn(
  'The demonstration values are not policy',
  'Every half-life, minimum safe level and recertification interval in the seeded database is plausible training content written for this project. None of it is approved IMD policy. Each policy row is stored with <code>isSimulation</code> set, and the interface labels it wherever it appears.',
)}
${chapterClose}`;

export const ch20 = `${chapterOpen(20, 'Operational Readiness Engine')}
${h2('Purpose')}
${p(
  `Decay makes it possible to ask whether an individual is current. This module asks the organisational question: *will we be ready when the season starts?* — where "the season" is a named period with its own competency requirements and its own start date.`,
)}
${p(`Status: ${status('IMPLEMENTED')}. The readiness index is a demonstration metric, and the seeded events are ${status('SIMULATED')}.`)}

${h2('Readiness events')}
${p(
  `A readiness event is an operational period to prepare for: a cyclone season, a monsoon onset, a radar commissioning. It carries a hazard type, a start and end date, a priority and a status, and it may be scoped to particular departments — with no departments named, it applies to the whole active workforce.`,
)}
${figure(
  '18-readiness-calendar.png',
  'The readiness calendar: operational periods, each measured at its own start date',
  'The calendar is the planning surface. Each event shows its hazard type, its window and how ready the affected workforce is — and the crucial detail is that each event is measured <strong>at its own start date</strong>, not today. An event three months away is evaluated against the competency levels people will hold three months from now, after decay. That is the only measurement that answers the question a planner is actually asking.',
)}

${h2('How readiness is computed')}
${p(`For one person against one event, readiness is the importance-weighted share of the event's requirements that are met at the event's start date.`)}
${pre(
  `readiness = Σ importance × min(effectiveLevel, requiredLevel)
            ─────────────────────────────────  × 100
                Σ importance × requiredLevel`,
  'personal readiness for one event',
)}
${p(`The state, however, is not read off that percentage, because being ready on average is not being ready:`)}
${table(
  'Personal readiness states',
  ['State', 'When'],
  [
    ['<code>READY</code>', 'Every competency the event depends on is met.'],
    ['<code>CRITICAL</code>', 'There is a shortfall, and at least one of the competencies involved is critical or expired.'],
    ['<code>AT_RISK</code>', 'There is a shortfall, and at least one competency is at risk.'],
    ['<code>NEEDS_PREPARATION</code>', 'There is a shortfall, but nothing has decayed dangerously — it is a training gap, not a freshness problem.'],
  ],
  { widths: ['24%', '76%'] },
)}
${p(
  `Each person gets the sentence that explains their state, naming up to three competencies they are short on with the figures: *"… is at 68% of what this event needs. Short on: Radar Meteorology (51% against 80% needed), Cyclone Warning (62% against 75% needed)."* Aggregated across everybody the event applies to, the platform reports how many are fully ready, how many need preparation, the average readiness, and which competencies are holding the organisation back, worst first.`,
)}

${h2('Readiness sprints')}
${figure(
  '19-readiness-sprint.png',
  'A readiness sprint: who is short, on what, measured at the event’s start date',
  'From here the training office assigns preparation to the people who are short. Assignment is idempotent — unique per event, person and competency — so running the assignment again after the roster changes tops up the list rather than duplicating it. Each assignment moves through assigned, in progress, completed or waived, and the <em>waived</em> state exists because a planner sometimes has a reason the system does not know about, and recording that is better than leaving a permanent false shortfall.',
)}
${note(
  'A performance note',
  'The event readiness endpoint originally returned every person’s full requirement breakdown regardless of what the screen needed. Trimming the payload to what the view actually renders reduced it by about 61% with no change to the figures. The full breakdown is still available when a single person is opened.',
)}

${h2('The Operational Readiness index')}
${figure(
  '17-operational-readiness.png',
  'The Operational Readiness dashboard: the index with its arithmetic on show, and the simulation control',
  'One headline number for the organisation, and — deliberately — the whole calculation printed underneath it. The simulation control at the top right recomputes everything on this page for a future date without writing anything. The label marking this a demonstration metric is not a disclaimer added to the page; it is attached to the metric in the code that produces it.',
)}
${pre(
  `index = coverage × wCoverage + freshness × wFreshness + continuity × wContinuity
        − criticalGapPenalty`,
  'the readiness index',
)}
${table(
  'The four components',
  ['Component', 'Definition'],
  [
    ['Coverage', 'Σ min(effective, required) ÷ Σ required across every role requirement in the organisation, on a 0 to 100 scale.'],
    ['Freshness', 'The share of competency records that are current, counting <em>watch</em> as half — still usable, but needing attention.'],
    ['Continuity', 'The share of competencies whose knowledge-loss risk is low, again counting <em>watch</em> as half.'],
    ['Critical-gap penalty', 'A deduction proportional to the share of role requirements whose gap is critical, capped at a configured maximum.'],
  ],
  { widths: ['22%', '78%'] },
)}
${p(
  `The penalty exists because an average hides exactly the thing a readiness figure must not hide. An organisation with a handful of critical holes is not "mostly ready", and a weighted mean would report it as such. Bands are Strong, Adequate, Fragile and At risk, all configurable.`,
)}
${warn(
  'This is a demonstration metric, and the demonstration data scores badly',
  'Against the seeded database the index currently reads in the low fifties — the <em>Fragile</em> band. That is not a defect: the demonstration data was written to contain real gaps, decayed competencies and thin continuity so that every feature in this report has something to show. An organisation that had none of those would produce a high index and an uninteresting screenshot. The number is reported exactly as the code computes it, with its arithmetic visible, and it is labelled a demonstration metric wherever it appears. It is <strong>not</strong> an official IMD operational readiness measure, and no claim is made that it corresponds to one.',
)}
${chapterClose}`;

export const ch21 = `${chapterOpen(21, 'Succession and Knowledge Continuity')}
${h2('Purpose')}
${p(
  `Some competencies are held by one person. That is invisible in an average and catastrophic on the day they leave. This module finds those competencies before the day arrives.`,
)}
${p(`Status: ${status('IMPLEMENTED')}; mentor pairing is ${status('PARTIALLY IMPLEMENTED')}.`)}

${h2('What it analyses')}
${p(
  `For each competency, the workforce is divided by effective level at the analysed date — which means decay is already applied, so somebody whose expertise has lapsed does not count as cover.`,
)}
${table(
  'The categories',
  ['Category', 'Definition'],
  [
    ['Experts', 'People at or above the configured expert level.'],
    ['Leaving experts', 'Experts whose <strong>recorded</strong> retirement date falls inside the configured window — or has already passed.'],
    ['Remaining experts', 'Experts expected to still be here: experts minus leaving experts.'],
    ['Developing', 'People above the developing level but not yet expert — the pipeline.'],
    ['Minimum experts', 'How many experts the configuration says this competency should have. Criticality raises the bar: a mission-critical competency requires additional cover.'],
  ],
  { widths: ['22%', '78%'] },
)}

${h2('Risk classification')}
${table(
  'How continuity risk is decided',
  ['Risk', 'Condition'],
  [
    ['<code>CRITICAL</code>', 'No remaining experts at all — the worst case, regardless of anything else. Or: a shortfall against the minimum on a mission-critical competency with <em>nobody</em> developing.'],
    ['<code>HIGH</code>', 'Remaining experts are fewer than the minimum.'],
    ['<code>WATCH</code>', 'The minimum is met exactly, or somebody is leaving.'],
    ['<code>LOW</code>', 'Comfortably above the minimum with nobody leaving.'],
  ],
  { widths: ['16%', '84%'] },
)}
${p(`Each classification carries its explanation: how many people reach the expert level, how many are leaving, how many are coming through, and what the minimum is for a competency of this criticality.`)}
${figure(
  '20-knowledge-continuity.png',
  'Knowledge continuity: where too few people hold a competency',
  'Competencies ranked by continuity risk, each expandable to the individuals behind the figure — who the experts are, which of them are inside the retirement window, and who is developing. The action the screen supports is pairing a mentor with somebody developing the competency. Like everything else derived from freshness, this analysis accepts a date, so a planner can ask what the continuity picture looks like after the next round of retirements.',
)}

${h2('What this is not')}
${warn(
  'It reports a configured risk; it does not predict who will leave',
  'The analysis uses <strong>recorded</strong> retirement dates from the personnel record. It does not model resignation, transfer, promotion or recruitment, and it makes no probabilistic claim of any kind. It answers "given what we have recorded, where is the organisation thin?" — which is a question about the present state of the record, not a forecast.',
)}

${h2('Mentorship')}
${p(
  `A mentorship pairs an expert with somebody developing a named competency, and carries a status through not started, active, completed and cancelled.`,
)}
${p(
  `It is labelled **partially implemented** deliberately. The platform stores the pairing and surfaces it in the continuity view, and that is all it does: it does not schedule sessions, record what was covered, track hours, or produce competency evidence from a completed mentorship. A mentorship is a record of intent, and the report does not describe it as more than that.`,
)}
${chapterClose}`;

export const ch22 = `${chapterOpen(22, 'The AR Instrument Lab')}
${h2('Purpose and the integration requirement')}
${p(
  `Reading about a radar's receiver chain and identifying the receiver on the equipment are different abilities, and the second is the one operational work needs. The AR Instrument Lab assesses that second ability.`,
  `The requirement that shaped the module was not the augmented reality. It was that the lab must not be a standalone demonstration. A practical had to travel the whole distance:`,
)}
${chain(['Course', 'AR practical', 'Practical score', 'Combined with theory', 'Competency engine', 'Competency update', 'Certification', 'Decay', 'AR refresher'], { vertical: false })}
${p(`Status: ${status('IMPLEMENTED')}. AR placement is confirmed on a real Android phone; the desktop 3D fallback is ${status('NOT VERIFIED')} by hand — see the verification section at the end of this chapter.`)}

${h2('The lab')}
${figure(
  '23-ar-instrument-lab.png',
  'The AR Instrument Lab: each lab listed with the competency it develops',
  'Two modules are seeded: the full Doppler Radar Lab and a five-minute Radar Refresher. Each names the competency it develops and the course it is attached to, so a lab is never an activity in isolation — it is a way of producing evidence for a specific competency. The heavy 3D asset is <strong>not</strong> loaded on this page, nor on any dashboard; it loads only when a lab is opened.',
)}
${figure(
  '24-ar-doppler-radar.png',
  'The Doppler Radar Lab in guided training, captured on a desktop',
  'This screenshot was taken on a desktop, which is why it shows the <strong>interactive 3D fallback</strong> and the notice that AR is unavailable on this device. On an Android phone the same screen offers "View in AR" and places the radar on the floor in front of the trainee. The numbered markers are real, focusable HTML buttons positioned in model space rather than hit-tested pixels on a canvas, so they are reachable by keyboard and announced by a screen reader. "See inside" hides the radome so the antenna within it can be identified.',
)}
${figure(
  '34-ar-assessment-mode.png',
  'The same lab in assessment mode',
  'The difference from the previous figure is the whole design of the module. In training, tasks carry hints and nothing is scored. In assessment, the markers are numbered but <strong>unlabelled</strong>, there are no hints, and the answers are not present in the browser at all: <code>correctComponentId</code> never leaves the server while an attempt is open. The trainee taps a marker; the browser records which component key was tapped, and that is the entirety of what it sends.',
)}

${h2('The 3D model')}
${p(
  `No Doppler weather radar model was found under a licence that could be relied on for a government training platform — the licence is typically unstated, inherited, or "free for personal use". Rather than ship an asset whose provenance could not be defended, the model is **generated by a script in this repository**.`,
)}
${table(
  'The generated model',
  ['Property', 'Value'],
  [
    ['Source', '<code>scripts/build-ar-models.mjs</code> — a pure-Node glTF encoder written for this project (JSON chunk plus binary chunk, accessors, buffer views, one material per part).'],
    ['Licence', 'Original work, the same terms as this repository. Nothing was downloaded.'],
    ['File', '<code>frontend/public/models/doppler-radar.glb</code>, about 55 KB'],
    ['Geometry', '2,316 triangles, 1,505 vertices, about 1.2 metres tall in glTF units'],
    ['Parts', '8 nodes, one material each: <code>base</code>, <code>controlUnit</code>, <code>tower</code>, <code>platform</code>, <code>receiver</code>, <code>rotator</code>, <code>antenna</code>, <code>radome</code>'],
    ['Textures', 'None — flat physically-based materials only, so there is nothing to download or decompress'],
    ['Reproducible', 'Yes. <code>npm run build:models</code> regenerates a byte-identical file.'],
  ],
  { widths: ['18%', '82%'] },
)}
${note(
  'A schematic model is better teaching material than a photoreal one',
  'One named node and one material per component means the application can tint <em>exactly</em> the part a trainee has to identify, and the parts map one-to-one onto the <code>ARComponent</code> rows that drive the lesson. A photoreal mesh would be a single surface with no addressable structure. The model is a schematic representation and is documented as <strong>not</strong> a model of any specific IMD installation or any manufacturer’s product.',
)}

${h2('Tasks and phases')}
${table(
  'The two seeded modules',
  ['Module', 'Kind', 'Components', 'Training tasks', 'Assessment tasks', 'Theory weight', 'Pass mark'],
  [
    ['Doppler Radar Lab', 'Full lab', '8', '4', '5', '0.4', '70%'],
    ['Radar Refresher', 'Refresher', '8', '1', '3', '0 (practical only)', '70%'],
  ],
  { className: 'narrow' },
)}
${p(
  `The refresher's theory weight of zero is deliberate: a refresher exists to re-establish practical currency, and requiring a theory paper to accompany it would defeat the point of a five-minute intervention.`,
)}

${h2('Scoring, and where it happens')}
${p(`Marking is entirely server-side. The submission carries the component keys the trainee selected and an idempotency key, and nothing else.`)}
${pre('combined = theory × theoryWeight + practical × (1 − theoryWeight)', 'combining practical and theory')}
${ol([
  `The submission is checked against <code>(userId, idempotencyKey)</code>. A replay returns the original result.`,
  `Each response is marked against <code>ARTask.correctComponentId</code>, giving the practical percentage from the points.`,
  `The most recent **passed** theory attempt for the linked course is looked up and snapshotted onto the attempt.`,
  `The two are combined at the module's weighting. **With no theory result, the practical stands alone** rather than being penalised for a paper the trainee has not yet taken.`,
  `In one transaction: a practice record is written (resetting the competency's decay clock), and the practical is applied to the competency engine as practical evidence, which blends it with the previous level and writes a history row.`,
])}
${figure(
  '35-ar-practical-result.png',
  'The AR practical result, with the weighting and the competency movement written out',
  'Per-task feedback, the practical percentage, the theory percentage it was combined with, the weighting that combined them, and the competency movement that resulted — all shown as arithmetic rather than as a verdict. The competency before and after are stored on the attempt itself, so a trainer can later see exactly what this practical changed.',
)}

${h2('How the lab reaches the competency engine')}
${p(
  `This is the integration the module exists for, and it was achieved by **widening an existing concept rather than adding a parallel one**. The engine already understood "practical evidence", which previously meant a trainer evaluation recorded as practical. That lookup was widened to take *the more recent of* a trainer evaluation of that type and a completed AR attempt.`,
)}
${p(
  `Nothing else changed. The blend rules, the guard-rails, the evidence window, the history row and the transaction are the ones described in Chapter 17. An AR practical is not a special case in the engine — it is simply another dated piece of practical evidence, which is why it interacts correctly with everything else without a single rule written specially for it.`,
)}
${warn(
  'The browser never computes a competency value',
  'This was a hard constraint on the module. The frontend does not calculate a score, does not decide whether a task was correct, and does not update a competency. It reports which component was tapped. Every figure in the result screenshot above was computed on the server from data the browser never held.',
)}

${h2('Closing the loop: the refresher')}
${p(
  `When the freshness engine reports a competency as at risk or critical, and an AR refresher exists for that competency, the platform recommends it automatically on the trainee's dashboard. Completing the refresher records fresh practical evidence and resets the competency's freshness — and the loop closes. The recommendation is produced by the same decay calculation described in Chapter 19, so it appears exactly when the freshness view says it should, and disappears when the refresher has been taken.`,
)}

${h2('Administrator view')}
${figure(
  '21-ar-practical-analytics.png',
  'AR practical performance: score distribution, hardest tasks, and the competency gain the labs produced',
  'The value of this screen to a training office is the third column. It is not "how many people completed the lab" but "how much competency movement did the lab actually cause" — which is answerable only because every attempt stores the competency before and after. The hardest-tasks breakdown is the feedback loop for the lab author: a task that almost everybody fails is either badly worded or teaching something the training phase did not cover.',
)}

${h2('Accessibility and fallback')}
${table(
  'Device support',
  ['Device', 'Behaviour'],
  [
    ['Android phone with WebXR (Chrome)', 'Full AR: the camera starts, a surface is detected, and the radar is placed in the room at roughly life scale.'],
    ['Other phones and tablets', 'Interactive 3D: orbit, pan and zoom on the model. The assessment is identical.'],
    ['Desktop and laptop', 'Interactive 3D, with a notice explaining that AR is unavailable on this device rather than a silent failure.'],
    ['No WebGL at all', 'The viewer reports that it could not load rather than showing a blank area, and the page around it still functions.'],
  ],
  { widths: ['30%', '70%'] },
)}
${p(
  `The viewer distinguishes five loading states and seven AR states, so every failure has its own message — the library failing to load, the model failing to load, AR being unsupported, permission being denied, a surface not yet detected. A trainee is never left looking at an empty box.`,
)}
${note(
  'Hotspots are real HTML',
  'The markers are <code>&lt;button&gt;</code> elements positioned in model space by <code>&lt;model-viewer&gt;</code>, not hit-tested points on a canvas. They therefore receive keyboard focus, are announced by a screen reader, and work with the browser’s own zoom. A canvas raycast would have been simpler to write and unusable without a pointing device.',
)}

${h2('What was verified, and what was not')}
${table(
  'Verification status of the AR module',
  ['Aspect', 'Status', 'Evidence'],
  [
    ['Server-side marking, weighting, competency update, refresher recommendation', status('IMPLEMENTED'), 'Covered end to end by the integration suite against a real database.'],
    ['AR placement on a real Android phone in Chrome', status('IMPLEMENTED'), 'Confirmed by hand: the camera starts, a surface is detected, the radar is placed.'],
    ['The 3D viewer rendering under test', status('NOT VERIFIED'), 'The test environment has no WebGL, so the automated tests cover the screens around the viewer rather than the rendering itself.'],
    ['The desktop 3D fallback clicked through by hand', status('NOT VERIFIED'), 'Screenshots of it exist, captured with a software renderer; it has not been exercised interactively by a person.'],
  ],
  { widths: ['42%', '20%', '38%'] },
)}
${warn(
  'On novelty',
  'No claim is made that this is the first augmented-reality capacity-building platform, or the first AR training for meteorological instruments. AR in technical training is well established. What is offered as this project’s contribution is the <em>integration</em>: a practical taken on a phone that becomes dated evidence in a competency record, is combined with a theory result, resets a decay clock, and later triggers its own refresher — in one system, with every step auditable.',
)}
${chapterClose}`;

export const ch23 = `${chapterOpen(23, 'Offline-First Progressive Web Application')}
${h2('Purpose')}
${p(
  `Observatories, radar sites and field stations are exactly the places where connectivity is worst and where training is most needed. If the platform only works online, it does not work where it matters most.`,
)}
${p(`Status: ${status('IMPLEMENTED')}. One limitation is stated at the end of the chapter.`)}

${h2('What works offline, and what deliberately does not')}
${table(
  'The offline boundary',
  ['Works with no network', 'Requires a connection'],
  [
    ['Opening the application and navigating it', 'Starting a <em>new</em> assessment attempt'],
    ['Reading a saved course: modules, text, documents and video from the device', 'Issuing or downloading a certificate'],
    ['Marking a module complete', 'Any workforce dashboard or administrative screen'],
    ['Leaving course feedback', 'Browsing the full catalogue'],
    ['Submitting an assessment <em>already in progress</em>', 'The AR lab'],
  ],
  { widths: ['50%', '50%'] },
)}
${p(
  `The right-hand column is a design decision, not a gap. Issuing a certificate offline would mean the device deciding a pass; starting a new attempt offline would mean the device holding a question bank. Each of those would break the rule that the browser is never a source of fact. The interface says which it is, rather than failing quietly.`,
)}

${h2('The service worker handles reads only')}
${p(
  `<code>frontend/public/sw.js</code> is hand-written, with no build-time dependency. It caches the application shell, the hashed build assets and the icons, and it serves a narrow **allow-list** of GET API responses: the signed-in user, their enrolments, their assessments and the courses they open — never workforce-wide or administrative data. A response served from the cache is marked with a header so the interface can show that it is a saved copy rather than a live one.`,
)}
${pre(
  `self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;   // writes belong to the mutation queue
  ...
});`,
  'the first line of the fetch handler, and the most important one',
)}
${warn(
  'Why the worker never replays a write',
  'A service worker replaying queued writes is the pattern most offline tutorials reach for, and it is difficult to reason about: the worker has no user interface, so it cannot ask a question, cannot show an error, and cannot decide what to do with a rejection. Ordering across several queued writes becomes implicit. Here, writes are queued and sent by the <strong>application</strong>, which owns the order, the retry policy, the idempotency key and what the learner is told. The worker does one job and does it simply.',
)}

${h2('The mutation queue')}
${p(`Every offline-capable write goes through one function, which decides whether to send it now or store it.`)}
${ol([
  `An entry is built with a new identifier, the kind of action, a human-readable label, the payload and the time it was created.`,
  `If the device is offline, the entry is persisted to IndexedDB and the indicator moves to OFFLINE.`,
  `Otherwise it is sent immediately. A **permanent** failure — a 4xx, meaning the server has rejected the action itself — is thrown to the caller so the learner sees it at once.`,
  `Any other failure persists the entry with an attempt count, because it is probably a connection that has just dropped.`,
  `When connectivity returns, the queue is drained **oldest first**, so a module completion recorded before a feedback entry is applied in that order.`,
  `Each entry carries an **idempotency key generated at the moment the learner acted** — not at the moment the request is sent. That is what makes a replay after a dropped connection return the original result instead of consuming a second attempt.`,
])}

${h2('What the learner sees')}
${figure(
  '32-offline-mode.png',
  'The application with the network disconnected',
  'Captured with the browser genuinely offline, not with a mocked flag. The connection indicator in the header reads OFFLINE, saved courses remain openable, and screens that need a connection say so rather than presenting an empty state that looks like a failure. The distinction matters: "you are offline and this needs the network" is actionable, and "no data" is not.',
)}
${figure(
  '33-sync-status.png',
  'The synchronisation popover, listing the changes still waiting',
  'Opening the indicator shows exactly what the device is holding: each queued change with its label, when it was made, how many attempts it has had, and any error. Nothing is discarded silently. A change the server has permanently rejected stays visible with its reason, so the learner knows it did not take effect — the failure mode a naive queue hides.',
)}
${p(`The indicator reads ONLINE, OFFLINE, SYNCING or SYNC COMPLETE, and the transition is visible rather than instantaneous, so a learner can see that their work has actually gone.`)}

${h2('Saved courses')}
${figure(
  '25-offline-library.png',
  'The Offline Library: what this device is holding, and what is waiting to sync',
  'Saving a course from the player downloads its modules, readings, documents and video into IndexedDB; from then on those files are served from the device rather than the network. This page shows everything the device holds, with its size, and lets the learner remove any of it — which matters on a shared or low-storage device, and is the sort of control that is easy to leave out and irritating to live without.',
)}

${h2('Security of data on the device')}
${p(`Offline support means learner data is written to the device, so it was treated as a security surface rather than a convenience.`)}
${ul([
  `**What is stored:** the cached app shell and build assets; the allow-listed GET responses; courses the learner explicitly saved, including document and video bytes; and any writes queued while offline.`,
  `**Where:** the browser's Cache Storage and IndexedDB, both scoped to the web origin and readable only by this application on this device. Nothing is written anywhere else and nothing goes to a third party.`,
  `**No authority is cached.** Every cached response is data the server had already authorised for that session. The worker never caches a *decision*, and permissions are re-checked on the server when the queue drains.`,
  `**Signing out erases everything.** Logout flushes the queue first, then deletes every cache, every saved course and every stored file, and tells the service worker to do the same.`,
  `**Scenario images** are constrained by the Content-Security-Policy to the application's own origin, so authored content cannot pull in a third-party tracker.`,
])}
${warn(
  'Known limitation',
  'Queued work is sent when the device reconnects <strong>while the application is open</strong>. There is no background synchronisation, so a learner who works offline and never reopens the application never syncs. Background Sync is listed in the future scope of Chapter 28. Separately, a session that simply expires, or a browser closed without signing out, leaves the saved copies in place until the next sign-out — offline access would be pointless otherwise — so on a shared workstation, signing out matters.',
)}

${h2('Installability')}
${p(
  `The application ships a web app manifest and icons at 192, 512 and maskable 512 pixels, so it installs from the browser onto a phone or desktop and runs in its own window. The service worker is registered only in production builds; a development flag exists to exercise it deliberately. The production nginx configuration serves the service worker with no-cache headers and declares the correct MIME types for the manifest and the <code>.glb</code> model, because getting either wrong produces a progressive web app that silently stops updating.`,
)}
${chapterClose}`;

export const ch24 = `${chapterOpen(24, 'Analytics, Reporting and Administration')}
${h2('Purpose')}
${p(
  `Everything so far produces a per-person answer. This module aggregates those answers into the view the training office actually acts on: where the organisation is short, how much it matters, and where it is heading.`,
)}
${p(`Status: ${status('IMPLEMENTED')}. The AI features are ${status('IMPLEMENTED')} and off by default.`)}
${p(
  `The organisation views apply exactly the individual formulas from Chapters 14 and 17 — an employee is an active user with a job role, and each competency their role requires is one row — so an administrator's figures always agree with what each employee sees on their own passport. That was a deliberate constraint: two views of the same workforce that disagree are worse than one view.`,
)}

${h2('The administrator dashboard')}
${figure(
  '11-admin-dashboard.png',
  'The administrator dashboard',
  'Headline workforce figures, recent activity, pending approvals and the entry points to the analytical views. Nothing on this screen is a stored aggregate: every figure is computed from the live tables when the page is opened, which is slower than a materialised summary and correct by construction.',
)}

${h2('The competency heatmap')}
${figure(
  '12-competency-heatmap.png',
  'The competency heatmap by department',
  'Department (or job role) on one axis, competency on the other. Each cell shows the average level, the required level and the average gap, with severity taken from the <em>average</em> gap using the same thresholds an individual is measured by. The change over 30, 90, 180 or 365 days comes from the append-only history, so it is a record of what actually happened rather than a comparison against a stored snapshot. A freshness layer overlays how much of each cell is current rather than decayed. Cell text colour is chosen from the measured contrast against the cell’s own background, and every value is tested, so the grid stays readable at WCAG AA.',
)}
${p(
  `Employees who have never been assessed on a competency their role requires count at level 0 — an unassessed requirement is a gap, and is flagged as such rather than excluded from the average, which would flatter the department.`,
)}

${h2('Training needs and the forecast')}
${figure(
  '13-training-needs-forecast.png',
  'Ranked training needs, with the trend forecast',
  'Per competency: how many employees are below target, their average gap, the mean priority of those employees, how many are already enrolled in a course that develops it, how many have not started one, and how many courses exist. A competency with real gaps and <strong>no published course</strong> is flagged, because that is the one finding a training office can act on immediately by commissioning a course.',
)}
${p(
  `Ranking is by **demand score**: the *sum* of the affected employees' priority scores, not the average. A large gap in a critical competency held by many people therefore rises to the top, which is the ordering a training budget should follow.`,
)}
${h3('The forecast is a calculation, not a generated opinion')}
${ol([
  `**Monthly averages.** For each competency, the average level of the employees whose role requires it, month by month, from the append-only history. The *same* employees are counted in every month — each at the level they held at the end of that month, and at their first recorded level before that — so somebody assessed only recently does not appear as organisational progress.`,
  `**Pace.** An ordinary least-squares line through those averages. Its slope is the pace in points per month. With fewer than three months of data there is no trend, and the forecast says so rather than inventing one.`,
  `**Projection.** From *today's* average at that pace, clamped to 0 to 100.`,
  `**Employees still short.** Every employee is moved by the pace over the horizon, and those still below their required level are counted alongside today's count.`,
  `**Outlook.** On target, Closing, Stagnant, Widening, or Not enough history. *Months to close* is reported only when the trend genuinely closes the gap. A pace within ±0.25 points a month counts as flat.`,
  `**Confidence.** High needs at least 8 months and R² ≥ 0.6; Medium at least 5 months and R² ≥ 0.3; otherwise Low.`,
])}
${note(
  'What the forecast does not know',
  'It is a projection of the recent pace and nothing more. It knows nothing about planned courses, retirements, new joiners or a change in requirements. The method is printed on the page so that a reader can judge it, and the optional AI briefing only <em>describes</em> these numbers — it never computes one.',
)}

${h2('Engagement')}
${figurePair(
  figure('29-notifications.png', 'Notifications', 'In-app only. Each carries a per-user unique dedupe key, which is what makes the scheduled jobs safe to run twice.', { size: 'half' }),
  figure('30-achievements.png', 'Achievements', 'Badges earned from real activity, unique per user and badge code, awarded after the submission transaction commits.', { size: 'half' }),
)}
${p(
  `Reminders — approaching deadlines, stalled learners, unaddressed high-priority gaps — run in an in-process scheduler every six hours, inside a PostgreSQL advisory lock so that only one API instance runs them however many are deployed. An administrator can also trigger a run, which is how an external cron would drive it. Announcements are broadcasts with an audience, an optional department scope and an optional expiry.`,
)}

${h2('Optional AI features')}
${p(
  `Five features, all off unless a provider key is configured, and all **additive**: the rule-based framework decides, and the model explains, drafts or searches.`,
)}
${table(
  'The AI features and their limits',
  ['Feature', 'What it does', 'What it cannot do'],
  [
    ['Course assistant', 'Answers a question from that course’s own materials, with sources.', 'Read any other course, or anything about any user.'],
    ['Quiz generator', 'Drafts questions for a trainer to review.', 'Save anything automatically. Drafts are re-validated with the same rules as hand-written questions, deduplicated and shuffled.'],
    ['Study-plan explanation', 'Words the engine’s recommendations.', 'Add a course, remove one, or change the order — it is handed the engine’s list.'],
    ['Plain-language search', 'Interprets a typed request against the catalogue.', 'Return anything that is not a real, published course — identifiers are checked against the database.'],
    ['Forecast briefing', 'Describes the calculated forecast in prose.', 'Compute any figure. The numbers are produced by the arithmetic above.'],
  ],
  { widths: ['18%', '38%', '44%'] },
)}
${figurePair(
  figure('15-ai-course-assistant.png', 'The course assistant, answering from the course’s own materials', 'Captured with a scripted stand-in for the model, because no API key was available: it shows the interface, not real model output.', { size: 'half' }),
  figure('16-ai-quiz-generator.png', 'The quiz generator, producing drafts for review', 'Also captured with a scripted stand-in. Nothing here is saved until the trainer accepts it.', { size: 'half' }),
)}
${warn(
  'Model output is untrusted input',
  'Every response is requested as structured output, validated against a Zod schema, and then validated again against the database — cited sources, course identifiers, competency identifiers and categories are checked and dropped when they are not real. Course text is escaped and delimited as data, and the instructions say to ignore instructions found inside it; but the design does not <em>depend</em> on the model obeying, because the model has no tools, no database access and no way to act. The worst a poisoned reading can do is produce a bad answer that the checks and the user’s review catch. Users see a plain notice of exactly what is sent, naming the service that receives it, taken from the server’s own configuration so it cannot drift from what is really used.',
)}
${chapterClose}`;
