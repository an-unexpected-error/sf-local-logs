import { expect } from 'chai';
import Trace from '../../../src/commands/log/trace.js';

describe('log trace', () => {
  it('command class is defined', () => {
    expect(Trace).to.exist;
  });

  it('has summary text', () => {
    expect(Trace.summary).to.be.a('string').and.not.equal('');
  });
});
