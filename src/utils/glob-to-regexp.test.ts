import { describe, it, expect } from 'vitest';
import { globToRegExp } from './glob-to-regexp.js';

describe('globToRegExp', () => {
  it.each([
    ['/repo/features/test/**', '/repo/features/test/support/support.dart'],
    ['/repo/features/test/**', '/repo/features/test/a.dart'],
    ['/repo/features/**/*_test.dart', '/repo/features/lib/menu_test.dart'],
    ['/repo/features/**/*_test.dart', '/repo/features/test/tab_bar/menu_tab_screen_test.dart'],
    ['/repo/samba/lib/i18n/l10n/*', '/repo/samba/lib/i18n/l10n/strings.dart'],
    ['/repo/samba/**/build/**', '/repo/samba/example/build/out.dart'],
    ['/repo/app/**/*.{g,freezed}.dart', '/repo/app/lib/model.freezed.dart'],
    ['/repo/app/lib/?.dart', '/repo/app/lib/a.dart'],
    ['**/*.g.dart', 'lib/model.g.dart'],
  ])('should match %s against %s', (glob, path) => {
    expect(globToRegExp(glob).test(path)).toBe(true);
  });

  it.each([
    ['/repo/features/test/**', '/repo/features/lib/tab_bar/menu_row_list.dart'],
    ['/repo/features/**/*_test.dart', '/repo/features/lib/menu.dart'],
    ['/repo/samba/lib/i18n/l10n/*', '/repo/samba/lib/i18n/l10n/nested/strings.dart'],
    ['/repo/app/**/*.{g,freezed}.dart', '/repo/app/lib/model.dart'],
    ['/repo/app/lib/?.dart', '/repo/app/lib/ab.dart'],
    ['/repo/app/lib/a.dart', '/repo/app/lib/aXdart'],
    ['/repo/app/lib/[a].dart', '/repo/app/lib/a.dart'],
  ])('should not match %s against %s', (glob, path) => {
    expect(globToRegExp(glob).test(path)).toBe(false);
  });
});
