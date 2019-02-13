#!/usr/bin/env node

import * as constants from './constants';

export const findNoteInPRBody = (body: string): string | null => {
  const onelineMatch = /(?:(?:\r?\n)|^)notes: (.+?)(?:(?:\r?\n)|$)/gi.exec(body);
  const multilineMatch =
      /(?:(?:\r?\n)Notes:(?:\r?\n)((?:\*.+(?:(?:\r?\n)|$))+))/gi.exec(body);

  let notes: string | null = null;
  if (onelineMatch && onelineMatch[1]) {
    notes = onelineMatch[1];
  } else if (multilineMatch && multilineMatch[1]) {
    notes = multilineMatch[1];
  }

  // remove the default PR template
  if (notes) {
    notes = notes.replace(/<!--.*?-->/g, '');
  }

  return notes;
};

const OMIT_FROM_RELEASE_NOTES_KEYS = [
  'blank',
  'empty',
  'no notes',
  'no',
  'no-notes',
  'no_notes',
  'none',
  'nothing',
];

export const createPRCommentFromNotes = (releaseNotes: string | null) => {
  let body = constants.NO_NOTES_BODY;
  if (releaseNotes && (OMIT_FROM_RELEASE_NOTES_KEYS.indexOf(releaseNotes) === -1)) {
    const splitNotes = releaseNotes.split('\n').filter(line => line !== '');
    if (splitNotes.length > 0) {
      const quoted = splitNotes.map(line => `> ${line}`).join('\n');
      body = `${constants.NOTES_LEAD}\n\n${quoted}`;
    }
  }

  return body;
};



const breakTypes = new Set(['breaking-change'])
const docTypes = new Set(['doc', 'docs'])
const featTypes = new Set(['feat', 'feature'])
const fixTypes = new Set(['fix'])
const otherTypes = new Set(['spec', 'build', 'test', 'chore', 'deps', 'refactor', 'tools', 'vendor', 'perf', 'style', 'ci'])
const knownTypes = new Set([...breakTypes.keys(), ...docTypes.keys(), ...featTypes.keys(), ...fixTypes.keys(), ...otherTypes.keys()])

const FOLLOW_REPOS = new Set([ 'electron/electron', 'electron/libchromiumcontent', 'electron/node' ])

const setPullRequest = (commit, owner, repo, number) => {
  if (!owner || !repo || !number) {
    throw new Error(JSON.stringify({ owner, repo, number }, null, 2))
  }

  if (!commit.originalPr) {
    commit.originalPr = commit.pr
  }

  commit.pr = { owner, repo, number }

  if (!commit.originalPr) {
    commit.originalPr = commit.pr
  }
}

/**
 * Looks for our project's conventions in the commit message:
 *
 * 'semantic: some description' -- sets type, subject
 * 'some description (#99999)' -- sets subject, pr
 * 'Fixes #3333' -- sets issueNumber
 * 'Merge pull request #99999 from ${branchname}' -- sets pr
 * 'This reverts commit ${sha}' -- sets revertHash
 * line starting with 'BREAKING CHANGE' in body -- sets breakingChange
 * 'Backport of #99999' -- sets pr
 */
export const parseCommitMessage = (commitMessage: string, owner: string, repo: string) => {
  // split commitMessage into subject & body
  let subject = commitMessage
  let body = ''
  const pos = subject.indexOf('\n')
  if (pos !== -1) {
    body = subject.slice(pos).trim()
    subject = subject.slice(0, pos).trim()
  }
  const commit: {
    originalSubject: string;
    subject?: string;
    body?: string;
    note?: string;
    type?: string;
    pr?: {
      branch: string;
      number: number;
    };
    originalPr?: {
      branch: string;
      number: number;
    };
    issueNumber?: number;
    revertHash?: string;
  } = {
    originalSubject: subject
  }

  if (body) {
    commit.body = body

    const note = findNoteInPRBody(body)
    if (note) { commit.note = note }
  }

  // if the subject ends in ' (#dddd)', treat it as a pull request id
  let match
  if ((match = subject.match(/^(.*)\s\(#(\d+)\)$/))) {
    setPullRequest(commit, owner, repo, parseInt(match[2]))
    subject = match[1]
  }

  // if the subject begins with 'word:', treat it as a semantic commit
  if ((match = subject.match(/^(\w+):\s(.*)$/))) {
    const type = match[1].toLocaleLowerCase()
    if (knownTypes.has(type)) {
      commit.type = type
      subject = match[2]
    }
  }

  // Check for GitHub commit message that indicates a PR
  if ((match = subject.match(/^Merge pull request #(\d+) from (.*)$/))) {
    setPullRequest(commit, owner, repo, parseInt(match[1]))
    commit.pr.branch = match[2].trim()
  }

  // Check for a trop comment that indicates a PR
  if ((match = commitMessage.match(/\bBackport of #(\d+)\b/))) {
    setPullRequest(commit, owner, repo, parseInt(match[1]))
  }

  // https://help.github.com/articles/closing-issues-using-keywords/
  if ((match = subject.match(/\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved|for)\s#(\d+)\b/))) {
    commit.issueNumber = parseInt(match[1])
    if (!commit.type) {
      commit.type = 'fix'
    }
  }

  // look for 'fixes' in markdown; e.g. 'Fixes [#8952](https://github.com/electron/electron/issues/8952)'
  if (!commit.issueNumber && ((match = commitMessage.match(/Fixes \[#(\d+)\]\(https:\/\/github.com\/(\w+)\/(\w+)\/issues\/(\d+)\)/)))) {
    commit.issueNumber = parseInt(match[1])
    if (commit.pr && commit.pr.number === commit.issueNumber) {
      commit.pr = null
    }
    if (commit.originalPr && commit.originalPr.number === commit.issueNumber) {
      commit.originalPr = null
    }
    if (!commit.type) {
      commit.type = 'fix'
    }
  }

  // https://www.conventionalcommits.org/en
  if (/^\s*BREAKING CHANGE/m.test(commitMessage)) {
    commit.type = 'breaking-change'
  }

  // Check for a reversion commit
  if ((match = body.match(/\bThis reverts commit ([a-f0-9]{40})\./))) {
    commit.revertHash = match[1]
  }

  // Edge case: manual backport where commit has `owner/repo#pull` notation
  if (commitMessage.toLowerCase().includes('backport') &&
      ((match = commitMessage.match(/\b(\w+)\/(\w+)#(\d+)\b/)))) {
    const [ , owner, repo, number ] = match
    if (FOLLOW_REPOS.has(`${owner}/${repo}`)) {
      setPullRequest(commit, owner, repo, number)
    }
  }

  // Edge case: manual backport where commit has a link to the backport PR
  if (commitMessage.toLowerCase().includes('backport') &&
      ((match = commitMessage.match(/https:\/\/github\.com\/(\w+)\/(\w+)\/pull\/(\d+)/)))) {
    const [ , owner, repo, number ] = match
    if (FOLLOW_REPOS.has(`${owner}/${repo}`)) {
      setPullRequest(commit, owner, repo, number)
    }
  }

  // Legacy commits: pre-semantic commits
  if (!commit.type || commit.type === 'chore') {
    const commitMessageLC = commitMessage.toLocaleLowerCase()
    if ((match = commitMessageLC.match(/\bchore\((\w+)\):/))) {
      // example: 'Chore(docs): description'
      commit.type = knownTypes.has(match[1]) ? match[1] : 'chore'
    } else if (commitMessageLC.match(/\b(?:fix|fixes|fixed)/)) {
      // example: 'fix a bug'
      commit.type = 'fix'
    } else if (commitMessageLC.match(/\[(?:docs|doc)\]/)) {
      // example: '[docs]
      commit.type = 'doc'
    }
  }

  commit.subject = subject.trim()
  return commit
}
