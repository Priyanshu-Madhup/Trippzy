import { releaseNotes } from '@/utils/releaseNotes';

describe('releaseNotes', () => {
  it('turns GitHub markdown into plain lines', () => {
    const md = '## What\'s new\n- **Faster** uploads\n* Fixed `calendar` reminders\n1. See [docs](https://x.y)\n\n';
    expect(releaseNotes(md)).toEqual(["What's new", 'Faster uploads', 'Fixed calendar reminders', 'See docs']);
  });
  it('is empty for an empty body', () => {
    expect(releaseNotes('  \n ')).toEqual([]);
  });
});
