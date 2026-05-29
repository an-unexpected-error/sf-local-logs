import { expect } from 'chai';
import Purge from '../../../src/commands/log/purge.js';

describe('log purge', () => {
  it('command class is defined', () => {
    expect(Purge).to.exist;
  });

  it('has summary text', () => {
    expect(Purge.summary).to.be.a('string').and.not.equal('');
  });
});
