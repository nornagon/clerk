#!/usr/bin/env node

import * as constants from '../constants';
import * as noteUtils from '../note-utils';

describe('note detection', () => {
  it('can find a note', () => {
    expect(noteUtils.findNoteInPRBody(prBodyWithNote)).toEqual('Added a memory leak.');
  });
  it('strips comments out of PR bodies', () => {
    expect(noteUtils.findNoteInPRBody(prBodyWithEmbeddedComment)).toEqual('no-notes');
  });
});

describe('comment generation', () => {
  it('knows when to show notes ', () => {
    const note = 'some note';
    const comment = noteUtils.createPRCommentFromNotes(note);
    expect(comment).toEqual(expect.stringContaining(constants.NOTES_LEAD));
    expect(comment).toEqual(expect.stringContaining(note));
  });

  it('knows when to show no-notes', () => {
    expect(noteUtils.createPRCommentFromNotes('no-notes')).toEqual(constants.NO_NOTES_BODY);
  });

  it('quotes a single-line note', () => {
    const note = 'some note';
    const comment = noteUtils.createPRCommentFromNotes(note);
    expect(comment).toEqual(expect.stringContaining(constants.NOTES_LEAD));
    expect(comment).toEqual(expect.stringContaining(`> ${note}`));
  });

  it('quotes a multiline note', () => {
    const note = 'line one\nline two';
    const comment = noteUtils.createPRCommentFromNotes(note);
    expect(comment).toEqual(expect.stringContaining(constants.NOTES_LEAD));
    expect(comment).toEqual(expect.stringContaining('> line one\n> line two'));
  });
});

describe('commit parsing', () => {
  it('parses commit type from title', () => {
    expect(noteUtils.parseCommitMessage('fix: foo', 'electron', 'electron')).toEqual({
      originalSubject: "fix: foo",
      subject: "foo",
      type: "fix",
    })
    expect(noteUtils.parseCommitMessage('chore: foo', 'electron', 'electron')).toEqual({
      originalSubject: "chore: foo",
      subject: "foo",
      type: "chore",
    })
  })
  it('sets breaking change type from body', () => {
    expect(noteUtils.parseCommitMessage('chore: foo\nBREAKING CHANGE\n', 'electron', 'electron')).toEqual({
      originalSubject: "chore: foo",
      subject: "foo",
      body: "BREAKING CHANGE",
      type: "breaking-change",
    })
  })
  it('sets pr from commit title', () => {
    expect(noteUtils.parseCommitMessage('fix: foo (#1234)', 'electron', 'electron')).toEqual({
      originalSubject: "fix: foo (#1234)",
      subject: "foo",
      type: "fix",
      originalPr: {number: 1234, owner: "electron", repo: "electron"},
      pr: {number: 1234, owner: "electron", repo: "electron"},
    })
  })
})

/* Test PR Bodies */

/* tslint:disable */
const prBodyWithNote = `#### Description of Change

Does a thing.

#### Checklist
<!-- Remove items that do not apply. For completed items, change [ ] to [x]. -->

- [ ] PR description included and stakeholders cc'd
- [ ] \`npm test\` passes
- [ ] tests are [changed or added](https://github.com/electron/electron/blob/master/docs/development/testing.md)
- [ ] PR title follows semantic [commit guidelines](https://github.com/electron/electron/blob/master/docs/development/pull-requests.md#commit-message-guidelines)
- [ ] [PR release notes](https://github.com/electron/clerk/blob/master/README.md) describe the change in a way relevant to app developers, and are [capitalized, punctuated, and past tense](https://github.com/electron/clerk/blob/master/README.md#examples).


#### Release Notes

Notes: Added a memory leak.
`;
/* tslint:enable */

// source: https://github.com/electron/electron/pull/16886
/* tslint:disable */
const prBodyWithEmbeddedComment = `Backport of #16875

See that PR for details.


Notes: <!-- Please add a one-line description for app developers to read in the release notes, or \`no-notes\` if no notes relevant to app developers. Examples and help on special cases: https://github.com/electron/clerk/blob/master/README.md#examples -->no-notes
`;
/* tslint:enable */
