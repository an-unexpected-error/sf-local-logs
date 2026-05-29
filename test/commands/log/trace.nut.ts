import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';

describe('log trace NUT', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  it('command is registered and --help exits 0', () => {
    const result = execCmd('log trace --help', { ensureExitCode: 0 });
    expect(result.shellOutput.stdout).to.include('Initiate a debug log session');
  });
});
