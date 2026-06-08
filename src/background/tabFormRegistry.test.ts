import { describe, expect, it, beforeEach } from 'vitest';
import { TabFormRegistry } from '@/background/tabFormRegistry';

describe('TabFormRegistry', () => {
  let registry: TabFormRegistry;

  beforeEach(() => {
    registry = new TabFormRegistry();
  });

  it('selects the frame with the highest field count', () => {
    registry.register(1, 0, {
      url: 'https://www.algosec.com/position/job',
      portal: 'generic',
      fieldCount: 0,
      isTopFrame: true,
    });
    registry.register(1, 42, {
      url: 'https://www.comeet.co/jobs/1/2/apply',
      portal: 'comeet',
      fieldCount: 6,
      isTopFrame: false,
    });

    const info = registry.aggregatePageInfo(
      1,
      'https://www.algosec.com/position/software-developer/0b-64e',
    );

    expect(info?.hasApplicationForm).toBe(true);
    expect(info?.formFrameId).toBe(42);
    expect(info?.portal).toBe('comeet');
    expect(info?.formFieldCount).toBe(6);
  });

  it('enables autofill for career URLs before iframe fields register', () => {
    const info = registry.aggregatePageInfo(
      2,
      'https://www.algosec.com/position/software-developer/0b-64e',
    );

    expect(info?.hasApplicationForm).toBe(true);
    expect(info?.formFrameId).toBe(0);
  });

  it('prefers higher-priority embed hosts on equal field counts', () => {
    registry.register(3, 10, {
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      portal: 'greenhouse',
      fieldCount: 4,
      isTopFrame: false,
    });
    registry.register(3, 11, {
      url: 'https://www.comeet.co/jobs/1/2/apply',
      portal: 'comeet',
      fieldCount: 4,
      isTopFrame: false,
    });

    const info = registry.aggregatePageInfo(3, 'https://careers.example.com/job');

    expect(info?.formFrameId).toBe(11);
    expect(info?.portal).toBe('comeet');
  });
});
