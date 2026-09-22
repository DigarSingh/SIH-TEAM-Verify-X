/**
 * Capacity Connect - demo data seed.
 *
 *   npm run db:seed              seed an empty database
 *   npm run db:seed -- --reset   wipe all application data first, then seed
 *
 * The seed is deterministic and DEVELOPMENT ONLY: it refuses to run with
 * NODE_ENV=production unless ALLOW_PRODUCTION_SEED=true. Every demo account gets
 * the password from SEED_DEMO_PASSWORD (a random one is generated and printed
 * once when the variable is not set).
 *
 * It does not just insert rows: a year of learning activity is replayed in strict
 * chronological order through the real competency-engine service, so every level,
 * history entry and timeline in the demo data is what the platform would have
 * produced itself.
 */
import 'dotenv/config';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import { checkAchievements } from '../backend/src/modules/achievements/achievements.service';
import { DEFAULT_ENGINE_CONFIG } from '../backend/src/modules/competencies/engine/config';
import { weightedEvaluationScore, type EvaluationRatings } from '../backend/src/modules/competencies/engine/evaluation';
import { applyCompetencyEvidence } from '../backend/src/modules/competencies/evidence.service';
import { COURSES, TRAINER_PROFILES, type CourseSeed, type TrainerKey } from './seed-data/courses';
import { COMPETENCIES, DECAY_POLICIES, DEPARTMENTS, ROLES, type CompetencyCode, type DepartmentCode, type RoleCode } from './seed-data/framework';
import { AR_MODULES } from './seed-data/ar-lab';
import { PRACTICAL_SCENARIOS } from './seed-data/scenarios';
import { DEPARTMENT_PROFILE, EVALUATION_COMMENTS, FEEDBACK_COMMENTS, PENDING, QUALIFICATIONS, SKILLS, TRAINEES, type PersonSeed } from './seed-data/people';
import { QUESTION_BANKS } from './seed-data/questions';
import { DAY, Rng, clamp, coverPng, daysAgo, handbookPdf, type Rgb } from './seed-data/util';

const prisma = new PrismaClient();
const NOW = new Date();
const rng = new Rng(20260920);
const config = DEFAULT_ENGINE_CONFIG;
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------------------------

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'TRAINEE' | 'TRAINER' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  employeeId: string;
  location: string;
  designation: string;
  deptId: string;
  roleId: string | null;
  deptCode: DepartmentCode;
  roleCode: RoleCode | null;
  createdAt: Date;
  ability: number;
}

interface CourseRow {
  seed: CourseSeed;
  id: string;
  trainerId: string;
  moduleIds: string[];
  createdAt: Date;
  questions: { id: string; marks: number; type: 'SINGLE' | 'MULTIPLE'; options: { id: string; isCorrect: boolean }[] }[];
  assessmentId: string | null;
}

const slugEmail = (name: string) =>
  `${name
    .replace(/^Dr\.\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, '.')}@imd.gov.in`;

const CERT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const certificateNumber = (at: Date) => `${process.env['CERTIFICATE_ID_PREFIX'] ?? 'CC'}-${at.getUTCFullYear()}-${Array.from({ length: 8 }, () => CERT_ALPHABET[randomInt(CERT_ALPHABET.length)]).join('')}`;

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;

async function wipe(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log('  wiped existing data');
}

const CATEGORY_COLOURS: Record<string, [Rgb, Rgb]> = {
  'Radar Meteorology': [[11, 31, 58], [45, 140, 255]],
  Forecasting: [[16, 62, 92], [14, 165, 168]],
  'Modelling & Prediction': [[41, 37, 99], [109, 90, 230]],
  'Satellite Services': [[8, 47, 73], [56, 189, 248]],
  'Scientific Foundations': [[30, 58, 95], [96, 165, 250]],
  'Data & Digital': [[15, 70, 74], [52, 211, 153]],
  'Climate & Research': [[22, 78, 99], [45, 212, 191]],
  'Public Safety': [[110, 46, 30], [234, 106, 71]],
};

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production' && process.env['ALLOW_PRODUCTION_SEED'] !== 'true') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production. Set ALLOW_PRODUCTION_SEED=true only if you really mean it.');
  }
  const reset = process.argv.includes('--reset');
  if ((await prisma.user.count()) > 0) {
    if (!reset) {
      console.log('The database already contains data. Re-run with "npm run db:seed -- --reset" to wipe it and seed again.');
      return;
    }
    await wipe();
  }

  let password = process.env['SEED_DEMO_PASSWORD'];
  let generated = false;
  if (!password) {
    password = `Cc!${randomBytes(9).toString('base64url')}9a`;
    generated = true;
  }
  if (!PASSWORD_POLICY.test(password)) throw new Error('SEED_DEMO_PASSWORD must be 10+ characters with lower-case, upper-case, a digit and a symbol.');
  const passwordHash = await hash(password);
  console.log('Seeding Capacity Connect demo data...');

  // ---- organisation -----------------------------------------------------------------------------
  const frameworkAt = daysAgo(350, NOW);
  const deptId = new Map<DepartmentCode, string>();
  for (const dept of DEPARTMENTS) deptId.set(dept.code, randomUUID());
  await prisma.department.createMany({ data: DEPARTMENTS.map((d) => ({ id: deptId.get(d.code) as string, code: d.code, name: d.name, description: d.description, createdAt: frameworkAt })) });

  const competencyId = new Map<CompetencyCode, string>();
  for (const c of COMPETENCIES) competencyId.set(c.code, randomUUID());
  await prisma.competency.createMany({
    data: COMPETENCIES.map((c) => ({ id: competencyId.get(c.code) as string, code: c.code, name: c.name, category: c.category, description: c.description, levelDescriptors: c.levelDescriptors, createdAt: frameworkAt })),
  });

  // Freshness policies. Marked as a simulation: they are demonstration values, not IMD policy.
  await prisma.competencyDecayPolicy.createMany({
    data: DECAY_POLICIES.map((policy) => ({
      competencyId: competencyId.get(policy.code) as string,
      decayEnabled: true,
      halfLifeDays: policy.halfLifeDays,
      minimumSafeLevel: policy.minimumSafeLevel,
      recertificationIntervalDays: policy.recertificationIntervalDays,
      criticality: policy.criticality,
      isSimulation: true,
      notes: policy.notes,
      createdAt: frameworkAt,
    })),
  });

  const roleId = new Map<RoleCode, string>();
  for (const r of ROLES) roleId.set(r.code, randomUUID());
  await prisma.role.createMany({ data: ROLES.map((r) => ({ id: roleId.get(r.code) as string, code: r.code, name: r.name, description: r.description, criticality: r.criticality, createdAt: frameworkAt })) });
  await prisma.roleCompetency.createMany({
    data: ROLES.flatMap((r) =>
      r.requirements.map(([code, requiredLevel, importance]) => ({ roleId: roleId.get(r.code) as string, competencyId: competencyId.get(code) as string, requiredLevel, importance, createdAt: frameworkAt })),
    ),
  });
  const requirementsByRole = new Map<RoleCode, Map<CompetencyCode, { required: number; importance: number }>>();
  for (const r of ROLES) requirementsByRole.set(r.code, new Map(r.requirements.map(([code, required, importance]) => [code, { required, importance }])));
  console.log(`  ${DEPARTMENTS.length} departments, ${ROLES.length} job roles, ${COMPETENCIES.length} competencies`);

  // ---- people -----------------------------------------------------------------------------------
  const users: UserRow[] = [];
  const addUser = (row: Omit<UserRow, 'id' | 'deptId' | 'roleId' | 'ability'> & { ability?: number }) => {
    const user: UserRow = { ...row, id: randomUUID(), deptId: deptId.get(row.deptCode) as string, roleId: row.roleCode ? (roleId.get(row.roleCode) as string) : null, ability: row.ability ?? 0 };
    users.push(user);
    return user;
  };
  /**
   * Career stage and (for some) a recorded retirement date, so the succession view
   * has something to work with. Demonstration data: a real deployment would take
   * these from the HR system.
   *
   * `SUCCESSION_DEMO` names the people the knowledge-continuity story needs: two
   * strong radar experts, one of whom is inside the retirement window.
   */
  const SUCCESSION_DEMO: Record<string, { careerLevel: 'JUNIOR' | 'MID' | 'SENIOR' | 'PRINCIPAL'; retiresInDays?: number }> = {
    'kamala.nair@imd.gov.in': { careerLevel: 'PRINCIPAL', retiresInDays: 420 },
    'arjun.sharma@imd.gov.in': { careerLevel: 'MID' },
  };

  const retirementFor = (u: UserRow): { careerLevel: 'JUNIOR' | 'MID' | 'SENIOR' | 'PRINCIPAL'; retirementDate: Date | null } => {
    const scripted = SUCCESSION_DEMO[u.email];
    if (scripted) {
      return {
        careerLevel: scripted.careerLevel,
        retirementDate: scripted.retiresInDays === undefined ? null : new Date(NOW.getTime() + scripted.retiresInDays * DAY),
      };
    }
    // Roughly a tenth of the workforce is within the configured two-year window.
    const band = rng.int(0, 9);
    const careerLevel = band <= 3 ? 'JUNIOR' : band <= 7 ? 'MID' : band === 8 ? 'SENIOR' : 'PRINCIPAL';
    const retirementDate = band === 9 ? new Date(NOW.getTime() + rng.int(120, 900) * DAY) : band === 8 ? new Date(NOW.getTime() + rng.int(900, 3000) * DAY) : null;
    return { careerLevel, retirementDate };
  };

  const adminAt = daysAgo(349, NOW);
  const admin = addUser({ email: 'admin@imd.gov.in', name: 'Meera Iyer', role: 'ADMIN', status: 'ACTIVE', employeeId: 'IMD-HR-0007', location: 'New Delhi', designation: 'Director, Capacity Building', deptCode: 'HRD', roleCode: 'LDO', createdAt: adminAt });
  addUser({ email: 'rajesh.khanna@imd.gov.in', name: 'Rajesh Khanna', role: 'ADMIN', status: 'ACTIVE', employeeId: 'IMD-HR-0011', location: 'New Delhi', designation: 'Deputy Director, HRD', deptCode: 'HRD', roleCode: 'LDO', createdAt: adminAt });
  const trainers = new Map<TrainerKey, UserRow>();
  for (const [key, profile] of Object.entries(TRAINER_PROFILES) as [TrainerKey, (typeof TRAINER_PROFILES)[TrainerKey]][]) {
    trainers.set(key, addUser({ email: profile.email, name: profile.name, role: 'TRAINER', status: 'ACTIVE', employeeId: profile.employeeId, location: profile.location, designation: profile.designation, deptCode: profile.department as DepartmentCode, roleCode: 'SST', createdAt: daysAgo(348, NOW), ability: 0.08 }));
  }
  const demoTrainee = addUser({ email: 'trainee@imd.gov.in', name: 'Dr. Ananya Rao', role: 'TRAINEE', status: 'ACTIVE', employeeId: 'IMD-TR-1024', location: 'New Delhi', designation: 'Scientific Assistant', deptCode: 'FC', roleCode: 'SWF', createdAt: daysAgo(340, NOW) });
  /**
   * Scripted employee for the operational-readiness demonstration: his Radar
   * Meteorology sits just under the 80% his role requires and was practised very
   * recently, so it reads as current today and decays to about 51% (AT RISK) when
   * the readiness simulation looks three months ahead.
   */
  const demoRadar = addUser({ email: 'arjun.sharma@imd.gov.in', name: 'Arjun Sharma', role: 'TRAINEE', status: 'ACTIVE', employeeId: 'IMD-TR-1042', location: 'New Delhi', designation: 'Radar Meteorologist', deptCode: 'FC', roleCode: 'SWF', createdAt: daysAgo(335, NOW) });

  /**
   * Scripted senior expert for the knowledge-continuity demonstration: one of the
   * few people at expert level in radar analysis, with a recorded retirement date
   * inside the configured two-year window.
   */
  const demoExpert = addUser({ email: 'kamala.nair@imd.gov.in', name: 'Kamala Nair', role: 'TRAINEE', status: 'ACTIVE', employeeId: 'IMD-RD-0009', location: 'Chennai', designation: 'Senior Radar Specialist', deptCode: 'RD', roleCode: 'RDM', createdAt: daysAgo(346, NOW), ability: 0.3 });

  TRAINEES.forEach((person: PersonSeed, index) => {
    addUser({ email: slugEmail(person.name), name: person.name, role: 'TRAINEE', status: 'ACTIVE', employeeId: `IMD-TR-${1100 + index * 7}`, location: person.location, designation: person.designation, deptCode: person.dept, roleCode: person.role, createdAt: daysAgo(rng.int(300, 340), NOW), ability: person.ability ?? 0 });
  });
  const pendingUsers = PENDING.map((person, index) =>
    addUser({ email: slugEmail(person.name), name: person.name, role: 'TRAINEE', status: 'PENDING', employeeId: `IMD-TR-${1900 + index}`, location: person.location, designation: person.designation, deptCode: person.dept, roleCode: person.role, createdAt: daysAgo(index + 1, NOW) }),
  );
  addUser({ email: 'rakesh.gupta@imd.gov.in', name: 'Rakesh Gupta', role: 'TRAINEE', status: 'SUSPENDED', employeeId: 'IMD-TR-1888', location: 'Lucknow', designation: 'Meteorologist', deptCode: 'FC', roleCode: 'SWF', createdAt: daysAgo(320, NOW) });

  await prisma.user.createMany({
    data: users.map((u) => ({
      id: u.id,
      email: u.email,
      passwordHash,
      name: u.name,
      employeeId: u.employeeId,
      phone: `+91 9${rng.int(100000000, 899999999)}`,
      designation: u.designation,
      location: u.location,
      joiningDate: new Date(Date.UTC(rng.int(2010, 2025), rng.int(0, 11), rng.int(1, 28))),
      ...retirementFor(u),
      role: u.role,
      status: u.status,
      departmentId: u.deptId,
      jobRoleId: u.roleId,
      approvedAt: u.status === 'PENDING' ? null : u.createdAt,
      approvedById: u.status === 'PENDING' ? null : admin.id,
      createdAt: u.createdAt,
    })),
  });
  const employees = users.filter((u) => u.status === 'ACTIVE' && u.roleId);
  console.log(`  ${users.length} users (3 demo accounts, ${TRAINEES.length + 1} trainees, ${trainers.size} trainers, 2 admins, ${pendingUsers.length} pending approval)`);

  // ---- professional profiles -----------------------------------------------------------------------
  const profiles: Prisma.ProfessionalProfileCreateManyInput[] = [];
  const qualifications: Prisma.QualificationCreateManyInput[] = [];
  const experiences: Prisma.WorkExperienceCreateManyInput[] = [];
  const skills: Prisma.ProfileSkillCreateManyInput[] = [];
  for (const user of users.filter((u) => u.status !== 'PENDING')) {
    const profileId = randomUUID();
    const trainerProfile = [...trainers.entries()].find(([, row]) => row.id === user.id)?.[0];
    profiles.push({
      id: profileId,
      userId: user.id,
      headline: trainerProfile ? `${user.designation}, IMD` : `${user.designation}, IMD ${user.location}`,
      bio: trainerProfile ? TRAINER_PROFILES[trainerProfile].bio : null,
      expertise: trainerProfile ? TRAINER_PROFILES[trainerProfile].expertise : [],
      createdAt: user.createdAt,
    });
    for (const q of rng.shuffle(QUALIFICATIONS).slice(0, rng.int(1, 2))) qualifications.push({ profileId, ...q, yearCompleted: rng.int(2004, 2022) });
    experiences.push({ profileId, title: user.designation, organization: 'India Meteorological Department', location: user.location, startDate: new Date(Date.UTC(rng.int(2010, 2024), rng.int(0, 11), 1)), description: 'Operational duties in the regional forecasting and observation programme.' });
    for (const name of rng.shuffle(SKILLS).slice(0, rng.int(3, 6))) skills.push({ profileId, name, proficiency: rng.int(2, 5) });
  }
  await prisma.professionalProfile.createMany({ data: profiles });
  await prisma.qualification.createMany({ data: qualifications });
  await prisma.workExperience.createMany({ data: experiences });
  await prisma.profileSkill.createMany({ data: skills });

  // ---- courses, modules, materials, assessments ---------------------------------------------------------
  const uploads = path.resolve(ROOT, process.env['STORAGE_LOCAL_DIR'] ?? './uploads');
  const writeFile = (key: string, data: Buffer) => {
    const target = path.join(uploads, key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  };

  const courseRows: CourseRow[] = [];
  const courseData: Prisma.CourseCreateManyInput[] = [];
  const courseMaps: Prisma.CourseCompetencyCreateManyInput[] = [];
  const prerequisites: Prisma.CoursePrerequisiteCreateManyInput[] = [];
  const modules: Prisma.ModuleCreateManyInput[] = [];
  const materials: Prisma.LearningMaterialCreateManyInput[] = [];
  const assessments: Prisma.AssessmentCreateManyInput[] = [];
  const questionData: Prisma.QuestionCreateManyInput[] = [];
  const optionData: Prisma.QuestionOptionCreateManyInput[] = [];

  for (const seed of COURSES) {
    const trainer = trainers.get(seed.trainer) as UserRow;
    const courseId = randomUUID();
    const createdAt = daysAgo(rng.int(250, 330), NOW);
    const status = seed.status ?? 'PUBLISHED';
    const [from, to] = CATEGORY_COLOURS[seed.category] ?? CATEGORY_COLOURS['Forecasting']!;
    const thumbnailKey = `thumbnails/${courseId}/${randomUUID()}.png`;
    writeFile(thumbnailKey, coverPng(640, 360, from, to, seed.key.length * 977 + seed.title.charCodeAt(0)));

    courseData.push({
      id: courseId,
      title: seed.title,
      description: seed.description,
      category: seed.category,
      difficulty: seed.difficulty,
      durationMinutes: seed.modules.reduce((sum, m) => sum + m.minutes, 0),
      thumbnailKey,
      outcomes: seed.outcomes,
      passingScore: seed.passingScore,
      certificateEnabled: true,
      status,
      publishedAt: status === 'PUBLISHED' || status === 'ARCHIVED' ? new Date(createdAt.getTime() + 9 * DAY) : null,
      trainerId: trainer.id,
      createdAt,
    });
    for (const mapping of seed.competencies) courseMaps.push({ courseId, competencyId: competencyId.get(mapping.code) as string, levelFrom: mapping.from, levelTo: mapping.to });

    const moduleIds: string[] = [];
    let handbook: Buffer | null = null;
    for (const [index, module] of seed.modules.entries()) {
      const moduleId = randomUUID();
      moduleIds.push(moduleId);
      modules.push({ id: moduleId, courseId, title: module.title, description: module.description, position: index, durationMinutes: module.minutes, createdAt });
      let position = 0;
      if (index === 0) {
        handbook = await handbookPdf({ title: seed.title, category: seed.category, difficulty: seed.difficulty, trainer: trainer.name, description: seed.description, outcomes: seed.outcomes, modules: seed.modules });
        const key = `materials/${courseId}/${randomUUID()}.pdf`;
        writeFile(key, handbook);
        materials.push({ moduleId, title: `${seed.title} - course handbook (PDF)`, type: 'DOCUMENT', fileKey: key, fileName: `${seed.key}-handbook.pdf`, mimeType: 'application/pdf', sizeBytes: handbook.length, position: position++, createdAt });
      }
      materials.push({ moduleId, title: `Lecture notes: ${module.title}`, type: 'TEXT', content: module.notes, position: position++, createdAt });
      if (module.link) materials.push({ moduleId, title: module.link.title, type: 'LINK', url: module.link.url, position: position++, createdAt });
    }
    for (const dep of seed.prerequisites) {
      const prerequisite = courseRows.find((row) => row.seed.key === dep);
      if (!prerequisite) throw new Error(`Course ${seed.key} lists ${dep} as a prerequisite, but it is defined later`);
      prerequisites.push({ courseId, prerequisiteId: prerequisite.id });
    }

    const bank = QUESTION_BANKS[seed.key];
    let assessmentId: string | null = null;
    const questions: CourseRow['questions'] = [];
    if (bank && seed.assessment !== false) {
      assessmentId = randomUUID();
      const deadline = seed.key === 'nwp-essentials' ? new Date(NOW.getTime() + 6 * DAY) : null;
      assessments.push({
        id: assessmentId,
        courseId,
        title: `${seed.title} - Final Assessment`,
        description: `Automatically marked assessment for ${seed.title}.`,
        instructions: 'Answer every question. The timer starts when you begin. You can only take the assessment after completing all modules.',
        timeLimitMinutes: seed.timeLimit,
        passingScore: seed.passingScore,
        maxAttempts: seed.maxAttempts,
        deadline,
        isPublished: status === 'PUBLISHED',
        createdById: trainer.id,
        createdAt: new Date(createdAt.getTime() + 5 * DAY),
      });
      bank.forEach((question, qi) => {
        const questionId = randomUUID();
        const all = [...question.correct.map((text) => ({ text, isCorrect: true })), ...question.wrong.map((text) => ({ text, isCorrect: false }))];
        const shift = qi % all.length;
        const rotated = [...all.slice(shift), ...all.slice(0, shift)];
        const options = rotated.map((option, position) => ({ id: randomUUID(), text: option.text, isCorrect: option.isCorrect, position }));
        questionData.push({ id: questionId, assessmentId: assessmentId as string, text: question.text, type: question.type, marks: question.marks, explanation: question.explanation, position: qi });
        for (const option of options) optionData.push({ id: option.id, questionId, text: option.text, isCorrect: option.isCorrect, position: option.position });
        questions.push({ id: questionId, marks: question.marks, type: question.type, options: options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })) });
      });
    }
    courseRows.push({ seed, id: courseId, trainerId: trainer.id, moduleIds, createdAt, questions, assessmentId });
  }
  await prisma.course.createMany({ data: courseData });
  await prisma.courseCompetency.createMany({ data: courseMaps });
  await prisma.coursePrerequisite.createMany({ data: prerequisites });
  await prisma.module.createMany({ data: modules });
  await prisma.learningMaterial.createMany({ data: materials });
  await prisma.assessment.createMany({ data: assessments });
  await prisma.question.createMany({ data: questionData });
  await prisma.questionOption.createMany({ data: optionData });

  // ---- the practical component of the assessments that have one ------------------------------------------
  let scenarioCount = 0;
  for (const [key, practical] of Object.entries(PRACTICAL_SCENARIOS)) {
    const course = courseRows.find((row) => row.seed.key === key);
    if (!course?.assessmentId) continue;
    // The written questions keep `mcqWeight` of the mark; the scenarios take the rest.
    await prisma.assessment.update({ where: { id: course.assessmentId }, data: { mcqWeight: practical.mcqWeight } });
    for (const [position, scenario] of practical.scenarios.entries()) {
      await prisma.practicalScenario.create({
        data: {
          assessmentId: course.assessmentId,
          title: scenario.title,
          briefing: scenario.briefing,
          marks: scenario.steps.reduce((sum, step) => sum + step.marks, 0),
          position,
          steps: {
            create: scenario.steps.map((step, stepPosition) => ({
              type: step.type,
              prompt: step.prompt,
              marks: step.marks,
              explanation: step.explanation ?? null,
              position: stepPosition,
              options: { create: step.options.map((option, optionPosition) => ({ text: option.text, credit: option.credit, rationale: option.rationale ?? null, position: optionPosition })) },
            })),
          },
        },
      });
      scenarioCount += 1;
    }
  }
  console.log(`  ${scenarioCount} practical scenarios (simulated exercises) on ${Object.keys(PRACTICAL_SCENARIOS).length} assessments`);

  // ---- the AR Instrument Lab -----------------------------------------------------------------
  // Modules are created parent-first so a refresher can point at the lab it refreshes.
  const arModuleId = new Map<string, string>();
  let arComponentCount = 0;
  let arTaskCount = 0;
  for (const module of [...AR_MODULES].sort((a, b) => (a.kind === 'FULL_LAB' ? -1 : 1) - (b.kind === 'FULL_LAB' ? -1 : 1))) {
    const created = await prisma.aRModule.create({
      data: {
        key: module.key,
        title: module.title,
        subtitle: module.subtitle,
        description: module.description,
        objectives: [...module.objectives],
        modelUrl: module.modelUrl,
        modelHeightM: module.modelHeightM,
        competencyId: competencyId.get(module.competencyCode as CompetencyCode) as string,
        courseId: module.courseKey ? (courseRows.find((row) => row.seed.key === module.courseKey)?.id ?? null) : null,
        kind: module.kind,
        parentModuleId: module.parentKey ? (arModuleId.get(module.parentKey) ?? null) : null,
        difficulty: module.difficulty,
        durationMinutes: module.durationMinutes,
        passingScore: module.passingScore,
        theoryWeight: module.theoryWeight,
        isPublished: true,
        isSimulation: true,
        position: module.kind === 'FULL_LAB' ? 0 : 1,
        components: {
          create: module.components.map((component, position) => ({
            key: component.key,
            name: component.name,
            description: component.description,
            hotspotPosition: component.hotspotPosition,
            // A nullable Json column needs Prisma's own null, not JavaScript's.
            hotspotNormal: component.hotspotNormal ?? Prisma.DbNull,
            isInteractive: component.isInteractive ?? true,
            position,
          })),
        },
      },
      include: { components: true },
    });
    arModuleId.set(module.key, created.id);
    arComponentCount += created.components.length;

    const componentByKey = new Map(created.components.map((component) => [component.key, component.id]));
    let trainingPosition = 0;
    let assessmentPosition = 0;
    for (const task of module.tasks) {
      const answer = componentByKey.get(task.answer);
      if (!answer) throw new Error(`AR module ${module.key}: task answer "${task.answer}" is not one of its components`);
      await prisma.aRTask.create({
        data: {
          arModuleId: created.id,
          phase: task.phase,
          type: task.type,
          position: task.phase === 'TRAINING' ? trainingPosition++ : assessmentPosition++,
          instruction: task.instruction,
          hint: task.hint ?? null,
          explanation: task.explanation ?? null,
          correctComponentId: answer,
          points: task.points ?? 20,
        },
      });
      arTaskCount += 1;
    }
  }
  console.log(`  ${AR_MODULES.length} AR lab modules, ${arComponentCount} components, ${arTaskCount} tasks (simulated training content)`);

  console.log(`  ${courseRows.length} courses (${courseRows.filter((c) => (c.seed.status ?? 'PUBLISHED') === 'PUBLISHED').length} published), ${modules.length} modules, ${questionData.length} questions, ${courseRows.filter((c) => c.assessmentId).length} assessments`);

  const publishedCourses = courseRows.filter((c) => (c.seed.status ?? 'PUBLISHED') === 'PUBLISHED' && c.assessmentId);
  const courseByKey = new Map(courseRows.map((c) => [c.seed.key, c]));

  // ---- baselines -----------------------------------------------------------------------------------------
  const baselineLevel = new Map<string, number>(); // `${userId}:${code}`
  const baselineRows: Prisma.EmployeeCompetencyCreateManyInput[] = [];
  const baselineHistory: Prisma.CompetencyHistoryCreateManyInput[] = [];

  /** Scripted baselines for the demo trainee (Radar 35%, required 80%: the gap of 45 from the brief). */
  const DEMO_BASELINE: Partial<Record<CompetencyCode, number>> = { RADAR: 35, FORECASTING: 55, SATELLITE: 62, NWP: 52, ATMOSPHERIC: 66, DATA: 38, CLIMATE: 55, DRM: 58 };

  /**
   * Scripted baselines for the readiness demonstration. Radar sits at 72% against
   * the 80% the role requires: current today, and about 51% (AT RISK) once the
   * simulation looks 90 days ahead with the configured 180-day half-life.
   */
  const DEMO_RADAR_BASELINE: Partial<Record<CompetencyCode, number>> = { RADAR: 72, FORECASTING: 78, SATELLITE: 68, NWP: 64, ATMOSPHERIC: 71, DATA: 62, CLIMATE: 58, DRM: 66 };

  /** The senior expert: at the top of radar analysis, and close to retirement. */
  const DEMO_EXPERT_BASELINE: Partial<Record<CompetencyCode, number>> = { RADAR: 95, FORECASTING: 88, SATELLITE: 84, ATMOSPHERIC: 86, DATA: 82, DRM: 79 };

  const practiceRows: Prisma.CompetencyPracticeRecordCreateManyInput[] = [];

  for (const user of employees) {
    const requirements = requirementsByRole.get(user.roleCode as RoleCode) as Map<CompetencyCode, { required: number }>;
    const profile = DEPARTMENT_PROFILE[user.deptCode];
    for (const [code, { required }] of requirements) {
      let level: number;
      if (user.id === demoTrainee.id) level = DEMO_BASELINE[code] ?? Math.round(required * 0.7);
      else if (user.id === demoRadar.id) level = DEMO_RADAR_BASELINE[code] ?? Math.round(required * 0.8);
      else if (user.id === demoExpert.id) level = DEMO_EXPERT_BASELINE[code] ?? Math.round(required * 0.95);
      else {
        const factor = (profile[code] ?? 0.65) + user.ability + rng.gaussian(0, 0.06);
        level = clamp(Math.round(required * factor), 12, 96);
      }

      /**
       * When the competency was last actually used. Spread realistically so the
       * organisation shows a believable mix of fresh, watched and at-risk people
       * on day one; the demonstration employee is deliberately recent so the
       * simulation, not the seed, is what puts him at risk.
       */
      let practisedDaysAgo: number;
      if (user.id === demoRadar.id) practisedDaysAgo = code === 'RADAR' ? 3 : rng.int(5, 60);
      else if (user.id === demoExpert.id) practisedDaysAgo = rng.int(1, 20);
      else if (user.role !== 'TRAINEE') practisedDaysAgo = rng.int(2, 90);
      else {
        /**
         * Four cohorts, weighted towards recent practice because most of the
         * workforce is operationally active. The tail of long-unused competencies
         * is what gives the readiness dashboard something to find.
         */
        const band = rng.int(0, 9);
        practisedDaysAgo = band <= 5 ? rng.int(1, 45) : band <= 7 ? rng.int(45, 110) : band === 8 ? rng.int(110, 200) : rng.int(200, 330);
      }
      const practicedAt = daysAgo(Math.min(practisedDaysAgo, Math.floor((NOW.getTime() - user.createdAt.getTime()) / DAY)), NOW);

      /**
       * When the level was last verified, which drives recertification. Using the
       * joining date would put almost everyone past a one-year recertification on
       * day one, so the demo data spreads assessments realistically instead: most
       * people were reassessed within the last few months, a few are overdue.
       */
      const assessedDaysAgo = user.id === demoRadar.id || user.id === demoExpert.id ? rng.int(20, 90) : rng.int(0, 9) <= 7 ? rng.int(20, 200) : rng.int(200, 400);
      const assessedAt = daysAgo(Math.min(assessedDaysAgo, Math.floor((NOW.getTime() - user.createdAt.getTime()) / DAY)), NOW);

      baselineLevel.set(`${user.id}:${code}`, level);
      baselineRows.push({ userId: user.id, competencyId: competencyId.get(code) as string, currentLevel: level, lastEvidenceAt: assessedAt, lastPracticedAt: practicedAt, createdAt: user.createdAt });
      baselineHistory.push({ userId: user.id, competencyId: competencyId.get(code) as string, previousLevel: 0, newLevel: level, source: 'BASELINE', details: { explanation: 'Baseline recorded during onboarding.' }, createdAt: user.createdAt });
      practiceRows.push({ userId: user.id, competencyId: competencyId.get(code) as string, practicedAt, source: 'OPERATIONAL_DUTY', note: 'Recorded from operational duty rosters (demonstration data).', createdAt: practicedAt });
    }
  }
  await prisma.employeeCompetency.createMany({ data: baselineRows });
  await prisma.competencyHistory.createMany({ data: baselineHistory });
  await prisma.competencyPracticeRecord.createMany({ data: practiceRows });

  // ---- learning activity plan -------------------------------------------------------------------------------
  type Outcome = 'CERTIFIED' | 'CERTIFIED_AFTER_RETRY' | 'IN_PROGRESS' | 'ASSESSMENT_PENDING' | 'ENROLLED' | 'WITHDRAWN' | 'STALLED';
  interface Run {
    user: UserRow;
    course: CourseRow;
    outcome: Outcome;
    enrollAt: Date;
    moduleTimes: Date[];
    attempts: { at: Date; pct: number; passed: boolean }[];
    feedback?: { rating: number; trainerRating: number; comment: string | null; at: Date };
    evaluation?: { at: Date; type: 'EVALUATION' | 'PRACTICAL'; ratings: EvaluationRatings; withCourse: boolean; comment: string };
  }
  const runs: Run[] = [];

  const modulesDone = (course: CourseRow, from: Date, spanDays: number, count = course.moduleIds.length): Date[] => {
    const times: Date[] = [];
    let cursor = from.getTime();
    for (let i = 0; i < count; i += 1) {
      cursor += Math.round((0.5 + rng.float() * (spanDays / Math.max(1, count))) * DAY);
      times.push(new Date(Math.min(cursor, NOW.getTime() - 3600_000)));
    }
    return times;
  };

  const ratingsFrom = (pct: number): EvaluationRatings => {
    const base = pct >= 90 ? 5 : pct >= 78 ? 4 : pct >= 66 ? 3.4 : 3;
    const draw = () => clamp(Math.round(base + rng.gaussian(0, 0.6)), 2, 5);
    return { technicalKnowledge: draw(), practicalAbility: draw(), participation: draw(), applicationOfKnowledge: draw(), overallCompetency: draw() };
  };

  // --- the scripted demo trainee ---------------------------------------------------------------------------------
  const fundamentals = courseByKey.get('forecasting-fundamentals') as CourseRow;
  const python = courseByKey.get('python-met-data') as CourseRow;
  const nwpEssentials = courseByKey.get('nwp-essentials') as CourseRow;
  const drm = courseByKey.get('disaster-risk-management') as CourseRow;
  {
    const aEnroll = daysAgo(232, NOW);
    runs.push({
      user: demoTrainee,
      course: fundamentals,
      outcome: 'CERTIFIED',
      enrollAt: aEnroll,
      moduleTimes: modulesDone(fundamentals, aEnroll, 12),
      attempts: [{ at: daysAgo(206, NOW), pct: 88, passed: true }],
      feedback: { rating: 5, trainerRating: 5, comment: 'Clear explanations and very relevant to day-to-day forecasting.', at: daysAgo(204, NOW) },
      evaluation: { at: daysAgo(190, NOW), type: 'EVALUATION', ratings: { technicalKnowledge: 5, practicalAbility: 4, participation: 5, applicationOfKnowledge: 4, overallCompetency: 4 }, withCourse: false, comment: 'Strong grasp of synoptic reasoning; applies it well in live cases.' },
    });
    const bEnroll = daysAgo(141, NOW);
    runs.push({
      user: demoTrainee,
      course: python,
      outcome: 'CERTIFIED',
      enrollAt: bEnroll,
      moduleTimes: modulesDone(python, bEnroll, 11),
      attempts: [{ at: daysAgo(120, NOW), pct: 81, passed: true }],
      feedback: { rating: 5, trainerRating: 4, comment: 'Excellent course - it closed a real gap in my knowledge.', at: daysAgo(118, NOW) },
    });
    const cEnroll = daysAgo(31, NOW);
    runs.push({ user: demoTrainee, course: nwpEssentials, outcome: 'ASSESSMENT_PENDING', enrollAt: cEnroll, moduleTimes: modulesDone(nwpEssentials, cEnroll, 24), attempts: [] });
    const dEnroll = daysAgo(12, NOW);
    runs.push({ user: demoTrainee, course: drm, outcome: 'IN_PROGRESS', enrollAt: dEnroll, moduleTimes: modulesDone(drm, dEnroll, 8, 2), attempts: [] });
  }

  // --- everyone else ----------------------------------------------------------------------------------------------
  const runsFor = () => {
    const r = rng.float();
    return r < 0.1 ? 0 : r < 0.32 ? 1 : r < 0.6 ? 2 : r < 0.82 ? 3 : 4;
  };
  for (const user of employees.filter((u) => u.role === 'TRAINEE' && u.id !== demoTrainee.id)) {
    const requirements = requirementsByRole.get(user.roleCode as RoleCode) as Map<CompetencyCode, { required: number }>;
    const levels = new Map<CompetencyCode, number>();
    for (const code of requirements.keys()) levels.set(code, baselineLevel.get(`${user.id}:${code}`) as number);
    const done = new Set<string>();
    let cursor = daysAgo(rng.int(170, 300), NOW);
    const wanted = runsFor();
    const wantsCurrent = rng.chance(0.55); // many learners are in the middle of a course right now

    /** Picks a course that still helps this learner (prerequisites done, gap not yet closed), weighted by how much of the gap it covers. */
    const chooseCourse = (): CourseRow | null => {
      const candidates = publishedCourses
        .filter((course) => !done.has(course.seed.key) && course.seed.prerequisites.every((p) => done.has(p)))
        .map((course) => {
          const need = course.seed.competencies.reduce((sum, m) => {
            const required = requirements.get(m.code)?.required;
            const level = levels.get(m.code);
            if (required === undefined || level === undefined) return sum;
            return sum + Math.max(0, Math.min(m.to, required) - Math.max(m.from, level));
          }, 0);
          return { course, weight: need };
        })
        .filter((c) => c.weight > 0);
      if (candidates.length === 0) return null;
      const total = candidates.reduce((sum, c) => sum + c.weight, 0);
      let pick = rng.float() * total;
      for (const candidate of candidates) {
        pick -= candidate.weight;
        if (pick <= 0) return candidate.course;
      }
      return candidates[0]!.course;
    };

    const currentRun = (course: CourseRow, enrollAt: Date): Run => {
      const r = rng.float();
      const outcome: Outcome = r < 0.5 ? 'IN_PROGRESS' : r < 0.78 ? 'ASSESSMENT_PENDING' : 'ENROLLED';
      const times = modulesDone(course, enrollAt, Math.max(2, Math.round((NOW.getTime() - enrollAt.getTime()) / DAY)));
      const run: Run = { user, course, outcome, enrollAt, moduleTimes: times, attempts: [] };
      if (outcome === 'ENROLLED') run.moduleTimes = [];
      if (outcome === 'IN_PROGRESS') run.moduleTimes = times.slice(0, Math.max(1, Math.min(course.moduleIds.length - 1, Math.round(course.moduleIds.length * (0.2 + rng.float() * 0.5)))));
      return run;
    };

    let ended = false;
    for (let i = 0; i < wanted; i += 1) {
      const course = chooseCourse();
      if (!course) break;
      if (cursor.getTime() > NOW.getTime() - 45 * DAY) break;

      const passMark = course.seed.passingScore;
      const passScore = () => clamp(Math.round(rng.gaussian(80 + user.ability * 40, 8)), passMark, 100);
      const moduleTimes = modulesDone(course, cursor, rng.int(9, 24));
      const lastModule = moduleTimes[moduleTimes.length - 1] as Date;
      const attemptAt = new Date(lastModule.getTime() + rng.int(1, 4) * DAY);

      const r = rng.float();
      const outcome: Outcome = r < 0.78 ? 'CERTIFIED' : r < 0.91 ? 'CERTIFIED_AFTER_RETRY' : r < 0.96 ? 'WITHDRAWN' : 'STALLED';

      const run: Run = { user, course, outcome, enrollAt: new Date(cursor), moduleTimes, attempts: [] };
      if (outcome === 'CERTIFIED') run.attempts.push({ at: attemptAt, pct: passScore(), passed: true });
      if (outcome === 'CERTIFIED_AFTER_RETRY') {
        run.attempts.push({ at: attemptAt, pct: clamp(Math.round(rng.gaussian(passMark - 12, 7)), 20, passMark - 1), passed: false });
        run.attempts.push({ at: new Date(attemptAt.getTime() + rng.int(2, 8) * DAY), pct: passScore(), passed: true });
      }
      if (outcome === 'WITHDRAWN' || outcome === 'STALLED') {
        const count = Math.max(1, Math.min(course.moduleIds.length - 1, Math.round(course.moduleIds.length * (0.25 + rng.float() * 0.5))));
        run.moduleTimes = moduleTimes.slice(0, count).filter((t) => t.getTime() < NOW.getTime() - 20 * DAY);
        if (run.moduleTimes.length === 0) run.moduleTimes = [new Date(cursor.getTime() + DAY)];
      }

      const passed = run.attempts.find((a) => a.passed);
      if (!passed) {
        // an abandoned course ends this learner's story
        runs.push(run);
        ended = true;
        break;
      }
      if (rng.chance(0.68)) {
        run.feedback = { rating: clamp(Math.round(rng.gaussian(4.3, 0.7)), 2, 5), trainerRating: clamp(Math.round(rng.gaussian(4.4, 0.6)), 2, 5), comment: rng.chance(0.75) ? rng.pick(FEEDBACK_COMMENTS) : null, at: new Date(passed.at.getTime() + rng.int(0, 3) * DAY) };
      }
      const evalAt = new Date(passed.at.getTime() + rng.int(3, 20) * DAY);
      if (rng.chance(0.32) && evalAt.getTime() < NOW.getTime() - DAY) {
        run.evaluation = { at: evalAt, type: rng.chance(0.3) ? 'PRACTICAL' : 'EVALUATION', ratings: ratingsFrom(passed.pct), withCourse: rng.chance(0.5), comment: rng.pick(EVALUATION_COMMENTS) };
      }
      done.add(course.seed.key);
      for (const m of course.seed.competencies) if (levels.has(m.code)) levels.set(m.code, Math.max(levels.get(m.code) as number, Math.round(m.to * 0.85)));
      cursor = new Date(Math.max(passed.at.getTime(), ...run.moduleTimes.map((t) => t.getTime())) + rng.int(10, 35) * DAY);
      runs.push(run);
    }

    if (!ended && wantsCurrent) {
      const course = chooseCourse();
      if (course) runs.push(currentRun(course, daysAgo(rng.int(3, 34), NOW)));
    }
  }

  // ---- enrollments and module progress (bulk) -----------------------------------------------------------------------
  const enrollmentData: Prisma.EnrollmentCreateManyInput[] = [];
  const moduleProgress: Prisma.ModuleProgressCreateManyInput[] = [];
  const enrollmentId = new Map<Run, string>();
  for (const run of runs) {
    const id = randomUUID();
    enrollmentId.set(run, id);
    const total = run.course.moduleIds.length;
    const completed = run.outcome === 'ENROLLED' ? 0 : run.moduleTimes.length;
    const lastAttempt = run.attempts[run.attempts.length - 1];
    const passedAttempt = run.attempts.find((a) => a.passed);
    const lastActivity = new Date(Math.max(run.enrollAt.getTime(), ...run.moduleTimes.map((t) => t.getTime()), lastAttempt?.at.getTime() ?? 0));
    let status: Prisma.EnrollmentCreateManyInput['status'];
    switch (run.outcome) {
      case 'CERTIFIED':
      case 'CERTIFIED_AFTER_RETRY':
        status = 'CERTIFIED';
        break;
      case 'ASSESSMENT_PENDING':
        status = 'ASSESSMENT_PENDING';
        break;
      case 'ENROLLED':
        status = 'ENROLLED';
        break;
      case 'WITHDRAWN':
        status = 'WITHDRAWN';
        break;
      default:
        status = completed > 0 ? 'IN_PROGRESS' : 'ENROLLED';
    }
    const progress = status === 'CERTIFIED' || status === 'ASSESSMENT_PENDING' ? 100 : Math.round((completed / total) * 100);
    enrollmentData.push({
      id,
      userId: run.user.id,
      courseId: run.course.id,
      status,
      progress,
      enrolledAt: run.enrollAt,
      startedAt: completed > 0 ? run.moduleTimes[0] ?? run.enrollAt : null,
      completedAt: passedAttempt?.at ?? null,
      lastAccessedAt: lastActivity,
      createdAt: run.enrollAt,
    });
    const done = status === 'CERTIFIED' || status === 'ASSESSMENT_PENDING' ? total : completed;
    for (let i = 0; i < done; i += 1) moduleProgress.push({ enrollmentId: id, moduleId: run.course.moduleIds[i] as string, completedAt: run.moduleTimes[i] ?? run.moduleTimes[run.moduleTimes.length - 1] ?? run.enrollAt });
    if (status === 'ASSESSMENT_PENDING' && run.moduleTimes.length < total) {
      // top up so a "pending" enrollment really has every module done
      const base = run.moduleTimes[run.moduleTimes.length - 1] ?? run.enrollAt;
      while (moduleProgress.filter((m) => m.enrollmentId === id).length < total) {
        const index = moduleProgress.filter((m) => m.enrollmentId === id).length;
        moduleProgress.push({ enrollmentId: id, moduleId: run.course.moduleIds[index] as string, completedAt: base });
      }
    }
  }
  await prisma.enrollment.createMany({ data: enrollmentData });
  await prisma.moduleProgress.createMany({ data: moduleProgress });
  console.log(`  ${enrollmentData.length} enrollments, ${moduleProgress.length} module completions`);

  // ---- chronological replay: assessments, certificates, evaluations, competency updates ----------------------------------
  interface TimelineEvent {
    at: Date;
    run: () => Promise<void>;
  }
  const events: TimelineEvent[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const feedbackRows: Prisma.FeedbackCreateManyInput[] = [];
  let attemptCount = 0;
  let certificateCount = 0;
  let evaluationCount = 0;

  const pickAnswers = (course: CourseRow, targetPct: number, passed: boolean) => {
    const total = course.questions.reduce((sum, q) => sum + q.marks, 0);
    const passMark = course.seed.passingScore;
    const order = rng.shuffle(course.questions);
    const correct = new Set<string>();
    let score = 0;
    for (const question of order) {
      const next = score + question.marks;
      const currentPct = (score / total) * 100;
      if (passed) {
        if (currentPct >= targetPct) break;
      } else if ((next / total) * 100 >= passMark || currentPct >= targetPct) {
        continue;
      }
      correct.add(question.id);
      score = next;
    }
    return { correct, score, total, percentage: Math.round((score / total) * 10000) / 100 };
  };

  for (const run of runs) {
    const enrollment = enrollmentId.get(run) as string;
    auditRows.push({ userId: run.user.id, action: 'COURSE_ENROLLED', entityType: 'Course', entityId: run.course.id, metadata: { title: run.course.seed.title }, createdAt: run.enrollAt });

    run.attempts.forEach((attempt, attemptIndex) => {
      events.push({
        at: attempt.at,
        run: async () => {
          const picked = pickAnswers(run.course, attempt.pct, attempt.passed);
          const attemptId = randomUUID();
          const started = new Date(attempt.at.getTime() - rng.int(9, 24) * 60_000);
          await prisma.assessmentAttempt.create({
            data: {
              id: attemptId,
              assessmentId: run.course.assessmentId as string,
              userId: run.user.id,
              enrollmentId: enrollment,
              attemptNumber: attemptIndex + 1,
              status: 'SUBMITTED',
              startedAt: started,
              submittedAt: attempt.at,
              expiresAt: new Date(started.getTime() + run.course.seed.timeLimit * 60_000),
              questionOrder: rng.shuffle(run.course.questions).map((q) => q.id),
              score: picked.score,
              totalMarks: picked.total,
              percentage: picked.percentage,
              passed: attempt.passed && picked.percentage >= run.course.seed.passingScore,
              timeTakenSeconds: Math.round((attempt.at.getTime() - started.getTime()) / 1000),
              createdAt: started,
            },
          });
          await prisma.assessmentAnswer.createMany({
            data: run.course.questions.map((question) => {
              const isCorrect = picked.correct.has(question.id);
              const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
              const wrongIds = question.options.filter((o) => !o.isCorrect).map((o) => o.id);
              const selected = isCorrect ? correctIds : question.type === 'MULTIPLE' ? [correctIds[0] as string] : [rng.pick(wrongIds)];
              return { attemptId, questionId: question.id, selectedOptionIds: selected, isCorrect, marksAwarded: isCorrect ? question.marks : 0 };
            }),
          });
          attemptCount += 1;
          auditRows.push({ userId: run.user.id, action: 'ASSESSMENT_SUBMITTED', entityType: 'Assessment', entityId: run.course.assessmentId, metadata: { course: run.course.seed.title, attempt: attemptIndex + 1, percentage: picked.percentage, passed: attempt.passed }, createdAt: attempt.at });

          if (attempt.passed) {
            const certificate = await prisma.certificate.create({
              data: {
                certificateNumber: certificateNumber(attempt.at),
                userId: run.user.id,
                courseId: run.course.id,
                enrollmentId: enrollment,
                attemptId,
                holderName: run.user.name,
                courseTitle: run.course.seed.title,
                issuer: process.env['CERTIFICATE_ISSUER'] ?? 'India Meteorological Department, Ministry of Earth Sciences',
                score: picked.percentage,
                issuedAt: attempt.at,
                createdAt: attempt.at,
              },
            });
            certificateCount += 1;
            auditRows.push({ userId: run.user.id, action: 'CERTIFICATE_ISSUED', entityType: 'Certificate', entityId: certificate.id, metadata: { certificateNumber: certificate.certificateNumber, course: run.course.seed.title }, createdAt: attempt.at });
            await applyCompetencyEvidence(prisma, { kind: 'ASSESSMENT', userId: run.user.id, courseId: run.course.id, attemptId, assessmentScore: picked.percentage }, config, attempt.at);
          }
        },
      });
    });

    if (run.feedback) {
      const feedback = run.feedback;
      feedbackRows.push({ userId: run.user.id, courseId: run.course.id, rating: feedback.rating, trainerRating: feedback.trainerRating, comment: feedback.comment, createdAt: feedback.at, updatedAt: feedback.at });
    }

    if (run.evaluation) {
      const evaluation = run.evaluation;
      const primary = run.course.seed.competencies[0]!;
      events.push({
        at: evaluation.at,
        run: async () => {
          const weightedScore = weightedEvaluationScore(evaluation.ratings, config.evaluationWeights);
          const trainerId = run.course.trainerId;
          const competency = run.user.id === demoTrainee.id ? competencyId.get('FORECASTING') : competencyId.get(primary.code);
          const row = await prisma.trainerEvaluation.create({
            data: {
              traineeId: run.user.id,
              trainerId,
              courseId: evaluation.withCourse ? run.course.id : null,
              competencyId: competency ?? null,
              type: evaluation.type,
              ...evaluation.ratings,
              weightedScore,
              weightsUsed: config.evaluationWeights as unknown as Prisma.InputJsonValue,
              comments: evaluation.comment,
              createdAt: evaluation.at,
            },
          });
          evaluationCount += 1;
          auditRows.push({ userId: trainerId, action: 'EVALUATION_CREATED', entityType: 'TrainerEvaluation', entityId: row.id, metadata: { trainee: run.user.name, weightedScore, type: evaluation.type }, createdAt: evaluation.at });
          await applyCompetencyEvidence(
            prisma,
            { kind: evaluation.type === 'PRACTICAL' ? 'PRACTICAL' : 'TRAINER_EVALUATION', userId: run.user.id, courseId: evaluation.withCourse ? run.course.id : null, competencyIds: competency ? [competency] : [], evaluationId: row.id },
            config,
            evaluation.at,
          );
        },
      });
    }
  }

  // Strict chronological order: every update sees exactly the evidence that existed at that moment.
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const event of events) await event.run();
  await prisma.feedback.createMany({ data: feedbackRows });
  console.log(`  ${attemptCount} assessment attempts, ${certificateCount} certificates, ${evaluationCount} trainer evaluations, ${feedbackRows.length} course ratings`);
  const historyCount = await prisma.competencyHistory.count({ where: { NOT: { source: 'BASELINE' } } });
  console.log(`  ${historyCount} competency updates written by the engine`);

  // ---- audit trail (history of platform administration) ------------------------------------------------------------------
  for (const dept of DEPARTMENTS) auditRows.push({ userId: admin.id, action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: deptId.get(dept.code), metadata: { name: dept.name }, createdAt: frameworkAt });
  for (const c of COMPETENCIES) auditRows.push({ userId: admin.id, action: 'COMPETENCY_CREATED', entityType: 'Competency', entityId: competencyId.get(c.code), metadata: { name: c.name }, createdAt: new Date(frameworkAt.getTime() + 3600_000) });
  for (const r of ROLES) auditRows.push({ userId: admin.id, action: 'ROLE_CREATED', entityType: 'Role', entityId: roleId.get(r.code), metadata: { name: r.name }, createdAt: new Date(frameworkAt.getTime() + 7200_000) });
  for (const user of employees) auditRows.push({ userId: admin.id, action: 'USER_APPROVED', entityType: 'User', entityId: user.id, metadata: { email: user.email }, createdAt: new Date(user.createdAt.getTime() + 6 * 3600_000) });
  for (const course of courseRows) {
    auditRows.push({ userId: course.trainerId, action: 'COURSE_CREATED', entityType: 'Course', entityId: course.id, metadata: { title: course.seed.title }, createdAt: course.createdAt });
    if ((course.seed.status ?? 'PUBLISHED') !== 'DRAFT') auditRows.push({ userId: course.trainerId, action: (course.seed.status ?? 'PUBLISHED') === 'ARCHIVED' ? 'COURSE_ARCHIVED' : 'COURSE_PUBLISHED', entityType: 'Course', entityId: course.id, metadata: { title: course.seed.title }, createdAt: new Date(course.createdAt.getTime() + 9 * DAY) });
  }
  for (const user of pendingUsers) auditRows.push({ userId: user.id, action: 'USER_REGISTERED', entityType: 'User', entityId: user.id, metadata: { requiresApproval: true }, createdAt: user.createdAt });
  auditRows.push({ userId: admin.id, action: 'USER_STATUS_CHANGED', entityType: 'User', entityId: users.find((u) => u.status === 'SUSPENDED')?.id, metadata: { to: 'SUSPENDED' }, createdAt: daysAgo(40, NOW) });
  for (let i = 0; i < auditRows.length; i += 1) {
    const row = auditRows[i] as Prisma.AuditLogCreateManyInput;
    row.ipAddress = `10.20.${rng.int(1, 40)}.${rng.int(2, 250)}`;
    row.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0 Safari/537.36';
  }
  await prisma.auditLog.createMany({ data: auditRows });

  // ---- announcements & notifications ---------------------------------------------------------------------------------------
  const announcementsData = [
    { title: 'Monsoon readiness training window is open', body: 'All forecasting and radar staff are encouraged to complete at least one course from their learning path before the peak monsoon season. Managers will review progress in the next capacity-building meeting.', audience: 'ALL' as const, at: daysAgo(9, NOW), expires: new Date(NOW.getTime() + 60 * DAY) },
    { title: 'New course: Advanced Radar Analysis & Nowcasting', body: 'Dr. Arjun Mehta has published the advanced radar course. It builds on Radar Fundamentals and Doppler Radar Analysis and closes the largest skill gap identified across forecasting centres.', audience: 'TRAINEES' as const, at: daysAgo(4, NOW), expires: null },
    { title: 'Platform maintenance on Sunday, 02:00-04:00 IST', body: 'Capacity Connect will be briefly unavailable during scheduled maintenance. Assessments in progress will not be interrupted if you submit before 02:00.', audience: 'ALL' as const, at: daysAgo(2, NOW), expires: new Date(NOW.getTime() + 5 * DAY) },
  ];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const active = users.filter((u) => u.status === 'ACTIVE');
  for (const item of announcementsData) {
    const announcement = await prisma.announcement.create({ data: { title: item.title, body: item.body, audience: item.audience, createdById: admin.id, publishedAt: item.at, expiresAt: item.expires, createdAt: item.at } });
    for (const user of active) {
      if (item.audience === 'TRAINEES' && user.role !== 'TRAINEE') continue;
      notifications.push({
        userId: user.id,
        type: 'ANNOUNCEMENT',
        title: item.title,
        message: item.body.length > 240 ? `${item.body.slice(0, 237)}...` : item.body,
        link: '/announcements',
        dedupeKey: `announcement:${announcement.id}`,
        isRead: user.id === demoTrainee.id ? item.at.getTime() < daysAgo(5, NOW).getTime() : rng.chance(0.55),
        readAt: null,
        metadata: { announcementId: announcement.id },
        createdAt: item.at,
      });
    }
  }

  // the demo trainee's inbox: recent activity, some unread
  const demoNotification = (type: Prisma.NotificationCreateManyInput['type'], title: string, message: string, link: string, at: Date, isRead: boolean, key?: string) =>
    notifications.push({ userId: demoTrainee.id, type, title, message, link, isRead, readAt: isRead ? new Date(at.getTime() + 3600_000) : null, dedupeKey: key ?? null, createdAt: at });
  const radarFundamentals = courseByKey.get('radar-fundamentals') as CourseRow;
  demoNotification('COURSE_RECOMMENDATION', 'New course for your skill gaps: Radar Fundamentals', 'Radar Meteorology is your highest-priority gap (35% against 80% required). This course is the first step of your learning path.', `/trainee/courses/${radarFundamentals.id}`, daysAgo(3, NOW), false, 'seed:radar-recommendation');
  demoNotification('ASSESSMENT_DEADLINE', 'Assessment due in 6 days: Numerical Weather Prediction Essentials', 'You have completed every module. Take the assessment before it closes to earn your certificate and competency update.', `/trainee/learn/${nwpEssentials.id}`, daysAgo(1, NOW), false, 'seed:nwp-deadline');
  demoNotification('COURSE_ENROLLMENT', 'Enrolled: Disaster Risk Management & Impact-Based Forecasting', 'You are enrolled. Work through the modules, then take the assessment.', `/trainee/learn/${drm.id}`, daysAgo(12, NOW), true, 'seed:drm-enrol');
  demoNotification('EVALUATION_RECEIVED', 'New trainer evaluation: 88%', 'Dr. Neha Kapoor evaluated your performance in Weather Forecasting.', '/trainee/passport', daysAgo(190, NOW), true, 'seed:eval');
  demoNotification('CERTIFICATE_ISSUED', 'Certificate issued: Python for Meteorological Data', 'Your certificate is ready to download and share.', '/trainee/certificates', daysAgo(120, NOW), true, 'seed:cert-python');
  demoNotification('ASSESSMENT_RESULT', 'Assessment passed: Python for Meteorological Data (81%)', 'You scored 81% (pass mark 70%).', '/trainee/assessments', daysAgo(120, NOW), true, 'seed:result-python');
  for (const user of pendingUsers) {
    notifications.push({ userId: admin.id, type: 'ACCOUNT', title: 'New registration awaiting approval', message: `${user.name} (${user.email}) has registered and is waiting for approval.`, link: '/admin/users?status=PENDING', isRead: false, dedupeKey: `registration:${user.id}`, createdAt: user.createdAt });
  }
  await prisma.notification.createMany({ data: notifications, skipDuplicates: true });

  // ---- achievements (computed from the data by the same rules the platform uses) ----------------------------------------------
  for (const user of employees.filter((u) => u.role === 'TRAINEE')) await checkAchievements(user.id, prisma);
  console.log(`  ${await prisma.achievement.count()} achievements awarded, ${await prisma.notification.count()} notifications, ${await prisma.auditLog.count()} audit entries`);

  // ---- readiness calendar ----------------------------------------------------------------------------------------------------
  /**
   * Simulated readiness events. A real deployment would take these from the
   * operational calendar; every row here is marked `isSimulation` and the
   * interface says so.
   */
  const READINESS_EVENTS: {
    name: string;
    description: string;
    hazard: 'CYCLONE' | 'MONSOON' | 'HEATWAVE' | 'FLOOD' | 'WINTER';
    startInDays: number;
    days: number;
    priority: number;
    departments: DepartmentCode[];
    requirements: [CompetencyCode, number, number][];
  }[] = [
    {
      name: 'Cyclone Readiness Sprint',
      description: 'Preparation for the pre-monsoon cyclone period: radar nowcasting, warning issue and disaster-manager liaison.',
      hazard: 'CYCLONE',
      startInDays: 75,
      days: 60,
      priority: 5,
      departments: ['CDW', 'FC', 'RD'],
      requirements: [['RADAR', 52, 5], ['FORECASTING', 55, 5], ['DRM', 50, 5], ['SATELLITE', 45, 3]],
    },
    {
      name: 'Monsoon Onset Readiness',
      description: 'Readiness for monsoon onset forecasting and heavy-rainfall warnings.',
      hazard: 'MONSOON',
      startInDays: 150,
      days: 120,
      priority: 4,
      departments: ['FC', 'NWP'],
      requirements: [['FORECASTING', 52, 5], ['NWP', 45, 4], ['ATMOSPHERIC', 50, 3]],
    },
    {
      name: 'Heatwave Readiness',
      description: 'Preparation for the summer heatwave advisory season.',
      hazard: 'HEATWAVE',
      startInDays: 30,
      days: 90,
      priority: 3,
      departments: ['FC', 'CLR'],
      requirements: [['FORECASTING', 55, 4], ['CLIMATE', 48, 4], ['DRM', 45, 3]],
    },
  ];

  for (const event of READINESS_EVENTS) {
    await prisma.readinessEvent.create({
      data: {
        name: event.name,
        description: event.description,
        startDate: new Date(NOW.getTime() + event.startInDays * DAY),
        endDate: new Date(NOW.getTime() + (event.startInDays + event.days) * DAY),
        hazardType: event.hazard,
        priority: event.priority,
        status: 'PLANNED',
        isSimulation: true,
        createdById: admin.id,
        departments: { create: event.departments.map((code) => ({ departmentId: deptId.get(code) as string })) },
        requirements: { create: event.requirements.map(([code, requiredLevel, importance]) => ({ competencyId: competencyId.get(code) as string, requiredLevel, importance })) },
      },
    });
  }
  console.log(`  ${READINESS_EVENTS.length} readiness events (simulated)`);

  // ---- summary ------------------------------------------------------------------------------------------------------------------
  const radar = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: demoTrainee.id, competencyId: competencyId.get('RADAR') } });
  console.log('\nDemo accounts (password is the same for all):');
  console.log('  trainee@imd.gov.in   Dr. Ananya Rao      - Radar Meteorology currently %d%% (required 80%%)', radar.currentLevel);
  console.log('  trainer@imd.gov.in   Dr. Arjun Mehta     - owns the Radar course path');
  console.log('  admin@imd.gov.in     Meera Iyer          - heatmap, training needs, user approvals');
  console.log(generated ? `\nGenerated demo password (shown once): ${password}` : '\nPassword: value of SEED_DEMO_PASSWORD');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
