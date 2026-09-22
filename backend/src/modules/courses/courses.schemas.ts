import { z } from 'zod';
import { paginationSchema, queryBool } from '../../lib/http';
import { level, requiredText, searchQuery, uuid } from '../../lib/schemas';

export const difficultyEnum = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
export const courseStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const materialTypeEnum = z.enum(['VIDEO', 'DOCUMENT', 'LINK', 'TEXT']);

/** Only web links are accepted; `javascript:` and other schemes are rejected. */
export const httpUrl = z
  .string()
  .trim()
  .max(2000, 'URL is too long')
  .url('Enter a valid URL')
  .refine((value) => /^https?:\/\//i.test(value), 'Only http(s) links are allowed');

export const competencyMappingSchema = z
  .strictObject({ competencyId: uuid, levelFrom: level, levelTo: level })
  .refine((mapping) => mapping.levelTo > mapping.levelFrom, { path: ['levelTo'], message: 'Target level must be higher than the entry level' });

export const competencyMappingsSchema = z
  .array(competencyMappingSchema)
  .max(20, 'At most 20 competencies per course')
  .refine((list) => new Set(list.map((mapping) => mapping.competencyId)).size === list.length, 'A competency can only be mapped once');

const outcomes = z.array(requiredText(3, 200, 'Outcome')).max(12, 'At most 12 learning outcomes');
const prerequisiteIds = z
  .array(uuid)
  .max(10, 'At most 10 prerequisites')
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate prerequisites');

const initialModule = z.strictObject({
  title: requiredText(2, 150, 'Module title'),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.number().int().min(0).max(6000).optional(),
});

export const createCourseSchema = z.strictObject({
  title: requiredText(3, 150, 'Title'),
  description: requiredText(10, 5000, 'Description'),
  category: requiredText(2, 60, 'Category'),
  difficulty: difficultyEnum.default('BEGINNER'),
  durationMinutes: z.number().int().min(0).max(60000).optional(),
  outcomes: outcomes.default([]),
  passingScore: z.number().int().min(1).max(100).default(70),
  certificateEnabled: z.boolean().default(true),
  competencies: competencyMappingsSchema.default([]),
  prerequisiteIds: prerequisiteIds.default([]),
  modules: z.array(initialModule).max(50).default([]),
  /** Administrators may create a course on behalf of a trainer. */
  trainerId: uuid.optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

// NOTE: deliberately no `.default()` here - Zod 4 applies defaults inside optional
// fields, which would silently reset untouched values on every PATCH.
export const updateCourseSchema = z
  .strictObject({
    title: requiredText(3, 150, 'Title'),
    description: requiredText(10, 5000, 'Description'),
    category: requiredText(2, 60, 'Category'),
    difficulty: difficultyEnum,
    durationMinutes: z.number().int().min(0).max(60000),
    outcomes,
    passingScore: z.number().int().min(1).max(100),
    certificateEnabled: z.boolean(),
    competencies: competencyMappingsSchema,
    prerequisiteIds,
    trainerId: uuid,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const statusChangeSchema = z.strictObject({ status: courseStatusEnum });

export const listCoursesQuery = paginationSchema.extend({
  q: searchQuery,
  category: z.string().trim().max(60).optional(),
  difficulty: difficultyEnum.optional(),
  competencyId: uuid.optional(),
  departmentId: uuid.optional(),
  status: courseStatusEnum.optional(),
  mine: queryBool,
  completion: z.enum(['NOT_ENROLLED', 'ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING', 'COMPLETED']).optional(),
  sort: z.enum(['newest', 'title', 'popular', 'duration']).default('newest'),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuery>;

// ---- modules & materials ---------------------------------------------------------------------------

export const createModuleSchema = z.strictObject({
  title: requiredText(2, 150, 'Module title'),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(6000).optional(),
});
export const updateModuleSchema = z
  .strictObject({
    title: requiredText(2, 150, 'Module title'),
    description: z.string().trim().max(1000).nullable(),
    durationMinutes: z.number().int().min(0).max(6000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export const reorderModulesSchema = z.strictObject({ moduleIds: z.array(uuid).min(1) });

/** Multipart form fields arrive as strings; blank ones mean "not provided". */
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export const createMaterialSchema = z.strictObject({
  title: requiredText(2, 150, 'Title'),
  type: materialTypeEnum,
  url: z.preprocess(blankToUndefined, httpUrl.optional()),
  content: z.preprocess(blankToUndefined, z.string().max(50_000, 'Text is too long (max 50,000 characters)').optional()),
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z
  .strictObject({
    title: requiredText(2, 150, 'Title'),
    url: httpUrl,
    content: z.string().max(50_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

// ---- feedback -------------------------------------------------------------------------------------------

export const feedbackSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  trainerRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
});
