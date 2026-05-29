import { expect } from 'chai';
import Search from '../../../src/commands/log/search.js';

describe('log search', () => {
  it('command class is defined', () => {
    expect(Search).to.exist;
  });

  it('has summary text', () => {
    expect(Search.summary).to.be.a('string').and.not.equal('');
  });
});
