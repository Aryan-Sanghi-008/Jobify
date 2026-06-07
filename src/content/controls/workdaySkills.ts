import { fillSkillsSequential } from '@/content/controls/skillsFill';

export {
  clickSkillResultRow,
  findBestSkillMatchRow,
  hasSelectedSkillChip,
  scoreSkillMatch,
} from '@/content/controls/skillsFill';

/**
 * Fills Workday's checkbox-based Skills search UI with fuzzy matching.
 */
export async function fillWorkdaySkillsAsync(
  root: ParentNode,
  skills: string[],
): Promise<number> {
  return fillSkillsSequential(root, skills, { portal: 'workday' });
}
