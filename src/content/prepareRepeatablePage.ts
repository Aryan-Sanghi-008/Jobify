import { fillSkillsSequential, pageHasSkillsSection } from '@/content/controls/skillsFill';
import {
  fillEducationEntryFields,
  fillExperienceEntryFields,
} from '@/content/entryFieldFill';
import {
  delayBetweenSections,
  ensureEntryCount,
  fillRepeatableEntriesSequential,
  getEntryContainers,
  getRepeatableDelays,
  type RepeatablePrepareOptions,
} from '@/content/repeatableSections';
import type { FormSectionType, PortalName, UserProfile } from '@/shared/types';
import { getTenantRepeatableConfig } from '@/shared/tenantOverrides';

interface RepeatablePrepareState {
  experience: boolean;
  education: boolean;
  skills: boolean;
}

const prepareState: RepeatablePrepareState = {
  experience: false,
  education: false,
  skills: false,
};

export function resetRepeatablePagePreparedForTests(): void {
  prepareState.experience = false;
  prepareState.education = false;
  prepareState.skills = false;
}

export function isRepeatableSectionPrepared(
  section: Exclude<FormSectionType, 'skills'>,
): boolean {
  return prepareState[section];
}

export function isRepeatablePagePrepared(): boolean {
  return (
    prepareState.experience || prepareState.education || prepareState.skills
  );
}

/** @deprecated Use isRepeatablePagePrepared */
export function isMyExperiencePrepared(): boolean {
  return isRepeatablePagePrepared();
}

/** @deprecated Use resetRepeatablePagePreparedForTests */
export function resetMyExperiencePreparedForTests(): void {
  resetRepeatablePagePreparedForTests();
}

export interface RepeatablePrepareStrategy {
  shouldRun: (formRoot: ParentNode) => boolean;
  fillExperienceEntry: (
    container: HTMLElement,
    entry: UserProfile['experience'][number],
    profile: UserProfile,
    index: number,
  ) => Promise<number>;
  fillEducationEntry: (
    container: HTMLElement,
    entry: UserProfile['education'][number],
    profile: UserProfile,
    index: number,
  ) => Promise<number>;
}

function resetPrepareState(): void {
  prepareState.experience = false;
  prepareState.education = false;
  prepareState.skills = false;
}

function pageHasRepeatableSections(
  profile: UserProfile,
  formRoot: ParentNode,
): boolean {
  if (profile.experience.length > 0 && getEntryContainers('experience').length > 0) {
    return true;
  }

  if (profile.education.length > 0) {
    return true;
  }

  if (profile.skills.length > 0 && pageHasSkillsSection(formRoot)) {
    return true;
  }

  const text = formRoot.textContent ?? '';
  if (/work experience|employment history|\beducation\b|\bskills\b/i.test(text)) {
    return true;
  }

  return false;
}

function getDefaultStrategy(profile: UserProfile, portal: PortalName): RepeatablePrepareStrategy {
  const delays = getRepeatableDelays(portal);

  return {
    shouldRun: () => true,
    fillExperienceEntry: async (container, entry, activeProfile, index) => {
      const filled = fillExperienceEntryFields(
        container,
        entry,
        activeProfile.personal.city,
        index,
      );
      await new Promise((resolve) => {
        window.setTimeout(resolve, delays.entrySettle);
      });
      return filled;
    },
    fillEducationEntry: async (container, entry, _profile, index) => {
      const filled = fillEducationEntryFields(container, entry, index);
      await new Promise((resolve) => {
        window.setTimeout(resolve, delays.entrySettle);
      });
      return filled;
    },
  };
}

function getPrepareOptions(portal: PortalName): RepeatablePrepareOptions {
  return { delays: getRepeatableDelays(portal) };
}

/**
 * Sequential prepare for repeatable experience, education, and skills sections.
 * Used by all portals before scan/match/fill.
 */
export async function prepareRepeatablePage(
  profile: UserProfile,
  portal: PortalName,
  formRoot: ParentNode = document,
  strategy?: RepeatablePrepareStrategy,
): Promise<void> {
  resetPrepareState();

  const activeStrategy = strategy ?? getDefaultStrategy(profile, portal);

  if (!activeStrategy.shouldRun(formRoot)) {
    return;
  }

  if (!pageHasRepeatableSections(profile, formRoot)) {
    return;
  }

  const tenantConfig = getTenantRepeatableConfig();
  const options = getPrepareOptions(portal);
  const delays = getRepeatableDelays(portal);
  let experienceFilled = 0;
  let educationFilled = 0;
  let skillsFilled = 0;

  if (profile.experience.length > 0) {
    if (tenantConfig.bulkEnsureEntries) {
      await ensureEntryCount('experience', profile.experience.length);
    }

    const entryCount = await fillRepeatableEntriesSequential(
      'experience',
      profile.experience,
      async (container, entry, index) => {
        experienceFilled += await activeStrategy.fillExperienceEntry(
          container,
          entry,
          profile,
          index,
        );
      },
      options,
    );

    if (entryCount >= profile.experience.length && experienceFilled > 0) {
      prepareState.experience = true;
    }
  }

  if (profile.education.length > 0 || profile.experience.length > 0) {
    await delayBetweenSections(portal);
  }

  if (profile.education.length > 0) {
    if (tenantConfig.bulkEnsureEntries) {
      await ensureEntryCount('education', profile.education.length);
    }

    const entryCount = await fillRepeatableEntriesSequential(
      'education',
      profile.education,
      async (container, entry, index) => {
        educationFilled += await activeStrategy.fillEducationEntry(
          container,
          entry,
          profile,
          index,
        );
      },
      options,
    );

    if (entryCount >= profile.education.length && educationFilled > 0) {
      prepareState.education = true;
    }
  }

  if (profile.skills.length > 0) {
    await delayBetweenSections(portal);
    skillsFilled = await fillSkillsSequential(formRoot, profile.skills, {
      portal,
      skillItemDelayMs: delays.skillItem,
    });

    if (skillsFilled >= profile.skills.length) {
      prepareState.skills = true;
    }
  }
}
