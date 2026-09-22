/** Chapter 28: deployment, limitations, future scope and conclusion. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, note, warn, pre, chain, status } from '../kit.mjs';

export const ch28 = `${chapterOpen(28, 'Deployment, Limitations, Future Scope and Conclusion')}
${h2('Deployment')}
${p(
  `Two deployment shapes are supported. Both are documented in <code>docs/deployment.md</code>, and the configuration is entirely by environment variable, validated at start-up — the API refuses to boot with a list of what is wrong rather than failing later at request time.`,
)}
${table(
  'Deployment options',
  ['Option', 'Shape', 'Status'],
  [
    ['Docker Compose on one host', 'PostgreSQL, the API, and nginx serving the built web app and proxying <code>/api</code>, with a one-off migration step.', status('NOT VERIFIED')],
    ['Separate hosting', 'The API as a Node process behind a reverse proxy; the built web app as static files on any host or CDN; a managed PostgreSQL; an S3-compatible bucket for uploads.', status('PARTIALLY IMPLEMENTED')],
  ],
  { widths: ['24%', '56%', '20%'] },
)}
${warn(
  'The container images have never been built or run',
  'The Dockerfiles, the nginx template and the compose file were written, but no Docker was available in the environment where this project was developed, so <strong>not one of them has ever been executed</strong>. The continuous-integration workflow builds them on push, and the first <code>docker compose up</code> must be treated as a test rather than as a deployment. This is stated here, in the security chapter and in the repository documentation, because a report that quietly listed "Docker deployment" as a feature would be making a claim the project cannot support.',
)}
${p(
  `The separate-hosting path is labelled partially implemented on the same basis: the build outputs exist and have been produced repeatedly (<code>npm run build</code> is part of the validation routine), the nginx template exists and its Content-Security-Policy was checked in a real browser against the production bundle, but the arrangement has not been stood up end to end on real infrastructure.`,
)}
${h3('What has been run')}
${ul([
  `The production build of both workspaces, repeatedly and cleanly.`,
  `The production web bundle served by a static preview server with the service worker registered — which is how the offline behaviour and every screenshot in Chapters 19 to 24 were produced.`,
  `The API against a real PostgreSQL, both the embedded local instance and the test database used by the integration suite.`,
  `The administrator command-line tool that creates the first account, which is the intended way to start a production system.`,
])}

${h2('Limitations')}
${p(
  `These are stated as findings, not as apologies. Each is a real boundary of what was built, and each is either a deliberate scope decision or an honest gap.`,
)}
${table(
  'Limitations of the delivered system',
  ['#', 'Limitation', 'Nature'],
  [
    ['L-1', 'The container images and compose file have never been built or run.', 'Environment constraint; the first deployment is a test.'],
    ['L-2', 'No automated browser end-to-end test suite is kept in the repository. Flows were driven with throw-away scripts.', 'Scope decision; the scripts were not maintained as a suite.'],
    ['L-3', 'The desktop 3D fallback has not been clicked through by hand, and the viewer cannot be exercised under test because the test environment has no WebGL.', 'Genuine verification gap. AR placement on Android <em>was</em> confirmed.'],
    ['L-4', 'No multi-factor authentication, no single sign-on, and no password reset by e-mail — an administrator issues a temporary password.', 'Scope decision; there is no e-mail delivery at all.'],
    ['L-5', 'Notifications are in-app only. No e-mail, no SMS.', 'Scope decision.'],
    ['L-6', 'No background synchronisation: a learner who works offline and never reopens the application never syncs.', 'Platform capability not used; Background Sync would address it.'],
    ['L-7', 'Rate-limit counters are held in memory, so each API instance has its own budget.', 'Known scaling limit; a shared store or gateway limit is needed.'],
    ['L-8', 'No malware scanning of uploads.', 'Deliberate omission; a deployment that needs it should scan on upload.'],
    ['L-9', 'Mentorship records intent only — no session scheduling, no record of what was transferred, no competency evidence.', 'Partially implemented, and labelled as such throughout.'],
    ['L-10', 'The competency framework must be populated by hand. The platform does not infer competencies from course content.', 'Deliberate: an inferred framework would not be defensible.'],
    ['L-11', 'Every decay half-life, readiness event and practical scenario in the demonstration data is invented for this project.', 'Simulated content, flagged in the database and labelled in the interface.'],
    ['L-12', 'No accessibility testing with assistive technology. An automated axe-core scan of 31 screens came back clean, which is not the same thing.', 'Genuine gap; a formal audit is future work.'],
    ['L-13', 'Interface text is English only.', 'Scope decision; Hindi and regional languages are future work.'],
    ['L-14', 'No proctoring, and no question-bank analytics (difficulty, discrimination).', 'Scope decision; relevant only for high-stakes assessment.'],
    ['L-15', 'No integration with any HR or personnel system. Job roles, retirement dates and postings are maintained inside the platform.', 'Scope decision; an obvious first integration.'],
    ['L-16', 'No measured operational outcome is available, because the system has never been deployed in service.', 'Unavoidable, and the reason no such claim appears anywhere in this report.'],
  ],
  { widths: ['6%', '58%', '36%'] },
)}

${h2('Future scope')}
${p(`Ordered by what would add most, given what exists.`)}
${table(
  'Future work',
  ['Priority', 'Work', 'Why it matters'],
  [
    ['1', 'Single sign-on with the department’s identity provider, and multi-factor authentication.', 'The single largest barrier to real deployment. Staff should not hold another password.'],
    ['2', 'E-mail and SMS delivery for notifications, reminders and password reset.', 'In-app notifications only reach people who are already using the platform — which is the opposite of who a reminder is for.'],
    ['3', 'Synchronisation with the HR system for postings, role changes and retirement dates.', 'Continuity analysis is only as good as the retirement dates it reads, and a job-role change should not be a manual edit.'],
    ['4', 'Build and run the container images; a first pilot deployment.', 'Closes L-1, and turns the deployment documentation from a plan into a procedure.'],
    ['5', 'A Hindi and regional-language interface.', 'A national department’s training platform in English only excludes part of its own workforce.'],
    ['6', 'More AR instrument labs: automatic weather station, upper-air sounding, satellite reception.', 'The hard part — the pipeline from practical to competency to refresher — is built. Each new lab is now content plus a model, not new architecture.'],
    ['7', 'Background synchronisation, so queued work is sent with the application closed.', 'Closes L-6 and completes the offline story.'],
    ['8', 'A kept browser end-to-end suite, and a formal WCAG audit with assistive technology.', 'Closes L-2 and L-12.'],
    ['9', 'E-learning standards (SCORM, xAPI) for imported content.', 'Lets the department use material it has already bought or built.'],
    ['10', 'Scheduled instructor-led sessions with attendance, and 360-degree or peer evaluation.', 'Both are recognised evidence types the engine could consume with no change to its rules.'],
    ['11', 'Question-bank analytics and proctoring.', 'Required before any assessment becomes high-stakes.'],
    ['12', 'Cohort analytics and exportable reports; malware scanning of uploads.', 'Operational maturity for a live service.'],
  ],
  { widths: ['9%', '43%', '48%'] },
)}
${note(
  'Why more AR labs sit at position six rather than first',
  'It is the most visible thing that could be added, and it is deliberately not the most valuable. The architecture for practicals is finished: a new lab needs a generated model, a set of components with hotspot positions, and a set of tasks. It needs no new engine rule, no schema change and no new integration. Single sign-on, by contrast, is what stands between this system and being usable by a real department.',
)}

${h2('What was achieved')}
${p(
  `The project set out to answer twelve questions (Table 2.1) that a training record cannot answer. All twelve are answered by the delivered system, and each answer is traceable to a chapter of this report, a module of the code and a test.`,
)}
${table(
  'Delivered, in numbers',
  ['Measure', 'Value'],
  [
    ['API endpoints, documented and checked against the code by tooling', '175'],
    ['Database tables / enumerated types / migrations', '48 / 24 / 10'],
    ['Backend feature modules', '22'],
    ['Frontend page components', '58'],
    ['Automated tests passing', '<strong>753</strong> — 614 backend across 29 files, 139 frontend across 15 files'],
    ['Screenshots of the running system in this report', '40'],
    ['Diagrams generated from the implementation', '14'],
    ['3D assets, original and reproducible from a script in the repository', '1'],
  ],
  { className: 'narrow', widths: ['62%', '38%'] },
)}

${h2('Conclusion')}
${p(
  `A learning management system can tell an organisation what its people have attended. That is a useful record and an insufficient one. For a department whose output is a warning issued under time pressure, the question that matters is whether the person on duty can do the work today.`,
  `Capacity Connect answers that question, and the way it answers it is the contribution. A competency level here is never asserted: it is blended from dated evidence by a deterministic engine, recorded with the inputs that produced it, and shown to the person it describes together with the arithmetic. Because decay was implemented as a pure function of a date rather than as a scheduled write, the same code that reports today's workforce reports next season's, with nothing written and no separate projection to drift out of step. And because an AR practical enters that engine as ordinary practical evidence rather than as a special case, a trainee tapping a component on their phone moves the same number, through the same rules, as a written assessment does — and when that number later fades, the system offers the five-minute refresher that restores it.`,
  `That is the loop the problem statement asked for, and it closes.`,
)}
${chain(['Requirement', 'Gap', 'Learning', 'Evidence', 'Competency', 'Certificate', 'Decay', 'Refresher', 'Evidence'])}
${p(
  `What has not been done is stated as plainly as what has. The containers have never been built. The desktop 3D fallback has never been clicked through by a person. There is no single sign-on, no e-mail, no assistive-technology testing, and no measured operational outcome — because the system has not yet been used in service, and a report that claimed otherwise would be worth less than the software it describes.`,
  `The system is complete as an implementation of its design, honest about its edges, and ready for the pilot deployment that would tell us which of the twelve answers survive contact with a real training office.`,
)}
${chapterClose}`;
