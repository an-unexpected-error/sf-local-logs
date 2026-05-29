import { expect } from 'chai';
import Download from '../../../src/commands/log/download.js';

describe('log download', () => {
  it('command class is defined', () => {
    expect(Download).to.exist;
  });

  it('has summary text', () => {
    expect(Download.summary).to.be.a('string').and.not.equal('');
  });
});
