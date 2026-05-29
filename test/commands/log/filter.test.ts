import { expect } from 'chai';
import Filter from '../../../src/commands/log/filter.js';

describe('log filter', () => {
  it('command class is defined', () => {
    expect(Filter).to.exist;
  });

  it('has summary text', () => {
    expect(Filter.summary).to.be.a('string').and.not.equal('');
  });
});
