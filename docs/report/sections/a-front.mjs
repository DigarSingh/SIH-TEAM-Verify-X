/** Cover, certificate, declaration, acknowledgement and abstract. */
import { md, p } from '../kit.mjs';

/**
 * Personal and institutional details were not supplied. They are rendered as
 * visible placeholders rather than invented, so whoever finalises the document
 * can see exactly what is outstanding.
 */
export const PLACEHOLDER = '<span class="ph">[to be completed]</span>';

export const cover = `
<section class="cover">
  <div class="cover-top">
    <div class="crest">
      <div class="crest-mark">CC</div>
      <div>
        <div class="crest-org">Ministry of Earth Sciences</div>
        <div class="crest-sub">India Meteorological Department</div>
      </div>
    </div>
    <div class="cover-ps">Smart India Hackathon &middot; Problem Statement <strong>SIH26075</strong></div>
  </div>

  <div class="cover-main">
    <h1>Capacity&#8202;Connect</h1>
    <p class="tagline">From Course Completion to Competency Development</p>
    <p class="cover-sub">A Digital Capacity Building and Learning Management Portal</p>
    <div class="cover-rule"></div>
    <dl class="cover-meta">
      <div><dt>Problem Statement</dt><dd>SIH26075 &mdash; Capacity Connect</dd></div>
      <div><dt>Organisation</dt><dd>Ministry of Earth Sciences (MoES) &middot; India Meteorological Department (IMD)</dd></div>
      <div><dt>Theme</dt><dd>Smart Education</dd></div>
      <div><dt>Category</dt><dd>Software</dd></div>
    </dl>
  </div>

  <div class="cover-foot">
    <dl class="cover-team">
      <div><dt>Team Name</dt><dd>${PLACEHOLDER}</dd></div>
      <div><dt>Team Members</dt><dd>${PLACEHOLDER}</dd></div>
      <div><dt>Institution</dt><dd>${PLACEHOLDER}</dd></div>
      <div><dt>Department</dt><dd>${PLACEHOLDER}</dd></div>
      <div><dt>Guide / Mentor</dt><dd>${PLACEHOLDER}</dd></div>
      <div><dt>Academic Year</dt><dd>${PLACEHOLDER}</dd></div>
    </dl>
    <p class="cover-note">This report documents the software actually built in this repository. Features that are demonstration content, partially built or unverified are labelled as such throughout.</p>
  </div>
</section>`;

export const certificate = `
<section class="frontmatter">
  <h1 class="fm-title">Certificate</h1>
  <div class="cert-body">
    ${p(
      `This is to certify that the project entitled **"Capacity Connect — From Course Completion to Competency Development"**, submitted against Smart India Hackathon problem statement **SIH26075** issued by the Ministry of Earth Sciences (MoES) / India Meteorological Department (IMD), is a record of bona fide work carried out by:`,
    )}
    <div class="cert-names">${PLACEHOLDER}</div>
    ${p(
      `of ${'the Department of'} ${PLACEHOLDER}, ${PLACEHOLDER}, during the academic year ${PLACEHOLDER}, under the guidance of ${PLACEHOLDER}.`,
      `The work presented in this report has been carried out by the team and has not been submitted elsewhere for the award of any other degree or diploma. The implementation described here is present in the project repository and was verified against the source code, the automated test suites and a running instance of the system at the time of writing.`,
    )}
    <div class="sign-row">
      <div class="sign"><div class="sign-line"></div><div class="sign-role">Guide / Mentor</div><div class="sign-name">${PLACEHOLDER}</div></div>
      <div class="sign"><div class="sign-line"></div><div class="sign-role">Head of Department</div><div class="sign-name">${PLACEHOLDER}</div></div>
      <div class="sign"><div class="sign-line"></div><div class="sign-role">External Examiner</div><div class="sign-name">${PLACEHOLDER}</div></div>
    </div>
  </div>
</section>`;

export const declaration = `
<section class="frontmatter">
  <h1 class="fm-title">Declaration</h1>
  ${p(
    `We declare that this project report, **"Capacity Connect — From Course Completion to Competency Development"**, is our own work, carried out for Smart India Hackathon problem statement SIH26075.`,
    `The system described in this report was designed and implemented by the team. Where third-party libraries, frameworks or assets have been used, they are identified in the report and in the repository's documentation, together with their licences. The three-dimensional model used by the AR Instrument Lab was created for this project and is documented in \`docs/AR_ASSETS.md\`.`,
    `Every feature described in this report was checked against the source code before being written down. Where a capability is demonstration content rather than institutional policy, where it is only partly built, or where it has not been verified on real hardware, the report says so explicitly. No measured operational outcome is claimed, because the system has not yet been deployed in service.`,
    `The competency half-lives, readiness events, hazard calendars and practical scenarios shipped with the demonstration database are plausible training content written for this project. They are **not** official IMD policy, and the application labels them as simulated wherever they appear.`,
  )}
  <div class="sign-row two">
    <div class="sign"><div class="sign-line"></div><div class="sign-role">Team Members</div><div class="sign-name">${PLACEHOLDER}</div></div>
    <div class="sign"><div class="sign-line"></div><div class="sign-role">Date and Place</div><div class="sign-name">${PLACEHOLDER}</div></div>
  </div>
</section>`;

export const acknowledgement = `
<section class="frontmatter">
  <h1 class="fm-title">Acknowledgement</h1>
  ${p(
    `We are grateful to the **Ministry of Earth Sciences** and the **India Meteorological Department** for framing problem statement SIH26075. The problem statement asks a genuinely difficult question — how an organisation can know whether its people are *able* to do the work, rather than merely whether they have attended training — and working on it has taught us a great deal about the difference between a learning management system and a capacity building system.`,
    `We thank our guide, ${PLACEHOLDER}, for direction and review throughout the work, and the Department of ${PLACEHOLDER} at ${PLACEHOLDER} for the facilities and encouragement that made the project possible.`,
    `We also acknowledge the open-source projects this system is built on — among them Node.js, Express, React, Prisma, PostgreSQL, Vite, TanStack Query and Google's \`<model-viewer>\` — whose maintainers make work of this scope possible for a student team.`,
    `Finally, we thank the Smart India Hackathon organising committee for the opportunity to build against a real institutional need.`,
  )}
</section>`;

export const abstract = `
<section class="frontmatter">
  <h1 class="fm-title">Abstract</h1>
  ${p(
    `Learning management systems record what people have *attended*. Operational organisations need to know what their people are *able to do*, and whether that ability is still current. For the India Meteorological Department, where a forecaster's radar interpretation or a duty officer's warning procedure has consequences measured in public safety, that distinction matters. A certificate issued three years ago is a record of a past event, not evidence of present capability.`,
    `**Capacity Connect** is a competency-driven capacity building portal built for problem statement SIH26075. It reframes the unit of account from the course to the competency. Every employee has a job role; every job role requires named competencies at defined levels; every employee holds a current level in each. The difference is a **skill gap**, and that gap — weighted by how important the competency is to the role and how critical the role is to the organisation — produces a **training priority** that drives personalised course recommendations and a prerequisite-aware learning path.`,
    `Learning is delivered through a full learning management system: courses with modules and materials, enrolment and progress tracking, timed assessments drawn from a question bank, trainer evaluations against a weighted rubric, and digitally signed PDF certificates with QR-code public verification. What distinguishes the system is what happens *after* the certificate. Assessment results do not overwrite a competency level; they are treated as **evidence** and blended with the previous level and all other current evidence by an auditable competency engine that records the inputs behind every change.`,
    `Because skill fades, the system models **competency decay** as a pure function of elapsed time since practice, so an administrator can recompute the entire workforce at any future date without altering a single stored record. That single design decision makes several capabilities fall out almost for free: recertification tracking, hazard-season **readiness sprints** measured at the date an operational period begins, **knowledge-continuity analysis** that finds competencies held by too few people, and automatic recommendation of short refresher training when a competency has faded.`,
    `Practical skill is assessed through an **AR Instrument Lab**. A trainee places a three-dimensional Doppler weather radar in the room through a phone camera, identifies its components and works through a marked practical. The practical is scored on the server, combined with the theory result at a configurable weighting, and fed to the same competency engine as every other kind of evidence. On devices without AR support the identical lab runs as an interactive 3D model, so assessment is never blocked by hardware. The application is also an installable **offline-first progressive web app**: field staff can save courses to the device, work without a network, and have their progress queued and synchronised — protected by idempotency keys so a dropped connection can never cost an attempt.`,
    `The result is a single auditable loop — learn, practise, assess, update, certify, monitor, refresh — in which every number shown to a user can be traced back to the evidence that produced it.`,
  )}
</section>`;
