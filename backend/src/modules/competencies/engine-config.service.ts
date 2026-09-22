import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { DEFAULT_ENGINE_CONFIG, mergeEngineConfig, type EngineConfig } from './engine/config';

const SETTING_KEY = 'engine.config';

/** The active engine configuration (stored defaults are merged in, so it is always complete and valid). */
export async function getEngineConfig(db: Db = prisma): Promise<EngineConfig> {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  return mergeEngineConfig(row?.value);
}

export async function saveEngineConfig(config: EngineConfig, updatedById: string, db: Db = prisma): Promise<EngineConfig> {
  const value = config as unknown as Prisma.InputJsonValue;
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value, updatedById },
    update: { value, updatedById },
  });
  return config;
}

/** Removes the stored override, so the built-in defaults apply again. (Who did it, and when, is in the audit log.) */
export async function resetEngineConfig(db: Db = prisma): Promise<EngineConfig> {
  await db.systemSetting.deleteMany({ where: { key: SETTING_KEY } });
  return DEFAULT_ENGINE_CONFIG;
}

/** "Customised" means the stored values really differ from the defaults, not merely that a row exists. */
export async function getEngineConfigMeta(db: Db = prisma) {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  const customised = row !== null && JSON.stringify(mergeEngineConfig(row.value)) !== JSON.stringify(DEFAULT_ENGINE_CONFIG);
  return { customised, updatedAt: customised ? row.updatedAt : null, updatedById: customised ? row.updatedById : null };
}
